/**
 * Browser Stockfish Service
 * Manages UCI communication with browser-based Stockfish engine
 * Uses StockfishClient for direct worker communication
 */

import { StockfishClient } from '../engine/stockfishClient';

class BrowserStockfishService {
  constructor() {
    this.engine = null;
    this.initialized = false;
    this.isReady = false;
    this.analyzing = false;
    this.actualThreads = 1; // Will be set during initialization
  }

  /**
   * Wait for engine to be ready after sending a command
   */
  async _waitForReady() {
    return new Promise((resolve) => {
      const unsubscribe = this.engine.onMessage((msg) => {
        if (msg.includes('readyok')) {
          unsubscribe();
          resolve();
        }
      });
      this.engine.worker.postMessage('isready');
    });
  }

  /**
   * Initialize Stockfish engine
   */
  async init(retryCount = 0) {
    if (this.initialized) {
      return Promise.resolve();
    }

    try {
      console.log(`🚀 Initializing Browser Stockfish (attempt ${retryCount + 1}/3)...`);

      // Try multi-threaded version first, fall back to single-threaded if SharedArrayBuffer not available
      const enginePath = typeof SharedArrayBuffer !== 'undefined'
        ? '/stockfish-17.1-8e4d048.js'  // Multi-threaded (requires headers)
        : '/stockfish-17.1-lite-single-03e3232.js';  // Single-threaded (no headers needed)

      console.log(`  Using: ${enginePath.includes('single') ? 'Single-threaded' : 'Multi-threaded'} engine`);

      // Create StockfishClient - loads worker directly
      this.engine = new StockfishClient(enginePath);

      // Wait for engine to be ready with timeout
      const initPromise = this.engine.waitReady();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Engine initialization timeout')), 15000)
      );

      await Promise.race([initPromise, timeoutPromise]);

      this.initialized = true;
      this.isReady = true;

      // Set up engine options for analysis
      this.engine.setOption('UCI_AnalyseMode', 'true');
      await this._waitForReady();

      this.engine.setOption('MultiPV', '3');
      await this._waitForReady();

      // Enable multi-threading for maximum strength (only if SharedArrayBuffer available)
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      let maxThreads = 1;

      if (hasSharedArrayBuffer) {
        const threads = navigator.hardwareConcurrency || 4;
        maxThreads = Math.min(threads, 6);
        this.engine.setOption('Threads', String(maxThreads));
        await this._waitForReady();
      }

      // Store actual thread count
      this.actualThreads = maxThreads;

      // Set hash table size (256MB for multi-threaded, 128MB for single-threaded)
      const hashSize = hasSharedArrayBuffer ? '256' : '128';
      this.engine.setOption('Hash', hashSize);
      await this._waitForReady();

      console.log('✅ Browser Stockfish 17.1 initialized successfully');
      console.log(`  🧵 Threads: ${maxThreads}${hasSharedArrayBuffer ? ` (CPU cores: ${navigator.hardwareConcurrency || 4})` : ' (single-threaded)'}`);
      console.log(`  💾 Hash: ${hashSize} MB`);
      console.log(`  📊 MultiPV: 3`);

      if (!hasSharedArrayBuffer) {
        console.warn('⚠️ Running in single-threaded mode (SharedArrayBuffer not available)');
        console.warn('   To enable multi-threading, configure COOP/COEP headers in your server');
      }

      return Promise.resolve();
    } catch (error) {
      console.error(`Failed to initialize Browser Stockfish (attempt ${retryCount + 1}):`, error);

      // Clean up failed engine
      if (this.engine) {
        try {
          this.engine.terminate();
        } catch (e) {
          console.error('Error terminating failed engine:', e);
        }
        this.engine = null;
      }

      // Retry up to 3 times with exponential backoff
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.init(retryCount + 1);
      }

      throw new Error(`Failed to initialize Browser Stockfish after ${retryCount + 1} attempts: ${error.message}`);
    }
  }

  /**
   * Set position from FEN
   */
  setPosition(fen) {
    if (!this.engine || !this.isReady) {
      console.warn('Browser Stockfish engine not ready');
      return;
    }
    this.engine.positionFen(fen);
  }

  /**
   * Analyze position - returns multipv lines with score info
   * @param {Object} options - Analysis options
   * @param {number} options.depth - Search depth (default: 15 for browser)
   * @param {number} options.multiPV - Number of lines to analyze (default: 3)
   * @returns {Promise} Resolves with analysis results
   */
  async analyzePosition(options = {}) {
    const {
      depth = 15,
      multiPV = 3,
      onUpdate = null
    } = options;

    console.log('🔍 Starting browser analysis:', { depth, multiPV });

    if (!this.isReady) {
      await this.init();
    }

    this.analyzing = true;

    return new Promise((resolve, reject) => {
      let bestMove = null;
      let evaluation = null;
      let lines = [];
      let messageCount = 0;
      const startTime = Date.now();

      // Set MultiPV
      if (multiPV > 1) {
        this.engine.setOption('MultiPV', String(multiPV));
      } else {
        this.engine.setOption('MultiPV', '1');
      }

      // Set up message listener for this analysis
      const unsubscribe = this.engine.onMessage((message) => {
        messageCount++;

        // Parse info messages
        if (message.startsWith('info')) {
          const info = this.parseInfo(message);

          if (info.multipv && info.score && info.pv && info.pv.length > 0) {
            const lineIndex = info.multipv - 1;
            lines[lineIndex] = {
              multipv: info.multipv,
              score: info.score,
              pv: info.pv,
              depth: info.depth || depth,
              cp: info.score.type === 'cp' ? info.score.value : null,
              mate: info.score.type === 'mate' ? info.score.value : null
            };
          }

          if (onUpdate && info.depth) {
            onUpdate({
              depth: info.depth,
              score: info.score,
              nodes: info.nodes,
              pv: info.pv,
              lines: [...lines]
            });
          }
        }

        // Parse best move
        if (message.startsWith('bestmove')) {
          const parts = message.split(' ');
          bestMove = parts[1];

          // Get evaluation from first line
          if (lines.length > 0 && lines[0]) {
            evaluation = lines[0].score;
          }

          const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`✅ Browser analysis complete in ${elapsedTime}s, bestmove: ${bestMove}`);

          this.analyzing = false;
          unsubscribe();

          resolve({
            bestMove,
            evaluation,
            lines: lines.filter(l => l !== undefined),
            depth
          });
        }
      });

      // Stop any ongoing analysis first
      this.engine.stop();

      // Start analysis
      console.log(`📊 Starting depth-based search: depth ${depth}`);
      this.engine.goDepth(depth);

      // Timeout - much longer for single-threaded mode
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      const baseTimeout = hasSharedArrayBuffer ? depth * 5000 : depth * 15000; // 3x longer for single-threaded
      const timeout = baseTimeout + 20000; // Extra 20s buffer

      console.log(`⏳ Timeout set to ${(timeout / 1000).toFixed(1)}s (${hasSharedArrayBuffer ? 'multi' : 'single'}-threaded)`);

      setTimeout(() => {
        if (this.analyzing) {
          console.error(`❌ Browser analysis TIMEOUT after ${(timeout / 1000).toFixed(1)}s`);
          this.stop();
          unsubscribe();
          reject(new Error('Analysis timeout'));
        }
      }, timeout);
    });
  }

  /**
   * Parse info message from Stockfish
   */
  parseInfo(message) {
    const info = {};
    const parts = message.split(' ');

    for (let i = 0; i < parts.length; i++) {
      switch (parts[i]) {
        case 'depth':
          info.depth = parseInt(parts[i + 1]);
          break;
        case 'seldepth':
          info.seldepth = parseInt(parts[i + 1]);
          break;
        case 'multipv':
          info.multipv = parseInt(parts[i + 1]);
          break;
        case 'score':
          // Next token is either 'cp' or 'mate'
          if (parts[i + 1] === 'cp') {
            info.score = {
              type: 'cp',
              value: parseInt(parts[i + 2])
            };
          } else if (parts[i + 1] === 'mate') {
            info.score = {
              type: 'mate',
              value: parseInt(parts[i + 2])
            };
          }
          break;
        case 'nodes':
          info.nodes = parseInt(parts[i + 1]);
          break;
        case 'nps':
          info.nps = parseInt(parts[i + 1]);
          break;
        case 'time':
          info.time = parseInt(parts[i + 1]);
          break;
        case 'pv':
          // Principal variation - rest of the line
          info.pv = parts.slice(i + 1);
          i = parts.length;
          break;
      }
    }

    return info;
  }

  /**
   * Get best move for current position
   */
  async getBestMove(fen, depth = 15) {
    this.setPosition(fen);
    const result = await this.analyzePosition({ depth, multiPV: 1 });
    return result.bestMove;
  }

  /**
   * Get evaluation for current position
   */
  async getEvaluation(fen, depth = 15) {
    this.setPosition(fen);
    const result = await this.analyzePosition({ depth, multiPV: 1 });
    return result.evaluation;
  }

  /**
   * Get top N moves with evaluations
   */
  async getTopMoves(fen, n = 3, depth = 15) {
    this.setPosition(fen);
    const result = await this.analyzePosition({ depth, multiPV: n });
    return result.lines;
  }

  /**
   * Stop current analysis
   */
  stop() {
    if (this.analyzing && this.engine) {
      this.engine.stop();
      this.analyzing = false;
    }
  }

  /**
   * Get thread information
   */
  getThreadInfo() {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    return {
      current: this.actualThreads,
      max: hasSharedArrayBuffer ? Math.min(navigator.hardwareConcurrency || 4, 6) : 1,
      supportsMultiThreading: hasSharedArrayBuffer
    };
  }

  /**
   * Change thread count dynamically
   */
  async setThreads(count) {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

    if (!hasSharedArrayBuffer) {
      console.warn('Cannot change threads - running in single-threaded mode');
      return false;
    }

    if (!this.initialized || !this.engine) {
      console.warn('Cannot change threads - engine not initialized');
      return false;
    }

    // Validate thread count
    const maxThreads = Math.min(navigator.hardwareConcurrency || 4, 6);
    const newThreads = Math.max(1, Math.min(count, maxThreads));

    if (newThreads === this.actualThreads) {
      console.log(`Already using ${newThreads} thread(s)`);
      return true;
    }

    try {
      console.log(`🔧 Changing threads: ${this.actualThreads} → ${newThreads}`);

      // Send UCI command to change threads
      this.engine.setOption('Threads', String(newThreads));
      await this._waitForReady();

      // Update stored thread count
      this.actualThreads = newThreads;

      console.log(`✅ Now using ${newThreads} thread(s)`);
      return true;
    } catch (error) {
      console.error('Failed to change thread count:', error);
      return false;
    }
  }

  /**
   * Set Skill Level for human-like play
   * @param {number} level - Skill level (0-20)
   *   0 = ~800 ELO (beginner, makes frequent blunders)
   *   10 = ~1500 ELO (club player, occasional mistakes)
   *   20 = ~3200+ ELO (full strength, no mistakes)
   * @returns {Promise<boolean>} Success status
   */
  async setSkillLevel(level) {
    if (!this.initialized || !this.engine) {
      console.warn('Cannot set skill level - engine not initialized');
      return false;
    }

    // Validate skill level (0-20)
    const skillLevel = Math.max(0, Math.min(20, Math.floor(level)));

    try {
      console.log(`🎯 Setting Skill Level: ${skillLevel} (for human-like play)`);

      // Set UCI Skill Level option
      this.engine.setOption('Skill Level', String(skillLevel));
      await this._waitForReady();

      console.log(`✅ Skill Level set to ${skillLevel}`);
      return true;
    } catch (error) {
      console.error('Failed to set skill level:', error);
      return false;
    }
  }

  /**
   * Reset to full strength (disable skill level limiting)
   * @returns {Promise<boolean>} Success status
   */
  async setFullStrength() {
    return await this.setSkillLevel(20);
  }

  /**
   * Quit Stockfish
   */
  quit() {
    if (this.engine) {
      this.engine.terminate();
      this.engine = null;
      this.initialized = false;
      this.isReady = false;
      this.analyzing = false;
    }
  }
}

// Singleton instance
let browserStockfishInstance = null;

export function getBrowserStockfish() {
  if (!browserStockfishInstance) {
    browserStockfishInstance = new BrowserStockfishService();
  }
  return browserStockfishInstance;
}

export default BrowserStockfishService;
