import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';
import { usePuzzleFeed } from '@/hooks/usePuzzleFeed';
import { PuzzleCard } from './PuzzleCard';
import { CardBoundary } from './CardBoundary';

/**
 * Shorts-style vertical puzzle feed.
 *
 * Built ONLY on core React Native primitives (ScrollView + Animated with the
 * native driver) — the same stack proven in the PuzzleView build. Reanimated
 * worklets on the scroll path are deliberately avoided: a worklet exception
 * runs on the UI thread where neither React error boundaries nor the global
 * JS error handler can catch it (it white-screens release builds).
 *
 * Each card is exactly the measured viewport height, so `pagingEnabled`
 * snaps precisely card-to-card (YouTube Shorts behaviour) on any screen.
 */
export const ShortsFeed = () => {
  const { puzzles, isLoading, isLoadingMore, error, refresh, loadMore } =
    usePuzzleFeed();

  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView | null>(null);
  const loadingMoreRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Native-driven scroll position for the card scale/dim animations.
  const handleScrollEvent = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  );

  // Fires when a drag or momentum gesture settles (plain JS thread).
  const handleSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const page = layoutMeasurement.height;
      if (page > 0) {
        setActiveIndex(Math.max(0, Math.round(contentOffset.y / page)));
        // Near the end of the loaded content → fetch the next page.
        if (
          contentOffset.y + layoutMeasurement.height >=
            contentSize.height - page * 1.5 &&
          !loadingMoreRef.current
        ) {
          loadingMoreRef.current = true;
          loadMore()
            .catch(() => {})
            .finally(() => {
              loadingMoreRef.current = false;
            });
        }
      }
    },
    [loadMore],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      setActiveIndex(0);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const showLoading = isLoading && puzzles.length === 0;
  const showError = !!error && puzzles.length === 0;

  return (
    <View
      style={styles.container}
      onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
    >
      {showError ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : showLoading || viewportHeight === 0 ? (
        <LoadingPuzzles />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          pagingEnabled
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={handleScrollEvent}
          onScrollEndDrag={handleSettled}
          onMomentumScrollEnd={handleSettled}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#4da3ff']}
              tintColor="#4da3ff"
              progressBackgroundColor="#131313"
            />
          }
        >
          {puzzles.map((puzzle, i) => (
            <CardBoundary key={puzzle.id} height={viewportHeight}>
              <PuzzleCard
                puzzle={puzzle}
                index={i}
                scrollY={scrollY}
                cardHeight={viewportHeight}
                isActive={i === activeIndex}
                boardReady={Math.abs(i - activeIndex) <= 1}
              />
            </CardBoundary>
          ))}
        </ScrollView>
      )}

      {/* Top overlay: brand + position in the feed */}
      <View style={styles.topBar} pointerEvents="none">
        <Text style={styles.brand}>♛ ChessShorts</Text>
        {puzzles.length > 0 ? (
          <Text style={styles.counter}>
            #{activeIndex + 1} · {puzzles.length} loaded
          </Text>
        ) : null}
      </View>

      {/* Bottom hint: only on the first card, like Shorts' swipe cue */}
      {activeIndex === 0 && puzzles.length > 1 ? (
        <View style={styles.swipeHint} pointerEvents="none">
          <Text style={styles.swipeHintText}>Swipe up for the next puzzle ↑</Text>
        </View>
      ) : null}

      {isLoadingMore ? (
        <View style={styles.loadingMore} pointerEvents="none">
          <ActivityIndicator size="small" color="#4da3ff" />
          <Text style={styles.loadingMoreText}>Loading more…</Text>
        </View>
      ) : null}
    </View>
  );
};

/**
 * Chess-themed loading: a pulsing queen instead of a bare spinner.
 */
const LoadingPuzzles = React.memo(function LoadingPuzzles() {
  const pulse = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.15],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.95],
  });
  return (
    <View style={styles.stateContainer}>
      <Animated.Text
        style={[styles.loadingGlyph, { transform: [{ scale }], opacity }]}
      >
        ♛
      </Animated.Text>
      <Text style={styles.stateText}>Loading puzzles…</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
    gap: 14,
  },
  stateText: {
    color: '#8f8f96',
    fontSize: 16,
  },
  loadingGlyph: {
    color: '#ffffff',
    fontSize: 46,
    marginBottom: 4,
  },
  errorText: {
    color: '#ff7f7f',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#2c2c2c',
  },
  retryText: {
    color: '#4da3ff',
    fontSize: 14,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  brand: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    opacity: 0.92,
  },
  counter: {
    color: '#d4b45a',
    fontSize: 13,
    fontWeight: '700',
  },
  swipeHint: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  swipeHintText: {
    color: '#56565e',
    fontSize: 13,
    fontWeight: '500',
  },
  loadingMore: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(19, 19, 19, 0.9)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#232323',
  },
  loadingMoreText: {
    color: '#8f8f96',
    fontSize: 13,
  },
});
