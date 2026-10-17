from sqlalchemy import select, func, not_, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import ARRAY
from app.models import Puzzle, UserProgress
from app.schemas import PuzzleFeedItem
from typing import List, Optional
import random

DEFAULT_RATING = 1200
PRIMARY_BAND_LOW = -120
PRIMARY_BAND_HIGH = 80
EASY_BAND_LOW = -200
EASY_BAND_HIGH = -120
HARD_BAND_LOW = 80
HARD_BAND_HIGH = 160

PRIMARY_RATIO = 0.7
EASY_RATIO = 0.15
HARD_RATIO = 0.15

async def get_user_rating(db: AsyncSession, user_id: str) -> int:
    """User's rating = avg rating of their last 20 solved puzzles."""
    last_20 = (
        select(Puzzle.rating, UserProgress.attempted_at)
        .join(UserProgress, UserProgress.puzzle_id == Puzzle.id)
        .where(
            UserProgress.user_id == user_id,
            UserProgress.solved == True,
        )
        .order_by(UserProgress.attempted_at.desc())
        .limit(20)
        .subquery()
    )
    result = await db.execute(select(func.avg(last_20.c.rating)))
    avg_rating = result.scalar()
    return int(avg_rating) if avg_rating else DEFAULT_RATING

async def get_solved_puzzle_ids(db: AsyncSession, user_id: str) -> set:
    """Get set of puzzle IDs the user has already solved."""
    result = await db.execute(
        select(UserProgress.puzzle_id).where(
            UserProgress.user_id == user_id,
            UserProgress.solved == True
        )
    )
    return set(row[0] for row in result.all())

async def get_recent_attempted_ids(db: AsyncSession, user_id: str, hours: int = 24) -> set:
    """Get set of puzzle IDs attempted recently (to avoid immediate repeats)."""
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    result = await db.execute(
        select(UserProgress.puzzle_id).where(
            UserProgress.user_id == user_id,
            UserProgress.attempted_at >= cutoff
        )
    )
    return set(row[0] for row in result.all())

def build_rating_filter(user_rating: int, band: str):
    """Build SQLAlchemy filter for rating bands."""
    if band == "primary":
        low = user_rating + PRIMARY_BAND_LOW
        high = user_rating + PRIMARY_BAND_HIGH
    elif band == "easy":
        low = user_rating + EASY_BAND_LOW
        high = user_rating + EASY_BAND_HIGH
    elif band == "hard":
        low = user_rating + HARD_BAND_LOW
        high = user_rating + HARD_BAND_HIGH
    else:
        low = user_rating - 400
        high = user_rating + 400
    
    return and_(Puzzle.rating >= low, Puzzle.rating <= high)

async def fetch_puzzles_by_band(
    db: AsyncSession,
    user_id: str,
    user_rating: int,
    band: str,
    count: int,
    solved_ids: set,
    recent_ids: set,
    exclude_ids: set = None
) -> List[Puzzle]:
    """Fetch puzzles from a specific rating band."""
    exclude_ids = exclude_ids or set()
    all_excluded = solved_ids | recent_ids | exclude_ids
    
    rating_filter = build_rating_filter(user_rating, band)
    
    # Base query with exclusions
    stmt = (
        select(Puzzle)
        .where(rating_filter)
        .where(not_(Puzzle.id.in_(all_excluded)) if all_excluded else True)
        .order_by(
            # Weight by: rating distance (closer = better), popularity (higher = better)
            func.abs(Puzzle.rating - user_rating).asc(),
            Puzzle.popularity.desc()
        )
        .limit(count * 3)  # Fetch extra for randomness
    )
    
    result = await db.execute(stmt)
    puzzles = list(result.scalars().all())
    
    # Add some randomness to avoid deterministic feeds
    if len(puzzles) > count:
        puzzles = random.sample(puzzles, count)
    
    return puzzles[:count]

async def get_feed_puzzles(
    db: AsyncSession,
    user_id: str,
    offset: int = 0,
    limit: int = 10
) -> tuple[List[PuzzleFeedItem], int]:
    """Get curated feed puzzles for a user with adaptive difficulty."""
    user_rating = await get_user_rating(db, user_id)
    solved_ids = await get_solved_puzzle_ids(db, user_id)
    recent_ids = await get_recent_attempted_ids(db, user_id)
    
    # Calculate counts per band
    primary_count = int(limit * PRIMARY_RATIO)
    easy_count = int(limit * EASY_RATIO)
    hard_count = limit - primary_count - easy_count
    
    # For pagination, we use offset-based but with a twist:
    # We fetch a larger pool and slice it
    pool_multiplier = 5
    total_pool_size = limit * pool_multiplier
    
    # Fetch from each band
    primary_puzzles = await fetch_puzzles_by_band(
        db, user_id, user_rating, "primary", 
        primary_count * pool_multiplier, solved_ids, recent_ids
    )
    easy_puzzles = await fetch_puzzles_by_band(
        db, user_id, user_rating, "easy",
        easy_count * pool_multiplier, solved_ids, recent_ids, set(p.id for p in primary_puzzles)
    )
    hard_puzzles = await fetch_puzzles_by_band(
        db, user_id, user_rating, "hard",
        hard_count * pool_multiplier, solved_ids, recent_ids, set(p.id for p in primary_puzzles + easy_puzzles)
    )
    
    # Combine and shuffle with weighted preference
    all_puzzles = primary_puzzles + easy_puzzles + hard_puzzles
    
    # Sort by weighted score
    def score_puzzle(p: Puzzle) -> float:
        rating_diff = abs(p.rating - user_rating)
        popularity_score = min(p.popularity / 100.0, 1.0)
        random_factor = random.random() * 0.1
        return rating_diff * 0.7 - popularity_score * 0.3 + random_factor
    
    all_puzzles.sort(key=score_puzzle)
    
    # Apply pagination
    paginated = all_puzzles[offset:offset + limit]
    
    # Convert to feed items
    feed_items = [
        PuzzleFeedItem(
            id=p.id,
            fen=p.fen,
            moves=p.moves,
            rating=p.rating,
            popularity=p.popularity,
            themes=p.themes,
        )
        for p in paginated
    ]
    
    next_offset = offset + limit
    return feed_items, next_offset