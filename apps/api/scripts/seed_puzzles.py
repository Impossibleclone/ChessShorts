#!/usr/bin/env python3
"""
Seed database with a few puzzles for immediate testing.
Run after database is created: python scripts/seed_puzzles.py
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.db.base import Base
from app.models import Puzzle

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/chessshorts"
)

# Sample puzzles from Lichess format: id, fen, moves (UCI), rating, popularity, themes
SEED_PUZZLES = [
    {
        "id": "00001",
        "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        "moves": "d1h5 g7g6 h5f7",
        "rating": 800,
        "popularity": 95,
        "themes": ["mate", "mateIn2"],
    },
    {
        "id": "00002",
        "fen": "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 4",
        "moves": "c4d5 e7e6 d5e6 f7e6",
        "rating": 1000,
        "popularity": 88,
        "themes": ["fork", "winningMaterial"],
    },
    {
        "id": "00003",
        "fen": "r1bq1rk1/ppp2ppp/2n2n2/3pp3/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 6",
        "moves": "c1g5 f8e7 g5f6 d8f6",
        "rating": 1200,
        "popularity": 92,
        "themes": ["pin", "crushing"],
    },
    {
        "id": "00004",
        "fen": "r2q1rk1/ppp2ppp/2n1bn2/3pp3/3P4/2N1PN2/PPQ2PPP/R1B2RK1 w - - 0 8",
        "moves": "c3d5 c6d5 c1g5 f8e7 g5f6 d8f6",
        "rating": 1400,
        "popularity": 85,
        "themes": ["discoveredAttack", "mate"],
    },
    {
        "id": "00005",
        "fen": "r1bq1rk1/ppp2ppp/2np1n2/3Np3/2P1P3/2N2P2/PP3PPP/R1BQKB1R w KQ - 0 7",
        "moves": "d4e5 d6e5 f3e5 c6e5 d1d8",
        "rating": 1600,
        "popularity": 78,
        "themes": ["sacrifice", "queenSacrifice"],
    },
    {
        "id": "00006",
        "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        "moves": "d1h5 g7g6 h5f7",
        "rating": 900,
        "popularity": 90,
        "themes": ["mateIn2", "smotheredMate"],
    },
    {
        "id": "00007",
        "fen": "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 5",
        "moves": "d4e5 d6e5 f3e5 d8e7 e5f7",
        "rating": 1100,
        "popularity": 82,
        "themes": ["fork", "knightFork"],
    },
    {
        "id": "00008",
        "fen": "r1bq1rk1/ppp1bppp/2n1pn2/4N3/2B1P3/5N2/PPP2PPP/R2QKB1R w KQ - 0 9",
        "moves": "e4f6 g7f6 c3d5 e6d5 f3d4",
        "rating": 1300,
        "popularity": 75,
        "themes": ["skewer", "doubleAttack"],
    },
    {
        "id": "00009",
        "fen": "r1bq1rk1/ppp2ppp/2n1bn2/3pp3/2PP4/2N1PN2/PP2QPPP/R1B2RK1 w - - 0 9",
        "moves": "d3h7 g8h7 f3g5 h7g8 g5f7",
        "rating": 1500,
        "popularity": 70,
        "themes": ["mate", "mateIn3"],
    },
    {
        "id": "00010",
        "fen": "r2q1rk1/ppp2ppp/2n1bn2/3pp3/2PP4/2N1PN2/PP2QPPP/R1B2RK1 w - - 0 9",
        "moves": "d3h7 g8h7 f3g5 h7g8 g5f7",
        "rating": 1700,
        "popularity": 65,
        "themes": ["clearance", "sacrifice"],
    },
]

async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        async with session.begin():
            for p in SEED_PUZZLES:
                puzzle = Puzzle(
                    id=p["id"],
                    fen=p["fen"],
                    moves=p["moves"],
                    rating=p["rating"],
                    popularity=p["popularity"],
                    themes=p["themes"],
                )
                session.add(puzzle)
        
        print(f"Seeded {len(SEED_PUZZLES)} puzzles")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed())