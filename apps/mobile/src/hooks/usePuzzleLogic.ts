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
 * The needle is applied AFTER a short prelude so the player actually SEES the
 * opponent's move happen (e.g. a checking move) instead of being dropped into
 * a position where their king is already in check with no explanation. After
 * the prelude:
 * - the player only ever plays their own color (opponent replies animate in
 *   ~0.4 s later; opponent pieces stay inert the whole time)
 * - `playerColor` is the color the solver controls — used to orient the board
 * - every puzzle card holds its own state (no global store → no cross-card
 *   re-render storms, the main source of piece-drag lag)
 */
export type Feedback = 'idle' | 'correct' | 'wrong' | 'solved';
export type Phase = 'prelude' | 'playing';

export const OPPOSITE_COLOR: Record<'w' | 'b', 'w' | 'b'> = { w: 'b', b: 'w' };

interface PuzzleSetup {
  game: Chess;
  rawFen: string;
  needle: string | null;
  playerColor: 'w' | 'b';
  solution: string[];
}

function toUciMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

function initialize(puzzle: Puzzle): PuzzleSetup {
  const game = new Chess(puzzle.fen);
  const moves = puzzle.moves.split(' ').filter(Boolean);
  const needle = moves.length ? moves[0] : null;
  // The needle move is always played by the side-to-move in the stored FEN,
  // so the solver controls the opposite color.
  const sideToMove = puzzle.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const playerColor =
    needle && moves.length > 1 ? OPPOSITE_COLOR[sideToMove] : sideToMove;
  return {
    game,
    rawFen: game.fen(),
    needle,
    playerColor,
    solution: moves.slice(1),
  };
}

export function usePuzzleLogic(puzzle: Puzzle, isActive: boolean) {
  // The card is keyed by puzzle.id upstream, so this initializer runs once
  // per puzzle; resetPuzzle re-runs it for the explicit reset button.
  const [initial] = useState(() => initialize(puzzle));
  const gameRef = useRef<Chess>(initial.game);
  const solutionRef = useRef<string[]>(initial.solution);

  const [currentFen, setCurrentFen] = useState(initial.rawFen);
  const [playerColor] = useState<'w' | 'b'>(initial.playerColor);
  const [phase, setPhase] = useState<Phase>(
    initial.needle && initial.solution.length ? 'prelude' : 'playing',
  );
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [solved, setSolved] = useState(initial.solution.length === 0);
  const [showSolution, setShowSolution] = useState(false);
  const [replying, setReplying] = useState(false);
  const startTimeRef = useRef(Date.now());
  const preludeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: submitProgress } = useSubmitProgress();

  const opPlayNeedle = useCallback(() => {
    const game = gameRef.current;
    if (!initial.needle) {
      setPhase('playing');
      return;
    }
    try {
      game.move(toUciMove(initial.needle));
    } catch (error) {
      console.error('Needle application error:', error);
    }
    setCurrentFen(game.fen());
    setPhase('playing');
  }, [initial.needle]);

  // The opponent visibly opens the puzzle shortly after the card settles —
  // the player watches the move (check included) rather than inheriting it.
  useEffect(() => {
    if (phase !== 'prelude') return;
    preludeTimerRef.current = setTimeout(opPlayNeedle, 600);
    return () => {
      if (preludeTimerRef.current) clearTimeout(preludeTimerRef.current);
      preludeTimerRef.current = null;
    };
  }, [phase, opPlayNeedle]);

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
      if (phase !== 'playing') return false; // opponent is still opening
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
    [phase, step, solved],
  );

  const resetPuzzle = useCallback(() => {
    if (preludeTimerRef.current) {
      clearTimeout(preludeTimerRef.current);
      preludeTimerRef.current = null;
    }
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
    setCurrentFen(fresh.rawFen);
    setStep(0);
    setFeedback('idle');
    setSolved(fresh.solution.length === 0);
    setShowSolution(false);
    setReplying(false);
    setPhase(fresh.needle && fresh.solution.length ? 'prelude' : 'playing');
    startTimeRef.current = Date.now();
  }, [puzzle]);

  const toggleSolution = useCallback(() => {
    setShowSolution((current) => !current);
  }, []);

  const interactionOpen = phase === 'playing' && !solved;

  return {
    currentFen,
    playerColor,
    phase,
    feedback,
    step,
    solved,
    showSolution,
    replying,
    interactionOpen,
    /** null = nothing is draggable (prelude / solved); else the solver's color */
    movableColor: interactionOpen && !replying ? playerColor : null,
    isPlayerTurn: interactionOpen && !replying && step % 2 === 0,
    expectedMove: solutionRef.current[step] ?? null,
    solutionMoves: solutionRef.current,
    handleMove,
    toggleSolution,
    resetPuzzle,
  };
}
