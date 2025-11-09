// import { useState, useEffect, useCallback, useRef } from 'react';
// import { getStockfish } from '../services/stockfishService';
// import { scoreToCentipawns, scoreToString } from '../utils/engineUtils';

// /**
//  * React hook for Stockfish integration
//  */
// export function useStockfish() {
//   const [initialized, setInitialized] = useState(false);
//   const [analyzing, setAnalyzing] = useState(false);
//   const [error, setError] = useState(null);
//   const stockfishRef = useRef(null);

//   // Initialize Stockfish on mount
//   useEffect(() => {
//     const initEngine = async () => {
//       try {
//         stockfishRef.current = getStockfish();
//         await stockfishRef.current.init();
//         setInitialized(true);
//       } catch (err) {
//         setError(err.message);
//         console.error('Failed to initialize Stockfish:', err);
//       }
//     };

//     initEngine();

//     // Cleanup on unmount
//     return () => {
//       if (stockfishRef.current) {
//         stockfishRef.current.stop();
//       }
//     };
//   }, []);

//   /**
//    * Analyze a position
//    */
//   const analyze = useCallback(async (fen, options = {}) => {
//     if (!initialized || !stockfishRef.current) {
//       throw new Error('Stockfish not initialized');
//     }

//     setAnalyzing(true);
//     setError(null);

//     try {
//       stockfishRef.current.setPosition(fen);
//       const result = await stockfishRef.current.analyzePosition(options);
//       setAnalyzing(false);
//       return result;
//     } catch (err) {
//       setError(err.message);
//       setAnalyzing(false);
//       throw err;
//     }
//   }, [initialized]);

//   /**
//    * Get best move for a position
//    */
//   const getBestMove = useCallback(async (fen, depth = 18) => {
//     const result = await analyze(fen, { depth, multiPV: 1 });
//     return result.bestMove;
//   }, [analyze]);

//   /**
//    * Get evaluation for a position
//    */
//   const getEvaluation = useCallback(async (fen, depth = 18) => {
//     const result = await analyze(fen, { depth, multiPV: 1 });
//     return {
//       score: result.evaluation,
//       centipawns: scoreToCentipawns(result.evaluation, fen.split(' ')[1]),
//       display: scoreToString(result.evaluation, fen.split(' ')[1])
//     };
//   }, [analyze]);

//   /**
//    * Get top N moves
//    */
//   const getTopMoves = useCallback(async (fen, n = 3, depth = 18) => {
//     const result = await analyze(fen, { depth, multiPV: n });
//     return result.lines;
//   }, [analyze]);

//   /**
//    * Stop current analysis
//    */
//   const stop = useCallback(() => {
//     if (stockfishRef.current) {
//       stockfishRef.current.stop();
//       setAnalyzing(false);
//     }
//   }, []);

//   return {
//     initialized,
//     analyzing,
//     error,
//     analyze,
//     getBestMove,
//     getEvaluation,
//     getTopMoves,
//     stop
//   };
// }

// export default useStockfish;



import { useState, useEffect, useCallback, useRef } from 'react';
import { getStockfish } from '../services/stockfishService';
import { scoreToCentipawns, scoreToString } from '../utils/engineUtils';

/**
 * React hook for Stockfish integration (with searchmoves support)
 *
 * All analyze* methods accept:
 *   - depth?: number        (preferred for deterministic results)
 *   - multiPV?: number      (default 1; >1 only for root "top lines")
 *   - searchMoves?: string[]  // UCI move list, e.g. ['e2e4'] -> uses 'go ... searchmoves e2e4'
 *   - nodes?: number
 *   - movetime?: number     (avoid mixing movetime with depth if you want stability)
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
        await stockfishRef.current.init?.(); // optional chaining if your service already inits internally
        setInitialized(true);
      } catch (err) {
        setError(err.message || String(err));
        console.error('Failed to initialize Stockfish:', err);
      }
    };

    initEngine();

    // Cleanup on unmount
    return () => {
      try {
        stockfishRef.current?.stop?.();
      } catch {}
    };
  }, []);

  /**
   * Core analyze call (passes options to service 1:1).
   * options supports: { depth, multiPV, searchMoves, nodes, movetime }
   * Expects the service to return:
   *   {
   *     evaluation: { type: 'cp'|'mate', value: number },
   *     bestMove: 'e2e4',
   *     lines: [{ pv: string[], evaluation?: {type, value}, cp?: number }, ...]
   *   }
   */
  const analyze = useCallback(async (fen, options = {}) => {
    if (!initialized || !stockfishRef.current) {
      throw new Error('Stockfish not initialized');
    }

    setAnalyzing(true);
    setError(null);

    try {
      stockfishRef.current.setPosition?.(fen);
      // Forward all options (depth/multiPV/searchMoves/nodes/movetime)
      const result = await stockfishRef.current.analyzePosition?.(options);
      setAnalyzing(false);
      return result;
    } catch (err) {
      setError(err.message || String(err));
      setAnalyzing(false);
      throw err;
    }
  }, [initialized]);

  /**
   * Convenience: get best move (root search, no searchMoves)
   */
  const getBestMove = useCallback(async (fen, depth = 20) => {
    const result = await analyze(fen, { depth, multiPV: 1 });
    return result.bestMove;
  }, [analyze]);

  /**
   * Convenience: get top-N lines (root search, no searchMoves)
   */
  const getTopMoves = useCallback(async (fen, n = 3, depth = 20) => {
    const result = await analyze(fen, { depth, multiPV: n });
    return result.lines || [];
  }, [analyze]);

  /**
   * Re-search exactly ONE move from a given root position using `searchmoves`.
   * This is the key for fair CP-loss comparison with the engine's PV1.
   */
  const analyzeSpecificMove = useCallback(async (fen, uciMove, depth = 20) => {
    // we purposely use multiPV:1 with a single searchMoves constraint
    const result = await analyze(fen, { depth, multiPV: 1, searchMoves: [uciMove] });
    return result;
  }, [analyze]);

  /**
   * Get evaluation object at root (no searchMoves).
   */
  const getEvaluation = useCallback(async (fen, depth = 20) => {
    const result = await analyze(fen, { depth, multiPV: 1 });
    const turn = fen.split(' ')[1]; // 'w'|'b'
    return {
      score: result.evaluation,
      centipawns: scoreToCentipawns(result.evaluation, turn),
      display: scoreToString(result.evaluation, turn),
    };
  }, [analyze]);

  /**
   * Stop current analysis (if service supports it)
   */
  const stop = useCallback(() => {
    try {
      stockfishRef.current?.stop?.();
      setAnalyzing(false);
    } catch {}
  }, []);

  return {
    initialized,
    analyzing,
    error,

    // core
    analyze,
    stop,

    // helpers
    getBestMove,
    getTopMoves,
    getEvaluation,
    analyzeSpecificMove, // <-- use this in your TestClassification for "our move" and "best move" re-search
  };
}

export default useStockfish;
