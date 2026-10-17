import React, { useCallback, useMemo, useRef, useState } from 'react';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Standard modern green/ivory board scheme (chess.com-style).
const THEME = {
  white: '#EEEED2',
  black: '#769656',
  lastMoveHighlight: 'rgba(250, 216, 66, 0.55)',
  checkmateHighlight: '#E84855',
  promotionPieceButton: '#FFB366',
};

interface PuzzleCardProps {
  puzzle: Puzzle;
  index: number;
  scrollY: Animated.Value;
  cardHeight: number;
  isActive: boolean;
  /** Only the active card and its immediate neighbors mount a full board. */
  boardReady: boolean;
}

/**
 * Isolated board subtree: re-renders only when the position, orientation or
 * interactivity window changes. Status pills, hint toggles and timers live in
 * the parent and no longer re-render all 32 pieces on every transient update.
 */
const PuzzleBoard = React.memo(function PuzzleBoard({
  fen,
  boardSize,
  flipBoard,
  movableColor,
  apiRef,
  onMove,
}: {
  fen: string;
  boardSize: number;
  flipBoard: boolean;
  movableColor: 'w' | 'b' | null;
  apiRef: React.MutableRefObject<ChessboardRef | null>;
  onMove: (from: string, to: string, promotion?: string) => boolean;
}) {
  const handleMove = useCallback(
    (info: ChessMoveInfo) => {
      const result = onMove(info.move.from, info.move.to, info.move.promotion);
      if (result === false) {
        // Wrong/illegal move: snap the board back and clear any stuck
        // piece selection.
        apiRef.current?.resetBoard(fen);
        apiRef.current?.resetAllHighlightedSquares();
      }
    },
    [onMove, fen, apiRef],
  );

  return (
    <Chessboard
      ref={apiRef}
      fen={fen}
      onMove={handleMove}
      boardSize={boardSize}
      colors={THEME}
      flipBoard={flipBoard}
      movableColor={movableColor}
      withLetters={true}
      withNumbers={true}
      gestureEnabled={true}
    />
  );
});

export const PuzzleCard = React.memo(function PuzzleCard({
  puzzle,
  index,
  scrollY,
  cardHeight,
  isActive,
  boardReady,
}: PuzzleCardProps) {
  const apiRef = useRef<ChessboardRef | null>(null);
  const [hintSeen, setHintSeen] = useState(false);
  // Entrance animation — same core-Animated pattern as the proven PuzzleView.
  const fadeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isActive ? 0 : 40)).current;

  const {
    currentFen,
    playerColor,
    phase,
    feedback,
    step,
    solved,
    showSolution,
    replying,
    isPlayerTurn,
    movableColor,
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

  // Re-arm the hint every time the puzzle advances so it never lingers.
  React.useEffect(() => {
    setHintSeen(false);
  }, [step, puzzle.id]);

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

  // Nearly edge-to-edge: bounded by viewport width (tiny margins) and by
  // viewport height so status/hint chrome always fits below the board.
  const boardSize = Math.max(
    120,
    Math.min(Math.floor(cardHeight * 0.54), SCREEN_WIDTH - 44),
  );
  const cardWidth = boardSize + 36;

  const resetPuzzleWithBoard = useCallback(() => {
    resetPuzzle();
    apiRef.current?.resetBoard(puzzle.fen);
    apiRef.current?.resetAllHighlightedSquares();
  }, [resetPuzzle, puzzle.fen]);

  const renderStatus = () => {
    if (solved) {
      return (
        <View style={[styles.statusContainer, styles.statusSolved]}>
          <Text style={styles.statusText}>🎉 Solved!</Text>
          <Text style={styles.statusSubtext}>
            {Math.ceil(solutionMoves.length / 2)} move
            {Math.ceil(solutionMoves.length / 2) > 1 ? 's' : ''} •{' '}
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
          {phase === 'prelude'
            ? `${playerColor === 'w' ? 'Black' : 'White'} opens…`
            : replying
              ? 'Opponent is replying…'
              : 'Your move'}
        </Text>
        <Text style={styles.statusSubtext}>
          {puzzle.themes.join(' · ')} · Rating: {puzzle.rating}
        </Text>
      </View>
    );
  };

  const renderBoard = () => {
    if (!boardReady) {
      // Lightweight placeholder while the card is outside the active window —
      // keeps mounted chessboards (32 animated pieces each) to about 3.
      return (
        <View
          style={[styles.boardPlaceholder, { width: boardSize, height: boardSize }]}
        >
          <Text style={styles.placeholderText}>Preparing board…</Text>
        </View>
      );
    }
    return (
      <PuzzleBoard
        fen={currentFen}
        boardSize={boardSize}
        flipBoard={playerColor === 'b'}
        movableColor={movableColor}
        apiRef={apiRef}
        onMove={handleMove}
      />
    );
  };

  return (
    <View style={[styles.page, { height: cardHeight }]} collapsable={false}>
      <Animated.View style={{ transform: [{ scale }], opacity: dimOpacity }}>
        <Animated.View
          style={[
            styles.card,
            { width: cardWidth },
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.badgeRow}>
            <View style={styles.sideChip}>
              <View
                style={[
                  styles.sideDot,
                  playerColor === 'b' && styles.sideDotBlack,
                ]}
              />
              <Text style={styles.badgeText}>
                You play {playerColor === 'w' ? 'White' : 'Black'}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>#{index + 1}</Text>
            </View>
            <Pressable style={styles.badge} onPress={resetPuzzleWithBoard}>
              <Text style={styles.badgeText}>↺ Reset</Text>
            </Pressable>
          </View>

          <View style={styles.boardWrapper}>{renderBoard()}</View>

          {renderStatus()}

          {feedback === 'wrong' && (
            <Pressable style={styles.resetButton} onPress={resetPuzzleWithBoard}>
              <Text style={styles.resetButtonText}>↺ Reset puzzle</Text>
            </Pressable>
          )}

          {!solved &&
            (isPlayerTurn ? (
              <View style={styles.hintRow}>
                <Text style={styles.hintText}>Find the best move</Text>
                <Pressable
                  style={[styles.smallButton, hintSeen && styles.smallButtonActive]}
                  onPress={() => setHintSeen((seen) => !seen)}
                >
                  <Text style={styles.smallButtonText}>
                    {hintSeen ? 'Hide hint' : '💡 Hint'}
                  </Text>
                </Pressable>
                {hintSeen && expectedMove ? (
                  <Text style={styles.hintRevealInline}>
                    💡 A piece of yours sits on {expectedMove.slice(0, 2)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.hintContainer}>
                <Text style={styles.hintText}>Opponent to move…</Text>
              </View>
            ))}

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
                  {showSolution ? 'Hide Full Line' : 'Show Full Line'}
                </Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
});

PuzzleCard.displayName = 'PuzzleCard';

const styles = StyleSheet.create({
  page: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#121214',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#26262a',
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#1c1c20',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2c2c32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1c1c20',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2c2c32',
  },
  sideDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f5f5f4',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  sideDotBlack: {
    backgroundColor: '#18181b',
    borderColor: '#52525b',
  },
  badgeText: {
    color: '#e5e5e5',
    fontSize: 13,
    fontWeight: '600',
  },
  boardWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#2b2b30',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  boardPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1e',
    borderRadius: 10,
  },
  placeholderText: {
    color: '#8f8f96',
    fontSize: 14,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 48,
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
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  statusWrong: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  statusSolved: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
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
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  hintRevealInline: {
    color: '#d4b45a',
    fontSize: 13,
    fontWeight: '600',
  },
  smallButton: {
    backgroundColor: '#1c1c20',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2c2c32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonActive: {
    borderColor: '#d4b45a',
  },
  smallButtonText: {
    color: '#cfcfcf',
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    marginTop: 10,
    backgroundColor: '#1c1c20',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2c2c32',
  },
  resetButtonText: {
    color: '#4da3ff',
    fontSize: 13,
    fontWeight: '600',
  },
  solutionContainer: {
    width: '100%',
    backgroundColor: '#0d0d0f',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#26262a',
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
