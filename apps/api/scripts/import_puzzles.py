#!/usr/bin/env python3
"""
Import Lichess puzzles from CSV.zst into PostgreSQL.

Usage:
    python scripts/import_puzzles.py --file lichess_db_puzzle.csv.zst --limit 500000
    python scripts/import_puzzles.py --url https://database.lichess.org/lichess_db_puzzle.csv.zst --limit 100000
"""

import argparse
import asyncio
import io
import os
import sys
import tempfile
from pathlib import Path

import polars as pl
import zstandard as zstd
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from tqdm import tqdm

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.base import Base, make_engine
from app.models import Puzzle

CHUNK_SIZE = 10000

async def create_tables(engine):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def import_puzzles(engine, csv_path: str, limit: int = None, batch_size: int = CHUNK_SIZE):
    """Import puzzles from CSV file using Polars for fast parsing."""
    
    print(f"Reading {csv_path}...")
    
    # Read with Polars (handles zstd automatically if file ends with .zst)
    if csv_path.endswith('.zst'):
        # Use polars with zstd decompression
        df = pl.scan_csv(csv_path, 
            columns=['PuzzleId', 'FEN', 'Moves', 'Rating', 'Popularity', 'Themes'],
            n_rows=limit,
            low_memory=True
        ).collect()
    else:
        df = pl.read_csv(csv_path,
            columns=['PuzzleId', 'FEN', 'Moves', 'Rating', 'Popularity', 'Themes'],
            n_rows=limit,
            low_memory=True
        )
    
    print(f"Loaded {len(df)} rows")
    print(f"Columns: {df.columns}")
    print(f"Sample:\n{df.head(3)}")
    
    # Validate and clean
    df = df.filter(
        (pl.col('FEN').is_not_null()) & 
        (pl.col('Moves').is_not_null()) & 
        (pl.col('Rating').is_not_null())
    )
    
    # Parse themes
    df = df.with_columns(
        pl.col('Themes').str.split(' ').alias('themes_array')
    )
    
    print(f"After cleaning: {len(df)} rows")
    
    # Convert to list of dicts for batch insert
    puzzles_data = df.to_dicts()
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    inserted = 0
    async with async_session() as session:
        async with session.begin():
            for i in tqdm(range(0, len(puzzles_data), batch_size), desc="Inserting batches"):
                batch = puzzles_data[i:i + batch_size]
                
                # Build upsert statement
                values = []
                for row in batch:
                    values.append({
                        'id': str(row['PuzzleId']),
                        'fen': row['FEN'],
                        'moves': row['Moves'],
                        'rating': int(row['Rating']),
                        'popularity': int(row.get('Popularity', 0) or 0),
                        'themes': row['themes_array'] if row['themes_array'] else [],
                    })
                
                # Use PostgreSQL COPY for bulk insert (fastest)
                # For upsert, we'll use a temporary table approach
                await session.execute(text("""
                    CREATE TEMP TABLE temp_puzzles (LIKE puzzles INCLUDING ALL) ON COMMIT DROP
                """))
                
                # Insert into temp table
                for v in values:
                    await session.execute(text("""
                        INSERT INTO temp_puzzles (id, fen, moves, rating, popularity, themes)
                        VALUES (:id, :fen, :moves, :rating, :popularity, :themes)
                    """), v)
                
                # Upsert from temp to main
                await session.execute(text("""
                    INSERT INTO puzzles (id, fen, moves, rating, popularity, themes)
                    SELECT id, fen, moves, rating, popularity, themes FROM temp_puzzles
                    ON CONFLICT (id) DO UPDATE SET
                        fen = EXCLUDED.fen,
                        moves = EXCLUDED.moves,
                        rating = EXCLUDED.rating,
                        popularity = EXCLUDED.popularity,
                        themes = EXCLUDED.themes,
                        updated_at = NOW()
                """))
                
                inserted += len(batch)
                await session.commit()
    
    print(f"Imported {inserted} puzzles")

async def download_file(url: str, dest: str):
    """Download file with progress bar."""
    import httpx
    async with httpx.AsyncClient(timeout=300.0) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            total = int(response.headers.get("content-length", 0))
            with open(dest, "wb") as f, tqdm(
                total=total, unit="B", unit_scale=True, desc="Downloading"
            ) as pbar:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
                    pbar.update(len(chunk))

async def main():
    parser = argparse.ArgumentParser(description="Import Lichess puzzles")
    parser.add_argument("--file", help="Path to local CSV.zst file")
    parser.add_argument("--url", help="URL to download CSV.zst from")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of puzzles to import")
    parser.add_argument("--batch-size", type=int, default=CHUNK_SIZE, help="Batch size for inserts")
    parser.add_argument("--db-url", default=None, help="Postgres URL (defaults to DATABASE_URL env)")
    
    args = parser.parse_args()
    
    if not args.file and not args.url:
        parser.error("Either --file or --url must be provided")
    
    engine = make_engine(args.db_url)
    
    await create_tables(engine)
    
    file_path = args.file
    if args.url:
        if not args.file:
            file_path = tempfile.mktemp(suffix=".csv.zst")
        print(f"Downloading from {args.url}...")
        await download_file(args.url, file_path)
    
    try:
        await import_puzzles(engine, file_path, args.limit, args.batch_size)
    finally:
        await engine.dispose()
        if args.url and not args.file:
            os.unlink(file_path)

if __name__ == "__main__":
    asyncio.run(main())