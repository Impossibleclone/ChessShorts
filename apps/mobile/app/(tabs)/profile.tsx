import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useUserStore } from '@/store';
import { api } from '@/api/client';
import { useQuery } from '@tanstack/react-query';

export default function ProfileScreen() {
  const { userId, rating, solvedCount, totalAttempts } = useUserStore();
  const [displayUserId, setDisplayUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.ensureUserId().then(setDisplayUserId);
  }, []);

  const { data: progress } = useQuery({
    queryKey: ['user-progress', displayUserId],
    queryFn: () => displayUserId ? api.getUserProgress(displayUserId) : [],
    enabled: !!displayUserId,
  });

  const recentSolves = progress?.filter(p => p.solved).slice(-10).reverse() || [];
  const accuracy = totalAttempts > 0 ? Math.round((solvedCount / totalAttempts) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{rating}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{solvedCount}</Text>
          <Text style={styles.statLabel}>Solved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalAttempts}</Text>
          <Text style={styles.statLabel}>Attempts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{accuracy}%</Text>
          <Text style={styles.statLabel}>Accuracy</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Solves</Text>
        {recentSolves.length === 0 ? (
          <Text style={styles.emptyText}>No solves yet. Start playing!</Text>
        ) : (
          <View style={styles.recentList}>
            {recentSolves.map((solve, i) => (
              <View key={solve.puzzleId} style={styles.recentItem}>
                <Text style={styles.recentNumber}>{i + 1}.</Text>
                <Text style={styles.recentPuzzleId}>{solve.puzzleId}</Text>
                <Text style={styles.recentTime}>
                  {solve.solveTimeMs ? `${(solve.solveTimeMs / 1000).toFixed(1)}s` : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User ID</Text>
        <Text style={styles.userIdText} selectable={true}>
          {displayUserId || 'Loading...'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    minWidth: 80,
    flex: 1,
    borderWidth: 1,
    borderColor: '#222',
  },
  statValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  recentList: {
    gap: 8,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  recentNumber: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    width: 24,
  },
  recentPuzzleId: {
    color: '#ddd',
    fontSize: 14,
    fontFamily: 'monospace',
    flex: 1,
  },
  recentTime: {
    color: '#888',
    fontSize: 13,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 40,
  },
  userIdText: {
    color: '#666',
    fontSize: 13,
    fontFamily: 'monospace',
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
});