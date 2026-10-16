import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { Puzzle } from '@/types';

const storage = new MMKV();

const mmkvStorage = {
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    storage.set(name, value);
  },
  removeItem: (name: string) => {
    storage.delete(name);
  },
};

interface FeedState {
  puzzles: Puzzle[];
  currentIndex: number;
  offset: number;
  limit: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  setPuzzles: (puzzles: Puzzle[]) => void;
  appendPuzzles: (puzzles: Puzzle[]) => void;
  setCurrentIndex: (index: number) => void;
  setOffset: (offset: number) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useFeedStore = create<FeedState>()(
  persist(
    (set) => ({
      puzzles: [],
      currentIndex: 0,
      offset: 0,
      limit: 10,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      setPuzzles: (puzzles) => set({ puzzles }),
      appendPuzzles: (newPuzzles) => set((state) => ({ puzzles: [...state.puzzles, ...newPuzzles] })),
      setCurrentIndex: (currentIndex) => set({ currentIndex }),
      setOffset: (offset) => set({ offset }),
      setLoading: (isLoading) => set({ isLoading }),
      setLoadingMore: (isLoadingMore) => set({ isLoadingMore }),
      setError: (error) => set({ error }),
      reset: () => set({ puzzles: [], currentIndex: 0, offset: 0, error: null }),
    }),
    {
      name: 'feed-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        puzzles: state.puzzles,
        currentIndex: state.currentIndex,
        offset: state.offset,
      }),
    }
  )
);

interface UserState {
  userId: string | null;
  rating: number;
  solvedCount: number;
  totalAttempts: number;
  setUserId: (userId: string) => void;
  setRating: (rating: number) => void;
  incrementSolved: () => void;
  incrementAttempts: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      rating: 1200,
      solvedCount: 0,
      totalAttempts: 0,
      setUserId: (userId) => set({ userId }),
      setRating: (rating) => set({ rating }),
      incrementSolved: () => set((state) => ({ solvedCount: state.solvedCount + 1 })),
      incrementAttempts: () => set((state) => ({ totalAttempts: state.totalAttempts + 1 })),
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);

interface PuzzleViewState {
  feedback: 'idle' | 'correct' | 'wrong' | 'solved';
  step: number;
  solved: boolean;
  showSolution: boolean;
  startTime: number;
  setFeedback: (feedback: 'idle' | 'correct' | 'wrong' | 'solved') => void;
  setStep: (step: number) => void;
  setSolved: (solved: boolean) => void;
  setShowSolution: (show: boolean) => void;
  setStartTime: (time: number) => void;
  reset: () => void;
}

export const usePuzzleViewStore = create<PuzzleViewState>((set) => ({
  feedback: 'idle',
  step: 0,
  solved: false,
  showSolution: false,
  startTime: Date.now(),
  setFeedback: (feedback) => set({ feedback }),
  setStep: (step) => set({ step }),
  setSolved: (solved) => set({ solved }),
  setShowSolution: (showSolution) => set({ showSolution }),
  setStartTime: (startTime) => set({ startTime }),
  reset: () => set({ feedback: 'idle', step: 0, solved: false, showSolution: false, startTime: Date.now() }),
}));