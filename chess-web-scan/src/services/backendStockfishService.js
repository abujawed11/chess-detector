/**
 * Backend Stockfish Service
 * Communicates with native Stockfish engine via FastAPI backend
 */

const API_BASE_URL = 'http://localhost:8000';

class BackendStockfishService {
  constructor() {
    this.initialized = false;
    this.isReady = false;
    this.analyzing = false;
    this.engineRunning = false;
  }

  /**
   * Initialize the backend Stockfish engine
   */
  async init(retryCount = 0) {
    if (this.initialized) {
      return Promise.resolve();
    }

    try {
      console.log(`🚀 Initializing Backend Stockfish (attempt ${retryCount + 1}/3)...`);

      // Start the engine on the backend
      const response = await fetch(`${API_BASE_URL}/start_engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && (data.status === 'started' || data.status === 'already_running')) {
        this.initialized = true;
        this.isReady = true;
        this.engineRunning = true;

        console.log('✅ Backend Stockfish initialized successfully');
        console.log(`  🔧 Engine: ${data.engine_path || 'Native Stockfish'}`);
        console.log('  🧵 Threads: 2 (backend managed)');
        console.log('  💾 Hash: 512 MB (backend managed)');

        return Promise.resolve();
      } else {
        throw new Error(data.message || 'Failed to start engine');
      }
    } catch (error) {
      console.error(`Failed to initialize Backend Stockfish (attempt ${retryCount + 1}):`, error);

      // Retry up to 3 times
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.init(retryCount + 1);
      }

      // All retries failed
      throw new Error(`Failed to initialize Backend Stockfish after ${retryCount + 1} attempts: ${error.message}`);
    }
  }

  /**
   * Set position from FEN (not needed for backend, kept for compatibility)
   */
  setPosition(fen) {
    // Position is sent with each analysis request to the backend
    // This method exists for API compatibility
  }

  /**
   * Analyze position
   * @param {Object} options - Analysis options
   * @param {number} options.depth - Search depth (default: 18)
   * @param {number} options.multiPV - Number of lines to analyze (default: 1)
   * @param {string[]} options.searchMoves - Restrict search to specific moves (not supported yet)
   * @returns {Promise} Resolves with best move and evaluation
   */
  async analyzePosition(options = {}) {
    const {
      depth = 18,
      multiPV = 1,
      searchMoves = null,
      fen = null
    } = options;

    if (!fen) {
      throw new Error('FEN is required for backend analysis');
    }

    console.log('🔍 Starting backend analysis:', { fen: fen.substring(0, 50), depth, multiPV, searchMoves });

    if (!this.isReady) {
      await this.init();
    }

    this.analyzing = true;

    try {
      const formData = new FormData();
      formData.append('fen', fen);
      formData.append('depth', depth.toString());
      formData.append('multipv', multiPV.toString());

      const startTime = Date.now();
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Analysis failed');
      }

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Backend analysis complete in ${elapsedTime}s`);
      console.log('📦 Backend response:', {
        evaluation: data.evaluation,
        linesCount: data.lines?.length,
        bestMove: data.bestMove
      });

      // Backend now returns frontend-compatible format directly
      // { evaluation, lines, depth, bestMove }
      this.analyzing = false;

      return {
        bestMove: data.bestMove || data.lines?.[0]?.pv?.[0] || null,
        evaluation: data.evaluation || null,
        lines: data.lines || [],
        depth: data.depth || depth
      };
    } catch (error) {
      this.analyzing = false;
      console.error('Backend analysis error:', error);
      throw error;
    }
  }

  /**
   * Parse info message (compatibility method - not used in backend)
   */
  parseInfo(message) {
    // Not needed for backend service
    return {};
  }

  /**
   * Get best move for current position
   */
  async getBestMove(fen, depth = 18) {
    const result = await this.analyzePosition({ fen, depth, multiPV: 1 });
    return result.bestMove;
  }

  /**
   * Get evaluation for current position
   */
  async getEvaluation(fen, depth = 18) {
    const result = await this.analyzePosition({ fen, depth, multiPV: 1 });
    return result.evaluation;
  }

  /**
   * Get top N moves with evaluations
   */
  async getTopMoves(fen, n = 3, depth = 18) {
    const result = await this.analyzePosition({ fen, depth, multiPV: n });
    return result.lines;
  }

  /**
   * Stop current analysis (not supported by backend yet)
   */
  stop() {
    this.analyzing = false;
    // Backend analysis can't be interrupted mid-flight currently
    // This is a known limitation
  }

  /**
   * Get thread information
   */
  getThreadInfo() {
    return {
      current: 2,
      max: 2,
      supportsMultiThreading: true
    };
  }

  /**
   * Set threads (managed by backend)
   */
  async setThreads(count) {
    console.log(`Thread count is managed by backend (currently: 2)`);
    return true;
  }

  /**
   * Quit Stockfish
   */
  async quit() {
    if (!this.engineRunning) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/stop_engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Backend engine stopped successfully');
        this.engineRunning = false;
        this.initialized = false;
        this.isReady = false;
        this.analyzing = false;
      }
    } catch (error) {
      console.error('Error stopping backend engine:', error);
    }
  }

  /**
   * Get engine status
   */
  async getStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/engine_status`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting engine status:', error);
      return { running: false, engine_exists: false };
    }
  }
}

// Singleton instance
let backendStockfishInstance = null;

export function getBackendStockfish() {
  if (!backendStockfishInstance) {
    backendStockfishInstance = new BackendStockfishService();
  }
  return backendStockfishInstance;
}

export default BackendStockfishService;
