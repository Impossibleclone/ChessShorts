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

  const queryClient = useQueryClient();

  const { data: feedData, isLoading: isInitialLoading, refetch } = useQuery<FeedResponse, Error>({
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
      await queryClient.prefetchQuery({
        queryKey: [FEED_QUERY_KEY, offset + limit, limit],
        queryFn: () => api.getFeed(offset + limit, limit),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more puzzles');
      setLoadingMore(false);
    }
  }, [offset, limit, isLoadingMore, queryClient, setLoadingMore, setError]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await refetch();
  }, [refetch, setLoading, setError]);

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