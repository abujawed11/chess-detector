/**
 * useStockfish Hook - Browser-Based Stockfish
 *
 * NOW USES BROWSER ENGINE instead of backend
 * This hook provides a React interface to the browser-based Stockfish engine.
 * All analysis is performed client-side using WASM Stockfish.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getStockfish } from '../services/stockfishService';

/**
 * React hook for browser Stockfish integration
 *
 * Returns:
 *   - initialized: boolean - whether the browser engine is ready
 *   - analyzing: boolean - whether an analysis is currently in progress
 *   - error: string | null - last error message
 *   - analyze: function(fen, options) - analyze a position
 *   - getThreadInfo: function() - get thread configuration
 *   - setThreads: function(count) - set thread count (browser managed)
 */
export function useStockfish() {
  const [initialized, setInitialized] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const engineRef = useRef(null);

  /**
   * Initialize the browser engine on mount
   */
  useEffect(() => {
    let mounted = true;

    const initEngine = async () => {
      try {
        console.log('🚀 Initializing browser Stockfish engine...');

        // Get browser engine instance
        const engine = getStockfish();
        engineRef.current = engine;

        // Initialize the engine
        await engine.init();

        if (!mounted) return;

        setInitialized(true);
        setError(null);
        console.log('✅ Browser Stockfish initialized successfully');
        console.log(`  🧵 Threads: ${engine.currentThreads}`);
        console.log(`  💾 Running in browser (WASM)`);
      } catch (err) {
        if (!mounted) return;
        const errorMsg = err.message || 'Failed to initialize browser engine';
        setError(errorMsg);
        console.error('❌ Browser Stockfish initialization failed:', err);

        // Retry once after a delay
        setTimeout(() => {
          if (mounted) {
            console.log('🔄 Retrying engine initialization...');
            initEngine();
          }
        }, 2000);
      }
    };

    initEngine();

    return () => {
      mounted = false;
      // Cleanup engine on unmount
      if (engineRef.current) {
        try {
          engineRef.current.stop();
        } catch (e) {
          console.warn('Error stopping engine on unmount:', e);
        }
      }
    };
  }, []);

  /**
   * Analyze a chess position
   *
   * @param {string} fen - FEN string of the position to analyze
   * @param {Object} options - Analysis options
   * @param {number} options.depth - Search depth (default: 18)
   * @param {number} options.multiPV - Number of lines to analyze (default: 3)
   * @returns {Promise<Object>} Analysis result with evaluation, lines, and bestMove
   *
   * Returns:
   * {
   *   evaluation: { type: 'cp' | 'mate', value: number },
   *   lines: [
   *     {
   *       multipv: number,
   *       cp: number | null,
   *       mate: number | null,
   *       depth: number,
   *       pv: ['e2e4', 'e7e5', ...],
   *       pvSan: '1. e4 e5 2. Nf3 Nc6 ...' (optional)
   *     }
   *   ],
   *   depth: number,
   *   bestMove: 'e2e4'
   * }
   */
  const analyze = useCallback(async (fen, options = {}) => {
    if (!initialized || !engineRef.current) {
      throw new Error('Browser engine not initialized');
    }

    const { depth = 18, multiPV = 3 } = options;

    setAnalyzing(true);
    setError(null);

    const startTime = Date.now();

    try {
      console.log(`🔍 Analyzing position (browser): depth=${depth}, multiPV=${multiPV}`);
      console.log(`  FEN: ${fen.substring(0, 60)}...`);

      const engine = engineRef.current;

      // Set position
      engine.setPosition(fen);

      // Analyze
      const result = await engine.analyzePosition({
        depth,
        multiPV
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Browser analysis complete in ${elapsed}s`);
      console.log(`  Evaluation: ${result.evaluation?.type === 'mate'
        ? `Mate in ${result.evaluation.value}`
        : `${(result.evaluation?.value / 100).toFixed(2)}`}`);
      console.log(`  Best move: ${result.bestMove}`);
      console.log(`  Lines: ${result.lines?.length}`);

      return {
        evaluation: result.evaluation,
        lines: result.lines || [],
        depth: result.depth || depth,
        bestMove: result.bestMove
      };

    } catch (err) {
      const errorMsg = err.message || 'Browser analysis failed';
      setError(errorMsg);
      console.error('❌ Browser analysis error:', err);
      throw err;
    } finally {
      setAnalyzing(false);
    }
  }, [initialized]);

  /**
   * Get thread information for the browser engine
   *
   * @returns {Object} Thread configuration
   * {
   *   current: number,
   *   max: number,
   *   supportsMultiThreading: boolean
   * }
   */
  const getThreadInfo = useCallback(() => {
    if (engineRef.current) {
      return engineRef.current.getThreadInfo();
    }

    // Default thread info before engine is initialized
    const threads = navigator.hardwareConcurrency || 4;
    return {
      current: Math.min(threads, 6),
      max: Math.min(threads, 6),
      supportsMultiThreading: true
    };
  }, []);

  /**
   * Set thread count (browser managed)
   *
   * @param {number} count - Desired thread count
   * @returns {Promise<boolean>} Success status
   */
  const setThreads = useCallback(async (count) => {
    if (engineRef.current) {
      console.log(`ℹ️ Thread count is managed by browser engine (requested: ${count})`);
      return await engineRef.current.setThreads(count);
    }
    console.log(`ℹ️ Engine not initialized yet, thread count will be set on init`);
    return true;
  }, []);

  /**
   * Stop current analysis
   */
  const stop = useCallback(() => {
    if (engineRef.current) {
      console.log('🛑 Stopping browser analysis...');
      engineRef.current.stop();
    }
    setAnalyzing(false);
  }, []);

  return {
    initialized,
    analyzing,
    error,
    analyze,
    getThreadInfo,
    setThreads,
    stop
  };
}

export default useStockfish;
