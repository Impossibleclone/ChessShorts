import asyncio
import logging
import os
import socket
import ssl

from dotenv import load_dotenv
from sqlalchemy import MetaData
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

logger = logging.getLogger("chessshorts.db")

_DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/chessshorts"

_RAW_DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_URL)

_UNPARSEABLE = "<unparseable DATABASE_URL — see startup logs>"

#/shared status so /health can report DB connectivity (never contains secrets)
db_state: dict = {"ready": False, "error": None}


def _mask(raw: str) -> str:
    """URL with the password redacted — safe for logs."""
    try:
        return str(make_url(raw).set(password=None)) + " (password hidden)"
    except Exception:
        return _UNPARSEABLE


def parse_database_url(raw: str | None = None) -> URL:
    """Validate DATABASE_URL; raise ValueError with a human hint when malformed."""
    raw = raw or _RAW_DATABASE_URL
    try:
        u = make_url(raw)
    except Exception as e:  # not just ArgumentError: any malformed shape (bad port, '@' eaten, ...)
        raise ValueError(
            f"DATABASE_URL is malformed and cannot be parsed ({type(e).__name__}). "
            "Common causes: a literal '<pass>'/'<password>' placeholder copied from docs, "
            "quotes around the value, a missing '@' between password and host, or stray "
            "spaces/newlines pasted into the env var."
        ) from e

    if not u.drivername.startswith("postgresql+asyncpg"):
        raise ValueError(
            f"DATABASE_URL driver must be postgresql+asyncpg:// (got {u.drivername}://...)"
        )
    if not u.host:
        raise ValueError("DATABASE_URL has no host part.")
    if not u.password and "neon.tech" in (u.host or ""):
        raise ValueError("DATABASE_URL is missing the password (Neon requires one).")
    return u


def make_engine(url: str | None = None) -> AsyncEngine:
    """Create an async engine with Neon/cloud-Postgres quirks handled.

    - strips libpq-style query params asyncpg can't parse (sslmode, channel_binding)
    - attaches a verified SSL context when TLS is required
    - right-sizes the pool for serverless Postgres
    """
    raw = url or _RAW_DATABASE_URL
    try:
        parse_database_url(raw)
    except ValueError as e:
        if url is not None:  # explicit caller (scripts) wants a loud failure
            raise
        # Module import must never crash on a bad env value (main app, tests,
        # and tooling all import this module). init_db() re-validates and
        # reports the precise diagnosis via logs + /health.
        db_state["error"] = str(e)
        logger.error("FATAL: %s  Masked URL: %s", e, _mask(raw))
        raw = _DEFAULT_URL

    # asyncpg rejects libpq-style params in the query string; strip them.
    base = raw.split("?", 1)[0]

    kwargs: dict = dict(echo=False, pool_pre_ping=True, pool_size=3, max_overflow=2)
    if (
        base.startswith("postgresql+asyncpg")
        and ("sslmode=require" in raw or "sslmode=verify" in raw or "neon.tech" in raw)
    ):
        kwargs["connect_args"] = {"ssl": ssl.create_default_context()}
    return create_async_engine(base, **kwargs)


engine = make_engine()

async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def _diagnose_connect_failure(exc: BaseException, raw_url: str) -> str:
    """Human-readable hint about why the DB connection failed."""
    hints: list[str] = []
    msg = str(exc).lower()

    try:
        host = make_url(raw_url).host
    except Exception:
        host = None

    if "gaierror" in repr(exc) or "name or service not known" in msg:
        if host:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, socket.getaddrinfo, host, 5432)
                hints.append(
                    f"host '{host}' DOES resolve from this container — the actual URL "
                    "in use differs from what you expect (malformed password segment, "
                    "quotes, or whitespace in the env value)."
                )
            except OSError as dns_err:
                hints.append(
                    f"host '{host}' does NOT resolve: {dns_err} — check the hostname "
                    "spelling in Render env or your network/DNS rules."
                )
        hints.append(
            "Render → Environment → DATABASE_URL: no quotes, no '<pass>' placeholder, "
            "real password in the password slot."
        )
    if "password authentication failed" in msg or "invalid password" in msg:
        hints.append(
            "Password rejected — the password in the URL doesn't match Neon's "
            "(reset in Neon → Roles → neondb_owner and update Render), OR the ep-… "
            "endpoint id is mistyped: verify the exact connection string in Neon console."
        )
    return "; ".join(hints) or "See error above."


async def init_db(retries: int = 6, backoff: float = 2.0) -> None:
    """Create tables at startup, retrying transient failures with backoff.

    Never raises after connection failures: the API stays up (so /health and
    Render logs show the diagnosis) and a failed startup doesn't crash-loop
    the service while env vars are being fixed.
    """
    try:
        u = parse_database_url()
        logger.info(
            "Connecting to DB host=%s db=%s user=%s",
            u.host, u.database, u.username,
        )
    except ValueError as e:
        db_state["error"] = str(e)
        logger.error("FATAL: %s  Masked URL: %s", e, _mask(_RAW_DATABASE_URL))
        return

    last_exc: BaseException | None = None
    for attempt in range(1, retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            db_state["ready"] = True
            db_state["error"] = None
            logger.info("Database ready (tables ensured).")
            return
        except Exception as e:
            last_exc = e
            try:
                hint = await _diagnose_connect_failure(e, _RAW_DATABASE_URL)
            except Exception:
                hint = ""
            logger.warning(
                "init_db attempt %d/%d failed: %r%s",
                attempt, retries, e, f"  HINT: {hint}" if hint else "",
            )
            if attempt < retries:
                await asyncio.sleep(backoff * attempt)
    # give up — keep serving so /health exposes the problem; no crash-loop
    detail = f"{type(last_exc).__name__}: {last_exc}"
    db_state["error"] = detail
    logger.error(
        "DB unreachable after %d attempts — continuing without DB. "
        "Masked URL: %s  Last error: %s",
        retries, _mask(_RAW_DATABASE_URL), detail,
    )