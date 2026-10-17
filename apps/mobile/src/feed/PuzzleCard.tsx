import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import { usePuzzleLogic } from '@/hooks/usePuzzleLogic';
import { Puzzle } from '@/types';
import type { Move } from 'chess.js';

// Local type definition since ChessMoveInfo is not exported
type ChessMoveInfo = {
  move: Move;
  state: {
    in_promotion: boolean;
  };
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Board scales with both axes so it stays large on tablets (landscape too)
// without overflowing short viewports.
const BOARD_SIZE = Math.min(SCREEN_WIDTH * 0.88, SCREEN_HEIGHT * 0.5, 560);

interface PuzzleCardProps {
  puzzle: Puzzle;
  index: number;
  scrollY: Animated.Value;
  cardHeight: number;
  isActive: boolean;
}

export const PuzzleCard = React.memo(function PuzzleCard({
  puzzle,
  index,
  scrollY,
  cardHeight,
  isActive,
}: PuzzleCardProps) {
  const boardRef = useRef<ChessboardRef>(null);
  // Entrance animation — same core-Animated pattern as the proven PuzzleView.
  const fadeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isActive ? 0 : 40)).current;

  const {
    currentFen,
    feedback,
    solved,
    showSolution,
    isPlayerTurn,
    expectedMove,
    solutionMoves,
    handleMove,
    toggleSolution,
    resetPuzzle,
  } = usePuzzleLogic(puzzle, isActive);

  React.useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(40);
    }
  }, [isActive, fadeAnim, slideAnim]);

  // Shorts-style focus: the centered card is full-size/bright, neighbours
  // scale down and dim while scrolling. Driven natively off the scroll value.
  const inputRange = [
    (index - 1) * cardHeight,
    index * cardHeight,
    (index + 1) * cardHeight,
  ];
  const scale = scrollY.interpolate({
    inputRange,
    outputRange: [0.92, 1, 0.92],
    extrapolate: 'clamp',
  });
  const dimOpacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.45, 1, 0.45],
    extrapolate: 'clamp',
  });

  const theme = {
    white: '#e8e2c5',
    black: '#5d6b41',
    lastMoveHighlight: '#aecfa6',
    checkmateHighlight: '#ff6b6b',
    promotionPieceButton: '#ffe066',
  };

  const handleMoveWrapper = useCallback(
    (info: ChessMoveInfo) => {
      const result = handleMove(info.move.from, info.move.to, info.move.promotion);
      if (result === false) {
        // Wrong / illegal move: snap the board back to the current position
        // and clear any stuck piece highlight (selection transform).
        boardRef.current?.resetBoard(currentFen);
        boardRef.current?.resetAllHighlightedSquares();
      }
    },
    [handleMove, currentFen],
  );

  const resetPuzzleWithBoard = useCallback(() => {
    resetPuzzle();
    boardRef.current?.resetBoard(puzzle.fen);
    boardRef.current?.resetAllHighlightedSquares();
  }, [resetPuzzle, puzzle.fen]);

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
          {isPlayerTurn ? 'Your move' : 'Opponent thinking...'}
        </Text>
        <Text style={styles.statusSubtext}>
          {puzzle.themes.join(' · ')} · Rating: {puzzle.rating}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.page, { height: cardHeight }]} collapsable={false}>
      <Animated.View style={{ transform: [{ scale }], opacity: dimOpacity }}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.badgeRow}>
            <Pressable style={styles.badge} onPress={resetPuzzleWithBoard}>
              <Text style={styles.badgeText}>↺ Reset</Text>
            </Pressable>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>#{index + 1}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{puzzle.rating}</Text>
            </View>
          </View>

          <View style={styles.boardWrapper}>
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

          {renderStatus()}

          {feedback === 'wrong' && (
            <Pressable style={styles.resetButton} onPress={resetPuzzleWithBoard}>
              <Text style={styles.resetButtonText}>↺ Reset puzzle</Text>
            </Pressable>
          )}

          {!solved && (
            <View style={styles.hintContainer}>
              <Text style={styles.hintText}>
                {isPlayerTurn
                  ? `Find the best move${
                      expectedMove
                        ? ` (${expectedMove.slice(0, 2)}-${expectedMove.slice(2, 4)})`
                        : ''
                    }`
                  : 'Waiting for opponent...'}
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
              <Pressable onPress={toggleSolution} style={styles.showSolutionButton}>
                <Text style={styles.showSolutionText}>
                  {showSolution ? 'Hide Solution' : 'Show Full Line'}
                </Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  page: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
  card: {
    width: Dimensions.get('window').width,
    maxWidth: BOARD_SIZE + 56,
    alignItems: 'center',
    backgroundColor: '#131313',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#232323',
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  badge: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2c2c2c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#e5e5e5',
    fontSize: 13,
    fontWeight: '600',
  },
  boardWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
    marginBottom: 18,
    backgroundColor: '#fff',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 14,
    minHeight: 50,
    justifyContent: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  statusSubtext: {
    color: '#8f8f96',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  statusCorrect: {
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  statusWrong: {
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  statusSolved: {
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  hintContainer: {
    paddingVertical: 6,
  },
  hintText: {
    color: '#6f6f76',
    fontSize: 14,
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2c2c2c',
  },
  resetButtonText: {
    color: '#4da3ff',
    fontSize: 13,
    fontWeight: '600',
  },
  solutionContainer: {
    width: '100%',
    backgroundColor: '#101010',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#232323',
  },
  solutionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  solutionMoves: {
    color: '#b9b9c2',
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 22,
    marginBottom: 12,
  },
  showSolutionButton: {
    alignItems: 'center',
  },
  showSolutionText: {
    color: '#4da3ff',
    fontSize: 14,
    fontWeight: '500',
  },
});

PuzzleCard.displayName = 'PuzzleCard';
