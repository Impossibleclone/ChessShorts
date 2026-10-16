#!/usr/bin/env python3
"""
Fast bulk import of Lichess puzzles from a CSV.zst file into PostgreSQL.

Reads the compressed CSV with Polars (native zstd), applies quality filters,
and inserts in bulk with asyncpg executemany (single UDP... single round-trip
per batch). Uses the DIRECT Neon endpoint (not the PgBouncer pooler) when
available, which is more reliable for long write transactions.

Usage:
    python scripts/import_puzzles.py --file ~/dls/lichess_db_puzzle.csv.zst --limit 500000
    python scripts/import_puzzles.py --file lichess_db_puzzle.csv.zst --limit 500000 --min-popularity 70
"""

import argparse
import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

import polars as pl
import asyncpg
import zstandard as zstd

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models import Puzzle  # noqa: F401  (ensures table metadata is defined)

CHUNK_SIZE = 5_000

CSV_COLUMNS = ["PuzzleId", "FEN", "Moves", "Rating", "Popularity", "Themes"]


def direct_endpoint(url: str) -> str:
    """Prefer Neon's direct endpoint over the PgBouncer pooler for bulk writes."""
    return url.replace("-pooler.", ".")


def ensure_plain_csv(path: str) -> tuple[str, bool]:
    """polars doesn't auto-decompress .zst; stream it to a temp CSV once."""
    if not path.endswith(".zst"):
        return path, False
    out = Path(tempfile.gettempdir()) / "chessshorts_tmp"
    out.mkdir(parents=True, exist_ok=True)
    plain = out / (Path(path).stem[:-4] if Path(path).name.endswith(".csv.zst") else Path(path).stem)
    plain = plain.with_suffix(".csv")
    dctx = zstd.ZstdDecompressor()
    with open(path, "rb") as src, open(plain, "wb") as dst:
        dctx.copy_stream(src, dst)
    return str(plain), True


def read_panel(path: str, limit: int, min_popularity: int, extra_rows: int = 3):
    """Read CSV (zstd auto-detected by extension), filter quality, dedupe, cap count.

    Reads (limit * extra_rows) raw rows first, then filters — cheaper than
    unseen-read-all for large files on a 0.5GB free-tier database.
    """
    import ssl  # local import keeps top clean for non-Neon users

    df = pl.read_csv(
        path,
        columns=CSV_COLUMNS,
        has_header=True,
        n_rows=limit * extra_rows,
        infer_schema_length=0,          # everything as strings, no type surprises
        low_memory=True,
    )

    df = df.with_columns(
        pl.col("Rating").cast(pl.Int64, strict=False),
        pl.col("Popularity").cast(pl.Int64, strict=False).fill_null(0),
    )

    df = (
        df.filter(
            pl.col("PuzzleId").is_not_null()
            & pl.col("FEN").is_not_null()
            & pl.col("Moves").is_not_null()
            & pl.col("Rating").is_not_null()
        )
        .filter(pl.col("Popularity") >= min_popularity)
        .unique(subset=["PuzzleId"], keep="first")
        .with_columns(
            pl.col("Themes")
            .fill_null("")
            .str.split(" ")
            .list.eval(pl.element().filter(pl.element() != ""))
            .alias("themes"),
        )
        .head(limit)
    )
    return df


async def insert_batches(
    df: "pl.DataFrame",
    dsn: str,
    batch_size: int = CHUNK_SIZE,
    ssl_ctx=None,
):
    from app.db.base import Base  # noqa: F401
    from sqlalchemy.ext.asyncio import create_async_engine

    # Create tables via SQLAlchemy (same code path as the API)
    engine = create_async_engine(dsn.split("?", 1)[0], connect_args=(
        {"ssl": ssl_ctx} if ssl_ctx else {}
    ))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()

    raw_url = dsn
    if not raw_url.startswith("postgresql://"):
        raw_url = raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    rows = list(zip(
        df["PuzzleId"], df["FEN"], df["Moves"],
        df["Rating"], df["Popularity"], df["themes"],
    ))

    inserted = 0
    conn = await asyncpg.connect(raw_url, ssl=ssl_ctx)
    try:
        stmt = """
            INSERT INTO puzzles (id, fen, moves, rating, popularity, themes)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING
        """
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            async with conn.transaction():
                await conn.executemany(stmt, batch)
            inserted += len(batch)
            if inserted % 50_000 < batch_size:
                print(f"  {inserted:,}/{len(rows):,} rows")

        print(f"✅ Inserted {inserted:,} puzzles")
    finally:
        await conn.close()


async def main():
    parser = argparse.ArgumentParser(description="Fast import Lichess puzzles CSV.zst -> PostgreSQL")
    import os
    parser.add_argument("--file", help="Path to local CSV.zst file")
    parser.add_argument("--limit", type=int, default=500_000, help="Max puzzles to import")
    parser.add_argument("--min-popularity", type=int, default=70,
                        help="Only puzzles with Lichess popularity >= this (1-100)")
    parser.add_argument("--db-url", default=os.getenv("DATABASE_URL"),
                        help="PostgreSQL URL (default: DATABASE_URL env; must be asyncpg://)")
    parser.add_argument("--batch-size", type=int, default=CHUNK_SIZE)
    args = parser.parse_args()

    if not args.file:
        parser.error("--file is required")
    if not args.db_url:
        parser.error("--db-url or DATABASE_URL env is required")

    ssl_ctx = None
    if "neon.tech" in args.db_url:
        import ssl
        ssl_ctx = ssl.create_default_context()
    dsn = direct_endpoint(args.db_url)

    print("Preparing CSV (decompressing .zst if needed)...")
    csv_path, tmp_created = ensure_plain_csv(args.file)

    t0 = time.monotonic()
    try:
        df = read_panel(csv_path, args.limit, args.min_popularity)
    finally:
        if tmp_created:
            try:
                os.unlink(csv_path)
            except OSError:
                pass

    t1 = time.monotonic()
    print(
        f"Loaded {len(df):,} puzzles "
        f"(popularity ≥ {args.min_popularity}, cap {args.limit:,}) "
        f"in {t1 - t0:.1f}s"
    )
    if len(df) == 0:
        print("Nothing to import after filters."); return

    rating_mean = df["Rating"].mean()
    print(f"Rating mean {rating_mean:.0f}, min {df['Rating'].min()} max {df['Rating'].max()}")


    await insert_batches(df, dsn, args.batch_size, ssl_ctx)
    print(f"Import finished in {time.monotonic() - t0:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())