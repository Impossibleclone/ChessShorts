from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class PuzzleBase(BaseModel):
    id: str
    fen: str
    moves: str
    rating: int
    popularity: int
    themes: List[str]

class PuzzleFeedItem(PuzzleBase):
    pass

class FeedResponse(BaseModel):
    puzzles: List[PuzzleFeedItem]
    next_offset: int
    limit: int

class SubmitProgressRequest(BaseModel):
    user_id: str
    puzzle_id: str
    solved: bool
    solve_time_ms: Optional[int] = None

class UserProgressResponse(BaseModel):
    user_id: str
    puzzle_id: str
    solved: bool
    solve_time_ms: Optional[int] = None
    attempted_at: datetime
    attempts_count: int

class UserStatsResponse(BaseModel):
    user_id: str
    rating: int
    solved_count: int
    total_attempts: int
    accuracy: float