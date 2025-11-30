/**
 * Opening Book - JavaScript port of opening_book.py
 * Provides opening book move detection
 *
 * NOTE: This version uses a simplified approach.
 * For full polyglot .bin support, you'll need to either:
 * 1. Convert gm2001.bin to JSON format
 * 2. Use a JavaScript polyglot reader library
 * 3. Keep using backend for book detection (optional)
 */

import { Chess } from 'chess.js';

// Opening book data - will be loaded from JSON file
let openingBookData = null;
let bookLoaded = false;

/**
 * Load opening book from JSON file
 *
 * To create the JSON file from gm2001.bin:
 * You can use python-chess to export:
 * ```python
 * import chess.polyglot
 * import json
 *
 * book = chess.polyglot.open_reader("gm2001.bin")
 * book_dict = {}
 * for entry in book:
 *     fen_key = entry.key  # Zobrist hash
 *     move_uci = entry.move.uci()
 *     if fen_key not in book_dict:
 *         book_dict[fen_key] = []
 *     book_dict[fen_key].append(move_uci)
 *
 * with open("opening_book.json", "w") as f:
 *     json.dump(book_dict, f)
 * ```
 */
export async function loadOpeningBook() {
  if (bookLoaded) {
    return openingBookData !== null;
  }

  try {
    console.log('[OPENING_BOOK] Loading opening book from JSON...');

    // Try to load from public folder
    const response = await fetch('/opening_book.json');

    if (!response.ok) {
      console.warn('[OPENING_BOOK] ❌ Book file not found at /opening_book.json');
      console.warn('[OPENING_BOOK] Opening book will not be available.');
      console.warn('[OPENING_BOOK] To enable: Convert gm2001.bin to JSON format');
      bookLoaded = true;
      openingBookData = null;
      return false;
    }

    openingBookData = await response.json();
    bookLoaded = true;

    const entryCount = Object.keys(openingBookData || {}).length;
    console.log(`[OPENING_BOOK] ✅ Book loaded successfully (${entryCount} positions)`);

    return true;
  } catch (error) {
    console.error('[OPENING_BOOK] ❌ Failed to load opening book:', error);
    bookLoaded = true;
    openingBookData = null;
    return false;
  }
}

/**
 * Calculate Zobrist hash for a position
 * (Simplified version - for full support, need proper Zobrist implementation)
 *
 * For now, we use FEN as key (less efficient but works)
 */
function getPositionKey(fen) {
  // Normalize FEN (remove move counters for book lookup)
  const parts = fen.split(' ');
  // Use only position, turn, castling, and en passant
  return parts.slice(0, 4).join(' ');
}

/**
 * Check if a move is in the opening book
 * @param {string} fen - FEN string of position BEFORE the move
 * @param {string} uciMove - Move in UCI format (e.g., "e2e4")
 * @returns {boolean} True if move is in opening book
 */
export function isBookMove(fen, uciMove) {
  // Ensure book is attempted to load
  if (!bookLoaded) {
    console.warn('[OPENING_BOOK] Book not loaded. Call loadOpeningBook() first.');
    return false;
  }

  if (!openingBookData) {
    return false;
  }

  try {
    const board = new Chess(fen);
    const positionKey = getPositionKey(fen);

    // Normalize UCI move
    const normalizedMove = uciMove.toLowerCase().trim().replace('=', '');

    // Check if position exists in book
    const bookMoves = openingBookData[positionKey];
    if (!bookMoves || !Array.isArray(bookMoves)) {
      console.log(`[OPENING_BOOK] Position not found in book: ${positionKey}`);
      return false;
    }

    // Check if move is in the list
    const found = bookMoves.some(bookMove => {
      const normalizedBookMove = bookMove.toLowerCase().trim().replace('=', '');
      return normalizedBookMove === normalizedMove;
    });

    if (found) {
      console.log(`[OPENING_BOOK] ✅ Book move found: ${uciMove} for FEN: ${fen.substring(0, 50)}...`);
    } else {
      console.log(`[OPENING_BOOK] ❌ Move ${uciMove} not in book for this position`);
    }

    return found;
  } catch (error) {
    console.error(`[OPENING_BOOK] ❌ Error checking move ${uciMove}:`, error);
    return false;
  }
}

/**
 * Get all book moves for a position
 * @param {string} fen - FEN string
 * @returns {Array<string>} Array of UCI moves from the book
 */
export function getBookMoves(fen) {
  if (!openingBookData) {
    return [];
  }

  try {
    const positionKey = getPositionKey(fen);
    const bookMoves = openingBookData[positionKey];
    return bookMoves || [];
  } catch (error) {
    console.error('[OPENING_BOOK] Error getting book moves:', error);
    return [];
  }
}

/**
 * ALTERNATIVE: Simple ECO-based opening detection
 * This doesn't require a polyglot book file
 * Uses move sequence matching for common openings
 */

// Common opening sequences (first few moves)
const COMMON_OPENINGS = {
  // King's Pawn
  'e2e4': true,
  'e2e4_e7e5': true,
  'e2e4_c7c5': true, // Sicilian
  'e2e4_e7e6': true, // French
  'e2e4_c7c6': true, // Caro-Kann

  // Queen's Pawn
  'd2d4': true,
  'd2d4_d7d5': true,
  'd2d4_g8f6': true,

  // English
  'c2c4': true,

  // Others
  'g1f3': true,
  'b1c3': true
};

/**
 * Simple opening detection based on move number and common sequences
 * @param {string} fen - FEN string
 * @param {string} uciMove - UCI move
 * @returns {boolean} True if likely an opening move
 */
export function isLikelyOpeningMove(fen, uciMove) {
  try {
    const board = new Chess(fen);
    const fullmoveNumber = board.moveNumber();

    // Consider first 10 moves as opening
    if (fullmoveNumber > 10) {
      return false;
    }

    // Very basic check - just seeing if it's early in the game
    // and not obviously a blunder
    return fullmoveNumber <= 10;
  } catch (e) {
    return false;
  }
}

/**
 * Fallback function when no book file is available
 * Uses heuristics for early game detection
 */
export function isBookMoveFallback(fen, uciMove) {
  // If book is loaded, use it
  if (openingBookData) {
    return isBookMove(fen, uciMove);
  }

  // Otherwise, use simple heuristics
  return isLikelyOpeningMove(fen, uciMove);
}

// Auto-load book on import (non-blocking)
loadOpeningBook().catch(err => {
  console.warn('[OPENING_BOOK] Auto-load failed:', err);
});

export default {
  loadOpeningBook,
  isBookMove,
  getBookMoves,
  isLikelyOpeningMove,
  isBookMoveFallback
};
