from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import List, Optional
from datetime import datetime


class CamelModel(BaseModel):
    """snake_case in Python, camelCase on the wire (matches the mobile client).

    FastAPI serializes response models with by_alias=True, so responses emit
    camelCase (nextOffset, userId, ...); request bodies accept camelCase,
    while internal constructors can keep snake_case field names.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PuzzleBase(CamelModel):
    id: str
    fen: str
    moves: str
    rating: int
    popularity: int
    themes: List[str]


class PuzzleFeedItem(PuzzleBase):
    pass


class FeedResponse(CamelModel):
    puzzles: List[PuzzleFeedItem]
    next_offset: int
    limit: int


class SubmitProgressRequest(CamelModel):
    user_id: str
    puzzle_id: str
    solved: bool
    solve_time_ms: Optional[int] = None


class UserProgressResponse(CamelModel):
    user_id: str
    puzzle_id: str
    solved: bool
    solve_time_ms: Optional[int] = None
    attempted_at: datetime
    attempts_count: int


class UserStatsResponse(CamelModel):
    user_id: str
    rating: int
    solved_count: int
    total_attempts: int
    accuracy: float
