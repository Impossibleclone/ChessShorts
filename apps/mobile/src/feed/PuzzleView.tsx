import React, { useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Dimensions, 
  Animated,
  Easing,
} from 'react-native';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import { Chess } from 'chess.js';
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
const BOARD_SIZE = Math.min(SCREEN_WIDTH * 0.92, 380);

interface PuzzleViewProps {
  puzzle: Puzzle;
  isActive: boolean;
  index: number;
}

export const PuzzleView = React.memo(function PuzzleView({ puzzle, isActive, index }: PuzzleViewProps) {
  const boardRef = useRef<ChessboardRef>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

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
  } = usePuzzleLogic(puzzle, isActive);

  const theme = useMemo(() => ({
    white: '#f0d9b5',
    black: '#b58863',
    lastMoveHighlight: '#90ee90',
    checkmateHighlight: '#ff6b6b',
    promotionPieceButton: '#ffe066',
  }), []);

  React.useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }
  }, [isActive, fadeAnim, slideAnim]);

  const handleMoveWrapper = (info: ChessMoveInfo) => {
    handleMove(info.move.from, info.move.to, info.move.promotion);
  };

  const renderStatus = () => {
    if (solved) {
      return (
        <Animated.View style={[styles.statusContainer, styles.statusSolved]}>
          <Text style={styles.statusText}>🎉 Solved!</Text>
          <Text style={styles.statusSubtext}>
            {solutionMoves.length / 2} move{solutionMoves.length > 2 ? 's' : ''} • {puzzle.themes.join(', ')}
          </Text>
        </Animated.View>
      );
    }

    if (feedback === 'correct') {
      return (
        <Animated.View style={[styles.statusContainer, styles.statusCorrect]}>
          <Text style={styles.statusText}>✓ Correct!</Text>
        </Animated.View>
      );
    }

    if (feedback === 'wrong') {
      return (
        <Animated.View style={[styles.statusContainer, styles.statusWrong]}>
          <Text style={styles.statusText}>✗ Try again</Text>
        </Animated.View>
      );
    }

    return (
      <Animated.View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          {isPlayerTurn ? 'Your move' : 'Opponent thinking...'}
        </Text>
        <Text style={styles.statusSubtext}>
          {puzzle.themes.join(' · ')} · Rating: {puzzle.rating}
        </Text>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container} collapsable={false}>
      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.badgeContainer}>
            <Text style={styles.ratingBadge}>#{index + 1}</Text>
            <Text style={styles.ratingBadge}>{puzzle.rating}</Text>
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

        {!solved && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>
              {isPlayerTurn 
                ? `Find the best move${expectedMove ? ` (${expectedMove.slice(0,2)}-${expectedMove.slice(2,4)})` : ''}` 
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
            <View style={styles.actionRow}>
              <Text 
                style={styles.showSolutionButton}
                onPress={toggleSolution}
              >
                {showSolution ? 'Hide Solution' : 'Show Full Line'}
              </Text>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: BOARD_SIZE + 40,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  ratingBadge: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  boardWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  board: {
    borderRadius: 8,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 50,
    justifyContent: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  statusSubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
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
    paddingVertical: 8,
  },
  hintText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  solutionContainer: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  solutionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  solutionMoves: {
    color: '#aaa',
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 22,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  showSolutionButton: {
    color: '#3498db',
    fontSize: 14,
    fontWeight: '500',
  },
});

PuzzleView.displayName = 'PuzzleView';