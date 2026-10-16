import os
import ssl
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import MetaData
from dotenv import load_dotenv

load_dotenv()

_DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/chessshorts"

_RAW_DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_URL)


def make_engine(url: str | None = None) -> "AsyncEngine":
    """Create an async engine with Neon/cloud-Postgres quirks handled.

    - strips libpq-style query params asyncpg can't parse
    - attaches a verified SSL context when TLS is required
    """
    raw = url or _RAW_DATABASE_URL
    base = raw.split("?", 1)[0]
    kwargs = dict(echo=False, pool_pre_ping=True)
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

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)