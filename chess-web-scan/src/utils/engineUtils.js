/**
 * Chess Engine Utilities
 * Helper functions for evaluation, move classification, and analysis
 */

/**
 * Convert centipawns to a readable evaluation string
 * @param {number} cp - Centipawn value
 * @returns {string} Formatted evaluation (e.g., "+1.5", "-0.3")
 */
export function centipawnsToEval(cp) {
  const eval_value = (cp / 100).toFixed(2);
  return cp > 0 ? `+${eval_value}` : eval_value;
}

/**
 * Convert evaluation score object to centipawns
 * @param {Object} score - Score object {type: 'cp'|'mate', value: number}
 * @param {string} side - Side to move ('w' or 'b')
 * @returns {number} Centipawn value (or large value for mate)
 */
export function scoreToCentipawns(score, side = 'w') {
  if (!score) return 0;

  if (score.type === 'mate') {
    // Mate in N moves
    const mateValue = score.value > 0 ? 10000 : -10000;
    return side === 'b' ? -mateValue : mateValue;
  }

  // Centipawns - adjust for side to move
  return side === 'b' ? -score.value : score.value;
}

/**
 * Get a human-readable evaluation string
 * @param {Object} score - Score object
 * @param {string} side - Side to move
 * @returns {string} Human-readable evaluation
 */
export function scoreToString(score, side = 'w') {
  if (!score) return '0.00';

  if (score.type === 'mate') {
    const moves = Math.abs(score.value);
    const winner = score.value > 0 ? 'White' : 'Black';
    return `Mate in ${moves} for ${winner}`;
  }

  return centipawnsToEval(scoreToCentipawns(score, side));
}

/**
 * Calculate win percentage from centipawn evaluation
 * Uses formula similar to Lichess
 * @param {number} cp - Centipawn evaluation
 * @returns {number} Win percentage (0-100)
 */
export function centipawnsToWinPercentage(cp) {
  // Formula: 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
  const winPercentage = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  return Math.max(0, Math.min(100, winPercentage));
}

/**
 * Classify a move based on evaluation change
 * @param {number} evalBefore - Evaluation before the move (centipawns)
 * @param {number} evalAfter - Evaluation after the move (centipawns)
 * @param {number} bestMoveEval - Evaluation of the best move (centipawns)
 * @param {boolean} isBestMove - Whether this is the engine's best move
 * @param {boolean} isOnlyGood - Whether this is the only good move
 * @param {boolean} isSacrifice - Whether this move is a sacrifice
 * @returns {Object} Classification result
 */
export function classifyMove(evalBefore, evalAfter, bestMoveEval, options = {}) {
  const {
    isBestMove = false,
    isOnlyGood = false,
    isSacrifice = false,
    missedMate = false
  } = options;

  // Calculate centipawn loss (how much worse than best move)
  const centipawnLoss = bestMoveEval - evalAfter;

  // Special cases first
  if (missedMate) {
    return {
      classification: 'miss',
      label: 'Missed Win',
      color: '#fa412d',
      cpLoss: centipawnLoss
    };
  }

  // Brilliant move: sacrifice that leads to advantage
  if (isSacrifice && centipawnLoss <= 20 && evalAfter > evalBefore) {
    return {
      classification: 'brilliant',
      label: 'Brilliant',
      color: '#1baca6',
      cpLoss: centipawnLoss
    };
  }

  // Great move: only good move in position
  if (isOnlyGood && centipawnLoss <= 20) {
    return {
      classification: 'great',
      label: 'Great Move',
      color: '#5c8bb0',
      cpLoss: centipawnLoss
    };
  }

  // Best move: engine's top choice
  if (isBestMove || centipawnLoss <= 10) {
    return {
      classification: 'best',
      label: 'Best Move',
      color: '#9bc02a',
      cpLoss: centipawnLoss
    };
  }

  // Excellent move
  if (centipawnLoss <= 25) {
    return {
      classification: 'excellent',
      label: 'Excellent',
      color: '#96bc4b',
      cpLoss: centipawnLoss
    };
  }

  // Good move
  if (centipawnLoss <= 50) {
    return {
      classification: 'good',
      label: 'Good',
      color: '#96af8b',
      cpLoss: centipawnLoss
    };
  }

  // Inaccuracy
  if (centipawnLoss <= 100) {
    return {
      classification: 'inaccuracy',
      label: 'Inaccuracy',
      color: '#f0c15c',
      cpLoss: centipawnLoss
    };
  }

  // Mistake
  if (centipawnLoss <= 200) {
    return {
      classification: 'mistake',
      label: 'Mistake',
      color: '#e58f2a',
      cpLoss: centipawnLoss
    };
  }

  // Blunder
  return {
    classification: 'blunder',
    label: 'Blunder',
    color: '#fa412d',
    cpLoss: centipawnLoss
  };
}

/**
 * Get classification emoji
 */
export function getClassificationEmoji(classification) {
  const emojis = {
    brilliant: '!!',
    great: '!',
    best: '✓',
    excellent: '✓',
    good: '✓',
    book: '📖',
    inaccuracy: '?!',
    mistake: '?',
    blunder: '??',
    miss: '??'
  };
  return emojis[classification] || '';
}

/**
 * Get move classification summary
 */
export function getClassificationSymbol(classification) {
  const symbols = {
    brilliant: '‼',
    great: '!',
    best: '',
    excellent: '',
    good: '',
    book: '',
    inaccuracy: '?!',
    mistake: '?',
    blunder: '??',
    miss: '??'
  };
  return symbols[classification] || '';
}

/**
 * Calculate average centipawn loss (ACPL) for a game
 * @param {Array} moves - Array of move objects with cpLoss property
 * @returns {number} Average centipawn loss
 */
export function calculateACPL(moves) {
  if (!moves || moves.length === 0) return 0;

  const totalLoss = moves.reduce((sum, move) => {
    return sum + (move.cpLoss || 0);
  }, 0);

  return Math.round(totalLoss / moves.length);
}

/**
 * Calculate accuracy percentage
 * Formula similar to Chess.com
 * @param {Array} moves - Array of move objects with cpLoss property
 * @returns {number} Accuracy percentage (0-100)
 */
export function calculateAccuracy(moves) {
  if (!moves || moves.length === 0) return 100;

  let totalAccuracy = 0;

  moves.forEach(move => {
    const cpLoss = move.cpLoss || 0;

    // Formula: 103.1668 * exp(-0.04354 * cpLoss) - 3.1669
    // Capped between 0 and 100
    const accuracy = Math.max(0, Math.min(100,
      103.1668 * Math.exp(-0.04354 * cpLoss) - 3.1669
    ));

    totalAccuracy += accuracy;
  });

  return Math.round(totalAccuracy / moves.length);
}

/**
 * Get move statistics from a game
 * @param {Array} moves - Array of classified moves
 * @returns {Object} Statistics object
 */
export function getMoveStatistics(moves) {
  const stats = {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    miss: 0,
    total: moves.length
  };

  moves.forEach(move => {
    if (move.classification && stats.hasOwnProperty(move.classification)) {
      stats[move.classification]++;
    }
  });

  return stats;
}

/**
 * Determine if a move is a sacrifice
 * @param {Object} move - Chess.js move object
 * @param {number} materialBefore - Material count before move
 * @param {number} materialAfter - Material count after move
 * @returns {boolean} True if sacrifice
 */
export function isSacrifice(move, materialBefore, materialAfter) {
  // Simplified: check if material decreased without a capture
  if (!move.captured && materialAfter < materialBefore) {
    return true;
  }

  // Check if piece value of captured is less than piece moved
  if (move.captured) {
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const capturedValue = pieceValues[move.captured.toLowerCase()] || 0;
    const movedValue = pieceValues[move.piece.toLowerCase()] || 0;

    if (movedValue > capturedValue + 1) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate material value from board position
 * @param {Object} chess - Chess.js instance
 * @returns {Object} Material count {white: number, black: number}
 */
export function calculateMaterial(chess) {
  const pieceValues = {
    p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
  };

  let whiteMaterial = 0;
  let blackMaterial = 0;

  const board = chess.board();
  board.forEach(row => {
    row.forEach(square => {
      if (square) {
        const value = pieceValues[square.type.toLowerCase()] || 0;
        if (square.color === 'w') {
          whiteMaterial += value;
        } else {
          blackMaterial += value;
        }
      }
    });
  });

  return { white: whiteMaterial, black: blackMaterial };
}

/**
 * Format time in seconds to readable string
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time
 */
export function formatTime(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format nodes count to readable string
 * @param {number} nodes - Number of nodes
 * @returns {string} Formatted nodes (e.g., "1.2M", "543K")
 */
export function formatNodes(nodes) {
  if (nodes >= 1000000) {
    return `${(nodes / 1000000).toFixed(1)}M`;
  }
  if (nodes >= 1000) {
    return `${(nodes / 1000).toFixed(1)}K`;
  }
  return nodes.toString();
}

export default {
  centipawnsToEval,
  scoreToCentipawns,
  scoreToString,
  centipawnsToWinPercentage,
  classifyMove,
  getClassificationEmoji,
  getClassificationSymbol,
  calculateACPL,
  calculateAccuracy,
  getMoveStatistics,
  isSacrifice,
  calculateMaterial,
  formatTime,
  formatNodes
};
