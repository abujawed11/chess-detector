/**
 * Stockfish Service
 * Manages UCI communication with Stockfish engine using StockfishClient
 */

import { StockfishClient } from '../engine/stockfishClient';

class StockfishService {
  constructor() {
    this.engine = null;
    this.initialized = false;
    this.isReady = false;
    this.analyzing = false;
  }

  /**
   * Initialize Stockfish engine
   */
  async init() {
    if (this.initialized) {
      return Promise.resolve();
    }

    try {
      // Create StockfishClient - loads worker directly (ASM.js version for compatibility)
      this.engine = new StockfishClient('/stockfish-17.1-8e4d048.js');

      // Wait for engine to be ready
      await this.engine.waitReady();

      this.initialized = true;
      this.isReady = true;

      // Set up engine options for analysis
      this.engine.setOption('UCI_AnalyseMode', 'true');
      this.engine.setOption('MultiPV', '3'); // Get top 3 moves

      console.log('✅ Stockfish engine initialized successfully');

      return Promise.resolve();
    } catch (error) {
      console.error('Failed to initialize Stockfish:', error);
      throw error;
    }
  }

  /**
   * Set position from FEN
   */
  setPosition(fen) {
    if (!this.engine || !this.isReady) {
      console.warn('Stockfish engine not ready');
      return;
    }
    this.engine.positionFen(fen);
  }

  /**
   * Analyze position
   * @param {Object} options - Analysis options
   * @param {number} options.depth - Search depth (default: 15)
   * @param {number} options.time - Time limit in ms (optional)
   * @param {function} options.onUpdate - Callback for analysis updates
   * @param {number} options.multiPV - Number of lines to analyze (default: 1)
   * @param {string[]} options.searchMoves - Restrict search to specific moves (UCI format)
   * @returns {Promise} Resolves with best move and evaluation
   */
  async analyzePosition(options = {}) {
    const {
      depth = 15,
      time = null,
      onUpdate = null,
      multiPV = 1,
      searchMoves = null
    } = options;

    if (!this.isReady) {
      await this.init();
    }

    this.analyzing = true;

    return new Promise((resolve, reject) => {
      let bestMove = null;
      let evaluation = null;
      let lines = [];

      // Set MultiPV if different from current
      if (multiPV > 1) {
        this.engine.setOption('MultiPV', String(multiPV));
      } else {
        this.engine.setOption('MultiPV', '1');
      }

      // Set up message listener for this analysis
      const unsubscribe = this.engine.onMessage((message) => {
        // Parse info messages
        if (message.startsWith('info')) {
          const info = this.parseInfo(message);

          if (info.multipv) {
            // Store multiple lines with consistent naming (evaluation instead of score)
            const lineIndex = info.multipv - 1;
            lines[lineIndex] = {
              ...info,
              evaluation: info.score, // Add evaluation alias for consistency
              cp: info.score?.type === 'cp' ? info.score.value : undefined
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

          // Get evaluation from last info message
          if (lines.length > 0) {
            evaluation = lines[0].score;
          }

          this.analyzing = false;
          unsubscribe(); // Remove listener

          resolve({
            bestMove,
            evaluation,
            lines: lines.filter(l => l !== undefined)
          });
        }
      });

      // Start analysis with optional searchmoves restriction
      if (time) {
        if (searchMoves && searchMoves.length > 0) {
          this.engine.go({ movetime: time, searchmoves: searchMoves.join(' ') });
        } else {
          this.engine.goMovetime(time);
        }
      } else {
        if (searchMoves && searchMoves.length > 0) {
          this.engine.go({ depth, searchmoves: searchMoves.join(' ') });
        } else {
          this.engine.goDepth(depth);
        }
      }

      // Timeout
      const timeout = time || depth * 2000; // 2 seconds per depth level
      setTimeout(() => {
        if (this.analyzing) {
          this.stop();
          unsubscribe();
          reject(new Error('Analysis timeout'));
        }
      }, timeout + 5000);
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
          i = parts.length; // Exit loop
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
let stockfishInstance = null;

export function getStockfish() {
  if (!stockfishInstance) {
    stockfishInstance = new StockfishService();
  }
  return stockfishInstance;
}

export default StockfishService;
