/**
 * Move Evaluation Service
 * NOW USES BROWSER-BASED EVALUATION instead of backend /evaluate
 *
 * Backend is preserved for React Native app
 * Web app uses browser Stockfish for all evaluations
 */

import {
  evaluateMove as browserEvaluateMove,
  getMoveBadge as browserGetMoveBadge,
  getMoveExplanation as browserGetMoveExplanation
} from './browserEvaluationService';

/**
 * Evaluate a single move using browser engine
 *
 * @param {string} fen - FEN string BEFORE the move
 * @param {string} move - UCI move string (e.g., "e2e4")
 * @param {number} depth - Search depth (default: 18)
 * @param {number} multipv - Number of lines (default: 5)
 * @returns {Promise<Object>} Complete evaluation with classification
 */
export async function evaluateMove(fen, move, depth = 18, multipv = 5) {
  try {
    const result = await browserEvaluateMove(fen, move, depth, multipv);

    // Normalize field names for compatibility
    return {
      // Main classification
      label: result.label,
      classification: result.label,

      // Evaluation scores
      evalBefore: result.eval_before,
      evalAfter: result.eval_after,
      evalChange: result.eval_change,
      cpl: result.cpl,

      // Move quality indicators
      multipvRank: result.multipv_rank,
      topGap: result.top_gap,

      // Special flags
      isSacrifice: result.is_sacrifice,
      isBook: result.is_book,
      inOpeningDb: result.in_opening_db,
      isMiss: result.miss_detected,

      // Sub-classifications
      basicLabel: result.basic_label,
      exclamLabel: result.exclam_label,

      // Mate information
      bestMateIn: result.best_mate_in,
      playedMateIn: result.played_mate_in,
      mateFlip: result.mate_flip,

      // Full response (for debugging)
      raw: result
    };
  } catch (error) {
    console.error('Browser evaluation failed:', error);
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

  // Convert back to snake_case for browser function
  const evalForBrowser = {
    label: evaluation.label || evaluation.classification,
    is_sacrifice: evaluation.isSacrifice,
    cpl: evaluation.cpl,
    eval_change: evaluation.evalChange
  };

  return browserGetMoveBadge(evalForBrowser);
}

/**
 * Get move explanation text
 *
 * @param {Object} evaluation - Result from evaluateMove()
 * @returns {string} Human-readable explanation
 */
export function getMoveExplanation(evaluation) {
  if (!evaluation) return '';

  // Convert back to snake_case for browser function
  const evalForBrowser = {
    label: evaluation.label || evaluation.classification,
    is_sacrifice: evaluation.isSacrifice,
    cpl: evaluation.cpl,
    eval_before: evaluation.evalBefore,
    eval_after: evaluation.evalAfter,
    is_book: evaluation.isBook,
    miss_detected: evaluation.isMiss
  };

  return browserGetMoveExplanation(evalForBrowser);
}

export default {
  evaluateMove,
  getMoveBadge,
  getMoveExplanation
};
