import { useState, useEffect, useCallback, useRef } from 'react';
import { getStockfish } from '../services/stockfishService';
import { scoreToCentipawns, scoreToString } from '../utils/engineUtils';

/**
 * React hook for Stockfish integration
 */
export function useStockfish() {
  const [initialized, setInitialized] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const stockfishRef = useRef(null);

  // Initialize Stockfish on mount
  useEffect(() => {
    const initEngine = async () => {
      try {
        stockfishRef.current = getStockfish();
        await stockfishRef.current.init();
        setInitialized(true);
      } catch (err) {
        setError(err.message);
        console.error('Failed to initialize Stockfish:', err);
      }
    };

    initEngine();

    // Cleanup on unmount
    return () => {
      if (stockfishRef.current) {
        stockfishRef.current.stop();
      }
    };
  }, []);

  /**
   * Analyze a position
   */
  const analyze = useCallback(async (fen, options = {}) => {
    if (!initialized || !stockfishRef.current) {
      throw new Error('Stockfish not initialized');
    }

    setAnalyzing(true);
    setError(null);

    try {
      stockfishRef.current.setPosition(fen);
      const result = await stockfishRef.current.analyzePosition(options);
      setAnalyzing(false);
      return result;
    } catch (err) {
      setError(err.message);
      setAnalyzing(false);
      throw err;
    }
  }, [initialized]);

  /**
   * Get best move for a position
   */
  const getBestMove = useCallback(async (fen, depth = 18) => {
    const result = await analyze(fen, { depth, multiPV: 1 });
    return result.bestMove;
  }, [analyze]);

  /**
   * Get evaluation for a position
   */
  const getEvaluation = useCallback(async (fen, depth = 18) => {
    const result = await analyze(fen, { depth, multiPV: 1 });
    return {
      score: result.evaluation,
      centipawns: scoreToCentipawns(result.evaluation, fen.split(' ')[1]),
      display: scoreToString(result.evaluation, fen.split(' ')[1])
    };
  }, [analyze]);

  /**
   * Get top N moves
   */
  const getTopMoves = useCallback(async (fen, n = 3, depth = 18) => {
    const result = await analyze(fen, { depth, multiPV: n });
    return result.lines;
  }, [analyze]);

  /**
   * Stop current analysis
   */
  const stop = useCallback(() => {
    if (stockfishRef.current) {
      stockfishRef.current.stop();
      setAnalyzing(false);
    }
  }, []);

  return {
    initialized,
    analyzing,
    error,
    analyze,
    getBestMove,
    getEvaluation,
    getTopMoves,
    stop
  };
}

export default useStockfish;
