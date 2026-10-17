import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, RefreshControl, Text, ActivityIndicator } from 'react-native';
import { LegendList, LegendListRef } from '@legendapp/list/react-native';
import { PuzzleView } from './PuzzleView';
import { usePuzzleFeed } from '@/hooks/usePuzzleFeed';
import { useFeedStore } from '@/store';
import { Puzzle } from '@/types';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_HEIGHT = Math.min(SCREEN_HEIGHT, 1100);

export const FeedScreen = () => {
  const {
    puzzles,
    currentIndex,
    goToIndex,
    isLoading,
    isLoadingMore,
    error,
    refresh,
    loadMore,
  } = usePuzzleFeed();

  const listRef = useRef<LegendListRef>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleIndex, setVisibleIndex] = useState(0);

  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: Array<{ index?: number; viewablePercent?: number }> }) => {
    if (viewableItems.length > 0) {
      const mostVisible = viewableItems.reduce((prev: { index?: number; viewablePercent?: number }, current: { index?: number; viewablePercent?: number }) => 
        (current.viewablePercent || 0) > (prev.viewablePercent || 0) ? current : prev
      );
      const index = mostVisible.index;
      if (index !== undefined && index !== visibleIndex) {
        setVisibleIndex(index);
        goToIndex(index);
      }
    }
  }, [visibleIndex, goToIndex]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const renderItem = useCallback(({ item, index }: { item: Puzzle; index: number }) => (
    <View
      key={item.id}
      style={{ height: ITEM_HEIGHT, width: SCREEN_WIDTH, alignItems: 'center' }}
      collapsable={false}
    >
      <PuzzleView puzzle={item} isActive={index === visibleIndex} index={index} />
    </View>
  ), [visibleIndex]);

  if (isLoading && puzzles.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading puzzles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LegendList
        ref={listRef}
        data={puzzles}
        estimatedItemSize={ITEM_HEIGHT}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        renderItem={renderItem}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 60,
          minimumViewTime: 100,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#fff']}
            progressBackgroundColor="#111"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ ...styles.listContent, alignItems: 'center' }}
        recycleItems={false}
      />
      
      {isLoadingMore && puzzles.length > 0 && (
        <View style={styles.loadMoreIndicator}>
          <ActivityIndicator size="small" color="#888" />
          <Text style={styles.loadMoreText}>Loading more...</Text>
        </View>
      )}

      {error && puzzles.length === 0 && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorRetry} onPress={refresh}>Pull to retry</Text>
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
  listContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    gap: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },
  loadMoreIndicator: {
    padding: 20,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  loadMoreText: {
    color: '#666',
    fontSize: 14,
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
    color: '#e74c3c',
    fontSize: 16,
    textAlign: 'center',
  },
  errorRetry: {
    color: '#3498db',
    fontSize: 14,
  },
});

FeedScreen.displayName = 'FeedScreen';