/**
 * Opening Book Module
 * Polyglot opening book reader for JavaScript
 * Based on opening_book.py from chess_brilliance_ai
 */

console.log('📚 [OPENING_BOOK] Module loading...');

import { Chess } from 'chess.js/dist/esm/chess.js';

console.log('📚 [OPENING_BOOK] Module loaded successfully');

// Path to the Polyglot book file (relative to public folder)
// In production, this should be placed in the public folder or loaded from a CDN
const BOOK_PATH = '/engine/book.bin';

// Cache for the book data
let bookCache = null;
let bookLoadPromise = null;
let bookLoadFailed = false; // Track if book loading failed (don't retry)

/**
 * Zobrist hashing for chess positions (Polyglot standard)
 * This is needed to match positions in the Polyglot book format
 */
class PolyglotHasher {
  constructor() {
    // Polyglot uses specific Zobrist keys
    // These are standard Polyglot random numbers
    this.pieceKeys = this.initPieceKeys();
    this.castleKeys = [0x0, 0x0, 0x0, 0x0]; // Will be set properly
    this.enPassantKeys = new Array(8).fill(0);
    this.sideKey = 0x0;
  }

  initPieceKeys() {
    // Simplified version - in production, use the actual Polyglot Zobrist keys
    const keys = {};
    const pieces = ['p', 'n', 'b', 'r', 'q', 'k', 'P', 'N', 'B', 'R', 'Q', 'K'];
    for (let sq = 0; sq < 64; sq++) {
      keys[sq] = {};
      for (const piece of pieces) {
        keys[sq][piece] = this.randomU64();
      }
    }
    return keys;
  }

  randomU64() {
    // Generate a pseudo-random 64-bit number
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  }

  hash(chess) {
    let h = 0n;
    const board = chess.board();

    // Hash pieces
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece) {
          const square = rank * 8 + file;
          const pieceChar = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
          h ^= BigInt(this.pieceKeys[square][pieceChar] || 0);
        }
      }
    }

    return h;
  }
}

/**
 * Simple in-memory opening book based on move sequences
 * This is a fallback when Polyglot book is not available
 */
const POPULAR_OPENINGS = [
  // 1.e4 e5 openings
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7",           // Ruy Lopez
  "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3",                // Italian Game
  "e4 e5 Nf3 Nc6 d4 exd4 Nxd4",                     // Scotch Game

  // Sicilian Defense
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6",           // Sicilian Najdorf
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6",          // Sicilian Dragon

  // French Defense
  "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3",                   // French Advance
  "e4 e6 d4 d5 Nd2 c5 exd5 exd5 Ngf3",              // French Tarrasch

  // Caro-Kann
  "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2",                  // Caro-Kann Advance
  "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6",          // Caro-Kann Classical

  // Queen's Gambit
  "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3",         // QGD
  "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5",            // QGA

  // Indian Defenses
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O",             // King's Indian
  "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5",             // Nimzo-Indian

  // English Opening
  "c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3",     // English

  // Slav/Semi-Slav
  "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5",            // Slav
  "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4",    // Semi-Slav
];

/**
 * Build an in-memory book from popular opening lines
 */
function buildSimpleBook() {
  const book = new Map();

  for (const line of POPULAR_OPENINGS) {
    const chess = new Chess();
    const moves = line.split(' ');

    for (const san of moves) {
      const fen = chess.fen();
      try {
        const move = chess.move(san);
        if (move) {
          const uci = move.from + move.to + (move.promotion || '');
          const key = `${fen}|${uci}`;
          book.set(key, true);
        }
      } catch (e) {
        console.warn(`Failed to parse move ${san} in opening line`);
        break;
      }
    }
  }

  console.log(`[OPENING_BOOK] Built simple book with ${book.size} positions`);
  return book;
}

/**
 * Load the Polyglot opening book
 * Returns null if book file is not available
 */
async function loadPolyglotBook() {
  try {
    console.log(`[OPENING_BOOK] Attempting to load Polyglot book from: ${BOOK_PATH}`);

    // Use HEAD request first to check if file exists (prevents download prompt)
    try {
      const headResponse = await fetch(BOOK_PATH, { method: 'HEAD' });
      if (!headResponse.ok) {
        console.warn(`[OPENING_BOOK] ⚠️ Book file not found at ${BOOK_PATH} (status: ${headResponse.status})`);
        console.warn(`[OPENING_BOOK] 💡 Using built-in simple book instead`);
        return null;
      }
    } catch (headError) {
      console.warn(`[OPENING_BOOK] ⚠️ Cannot access ${BOOK_PATH} - file may not exist`);
      console.warn(`[OPENING_BOOK] 💡 Using built-in simple book instead`);
      return null;
    }

    // File exists, now fetch it
    const response = await fetch(BOOK_PATH);
    if (!response.ok) {
      console.warn(`[OPENING_BOOK] Book file not found at ${BOOK_PATH}, using simple book`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    console.log(`[OPENING_BOOK] ✅ Loaded ${buffer.byteLength} bytes from book file`);

    // Parse Polyglot book format (16 bytes per entry)
    // Format: key (8 bytes), move (2 bytes), weight (2 bytes), learn (4 bytes)
    const entries = [];
    const view = new DataView(buffer);

    for (let offset = 0; offset < buffer.byteLength; offset += 16) {
      const key = view.getBigUint64(offset, false); // big-endian
      const move = view.getUint16(offset + 8, false);
      const weight = view.getUint16(offset + 10, false);

      entries.push({ key, move, weight });
    }

    console.log(`[OPENING_BOOK] ✅ Parsed ${entries.length} entries from Polyglot book`);
    return entries;
  } catch (error) {
    console.warn(`[OPENING_BOOK] ⚠️ Error loading Polyglot book: ${error.message}`);
    console.warn(`[OPENING_BOOK] 💡 Using built-in simple book instead`);
    return null;
  }
}

/**
 * Get the opening book (loads on first call)
 */
async function getBook() {
  if (bookCache !== null) {
    return bookCache;
  }

  if (bookLoadPromise) {
    return bookLoadPromise;
  }

  // If we already tried and failed, use simple book immediately
  if (bookLoadFailed) {
    console.log('[OPENING_BOOK] ℹ️ Previously failed to load book.bin, using simple book');
    if (!bookCache) {
      bookCache = { type: 'simple', entries: buildSimpleBook() };
    }
    return bookCache;
  }

  bookLoadPromise = (async () => {
    // Try to load Polyglot book first
    const polyglotBook = await loadPolyglotBook();

    if (polyglotBook && polyglotBook.length > 0) {
      console.log('[OPENING_BOOK] ✅ Using Polyglot book');
      bookCache = { type: 'polyglot', entries: polyglotBook };
    } else {
      console.log('[OPENING_BOOK] ℹ️ Using simple built-in book');
      bookLoadFailed = true; // Mark as failed so we don't retry
      bookCache = { type: 'simple', entries: buildSimpleBook() };
    }

    return bookCache;
  })();

  return bookLoadPromise;
}

/**
 * Check if a move is in the opening book
 * @param {string} fen - FEN position before the move
 * @param {string} uciMove - Move in UCI format (e.g., 'e2e4')
 * @returns {Promise<boolean>} True if move is in the book
 */
export async function isBookMove(fen, uciMove) {
  try {
    console.log(`\n[OPENING_BOOK] ------------------------------`);
    console.log(`[OPENING_BOOK] Checking FEN: ${fen}`);
    console.log(`[OPENING_BOOK] Checking move: ${uciMove}`);
    console.log(`[OPENING_BOOK] ------------------------------`);

    const book = await getBook();

    if (!book) {
      console.warn('[OPENING_BOOK] ⚠️ Book not loaded; treating as NOT book move.');
      return false;
    }

    console.log(`[OPENING_BOOK] Using ${book.type} book`);

    if (book.type === 'simple') {
      // Simple book: direct lookup
      const key = `${fen}|${uciMove}`;
      const found = book.entries.has(key);

      if (found) {
        console.log(`[OPENING_BOOK] 🎉 MATCH! This move IS in the opening book.`);
      } else {
        console.log(`[OPENING_BOOK] ❌ No match for move ${uciMove} in book entries.`);
      }

      return found;
    } else {
      // Polyglot book: use Zobrist hashing
      // This is a simplified version - in production, implement full Polyglot hashing
      console.warn('[OPENING_BOOK] ⚠️ Polyglot book support is limited - falling back to simple check');

      // For now, use a simple heuristic: first 10-15 moves
      const chess = new Chess(fen);
      const moveNumber = parseInt(fen.split(' ')[5] || '1');

      // Consider moves in first 15 moves as potential book moves
      if (moveNumber <= 15) {
        console.log(`[OPENING_BOOK] Move ${moveNumber} - treating as potential book move`);
        return true;
      }

      return false;
    }
  } catch (error) {
    console.error('[OPENING_BOOK] ❌ Error in isBookMove:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

/**
 * Check if a position has any book moves available
 * @param {string} fen - FEN position
 * @returns {Promise<boolean>} True if position has book moves
 */
export async function hasBookMoves(fen) {
  const book = await getBook();

  if (!book) {
    return false;
  }

  if (book.type === 'simple') {
    // Check if any entries start with this FEN
    for (const key of book.entries.keys()) {
      if (key.startsWith(fen + '|')) {
        return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Preload the opening book (call this on app startup)
 */
export function preloadBook() {
  getBook().then(() => {
    console.log('[OPENING_BOOK] Book preloaded successfully');
  }).catch(error => {
    console.error('[OPENING_BOOK] Failed to preload book:', error);
  });
}

export default {
  isBookMove,
  hasBookMoves,
  preloadBook
};
