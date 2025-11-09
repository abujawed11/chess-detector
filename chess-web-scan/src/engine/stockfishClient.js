// Stockfish Client - Direct Worker Communication
export class StockfishClient {
  constructor(path = '/stockfish-17.1-8e4d048.js') {
    this.worker = null;
    this._listeners = new Set();
    this._errorListeners = new Set();
    this._ready = false;
    this._resolver = null;
    this._crashed = false;
    this._initTimeout = null;

    try {
      // Create worker directly from Stockfish JS file (no wrapper needed)
      this.worker = new Worker(path);
      this._setupWorkerHandlers();
      this._startInitTimeout();
      // Send UCI command after handlers are set up to avoid race condition
      this.worker.postMessage('uci');
    } catch (error) {
      console.error('Failed to initialize Stockfish worker:', error);
      this._handleError('Failed to load Stockfish engine. Please check your internet connection and refresh the page.', error);
    }
  }

  _setupWorkerHandlers() {
    if (!this.worker) return;

    this.worker.onmessage = (e) => {
      const msg = String(e.data);
      // Forward every line to listeners
      for (const fn of this._listeners) fn(msg);

      // Handle UCI handshake responses
      if (msg.includes('uciok')) {
        // Engine acknowledged UCI mode, now check if ready
        this.worker.postMessage('isready');
      } else if (msg.includes('readyok')) {
        // Engine is ready for commands
        this._ready = true;
        this._clearInitTimeout();
        if (this._resolver) {
          this._resolver();
          this._resolver = null;
        }
      }
    };

    // Handle worker errors
    this.worker.onerror = (error) => {
      console.error('Stockfish worker error:', error);
      this._crashed = true;
      this._clearInitTimeout();
      this._handleError(
        'Chess engine encountered an error. The analysis feature may not work properly.',
        error
      );
    };

    // Handle worker termination (unexpected crashes)
    this.worker.onmessageerror = (error) => {
      console.error('Stockfish message error:', error);
      this._handleError('Failed to communicate with chess engine.', error);
    };
  }

  _startInitTimeout() {
    // Set a timeout for engine initialization (10 seconds)
    this._initTimeout = setTimeout(() => {
      if (!this._ready) {
        console.error('Stockfish initialization timeout');
        this._handleError('Chess engine failed to start within expected time. Please refresh the page.');
      }
    }, 10000);
  }

  _clearInitTimeout() {
    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = null;
    }
  }

  _handleError(message, error = null) {
    const errorData = {
      message,
      error,
      timestamp: new Date().toISOString(),
    };

    // Notify all error listeners
    for (const fn of this._errorListeners) {
      try {
        fn(errorData);
      } catch (e) {
        console.error('Error in error listener:', e);
      }
    }
  }

  onMessage(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  onError(fn) {
    this._errorListeners.add(fn);
    return () => this._errorListeners.delete(fn);
  }

  waitReady() {
    if (this._crashed) {
      return Promise.reject(new Error('Engine has crashed'));
    }
    return this._ready ? Promise.resolve() : new Promise(res => (this._resolver = res));
  }

  isReady() {
    return this._ready && !this._crashed;
  }

  hasCrashed() {
    return this._crashed;
  }

  // Convenience commands (with safety checks)
  ucinewgame() {
    if (this.worker && !this._crashed) {
      this.worker.postMessage('ucinewgame');
    }
  }

  stop() {
    if (this.worker && !this._crashed) {
      this.worker.postMessage('stop');
    }
  }

  setOption(name, value) {
    if (this.worker && !this._crashed) {
      this.worker.postMessage(`setoption name ${name} value ${value}`);
    }
  }

  positionFen(fen) {
    if (this.worker && !this._crashed) {
      this.worker.postMessage(`position fen ${fen}`);
    }
  }

  goDepth(depth) {
    if (this.worker && !this._crashed) {
      this.worker.postMessage(`go depth ${depth}`);
    }
  }

  goMovetime(ms) {
    if (this.worker && !this._crashed) {
      this.worker.postMessage(`go movetime ${ms}`);
    }
  }

  // Generic go command with options support
  go(options = {}) {
    if (!this.worker || this._crashed) return;

    let cmd = 'go';

    if (options.depth) cmd += ` depth ${options.depth}`;
    if (options.movetime) cmd += ` movetime ${options.movetime}`;
    if (options.nodes) cmd += ` nodes ${options.nodes}`;
    if (options.infinite) cmd += ' infinite';

    // Add searchmoves restriction if specified
    if (options.searchmoves) {
      cmd += ` searchmoves ${options.searchmoves}`;
    }

    this.worker.postMessage(cmd);
  }

  terminate() {
    this._clearInitTimeout();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (error) {
        console.error('Error terminating worker:', error);
      }
      this.worker = null;
    }
  }
}
