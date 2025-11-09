// /**
//  * Stockfish Service
//  * Manages UCI communication with Stockfish engine using StockfishClient
//  */

// import { StockfishClient } from '../engine/stockfishClient';

// class StockfishService {
//   constructor() {
//     this.engine = null;
//     this.initialized = false;
//     this.isReady = false;
//     this.analyzing = false;
//   }

//   /**
//    * Wait for engine to be ready after sending a command
//    */
//   async _waitForReady() {
//     return new Promise((resolve) => {
//       const unsubscribe = this.engine.onMessage((msg) => {
//         if (msg.includes('readyok')) {
//           unsubscribe();
//           resolve();
//         }
//       });
//       this.engine.worker.postMessage('isready');
//     });
//   }

//   /**
//    * Initialize Stockfish engine
//    */
//   async init(retryCount = 0) {
//     if (this.initialized) {
//       return Promise.resolve();
//     }

//     try {
//       console.log(`🚀 Initializing Stockfish (attempt ${retryCount + 1}/3)...`);

//       // Create StockfishClient - loads worker directly (ASM.js version for compatibility)
//       this.engine = new StockfishClient('/stockfish-17.1-8e4d048.js');

//       // Wait for engine to be ready with timeout
//       const initPromise = this.engine.waitReady();
//       const timeoutPromise = new Promise((_, reject) =>
//         setTimeout(() => reject(new Error('Engine initialization timeout')), 15000)
//       );

//       await Promise.race([initPromise, timeoutPromise]);

//       this.initialized = true;
//       this.isReady = true;

//       // Set up engine options for analysis
//       this.engine.setOption('UCI_AnalyseMode', 'true');
//       await this._waitForReady(); // Wait for option to be processed

//       this.engine.setOption('MultiPV', '3'); // Get top 3 moves
//       await this._waitForReady(); // Wait for option to be processed

//       // Enable multi-threading for maximum strength
//       const threads = navigator.hardwareConcurrency || 4;
//       const maxThreads = Math.min(threads, 4); // Limit to 6 threads max
//       this.engine.setOption('Threads', String(maxThreads));
//       await this._waitForReady(); // Wait for option to be processed

//       // Set hash table size (256MB for optimal performance)
//       this.engine.setOption('Hash', '256');
//       await this._waitForReady(); // Wait for option to be processed

//       console.log('✅ Stockfish 17.1 WASM initialized successfully');
//       console.log(`  🧵 Threads: ${maxThreads} (CPU cores: ${threads})`);
//       console.log(`  💾 Hash: 256 MB`);
//       console.log(`  📊 MultiPV: 3`);

//       return Promise.resolve();
//     } catch (error) {
//       console.error(`Failed to initialize Stockfish (attempt ${retryCount + 1}):`, error);

//       // Clean up failed engine
//       if (this.engine) {
//         try {
//           this.engine.terminate();
//         } catch (e) {
//           console.error('Error terminating failed engine:', e);
//         }
//         this.engine = null;
//       }

//       // Retry up to 3 times with exponential backoff
//       if (retryCount < 2) {
//         const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
//         console.log(`⏳ Retrying in ${delay}ms...`);
//         await new Promise(resolve => setTimeout(resolve, delay));
//         return this.init(retryCount + 1);
//       }

//       // All retries failed
//       throw new Error(`Failed to initialize Stockfish after ${retryCount + 1} attempts: ${error.message}`);
//     }
//   }

//   /**
//    * Set position from FEN
//    */
//   setPosition(fen) {
//     if (!this.engine || !this.isReady) {
//       console.warn('Stockfish engine not ready');
//       return;
//     }
//     this.engine.positionFen(fen);
//   }

//   /**
//    * Analyze position
//    * @param {Object} options - Analysis options
//    * @param {number} options.depth - Search depth (default: 15)
//    * @param {number} options.time - Time limit in ms (optional)
//    * @param {function} options.onUpdate - Callback for analysis updates
//    * @param {number} options.multiPV - Number of lines to analyze (default: 1)
//    * @param {string[]} options.searchMoves - Restrict search to specific moves (UCI format)
//    * @returns {Promise} Resolves with best move and evaluation
//    */
//   async analyzePosition(options = {}) {
//     const {
//       depth = 15,
//       time = null,
//       onUpdate = null,
//       multiPV = 1,
//       searchMoves = null
//     } = options;

//     console.log('🔍 Starting analysis:', { depth, time, multiPV, searchMoves });

//     if (!this.isReady) {
//       await this.init();
//     }

//     this.analyzing = true;

//     return new Promise((resolve, reject) => {
//       let bestMove = null;
//       let evaluation = null;
//       let lines = [];
//       let messageCount = 0;
//       const startTime = Date.now();

//       // Set MultiPV if different from current
//       if (multiPV > 1) {
//         this.engine.setOption('MultiPV', String(multiPV));
//       } else {
//         this.engine.setOption('MultiPV', '1');
//       }

//       // Set up message listener for this analysis
//       const unsubscribe = this.engine.onMessage((message) => {
//         messageCount++;

//         // Log EVERY message for first 5, then every 10th
//         if (messageCount <= 5 || messageCount % 10 === 0) {
//           console.log(`📨 Service received message #${messageCount} (${((Date.now() - startTime) / 1000).toFixed(1)}s):`, message.substring(0, 100));
//         }

//         // Parse info messages
//         if (message.startsWith('info')) {
//           const info = this.parseInfo(message);

//           if (info.multipv) {
//             // Store multiple lines with consistent naming (evaluation instead of score)
//             const lineIndex = info.multipv - 1;
//             lines[lineIndex] = {
//               ...info,
//               evaluation: info.score, // Add evaluation alias for consistency
//               cp: info.score?.type === 'cp' ? info.score.value : undefined
//             };
//           }

//           if (onUpdate && info.depth) {
//             onUpdate({
//               depth: info.depth,
//               score: info.score,
//               nodes: info.nodes,
//               pv: info.pv,
//               lines: [...lines]
//             });
//           }
//         }

//         // Parse best move
//         if (message.startsWith('bestmove')) {
//           const parts = message.split(' ');
//           bestMove = parts[1];

//           // Get evaluation from last info message
//           if (lines.length > 0) {
//             evaluation = lines[0].score;
//           }

//           const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
//           console.log(`✅ Analysis complete in ${elapsedTime}s, ${messageCount} messages, bestmove: ${bestMove}`);

//           this.analyzing = false;
//           unsubscribe(); // Remove listener

//           resolve({
//             bestMove,
//             evaluation,
//             lines: lines.filter(l => l !== undefined)
//           });
//         }
//       });

//       // Stop any ongoing analysis first
//       this.engine.stop();
//       console.log('🛑 Stopped any previous analysis');

//       // Start analysis with optional searchmoves restriction
//       if (time) {
//         console.log(`⏱️  Starting time-based search: ${time}ms`);
//         if (searchMoves && searchMoves.length > 0) {
//           this.engine.go({ movetime: time, searchmoves: searchMoves.join(' ') });
//         } else {
//           this.engine.goMovetime(time);
//         }
//       } else {
//         console.log(`📊 Starting depth-based search: depth ${depth}`);
//         if (searchMoves && searchMoves.length > 0) {
//           console.log(`  🎯 Restricting to moves: ${searchMoves.join(', ')}`);
//           this.engine.go({ depth, searchmoves: searchMoves.join(' ') });
//         } else {
//           this.engine.goDepth(depth);
//         }
//       }

//       // Timeout - increased for multi-threaded engine
//       const timeout = time || depth * 5000; // 5 seconds per depth level (was 2)
//       console.log(`⏳ Timeout set to ${(timeout + 10000) / 1000}s`);

//       setTimeout(() => {
//         if (this.analyzing) {
//           console.error(`❌ TIMEOUT after ${((Date.now() - startTime) / 1000).toFixed(2)}s - received ${messageCount} messages`);
//           this.stop();
//           unsubscribe();
//           reject(new Error('Analysis timeout'));
//         }
//       }, timeout + 10000); // Increased buffer from 5s to 10s
//     });
//   }

//   /**
//    * Parse info message from Stockfish
//    */
//   parseInfo(message) {
//     const info = {};
//     const parts = message.split(' ');

//     for (let i = 0; i < parts.length; i++) {
//       switch (parts[i]) {
//         case 'depth':
//           info.depth = parseInt(parts[i + 1]);
//           break;
//         case 'seldepth':
//           info.seldepth = parseInt(parts[i + 1]);
//           break;
//         case 'multipv':
//           info.multipv = parseInt(parts[i + 1]);
//           break;
//         case 'score':
//           // Next token is either 'cp' or 'mate'
//           if (parts[i + 1] === 'cp') {
//             info.score = {
//               type: 'cp',
//               value: parseInt(parts[i + 2])
//             };
//           } else if (parts[i + 1] === 'mate') {
//             info.score = {
//               type: 'mate',
//               value: parseInt(parts[i + 2])
//             };
//           }
//           break;
//         case 'nodes':
//           info.nodes = parseInt(parts[i + 1]);
//           break;
//         case 'nps':
//           info.nps = parseInt(parts[i + 1]);
//           break;
//         case 'time':
//           info.time = parseInt(parts[i + 1]);
//           break;
//         case 'pv':
//           // Principal variation - rest of the line
//           info.pv = parts.slice(i + 1);
//           i = parts.length; // Exit loop
//           break;
//       }
//     }

//     return info;
//   }

//   /**
//    * Get best move for current position
//    */
//   async getBestMove(fen, depth = 15) {
//     this.setPosition(fen);
//     const result = await this.analyzePosition({ depth, multiPV: 1 });
//     return result.bestMove;
//   }

//   /**
//    * Get evaluation for current position
//    */
//   async getEvaluation(fen, depth = 15) {
//     this.setPosition(fen);
//     const result = await this.analyzePosition({ depth, multiPV: 1 });
//     return result.evaluation;
//   }

//   /**
//    * Get top N moves with evaluations
//    */
//   async getTopMoves(fen, n = 3, depth = 15) {
//     this.setPosition(fen);
//     const result = await this.analyzePosition({ depth, multiPV: n });
//     return result.lines;
//   }

//   /**
//    * Stop current analysis
//    */
//   stop() {
//     if (this.analyzing && this.engine) {
//       this.engine.stop();
//       this.analyzing = false;
//     }
//   }

//   /**
//    * Quit Stockfish
//    */
//   quit() {
//     if (this.engine) {
//       this.engine.terminate();
//       this.engine = null;
//       this.initialized = false;
//       this.isReady = false;
//       this.analyzing = false;
//     }
//   }
// }

// // Singleton instance
// let stockfishInstance = null;

// export function getStockfish() {
//   if (!stockfishInstance) {
//     stockfishInstance = new StockfishService();
//   }
//   return stockfishInstance;
// }

// export default StockfishService;






//-------------------------



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

    // Prevent double-initialization races
    this._initPromise = null;

    // Track threading info
    this.currentThreads = 1;
    this.maxAvailableThreads = navigator.hardwareConcurrency || 2;
    this.supportsMultiThreading = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true;
  }

  /**
   * Wait for engine to be ready after sending a command
   * Sends 'isready' and resolves once 'readyok' is observed
   */
  async _waitForReady() {
    if (!this.engine) return;
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
   * Initialize Stockfish engine (single-flight; safe multithreading; ready barriers)
   */
  async init(retryCount = 0) {
    if (this.initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        console.log(`🚀 Initializing Stockfish (attempt ${retryCount + 1}/3)...`);

        // Create client (WASM/ASM worker path)
        this.engine = new StockfishClient('/stockfish-17.1-8e4d048.js');

        // Wait for uci/ready with a timeout
        const initPromise = this.engine.waitReady();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Engine initialization timeout')), 15000)
        );
        await Promise.race([initPromise, timeoutPromise]);

        this.initialized = true;
        this.isReady = true;

        // ---- Set stable analysis options (with ready barriers) ----
        // AnalyseMode once
        this.engine.setOption('UCI_AnalyseMode', 'true');
        await this._waitForReady();

        // Default MultiPV = 1 (you set per analysis when needed)
        this.engine.setOption('MultiPV', '1');
        await this._waitForReady();

        // Safe multithreading gate
        const supportsThreads =
          typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true;
        const cores = navigator.hardwareConcurrency || 2;
        const maxThreads = supportsThreads ? Math.min(cores, 4) : 1;

        this.currentThreads = maxThreads;
        this.engine.setOption('Threads', String(maxThreads));
        await this._waitForReady();

        // Hash (be conservative in browser)
        this.engine.setOption('Hash', '128'); // 256 is OK on beefy machines; 128 is safer
        await this._waitForReady();

        console.log('✅ Stockfish 17.1 WASM initialized successfully');
        console.log(`  🧵 Threads: ${maxThreads} (CPU cores: ${cores}, isolated: ${supportsThreads})`);
        console.log(`  💾 Hash: 128 MB`);
        console.log(`  📊 MultiPV: 1`);

        return;
      } catch (error) {
        console.error(`Failed to initialize Stockfish (attempt ${retryCount + 1}):`, error);

        // Clean up failed engine
        try {
          this.engine?.terminate?.();
        } catch (e) {
          console.error('Error terminating failed engine:', e);
        }
        this.engine = null;
        this.initialized = false;
        this.isReady = false;

        // Retry up to 3 attempts
        if (retryCount < 2) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          // release promise so the next call can set it again
          this._initPromise = null;
          return this.init(retryCount + 1);
        }

        // All retries failed
        this._initPromise = null;
        throw new Error(
          `Failed to initialize Stockfish after ${retryCount + 1} attempts: ${error.message}`
        );
      } finally {
        // If success, keep initialized=true so later calls return immediately.
        // If failed, we cleared _initPromise above to allow retry.
        if (this.initialized) {
          this._initPromise = null; // no longer needed
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
      console.warn('Stockfish engine not ready');
      return;
    }
    this.engine.positionFen(fen);
  }

  /**
   * Analyze position
   * @param {Object} options
   *   depth?: number (default 15)
   *   time?: number (ms)
   *   onUpdate?: (partial) => void
   *   multiPV?: number (default 1)
   *   searchMoves?: string[] (UCI moves)
   * @returns Promise<{ bestMove, evaluation, lines }>
   */
  async analyzePosition(options = {}) {
    const {
      depth = 15,
      time = null,
      onUpdate = null,
      multiPV = 1,
      searchMoves = null,
    } = options;

    console.log('🔍 Starting analysis:', { depth, time, multiPV, searchMoves });

    if (!this.isReady) {
      await this.init();
    }

    // Ensure we don't overlap analyses
    if (this.analyzing) {
      // Stop any ongoing analysis and wait ready
      this.engine.stop();
      await this._waitForReady();
    }
    this.analyzing = true;

    return new Promise(async (resolve, reject) => {
      let bestMove = null;
      let evaluation = null;
      let lines = [];
      let messageCount = 0;
      const startTime = Date.now();

      // Attach listener BEFORE issuing search commands
      const unsubscribe = this.engine.onMessage((message) => {
        messageCount++;

        // Debug sampling
        if (messageCount <= 5 || messageCount % 10 === 0) {
          console.log(
            `📨 Service received message #${messageCount} (${(
              (Date.now() - startTime) /
              1000
            ).toFixed(1)}s):`,
            message.substring(0, 120)
          );
        }

        if (message.startsWith('info')) {
          const info = this.parseInfo(message);

          if (info.multipv) {
            const idx = info.multipv - 1;
            lines[idx] = {
              ...info,
              evaluation: info.score,
              cp: info.score?.type === 'cp' ? info.score.value : undefined,
            };
          }

          if (onUpdate && info.depth) {
            onUpdate({
              depth: info.depth,
              score: info.score,
              nodes: info.nodes,
              pv: info.pv,
              lines: [...lines],
            });
          }
        }

        if (message.startsWith('bestmove')) {
          const parts = message.split(' ');
          bestMove = parts[1];

          if (lines.length > 0) {
            evaluation = lines[0].score;
          }

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`✅ Analysis complete in ${elapsed}s, ${messageCount} messages, bestmove: ${bestMove}`);

          this.analyzing = false;
          unsubscribe();
          resolve({
            bestMove,
            evaluation,
            lines: lines.filter(Boolean),
          });
        }
      });

      try {
        // Sync MultiPV -> ready
        this.engine.setOption('MultiPV', String(Math.max(1, multiPV | 0)));
        await this._waitForReady();

        // Stop any previous search (again, just in case) -> ready
        this.engine.stop();
        await this._waitForReady();

        // Now start search with or without searchmoves
        if (time) {
          console.log(`⏱️  Starting time-based search: ${time}ms`);
          if (searchMoves && searchMoves.length > 0) {
            this.engine.go({ movetime: time, searchmoves: searchMoves.join(' ') });
          } else {
            this.engine.goMovetime(time);
          }
        } else {
          console.log(`📊 Starting depth-based search: depth ${depth}`);
          if (searchMoves && searchMoves.length > 0) {
            console.log(`  🎯 Restricting to moves: ${searchMoves.join(', ')}`);
            this.engine.go({ depth, searchmoves: searchMoves.join(' ') });
          } else {
            this.engine.goDepth(depth);
          }
        }

        // Timeout (browser-safe): depth * 2000ms + buffer, or time + buffer
        const timeoutMs = (time ?? depth * 2000) + 8000;
        console.log(`⏳ Timeout set to ${(timeoutMs / 1000).toFixed(1)}s`);

        setTimeout(() => {
          if (this.analyzing) {
            console.error(
              `❌ TIMEOUT after ${((Date.now() - startTime) / 1000).toFixed(2)}s - received ${messageCount} messages`
            );
            try {
              this.engine.stop();
            } catch {}
            this.analyzing = false;
            unsubscribe();
            reject(new Error('Analysis timeout'));
          }
        }, timeoutMs);
      } catch (err) {
        this.analyzing = false;
        unsubscribe();
        reject(err);
      }
    });
  }

  /**
   * Parse 'info' line from Stockfish
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
          if (parts[i + 1] === 'cp') {
            info.score = { type: 'cp', value: parseInt(parts[i + 2]) };
          } else if (parts[i + 1] === 'mate') {
            info.score = { type: 'mate', value: parseInt(parts[i + 2]) };
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
          info.pv = parts.slice(i + 1);
          i = parts.length; // consume rest
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
      try {
        this.engine.stop();
      } finally {
        this.analyzing = false;
      }
    }
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
   * Change thread count dynamically
   */
  async setThreads(count) {
    if (!this.engine || !this.isReady) {
      console.warn('Engine not ready, cannot change threads');
      return false;
    }

    // Validate thread count
    const maxAllowed = this.supportsMultiThreading ? this.maxAvailableThreads : 1;
    const newThreads = Math.max(1, Math.min(count, maxAllowed));

    if (newThreads === this.currentThreads) {
      console.log(`Already using ${newThreads} thread(s)`);
      return true;
    }

    try {
      console.log(`🔧 Changing threads from ${this.currentThreads} to ${newThreads}...`);
      this.engine.setOption('Threads', String(newThreads));
      await this._waitForReady();
      this.currentThreads = newThreads;
      console.log(`✅ Successfully changed to ${newThreads} thread(s)`);
      return true;
    } catch (error) {
      console.error('Failed to change thread count:', error);
      return false;
    }
  }

  /**
   * Quit Stockfish
   */
  quit() {
    if (this.engine) {
      try {
        this.engine.terminate();
      } catch {}
      this.engine = null;
      this.initialized = false;
      this.isReady = false;
      this.analyzing = false;
      this._initPromise = null;
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
