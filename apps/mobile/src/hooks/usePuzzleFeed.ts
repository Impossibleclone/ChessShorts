import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useFeedStore, useUserStore } from '@/store';
import { FeedResponse } from '@/types';

const FEED_QUERY_KEY = 'puzzle-feed';

export function usePuzzleFeed() {
  const { 
    puzzles, 
    offset, 
    limit, 
    currentIndex, 
    setPuzzles, 
    appendPuzzles, 
    setOffset, 
    setCurrentIndex,
    setLoading,
    setLoadingMore,
    setError,
    isLoading,
    isLoadingMore,
    error,
  } = useFeedStore();

  const { data: feedData, isLoading: isInitialLoading } = useQuery<FeedResponse, Error>({
    queryKey: [FEED_QUERY_KEY, offset, limit],
    queryFn: () => api.getFeed(offset, limit),
    enabled: offset === 0,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (feedData) {
      if (offset === 0) {
        setPuzzles(feedData.puzzles);
      } else {
        appendPuzzles(feedData.puzzles);
      }
      setOffset(feedData.nextOffset);
      setLoading(false);
      setLoadingMore(false);
    }
  }, [feedData, offset, setPuzzles, appendPuzzles, setOffset, setLoading, setLoadingMore]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    setLoadingMore(true);
    try {
      // `offset` is the cursor for the NEXT page (API returns nextOffset),
      // so fetch at `offset` directly — offset + limit would skip a page.
      const next = await api.getFeed(offset, limit);
      appendPuzzles(next.puzzles);
      setOffset(next.nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more puzzles');
    } finally {
      setLoadingMore(false);
    }
  }, [offset, limit, isLoadingMore, appendPuzzles, setOffset, setLoadingMore, setError]);

  const refresh = useCallback(async () => {
    // Fetch a fresh first page directly: going through refetch() here would
    // hit the disabled (offset > 0) query cache entry and append duplicates
    // instead of replacing the feed.
    setLoading(true);
    setError(null);
    try {
      const fresh = await api.getFeed(0, limit);
      setPuzzles(fresh.puzzles);
      setOffset(fresh.nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh puzzles');
    } finally {
      setLoading(false);
    }
  }, [limit, setPuzzles, setOffset, setLoading, setError]);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
    
    if (index >= puzzles.length - 3 && !isLoadingMore) {
      loadMore();
    }
  }, [puzzles.length, isLoadingMore, setCurrentIndex, loadMore]);

  return {
    puzzles,
    currentIndex,
    goToIndex,
    isLoading: isInitialLoading || isLoading,
    isLoadingMore,
    error,
    refresh,
    loadMore,
  };
}

export function useSubmitProgress() {
  const { incrementSolved, incrementAttempts, setRating } = useUserStore();

  return useMutation({
    mutationFn: async (data: { puzzleId: string; solved: boolean; solveTimeMs?: number }) => {
      const userId = await api.ensureUserId();
      await api.submitProgress({ userId, ...data });
    },
    onSuccess: (_, variables) => {
      incrementAttempts();
      if (variables.solved) {
        incrementSolved();
      }
    },
    onError: (error) => {
      console.error('Failed to submit progress:', error);
    },
  });
}