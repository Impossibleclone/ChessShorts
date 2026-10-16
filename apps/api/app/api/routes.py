from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.base import get_db
from app.models import Puzzle, UserProgress
from app.schemas import (
    FeedResponse, 
    SubmitProgressRequest, 
    UserProgressResponse,
    UserStatsResponse,
    PuzzleFeedItem,
)
from app.services.feed import get_feed_puzzles, get_user_rating
from typing import List
from datetime import datetime

router = APIRouter(prefix="/api/v1", tags=["feed"])

@router.get("/feed", response_model=FeedResponse)
async def get_feed(
    user_id: str = Query(..., alias="userId", description="User ID"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(10, ge=1, le=50, description="Page size"),
    db: AsyncSession = Depends(get_db),
):
    """Get curated puzzle feed for a user with adaptive difficulty."""
    puzzles, next_offset = await get_feed_puzzles(db, user_id, offset, limit)
    return FeedResponse(puzzles=puzzles, next_offset=next_offset, limit=limit)

@router.post("/progress", response_model=UserProgressResponse)
async def submit_progress(
    data: SubmitProgressRequest,
    db: AsyncSession = Depends(get_db),
):
    """Record user's puzzle attempt result."""
    # Check if puzzle exists
    puzzle_result = await db.execute(select(Puzzle).where(Puzzle.id == data.puzzle_id))
    puzzle = puzzle_result.scalar_one_or_none()
    if not puzzle:
        raise HTTPException(status_code=404, detail="Puzzle not found")
    
    # Upsert user progress
    existing = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == data.user_id,
            UserProgress.puzzle_id == data.puzzle_id
        )
    )
    progress = existing.scalar_one_or_none()
    
    if progress:
        progress.attempts_count += 1
        if data.solved and not progress.solved:
            progress.solved = True
            progress.solve_time_ms = data.solve_time_ms
        progress.attempted_at = datetime.utcnow()
    else:
        progress = UserProgress(
            user_id=data.user_id,
            puzzle_id=data.puzzle_id,
            solved=data.solved,
            solve_time_ms=data.solve_time_ms,
            attempts_count=1,
        )
        db.add(progress)
    
    await db.commit()
    await db.refresh(progress)
    
    return UserProgressResponse(
        user_id=progress.user_id,
        puzzle_id=progress.puzzle_id,
        solved=progress.solved,
        solve_time_ms=progress.solve_time_ms,
        attempted_at=progress.attempted_at,
        attempts_count=progress.attempts_count,
    )

@router.get("/progress/{user_id}", response_model=List[UserProgressResponse])
async def get_user_progress(
    user_id: str,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get user's puzzle progress history."""
    result = await db.execute(
        select(UserProgress)
        .where(UserProgress.user_id == user_id)
        .order_by(UserProgress.attempted_at.desc())
        .limit(limit)
    )
    progress_list = result.scalars().all()
    
    return [
        UserProgressResponse(
            user_id=p.user_id,
            puzzle_id=p.puzzle_id,
            solved=p.solved,
            solve_time_ms=p.solve_time_ms,
            attempted_at=p.attempted_at,
            attempts_count=p.attempts_count,
        )
        for p in progress_list
    ]

@router.get("/stats/{user_id}", response_model=UserStatsResponse)
async def get_user_stats(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get user statistics."""
    # Total attempts
    attempts_result = await db.execute(
        select(func.count(UserProgress.id)).where(UserProgress.user_id == user_id)
    )
    total_attempts = attempts_result.scalar() or 0
    
    # Solved count
    solved_result = await db.execute(
        select(func.count(UserProgress.id)).where(
            UserProgress.user_id == user_id,
            UserProgress.solved == True
        )
    )
    solved_count = solved_result.scalar() or 0
    
    # Current rating
    rating = await get_user_rating(db, user_id)
    
    accuracy = (solved_count / total_attempts * 100) if total_attempts > 0 else 0
    
    return UserStatsResponse(
        user_id=user_id,
        rating=rating,
        solved_count=solved_count,
        total_attempts=total_attempts,
        accuracy=accuracy,
    )

@router.get("/puzzles/{puzzle_id}", response_model=PuzzleFeedItem)
async def get_puzzle(
    puzzle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single puzzle by ID."""
    result = await db.execute(select(Puzzle).where(Puzzle.id == puzzle_id))
    puzzle = result.scalar_one_or_none()
    if not puzzle:
        raise HTTPException(status_code=404, detail="Puzzle not found")
    
    return PuzzleFeedItem(
        id=puzzle.id,
        fen=puzzle.fen,
        moves=puzzle.moves,
        rating=puzzle.rating,
        popularity=puzzle.popularity,
        themes=puzzle.themes,
    )

@router.get("/health")
async def health_check():
    from app.db.base import db_state

    db = "ready" if db_state["ready"] else ("error" if db_state["error"] else "starting")
    payload: dict = {"status": "ok", "db": db}
    if db_state["error"]:
        # safe to expose: first 200 chars, no secrets (we never store URLs here)
        payload["db_error"] = db_state["error"][:200]
    return payload