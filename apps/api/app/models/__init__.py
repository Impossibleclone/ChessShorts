from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, Index, ForeignKey, BigInteger
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class Puzzle(Base):
    __tablename__ = "puzzles"

    id = Column(String(32), primary_key=True)
    fen = Column(Text, nullable=False)
    moves = Column(Text, nullable=False)  # space-delimited UCI sequence
    rating = Column(Integer, nullable=False)
    popularity = Column(Integer, default=0, nullable=False)
    themes = Column(ARRAY(String), default=[], nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    progress = relationship("UserProgress", back_populates="puzzle", lazy="dynamic")

    __table_args__ = (
        Index("idx_puzzles_rating", "rating"),
        Index("idx_puzzles_popularity", "popularity"),
        Index("idx_puzzles_themes_gin", "themes", postgresql_using="gin"),
    )

class UserProgress(Base):
    __tablename__ = "user_progress"

    user_id = Column(String(64), primary_key=True)
    puzzle_id = Column(String(32), ForeignKey("puzzles.id", ondelete="CASCADE"), primary_key=True)
    solved = Column(Boolean, default=False, nullable=False)
    solve_time_ms = Column(BigInteger, nullable=True)
    attempted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    attempts_count = Column(Integer, default=1, nullable=False)

    # Relationships
    puzzle = relationship("Puzzle", back_populates="progress")

    __table_args__ = (
        Index("idx_up_user", "user_id"),
        Index("idx_up_user_solved", "user_id", "solved"),
        Index("idx_up_user_attempted", "user_id", "attempted_at"),
    )