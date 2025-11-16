/**
 * Move Evaluation Service
 * Calls backend /evaluate endpoint for ALL move classification
 *
 * NO LOCAL CLASSIFICATION - Everything done on backend with native Stockfish
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Evaluate a single move using backend
 *
 * @param {string} fen - FEN string BEFORE the move
 * @param {string} move - UCI move string (e.g., "e2e4")
 * @param {number} depth - Search depth (default: 18)
 * @param {number} multipv - Number of lines (default: 5)
 * @returns {Promise<Object>} Complete evaluation with classification
 */
export async function evaluateMove(fen, move, depth = 18, multipv = 5) {
  try {
    const formData = new FormData();
    formData.append('fen', fen);
    formData.append('move', move);
    formData.append('depth', depth.toString());
    formData.append('multipv', multipv.toString());

    const response = await fetch(`${API_BASE_URL}/evaluate`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Evaluation failed');
    }

    const data = await response.json();

    // Return standardized format
    return {
      // Main classification
      label: data.label,                    // "Brilliant", "Great", "Best", "Good", etc.
      classification: data.label,           // Alias for compatibility

      // Evaluation scores
      evalBefore: data.eval_before,
      evalAfter: data.eval_after,
      evalChange: data.eval_change,
      cpl: data.cpl,                        // Centipawn loss

      // Move quality indicators
      multipvRank: data.multipv_rank,       // 1 = engine's top move
      topGap: data.top_gap,                 // Gap to best move

      // Special flags
      isSacrifice: data.is_sacrifice,
      isBook: data.is_book,
      inOpeningDb: data.in_opening_db,
      isMiss: data.miss_detected,

      // Sub-classifications
      basicLabel: data.basic_label,         // Best/Good/Inaccuracy/Mistake/Blunder
      exclamLabel: data.exclam_label,       // Brilliant/Great or null

      // Mate information
      bestMateIn: data.best_mate_in,
      playedMateIn: data.played_mate_in,
      mateFlip: data.mate_flip,

      // Full response (for debugging)
      raw: data
    };
  } catch (error) {
    console.error('Backend evaluation failed:', error);
    throw error;
  }
}

/**
 * Get move badge info for rendering
 *
 * @param {Object} evaluation - Result from evaluateMove()
 * @returns {Object} Badge display info
 */
export function getMoveBadge(evaluation) {
  if (!evaluation) return null;

  const { label, isSacrifice, cpl, evalChange } = evaluation;

  // Badge style mapping
  const badgeStyles = {
    'Brilliant': { symbol: '!!', color: '#1baca6', icon: '💎' },
    'Great': { symbol: '!', color: '#5c9fc4', icon: '⭐' },
    'Best': { symbol: '', color: '#96bc4b', icon: '✓' },
    'Excellent': { symbol: '', color: '#9bc02a', icon: '✨' },  // Added Excellent
    'Good': { symbol: '', color: '#96af8b', icon: '' },
    'Book': { symbol: '', color: '#a88865', icon: '📖' },
    'Inaccuracy': { symbol: '?!', color: '#f0c15c', icon: '⚠️' },
    'Mistake': { symbol: '?', color: '#e58f2b', icon: '❌' },
    'Blunder': { symbol: '??', color: '#ca3431', icon: '💥' },
    'Miss': { symbol: '?!', color: '#f0c15c', icon: '👁️' }
  };

  const style = badgeStyles[label] || badgeStyles['Good'];

  return {
    label,
    symbol: style.symbol,
    color: style.color,
    icon: style.icon,
    isSacrifice,
    cpl,
    evalChange
  };
}

/**
 * Get move explanation text
 *
 * @param {Object} evaluation - Result from evaluateMove()
 * @returns {string} Human-readable explanation
 */
export function getMoveExplanation(evaluation) {
  if (!evaluation) return '';

  const { label, isSacrifice, cpl, evalBefore, evalAfter, isBook, isMiss } = evaluation;

  if (isBook) {
    return 'This is a known opening move from the book.';
  }

  if (label === 'Brilliant') {
    if (isSacrifice) {
      return `Brilliant sacrifice! This move sacrifices material for a winning advantage.`;
    }
    return 'Brilliant move with exceptional tactical vision!';
  }

  if (label === 'Great') {
    return 'Great move! Shows excellent understanding of the position.';
  }

  if (label === 'Best') {
    return "This is the engine's top choice.";
  }

  if (label === 'Excellent') {
    return 'An excellent move with very minimal loss in accuracy.';
  }

  if (label === 'Good') {
    return 'A solid move maintaining the advantage.';
  }

  if (isMiss) {
    return `You missed a better opportunity. There was a move gaining ${Math.abs(cpl)} centipawns.`;
  }

  if (label === 'Inaccuracy') {
    return `Slightly inaccurate. Lost ${cpl} centipawns.`;
  }

  if (label === 'Mistake') {
    return `A mistake. Lost ${cpl} centipawns.`;
  }

  if (label === 'Blunder') {
    return `Blunder! Lost ${cpl} centipawns.`;
  }

  return `Evaluated as ${label}`;
}

export default {
  evaluateMove,
  getMoveBadge,
  getMoveExplanation
};
