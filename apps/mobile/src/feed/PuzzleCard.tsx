import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import Animated, {
  interpolate,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import { Chess } from 'chess.js';
import { usePuzzleLogic } from '@/hooks/usePuzzleLogic';
import { Puzzle } from '@/types';
import type { Move } from 'chess.js';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Responsive board: scales with screen, capped so it never dominates.
const BOARD_SIZE = Math.min(SCREEN_WIDTH * 0.82, 560);

type ChessMoveInfo = {
  move: Move;
  state: { in_promotion: boolean };
};

interface PuzzleCardProps {
  puzzle: Puzzle;
  index: number;
  scrollY: Animated.SharedValue<number>;
  cardHeight: number;
  isActive: boolean;
}

const theme = {
  white: '#e8e2c5',
  black: '#5d6b41',
  lastMoveHighlight: '#aecfa6',
  checkmateHighlight: '#ff6b6b',
};

export const PuzzleCard = React.memo(function PuzzleCard({
  puzzle,
  index,
  scrollY,
  cardHeight,
  isActive,
}: PuzzleCardProps) {
  const boardRef = useRef<ChessboardRef>(null);

  // Entrance animation for the card content when it becomes active.
  const enterY = useSharedValue(isActive ? 0 : 30);
  const enterOpacity = useSharedValue(isActive ? 1 : 0);

  const {
    currentFen,
    feedback,
    step,
    solved,
    showSolution,
    isPlayerTurn,
    expectedMove,
    solutionMoves,
    handleMove,
    toggleSolution,
    resetPuzzle,
  } = usePuzzleLogic(puzzle, isActive);

  // Animate content in when the card becomes the active (centered) one.
  React.useEffect(() => {
    if (isActive) {
      enterY.value = withSpring(0, { damping: 20, stiffness: 150 });
      enterOpacity.value = withSpring(1, { damping: 20, stiffness: 150 });
    } else {
      enterY.value = 30;
      enterOpacity.value = 0;
    }
  }, [isActive]);

  // Card position relative to the scroll center → scale/opacity for Shorts effect.
  const cardStyle = useAnimatedStyle(() => {
    const progress = scrollY.value / cardHeight;
    const diff = progress - index;
    const scale = interpolate(diff, [-1.2, -0.5, 0, 0.5, 1.2], [
      0.86,
      0.96,
      1,
      0.96,
      0.86,
    ]);
    const opacity = interpolate(diff, [-1.2, -0.5, 0, 0.5, 1.2], [
      0.35,
      0.75,
      1,
      0.75,
      0.35,
    ]);
    const translateY = interpolate(diff, [-1, 0, 1], [24, 0, -24]);
    return {
      transform: [{ scale }, { translateY }],
      opacity,
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: enterY.value }],
    opacity: enterOpacity.value,
  }));

  const handleMoveWrapper = (info: ChessMoveInfo) => {
    const result = handleMove(info.move.from, info.move.to, info.move.promotion);
    if (result === false) {
      // Wrong / illegal move: snap board back and clear any stuck selection.
      boardRef.current?.resetBoard(currentFen);
      boardRef.current?.resetAllHighlightedSquares();
    }
  };

  const renderStatus = () => {
    if (solved) {
      return (
        <View style={[styles.statusContainer, styles.statusSolved]}>
          <Text style={styles.statusText}>🎉 Solved!</Text>
          <Text style={styles.statusSubtext}>
            {solutionMoves.length / 2} move{solutionMoves.length > 2 ? 's' : ''} •{' '}
            {puzzle.themes.join(', ')}
          </Text>
        </View>
      );
    }

    if (feedback === 'correct') {
      return (
        <View style={[styles.statusContainer, styles.statusCorrect]}>
          <Text style={styles.statusText}>✓ Correct!</Text>
        </View>
      );
    }

    if (feedback === 'wrong') {
      return (
        <View style={[styles.statusContainer, styles.statusWrong]}>
          <Text style={styles.statusText}>✗ Try again</Text>
        </View>
      );
    }

    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {isPlayerTurn ? 'Your move' : 'Opponent thinking…'}
        </Text>
        <Text style={styles.statusSubtext}>
          {puzzle.themes.join(' · ')} • Rating: {puzzle.rating}
        </Text>
      </View>
    );
  };

  return (
    <Animated.View style={[styles.wrapper, cardStyle]}>
      <View style={styles.pillar} />
      <Animated.View style={[styles.card, contentStyle]}>
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Pressable style={styles.badge} onPress={resetPuzzleWithBoard}>
              <Text style={styles.badgeText}>↺ Reset</Text>
            </Pressable>
            <View style={styles.badge} />
            <Pressable style={styles.badge}>
              <Text style={styles.badgeText}>#{index + 1}</Text>
            </Pressable>
            <Pressable style={styles.badge}>
              <Text style={styles.badgeText}>{puzzle.rating}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.boardWrapper}>
          <View style={styles.boardCenter}>
            <Chessboard
              ref={boardRef}
              fen={currentFen}
              onMove={handleMoveWrapper}
              boardSize={BOARD_SIZE}
              colors={theme}
              withLetters={true}
              withNumbers={true}
              gestureEnabled={true}
            />
          </View>
        </View>

        {renderStatus()}

        {feedback === 'wrong' && (
          <View style={styles.resetContainer}>
            <Pressable style={styles.resetButton} onPress={resetPuzzleWithBoard}>
              <Text style={styles.resetText}>↺ Reset puzzle</Text>
            </Pressable>
          </View>
        )}

        {!solved && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>
              {isPlayerTurn
                ? `Find the best move${
                    expectedMove
                      ? ` (${expectedMove.slice(0, 2)}-${expectedMove.slice(
                          2,
                          4,
                        )})`
                      : ''
                  }`
                : 'Waiting for opponent…'}
            </Text>
          </View>
        )}

        {solved && (
          <View style={styles.solutionContainer}>
            <Text style={styles.solutionTitle}>Solution:</Text>
            <Text style={styles.solutionMoves}>
              {solutionMoves.map((move, i) => (
                <React.Fragment key={i}>
                  {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}
                  {move} {'\u00A0'}
                </React.Fragment>
              ))}
            </Text>
            <Pressable style={styles.showSolutionButton} onPress={toggleSolution}>
              <Text style={styles.showSolutionText}>
                {showSolution ? 'Hide Solution' : 'Show Full Line'}
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
      <View style={styles.pillar} />
    </Animated.View>
  );

  function resetPuzzleWithBoard() {
    resetPuzzle();
    boardRef.current?.resetBoard(puzzle.fen);
    boardRef.current?.resetAllHighlightedSquares();
  }
});

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillar: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  card: {
    width: '100%',
    maxWidth: BOARD_SIZE + 60,
    alignItems: 'center',
    backgroundColor: '#131313',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 20,
    paddingVertical: 26,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  boardWrapper: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 18,
  },
  boardCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  statusSubtext: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  statusCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  statusWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  statusSolved: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  hintContainer: {
    paddingVertical: 6,
  },
  hintText: {
    color: '#8a8a8e',
    fontSize: 14,
    textAlign: 'center',
  },
  resetContainer: {
    marginTop: 12,
  },
  resetButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  resetText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  solutionContainer: {
    width: '100%',
    backgroundColor: '#101010',
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#222',
  },
  solutionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  solutionMoves: {
    color: '#cbd5e1',
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 22,
    marginBottom: 12,
    textAlign: 'center',
  },
  showSolutionButton: {
    alignSelf: 'center',
    marginTop: 4,
  },
  showSolutionText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
});

PuzzleCard.displayName = 'PuzzleCard';
