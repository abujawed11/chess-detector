/**
 * useStockfish Hook - Backend Native Stockfish Only
 * 
 * This hook provides a React interface to the backend native Stockfish engine.
 * All analysis is performed server-side using a native Stockfish binary.
 * 
 * NO browser-based WASM engine is used.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * React hook for backend Stockfish integration
 * 
 * Returns:
 *   - initialized: boolean - whether the backend engine is ready
 *   - analyzing: boolean - whether an analysis is currently in progress
 *   - error: string | null - last error message
 *   - analyze: function(fen, options) - analyze a position
 *   - getThreadInfo: function() - get thread configuration
 *   - setThreads: function(count) - set thread count (backend managed)
 */
export function useStockfish() {
  const [initialized, setInitialized] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  /**
   * Initialize the backend engine on mount
   */
  useEffect(() => {
    let mounted = true;

    const initEngine = async () => {
      try {
        console.log('🚀 Initializing backend Stockfish engine...');
        
        const response = await fetch(`${API_BASE_URL}/start_engine`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (!mounted) return;

        if (response.ok && (data.status === 'started' || data.status === 'already_running')) {
          setInitialized(true);
          setError(null);
          console.log('✅ Backend Stockfish initialized successfully');
          console.log(`  🔧 Engine: ${data.engine_path || 'Native Stockfish'}`);
        } else {
          throw new Error(data.message || 'Failed to start engine');
        }
      } catch (err) {
        if (!mounted) return;
        const errorMsg = err.message || 'Failed to initialize backend engine';
        setError(errorMsg);
        console.error('❌ Backend Stockfish initialization failed:', err);
        
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
    if (!initialized) {
      throw new Error('Backend engine not initialized');
    }

    const { depth = 18, multiPV = 3 } = options;

    setAnalyzing(true);
    setError(null);

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startTime = Date.now();

    try {
      console.log(`🔍 Analyzing position: depth=${depth}, multiPV=${multiPV}`);
      console.log(`  FEN: ${fen.substring(0, 60)}...`);

      const formData = new FormData();
      formData.append('fen', fen);
      formData.append('depth', depth.toString());
      formData.append('multipv', multiPV.toString());

      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        body: formData,
        signal: abortController.signal
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Analysis failed');
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Analysis complete in ${elapsed}s`);
      console.log(`  Evaluation: ${data.evaluation?.type === 'mate' 
        ? `Mate in ${data.evaluation.value}` 
        : `${(data.evaluation?.value / 100).toFixed(2)}`}`);
      console.log(`  Best move: ${data.bestMove}`);
      console.log(`  Lines: ${data.lines?.length}`);

      return {
        evaluation: data.evaluation,
        lines: data.lines || [],
        depth: data.depth || depth,
        bestMove: data.bestMove
      };

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('🛑 Analysis cancelled');
        throw new Error('Analysis cancelled');
      }
      
      const errorMsg = err.message || 'Analysis failed';
      setError(errorMsg);
      console.error('❌ Analysis error:', err);
      throw err;
    } finally {
      setAnalyzing(false);
      abortControllerRef.current = null;
    }
  }, [initialized]);

  /**
   * Get thread information for the backend engine
   * 
   * @returns {Object} Thread configuration
   * {
   *   current: number,
   *   max: number,
   *   supportsMultiThreading: boolean
   * }
   */
  const getThreadInfo = useCallback(() => {
    // Backend engine configuration
    // Thread count is managed on the backend (typically 2-4 threads)
    return {
      current: 4,
      max: 4,
      supportsMultiThreading: true
    };
  }, []);

  /**
   * Set thread count (backend managed)
   * 
   * Note: Thread count is configured on the backend and cannot be changed
   * from the frontend. This method exists for API compatibility.
   * 
   * @param {number} count - Desired thread count (informational only)
   * @returns {boolean} Always returns true for compatibility
   */
  const setThreads = useCallback(async (count) => {
    console.log(`ℹ️ Thread count is managed by backend (current: 4, requested: ${count})`);
    // Backend manages threading - this is a no-op for compatibility
    return true;
  }, []);

  /**
   * Stop current analysis
   * 
   * Note: Backend analysis cannot be interrupted mid-flight.
   * This will cancel the HTTP request but the backend will continue processing.
   */
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('🛑 Aborting analysis request...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
