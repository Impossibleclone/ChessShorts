import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useDerivedValue,
  useSharedValue,
  useAnimatedScrollHandler,
  runOnJS,
} from 'react-native-reanimated';
import { Puzzle } from '@/types';
import { usePuzzleFeed } from '@/hooks/usePuzzleFeed';
import { PuzzleCard } from './PuzzleCard';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT, 1100);

export const ShortsFeed = () => {
  const {
    puzzles,
    isLoading,
    isLoadingMore,
    error,
    refresh,
    loadMore,
  } = usePuzzleFeed();

  const scrollY = useSharedValue(0);
  const scrollViewRef = useRef<Animated.ScrollView | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Which card is centered → drives which puzzle is "active".
  const activeIndex = useDerivedValue(() => Math.round(scrollY.value / CARD_HEIGHT));

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      // Auto-load more when nearing the bottom (guard inside loadMore).
      if (
        event.contentOffset.y + event.layoutMeasurement.height >=
        event.contentSize.height - 120
      ) {
        runOnJS(loadMore)();
      }
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (isLoading && puzzles.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading puzzles…</Text>
      </View>
    );
  }

  if (error && puzzles.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryText}>Pull to retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        snapToInterval={CARD_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3b82f6']}
            progressBackgroundColor="#131313"
          />
        }
        contentContainerStyle={styles.content}
      >
        {puzzles.map((puzzle, i) => {
          const isActive = activeIndex.value === i;
          return (
            <PuzzleCard
              key={puzzle.id}
              puzzle={puzzle}
              index={i}
              scrollY={scrollY}
              cardHeight={CARD_HEIGHT}
              isActive={isActive}
            />
          );
        })}
        {isLoadingMore && puzzles.length > 0 && (
          <View style={styles.loadMoreRow}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={styles.loadMoreText}>Loading more…</Text>
          </View>
        )}
      </Animated.ScrollView>

      {puzzles.length > 0 && !isLoadingMore && (
        <View style={styles.swipeHint}>
          <Text style={styles.swipeHintText}>Swipe up for next puzzle ↓</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    paddingBottom: 80,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    gap: 16,
  },
  loadingText: {
    color: '#8a8a8e',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
    gap: 12,
  },
  errorText: {
    color: '#f87171',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  retryText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  loadMoreRow: {
    padding: 24,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadMoreText: {
    color: '#8a8a8e',
    fontSize: 14,
  },
  swipeHint: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  swipeHintText: {
    color: '#52525b',
    fontSize: 13,
    fontWeight: '500',
  },
});
