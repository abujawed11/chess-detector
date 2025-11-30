/**
 * Chess Helpers - JavaScript port of chess_helpers.py
 * Provides eval conversion and Stockfish communication utilities
 */

import { Chess } from 'chess.js';

// Constants for normalization
const CP_MAX = 3000;
const MATE_BASE = CP_MAX + 100;
const MATE_CP = 32000;
const MATE_STEP = 1000;

/**
 * Convert score to centipawns from White's perspective
 * @param {Object} score - {type: 'cp'|'mate', value: number}
 * @param {string} sideToMove - 'w' or 'b'
 * @returns {number} Centipawn evaluation from White's POV
 */
export function evalForWhite(score, sideToMove) {
  if (!score) return 0;

  const type = score.type;
  let value = score.value || 0;

  if (type === 'cp') {
    try {
      value = parseInt(value);
    } catch (e) {
      value = 0;
    }
    // UCI returns from White's perspective, flip for Black's turn
    return sideToMove === 'w' ? value : -value;
  }

  if (type === 'mate') {
    try {
      value = parseInt(value);
    } catch (e) {
      value = 0;
    }

    // Determine sign from White's perspective
    const signForWhite = sideToMove === 'w' ? 1 : -1;
    const whiteMateVal = value * signForWhite;

    if (whiteMateVal === 0) return 0;

    const n = Math.abs(whiteMateVal);
    const base = Math.max(0, MATE_CP - MATE_STEP * n);
    return whiteMateVal > 0 ? base : -base;
  }

  try {
    return parseInt(value);
  } catch (e) {
    return 0;
  }
}

/**
 * Convert White-POV eval to player-POV eval
 * @param {number} evalWhiteCp - Eval from White's perspective
 * @param {string} moverColor - 'w' or 'b'
 * @returns {number} Eval from mover's perspective
 */
export function cpForPlayer(evalWhiteCp, moverColor) {
  return moverColor === 'w' ? evalWhiteCp : -evalWhiteCp;
}

/**
 * Get material value for a piece
 */
export const PIECE_VALUES = {
  p: 100,   // pawn
  n: 300,   // knight
  b: 300,   // bishop
  r: 500,   // rook
  q: 900,   // queen
  k: 0      // king
};

/**
 * Calculate material for a given color
 * @param {Chess} board - chess.js board instance
 * @param {string} color - 'w' or 'b'
 * @returns {number} Material count in centipawns
 */
export function materialForColor(board, color) {
  let total = 0;
  const pieces = board.board();

  for (let rank of pieces) {
    for (let square of rank) {
      if (square && square.color === color) {
        total += PIECE_VALUES[square.type] || 0;
      }
    }
  }

  return total;
}

/**
 * Calculate material balance for a side
 * @param {Chess} board - chess.js board instance
 * @param {string} sideChar - 'w' or 'b'
 * @returns {number} Material balance (our material - their material)
 */
export function materialBalanceForSide(board, sideChar) {
  const us = materialForColor(board, sideChar);
  const them = materialForColor(board, sideChar === 'w' ? 'b' : 'w');
  return us - them;
}

/**
 * Calculate material gain from a single move
 * @param {Chess} board - chess.js board instance (before move)
 * @param {string} uciMove - Move in UCI format (e.g., "e2e4")
 * @returns {number} Material gained in centipawns
 */
export function materialGainForMove(board, uciMove) {
  try {
    // Convert UCI to chess.js move format
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

    // Get the piece at destination (if any)
    const capturedPiece = board.get(to);

    if (!capturedPiece) {
      // Check for en passant
      const move = board.move({ from, to, promotion });
      if (move && move.flags.includes('e')) {
        board.undo();
        return PIECE_VALUES.p; // Captured a pawn
      }
      if (move) board.undo();
      return 0;
    }

    return PIECE_VALUES[capturedPiece.type] || 0;
  } catch (e) {
    console.error('Error calculating material gain:', e);
    return 0;
  }
}

/**
 * Compute material gain along the best line (PV)
 * @param {Chess} boardBefore - chess.js board instance before move
 * @param {Array<Object>} pvs - PV lines from engine
 * @param {string} sideBefore - 'w' or 'b'
 * @param {number} maxPlies - Maximum plies to simulate (default: 4)
 * @returns {number|null} Material gain in centipawns
 */
export function computeBestLineMaterialGain(boardBefore, pvs, sideBefore, maxPlies = 4) {
  if (!pvs || pvs.length === 0) return null;

  const firstPvEntry = pvs[0];
  const pvMoves = firstPvEntry.pv || [];
  if (pvMoves.length === 0) return null;

  // Clamp plies
  const actualPlies = Math.min(maxPlies, pvMoves.length);

  // Material balance before
  const startBalance = materialBalanceForSide(boardBefore, sideBefore);

  // Create a copy to play moves
  const tempBoard = new Chess(boardBefore.fen());
  let pliesPlayed = 0;

  for (let uci of pvMoves) {
    if (pliesPlayed >= actualPlies) break;

    try {
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;

      const move = tempBoard.move({ from, to, promotion });
      if (!move) break;

      pliesPlayed++;
    } catch (e) {
      break;
    }
  }

  const endBalance = materialBalanceForSide(tempBoard, sideBefore);
  const gainCp = endBalance - startBalance;

  console.log('BEST_LINE_MATERIAL_GAIN_DEBUG:', {
    sideBefore,
    pvPrefix: pvMoves.slice(0, actualPlies),
    pliesPlayed,
    startBalanceCp: startBalance,
    endBalanceCp: endBalance,
    bestLineMaterialGainCp: gainCp
  });

  return gainCp;
}

/**
 * Get the side to move from a FEN string
 * @param {string} fen - FEN string
 * @returns {string} 'w' or 'b'
 */
export function getSideToMove(fen) {
  const parts = fen.split(' ');
  return parts[1] === 'w' ? 'w' : 'b';
}

/**
 * Check if a position is checkmate
 * @param {string} fen - FEN string
 * @returns {boolean}
 */
export function isCheckmate(fen) {
  try {
    const board = new Chess(fen);
    return board.isCheckmate();
  } catch (e) {
    return false;
  }
}

/**
 * Check if a position is stalemate
 * @param {string} fen - FEN string
 * @returns {boolean}
 */
export function isStalemate(fen) {
  try {
    const board = new Chess(fen);
    return board.isStalemate();
  } catch (e) {
    return false;
  }
}

/**
 * Check if a position is game over
 * @param {string} fen - FEN string
 * @returns {boolean}
 */
export function isGameOver(fen) {
  try {
    const board = new Chess(fen);
    return board.isGameOver();
  } catch (e) {
    return false;
  }
}

/**
 * Apply a UCI move to a FEN and get the resulting FEN
 * @param {string} fen - Starting FEN
 * @param {string} uciMove - Move in UCI format
 * @returns {string|null} Resulting FEN or null if move is illegal
 */
export function applyUciMove(fen, uciMove) {
  try {
    const board = new Chess(fen);
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

    const move = board.move({ from, to, promotion });
    if (!move) return null;

    return board.fen();
  } catch (e) {
    return null;
  }
}

/**
 * Convert PV moves to SAN notation
 * @param {string} fen - Starting FEN
 * @param {Array<string>} pvMoves - Array of UCI moves
 * @param {number} maxMoves - Maximum moves to convert (default: 10)
 * @returns {string} SAN notation string
 */
export function pvToSan(fen, pvMoves, maxMoves = 10) {
  try {
    const board = new Chess(fen);
    const sanMoves = [];

    for (let i = 0; i < Math.min(pvMoves.length, maxMoves); i++) {
      const uci = pvMoves[i];
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;

      const move = board.move({ from, to, promotion });
      if (!move) break;

      sanMoves.push(move.san);
    }

    return sanMoves.join(' ');
  } catch (e) {
    return '';
  }
}

export default {
  evalForWhite,
  cpForPlayer,
  materialForColor,
  materialBalanceForSide,
  materialGainForMove,
  computeBestLineMaterialGain,
  getSideToMove,
  isCheckmate,
  isStalemate,
  isGameOver,
  applyUciMove,
  pvToSan,
  PIECE_VALUES,
  MATE_CP,
  MATE_STEP
};
