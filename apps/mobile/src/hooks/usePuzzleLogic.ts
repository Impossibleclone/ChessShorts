import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Puzzle } from '@/types';
import { usePuzzleViewStore } from '@/store';
import { useSubmitProgress } from './usePuzzleFeed';
import * as Haptics from 'expo-haptics';

export function usePuzzleLogic(puzzle: Puzzle, isActive: boolean) {
  const {
    feedback,
    step,
    solved,
    showSolution,
    startTime,
    setFeedback,
    setStep,
    setSolved,
    setShowSolution,
    setStartTime,
    reset,
  } = usePuzzleViewStore();

  const { mutate: submitProgress } = useSubmitProgress();
  
  const gameRef = useRef(new Chess(puzzle.fen));
  const solutionRef = useRef(puzzle.moves.split(' ').filter(Boolean));
  const [currentFen, setCurrentFen] = useState(puzzle.fen);

  useEffect(() => {
    gameRef.current = new Chess(puzzle.fen);
    solutionRef.current = puzzle.moves.split(' ').filter(Boolean);
    setCurrentFen(puzzle.fen);
    reset();
    setStartTime(Date.now());
  }, [puzzle.id, reset, setStartTime]);

  useEffect(() => {
    if (!isActive) {
      if (solved) {
        const solveTime = Date.now() - startTime;
        submitProgress({ puzzleId: puzzle.id, solved: true, solveTimeMs: solveTime });
      }
    }
  }, [isActive, solved, startTime, puzzle.id, submitProgress]);

  const getExpectedMove = useCallback(() => {
    return solutionRef.current[step] || null;
  }, [step]);

  const isPlayerTurn = useCallback(() => {
    return step % 2 === 0;
  }, [step]);

  const handleMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (solved || step >= solutionRef.current.length) return false;

      const expectedMove = solutionRef.current[step];
      if (!expectedMove) return false;

      const candidateMove = `${from}${to}${promotion || ''}`;
      const expectedBase = expectedMove.slice(0, 4);
      const expectedPromo = expectedMove[4] || '';

      const candidateBase = candidateMove.slice(0, 4);
      const candidatePromo = candidateMove[4] || '';

      if (candidateBase !== expectedBase || candidatePromo !== expectedPromo) {
        setFeedback('wrong');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => setFeedback('idle'), 800);
        return false;
      }

      try {
        const game = new Chess(gameRef.current.fen());
        game.move(expectedMove);
        
        let nextStep = step + 1;
        
        if (nextStep < solutionRef.current.length) {
          const opponentMove = solutionRef.current[nextStep];
          game.move(opponentMove);
          nextStep += 1;
        }

        gameRef.current = game;
        setCurrentFen(game.fen());
        setStep(nextStep);

        if (nextStep >= solutionRef.current.length) {
          setSolved(true);
          setFeedback('solved');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setFeedback('correct');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => setFeedback('idle'), 500);
        }

        return true;
      } catch (error) {
        console.error('Move application error:', error);
        return false;
      }
    },
    [step, solved, setFeedback, setStep, setSolved, setCurrentFen, submitProgress]
  );

  const toggleSolution = useCallback(() => {
    setShowSolution(!showSolution);
  }, [setShowSolution, showSolution]);

  const getSolutionMoves = useCallback(() => {
    return solutionRef.current;
  }, []);

  const getGame = useCallback(() => {
    return gameRef.current;
  }, []);

  return {
    game: gameRef.current,
    currentFen,
    feedback,
    step,
    solved,
    showSolution,
    isPlayerTurn: isPlayerTurn(),
    expectedMove: getExpectedMove(),
    solutionMoves: getSolutionMoves(),
    handleMove,
    toggleSolution,
  };
}