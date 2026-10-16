export interface Puzzle {
  id: string;
  fen: string;
  moves: string; // space-delimited UCI sequence
  rating: number;
  popularity: number;
  themes: string[];
}

export interface FeedResponse {
  puzzles: Puzzle[];
  nextOffset: number;
  limit: number;
}

export interface UserProgress {
  userId: string;
  puzzleId: string;
  solved: boolean;
  solveTimeMs?: number;
  attemptedAt: string;
}

export interface SubmitProgressRequest {
  userId: string;
  puzzleId: string;
  solved: boolean;
  solveTimeMs?: number;
}

export interface ApiError {
  message: string;
  code?: string;
}