/**
 * Stockfish Service
 * NOW USES BROWSER-BASED STOCKFISH instead of backend
 * Backend is preserved for React Native app
 */

import { getBrowserStockfish } from './browserStockfishService';

class StockfishService {
  constructor() {
    // Use browser engine
    this.browserEngine = getBrowserStockfish();
    this.engine = this.browserEngine; // For compatibility
    this.initialized = false;
    this.isReady = false;
    this.analyzing = false;
    this._initPromise = null;
  }

  // Delegate thread info to browser engine
  get currentThreads() {
    return this.browserEngine.getThreadInfo?.().current || 1;
  }

  get maxAvailableThreads() {
    return this.browserEngine.getThreadInfo?.().max || 1;
  }

  get supportsMultiThreading() {
    return this.browserEngine.getThreadInfo?.().supportsMultiThreading || false;
  }

  /**
   * Wait for engine to be ready
   */
  async _waitForReady() {
    // Browser engine handles this internally
    return Promise.resolve();
  }

  /**
   * Initialize Browser Stockfish engine
   */
  async init(retryCount = 0) {
    if (this.initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        await this.browserEngine.init(retryCount);
        this.initialized = true;
        this.isReady = true;
        return;
      } catch (error) {
        this.initialized = false;
        this.isReady = false;
        this._initPromise = null;
        throw error;
      } finally {
        if (this.initialized) {
          this._initPromise = null;
        }
      }
    })();

    return this._initPromise;
  }

  /**
   * Set position from FEN
   */
  setPosition(fen) {
    if (!this.engine || !this.isReady) {
      console.warn('Browser Stockfish engine not ready');
      return;
    }
    this.engine.setPosition(fen);
  }

  /**
   * Analyze position
   * @param {Object} options
   *   depth?: number (default 18)
   *   multiPV?: number (default 1)
   *   onUpdate?: callback
   * @returns Promise<{ bestMove, evaluation, lines }>
   */
  async analyzePosition(options = {}) {
    const {
      depth = 18,
      multiPV = 1,
      onUpdate = null
    } = options;

    if (!this.isReady) {
      await this.init();
    }

    this.analyzing = true;

    try {
      const result = await this.browserEngine.analyzePosition({
        depth,
        multiPV,
        onUpdate
      });

      this.analyzing = false;
      return result;
    } catch (error) {
      this.analyzing = false;
      throw error;
    }
  }

  /**
   * Parse info message
   */
  parseInfo(message) {
    return this.browserEngine.parseInfo(message);
  }

  /**
   * Get best move for current position
   */
  async getBestMove(fen, depth = 18) {
    this.setPosition(fen);
    const result = await this.analyzePosition({ depth, multiPV: 1 });
    return result.bestMove;
  }

  /**
   * Get evaluation for current position
   */
  async getEvaluation(fen, depth = 18) {
    this.setPosition(fen);
    const result = await this.analyzePosition({ depth, multiPV: 1 });
    return result.evaluation;
  }

  /**
   * Get top N moves with evaluations
   */
  async getTopMoves(fen, n = 3, depth = 18) {
    this.setPosition(fen);
    const result = await this.analyzePosition({ depth, multiPV: n });
    return result.lines;
  }

  /**
   * Stop current analysis
   */
  stop() {
    this.browserEngine.stop();
    this.analyzing = false;
  }

  /**
   * Get thread information
   */
  getThreadInfo() {
    return {
      current: this.currentThreads,
      max: this.maxAvailableThreads,
      supportsMultiThreading: this.supportsMultiThreading
    };
  }

  /**
   * Change thread count
   */
  async setThreads(count) {
    return await this.browserEngine.setThreads(count);
  }

  /**
   * Set Skill Level for human-like play
   * @param {number} level - Skill level (0-20)
   * @returns {Promise<boolean>} Success status
   */
  async setSkillLevel(level) {
    return await this.browserEngine.setSkillLevel(level);
  }

  /**
   * Reset to full strength
   * @returns {Promise<boolean>} Success status
   */
  async setFullStrength() {
    return await this.browserEngine.setFullStrength();
  }

  /**
   * Quit Stockfish
   */
  async quit() {
    this.browserEngine.quit();
    this.initialized = false;
    this.isReady = false;
    this.analyzing = false;
    this._initPromise = null;
  }
}

// Singleton instance
let stockfishInstance = null;

export function getStockfish() {
  if (!stockfishInstance) {
    stockfishInstance = new StockfishService();
  }
  return stockfishInstance;
}

export default StockfishService;
