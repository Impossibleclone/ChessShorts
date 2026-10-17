import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Puzzle } from '@/types';
import { useSubmitProgress } from './usePuzzleFeed';
import * as Haptics from 'expo-haptics';

/**
 * Lichess puzzle DB convention (verified against the Neon import + mateIn*
 * parity test): Moves = [opponent "needle", player, opponent, ...] and the
 * stored FEN is one half-move BEFORE the opponent plays the needle.
 *
 * We auto-play the needle on setup, so:
 * - the player only ever plays their own side (replies animate in after ~0.4s)
 * - `playerColor` is the color the solver controls — used to orient the board
 * - every puzzle card holds its own state (no global store → no cross-card
 *   re-render storms, the main source of piece-drag lag)
 */
export type Feedback = 'idle' | 'correct' | 'wrong' | 'solved';

interface PuzzleSetup {
  game: Chess;
  fen: string;
  playerColor: 'w' | 'b';
  solution: string[];
}

function toUciMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

function initialize(puzzle: Puzzle): PuzzleSetup {
  const game = new Chess(puzzle.fen);
  const moves = puzzle.moves.split(' ').filter(Boolean);
  if (moves.length) {
    const needle = moves[0];
    try {
      game.move(toUciMove(needle));
    } catch {
      // Malformed needle in a corrupt row — surface the raw position.
    }
  }
  return { game, fen: game.fen(), playerColor: game.turn(), solution: moves.slice(1) };
}

export function usePuzzleLogic(puzzle: Puzzle, isActive: boolean) {
  // The card is keyed by puzzle.id upstream, so this initializer runs once
  // per puzzle; resetPuzzle re-uses it for the explicit reset button.
  const [initial] = useState(() => initialize(puzzle));
  const gameRef = useRef<Chess>(initial.game);
  const solutionRef = useRef<string[]>(initial.solution);

  const [currentFen, setCurrentFen] = useState(initial.fen);
  const [playerColor] = useState<'w' | 'b'>(initial.playerColor);
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [solved, setSolved] = useState(initial.solution.length === 0);
  const [showSolution, setShowSolution] = useState(false);
  const [replying, setReplying] = useState(false);
  const startTimeRef = useRef(Date.now());
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: submitProgress } = useSubmitProgress();

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // Progress is submitted when the user swipes off a solved puzzle.
  useEffect(() => {
    if (isActive || !solved) return;
    submitProgress({
      puzzleId: puzzle.id,
      solved: true,
      solveTimeMs: Date.now() - startTimeRef.current,
    });
  }, [isActive, solved, puzzle.id, submitProgress]);

  const handleMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const game = gameRef.current;
      if (!game) return false;
      if (replyTimerRef.current) return false; // opponent reply is animating
      if (solved || step >= solutionRef.current.length) return false;

      const expected = solutionRef.current[step];
      if (!expected) return false;

      const candidateBase = `${from}${to}`;
      const candidatePromo = promotion ?? '';
      if (
        candidateBase !== expected.slice(0, 4) ||
        candidatePromo.slice(0, 1) !== (expected[4] ?? '')
      ) {
        setFeedback('wrong');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => setFeedback('idle'), 800);
        return false;
      }

      try {
        game.move({ from, to, promotion: candidatePromo || undefined });
      } catch (error) {
        console.error('Move application error:', error);
        return false;
      }

      setCurrentFen(game.fen());

      const next = step + 1;
      if (next >= solutionRef.current.length) {
        // Last move of the line belongs to the solver — puzzle solved.
        setStep(next);
        setSolved(true);
        setFeedback('solved');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return true;
      }

      setStep(next);
      setFeedback('correct');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedback('idle'), 500);

      // The opponent's reply plays automatically, slightly delayed so the
      // player sees it happen — they never input it themselves.
      const reply = solutionRef.current[next];
      if (reply) {
        setReplying(true);
        replyTimerRef.current = setTimeout(() => {
          replyTimerRef.current = null;
          try {
            game.move(toUciMove(reply));
          } catch (error) {
            console.error('Reply application error:', error);
          }
          setCurrentFen(game.fen());
          setReplying(false);
        }, 420);
      }

      return true;
    },
    [step, solved],
  );

  const resetPuzzle = useCallback(() => {
    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    const fresh = initialize(puzzle);
    gameRef.current = fresh.game;
    solutionRef.current = fresh.solution;
    setCurrentFen(fresh.fen);
    setStep(0);
    setFeedback('idle');
    setSolved(fresh.solution.length === 0);
    setShowSolution(false);
    setReplying(false);
    startTimeRef.current = Date.now();
  }, [puzzle]);

  const toggleSolution = useCallback(() => {
    setShowSolution((current) => !current);
  }, []);

  return {
    currentFen,
    playerColor,
    feedback,
    step,
    solved,
    showSolution,
    replying,
    isPlayerTurn: !replying && step % 2 === 0,
    expectedMove: solutionRef.current[step] ?? null,
    solutionMoves: solutionRef.current,
    handleMove,
    toggleSolution,
    resetPuzzle,
  };
}
