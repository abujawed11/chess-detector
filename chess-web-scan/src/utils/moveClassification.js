/**
 * Move Classification System
 * Chess.com-style move classification with accurate evaluation
 */

import { analyzeBrilliantMove, shouldCheckBrilliant } from './brilliantDetection.js';

/**
 * Normalize any engine evaluation to the ROOT side-to-move perspective
 * @param {string} rootTurn - Root position turn ('w' or 'b')
 * @param {string} nodeTurn - Current node turn ('w' or 'b')
 * @param {Object} evaluation - Engine evaluation {type: 'cp'|'mate', value: number}
 * @returns {number} Centipawn score from root perspective
 */
export function evalForRoot(rootTurn, nodeTurn, evaluation) {
  if (!evaluation) return 0;

  if (evaluation.type === 'mate') {
    // Closer mates slightly larger; sign positive if winning for side-to-move of node
    const signFromNode = evaluation.value > 0 ? 1 : -1;
    const cp = signFromNode * (100000 - Math.min(100, Math.abs(evaluation.value) * 2));
    return nodeTurn === rootTurn ? cp : -cp;
  }

  const cpFromNode = evaluation.value ?? 0;
  return nodeTurn === rootTurn ? cpFromNode : -cpFromNode;
}

/**
 * Annotate & sort MultiPV lines by score from ROOT side
 * @param {Array} lines - Engine analysis lines
 * @param {string} rootTurn - Root position turn
 * @returns {Array} Sorted and annotated lines
 */
export function normalizeLines(lines, rootTurn) {
  return (lines || [])
    .map(ln => ({
      ...ln,
      scoreForRoot: evalForRoot(rootTurn, rootTurn, ln.evaluation || { type: 'cp', value: ln.cp ?? 0 }),
    }))
    .sort((a, b) => b.scoreForRoot - a.scoreForRoot);
}

/**
 * Classify a move based on centipawn loss and position characteristics
 * Chess.com-style classification thresholds
 * @param {number} cpLoss - Centipawn loss
 * @param {Object} options - Classification options
 * @returns {Object} Classification result
 */
export function classifyMove(cpLoss, options = {}) {
  const {
    inTop3 = false,
    withinEps = false,
    forced = false,
    missedMate = false,
    isBook = false,
    isBrilliant = false
  } = options;

  // Missed mate is always a blunder (highest priority)
  if (missedMate) {
    return {
      classification: 'blunder',
      label: 'Blunder',
      color: '#fa412d',
      cpLoss
    };
  }

  // Brilliant moves (sacrifices or only moves that are best)
  // Must have specific brilliant flag set externally with proper logic
  if (isBrilliant && cpLoss <= 10) {
    return {
      classification: 'brilliant',
      label: 'Brilliant',
      color: '#1baca6',
      cpLoss
    };
  }

  // Book moves (opening theory) - only if very small CP loss
  if (isBook && cpLoss <= 10) {
    return {
      classification: 'book',
      label: 'Book',
      color: '#a88865',
      cpLoss: 0
    };
  }

  // Best move: <= 10 cp loss OR in top 3 within small epsilon
  if (cpLoss <= 10 || (inTop3 && withinEps)) {
    return {
      classification: 'best',
      label: 'Best',
      color: '#9bc02a',
      cpLoss
    };
  }

  // Excellent: 10-25 cp loss
  if (cpLoss <= 25) {
    return {
      classification: 'excellent',
      label: 'Excellent',
      color: '#96bc4b',
      cpLoss
    };
  }

  // Good: 25-50 cp loss
  if (cpLoss <= 50) {
    return {
      classification: 'good',
      label: 'Good',
      color: '#96af8b',
      cpLoss
    };
  }

  // Inaccuracy: 50-100 cp loss
  if (cpLoss <= 100) {
    return {
      classification: 'inaccuracy',
      label: 'Inaccuracy',
      color: '#f0c15c',
      cpLoss
    };
  }

  // Mistake: 100-200 cp loss
  if (cpLoss <= 200) {
    return {
      classification: 'mistake',
      label: 'Mistake',
      color: '#e58f2a',
      cpLoss
    };
  }

  // Blunder: > 200 cp loss
  return {
    classification: 'blunder',
    label: 'Blunder',
    color: '#fa412d',
    cpLoss
  };
}

/**
 * Detect if a position is in the opening phase (for book move detection)
 * @param {string} fen - Position FEN
 * @returns {boolean} True if opening phase
 */
export function isOpeningPhase(fen) {
  // Count material to determine game phase
  const pieceCount = (fen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;
  const moveNumber = parseInt(fen.split(' ')[5] || '1');

  // Book moves require: very early game (≤8 moves) AND all/most pieces on board (≥30 pieces)
  // This ensures only true opening theory moves are marked as book
  return moveNumber <= 8 && pieceCount >= 30;
}

/**
 * Analyze a move and classify it
 * @param {Object} stockfish - Stockfish hook/service with analyze method
 * @param {string} fen - Position FEN
 * @param {string} move - Move in UCI format (e.g., 'e2e4')
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Classification result with details
 */
export async function analyzeMoveClassification(stockfish, fen, move, options = {}) {
  const { depth = 20, epsilon = 10 } = options;

  const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
  const rootChess = new Chess(fen);
  const rootTurn = rootChess.turn();

  // Check if opening phase for book move detection
  const isBook = isOpeningPhase(fen);

  // 1) Root MultiPV analysis
  const root = await stockfish.analyze(fen, { depth, multiPV: 3 });
  const lines = normalizeLines(root.lines, rootTurn);
  const bestMove = lines[0]?.pv?.[0];

  // Diagnostics
  const pv2Gap = lines.length > 1 ? (lines[0].scoreForRoot - lines[1].scoreForRoot) : 0;
  const forced = pv2Gap >= 200;

  // 2) Score the player's move at the root using searchmoves
  const ourRoot = await stockfish.analyze(fen, {
    depth,
    multiPV: 1,
    searchMoves: [move],
  });
  const ourRootScore = evalForRoot(rootTurn, rootTurn, ourRoot.evaluation);

  // 3) Score the best move at the root using searchmoves
  const bestRoot = await stockfish.analyze(fen, {
    depth,
    multiPV: 1,
    searchMoves: [bestMove],
  });
  const bestRootScore = evalForRoot(rootTurn, rootTurn, bestRoot.evaluation);

  // 4) Calculate CP-loss from root perspective
  const cpLoss = Math.max(0, bestRootScore - ourRootScore);

  // Top-N / epsilon rules
  const inTop3 = lines.slice(0, 3).some(
    l => l.pv[0]?.toLowerCase() === move.toLowerCase()
  );
  const ourLine = lines.find(
    l => l.pv[0]?.toLowerCase() === move.toLowerCase()
  );
  const withinEps = ourLine ? (lines[0].scoreForRoot - ourLine.scoreForRoot) <= epsilon : false;

  const missedMate =
    (lines[0]?.evaluation?.type === 'mate') &&
    (ourRoot.evaluation?.type !== 'mate');

  // Count pieces for brilliant detection and game phase
  const pieceCount = (fen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;

  // Enhanced Brilliant Move Detection (V2)
  let isBrilliantV2 = false;
  let brilliantAnalysis = null;

  // Quick pre-check to avoid expensive brilliant analysis
  if (shouldCheckBrilliant(fen, move, cpLoss, forced)) {
    try {
      brilliantAnalysis = await analyzeBrilliantMove(stockfish, fen, move, {
        depth,
        useAdaptive: true
      });
      isBrilliantV2 = brilliantAnalysis.isBrilliantV2;
    } catch (error) {
      console.error('Brilliant analysis failed:', error);
      isBrilliantV2 = false;
    }
  }

  // Legacy brilliant detection (fallback for simple cases)
  const isBrilliantLegacy =
    forced &&
    pv2Gap >= 500 &&
    cpLoss === 0 &&
    !isBook &&
    pieceCount >= 20 &&
    pieceCount <= 30;

  // Use V2 if available, otherwise fall back to legacy
  const isBrilliant = isBrilliantV2 || isBrilliantLegacy;

  const classification = classifyMove(cpLoss, {
    inTop3,
    withinEps,
    forced,
    missedMate,
    isBook: isBook && cpLoss <= 10, // Only mark as book if it's a good move
    isBrilliant
  });

  return {
    ...classification,
    bestMove,
    cpLoss,
    lines,
    forced,
    missedMate,
    isBook: isBook && cpLoss <= 15,
    isBrilliant,
    isBrilliantV2,
    brilliantAnalysis, // Detailed brilliant move analysis (gates, reasons, confidence)
    engineEval: bestRootScore,
    moveEval: ourRootScore
  };
}

/**
 * Get classification statistics from an array of classifications
 * @param {Array} classifications - Array of classification objects
 * @returns {Object} Statistics
 */
export function getClassificationStats(classifications) {
  const stats = {
    brilliant: 0,
    book: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    total: classifications.length
  };

  classifications.forEach(c => {
    if (c.classification && stats.hasOwnProperty(c.classification)) {
      stats[c.classification]++;
    }
  });

  return stats;
}

/**
 * Calculate average centipawn loss
 * @param {Array} classifications - Array of classification objects with cpLoss
 * @returns {number} Average CP loss
 */
export function calculateAverageCPLoss(classifications) {
  if (!classifications || classifications.length === 0) return 0;

  const total = classifications.reduce((sum, c) => sum + (c.cpLoss || 0), 0);
  return total / classifications.length;
}

export default {
  evalForRoot,
  normalizeLines,
  classifyMove,
  isOpeningPhase,
  analyzeMoveClassification,
  getClassificationStats,
  calculateAverageCPLoss
};
