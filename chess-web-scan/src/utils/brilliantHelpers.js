/**
 * Brilliant Move Detection Helpers
 * Helper functions for detecting sacrifices, uniqueness, and stability
 */

import { BRILLIANT_CONFIG } from './brilliantConfig.js';
import { evalForRoot } from './moveClassification.js';

/**
 * Calculate material count for a position
 * @param {string} fen - Position FEN
 * @returns {number} Total material value in centipawns
 */
export function calculateMaterial(fen) {
  const board = fen.split(' ')[0];
  let material = 0;

  for (const char of board) {
    const piece = char.toLowerCase();
    if (BRILLIANT_CONFIG.PIECE_VALUES[piece]) {
      material += BRILLIANT_CONFIG.PIECE_VALUES[piece];
    }
  }

  return material;
}

/**
 * Calculate material for a specific side
 * @param {string} fen - Position FEN
 * @param {string} side - 'w' or 'b'
 * @returns {number} Material value for side
 */
export function calculateSideMaterial(fen, side) {
  const board = fen.split(' ')[0];
  let material = 0;

  for (const char of board) {
    const isWhite = char === char.toUpperCase() && char.match(/[PNBRQK]/);
    const isBlack = char === char.toLowerCase() && char.match(/[pnbrqk]/);

    if ((side === 'w' && isWhite) || (side === 'b' && isBlack)) {
      const piece = char.toLowerCase();
      if (BRILLIANT_CONFIG.PIECE_VALUES[piece]) {
        material += BRILLIANT_CONFIG.PIECE_VALUES[piece];
      }
    }
  }

  return material;
}

/**
 * Apply a move and return the resulting FEN
 * @param {string} fen - Starting FEN
 * @param {string} uciMove - Move in UCI format
 * @returns {string|null} Resulting FEN or null if invalid
 */
async function applyMove(fen, uciMove) {
  try {
    const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
    const game = new Chess(fen);

    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

    // Validate move is legal before attempting
    const legalMoves = game.moves({ verbose: true });
    const isLegal = legalMoves.some(m => m.from === from && m.to === to && (!promotion || m.promotion === promotion));
    
    if (!isLegal) {
      // Silently return null for illegal moves - this is expected in PV analysis
      // when the engine's PV doesn't match the actual position
      return null;
    }

    const move = game.move({ from, to, promotion });
    if (!move) return null;

    return game.fen();
  } catch (e) {
    // Only log if unexpected error (not invalid move)
    console.warn('Unexpected error in applyMove:', {
      fen,
      move: uciMove,
      error: e.message
    });
    return null;
  }
}

/**
 * Detect if a move is a sacrifice
 * @param {string} beforeFen - FEN before the move
 * @param {string} move - UCI move
 * @param {Array} pv - Principal variation after the move
 * @param {string} rootTurn - Side to move ('w' or 'b')
 * @returns {Promise<Object>} Sacrifice detection result
 */
export async function detectSacrifice(beforeFen, move, pv = [], rootTurn) {
  try {
    const materialBefore = calculateSideMaterial(beforeFen, rootTurn);

    // Apply the move
    const afterFen = await applyMove(beforeFen, move);
    if (!afterFen) {
      return { isSacrifice: false, materialLost: 0, reason: 'invalid_move' };
    }

    const materialAfter = calculateSideMaterial(afterFen, rootTurn);
    const immediateLoss = materialBefore - materialAfter;

    // Check if material is recovered in next few plies
    let currentFen = afterFen;
    let minMaterial = materialAfter;

    for (let i = 0; i < Math.min(BRILLIANT_CONFIG.SAC_RECOVERY_PLIES, pv.length); i++) {
      const nextMove = pv[i];
      if (!nextMove) break;

      currentFen = await applyMove(currentFen, nextMove);
      if (!currentFen) break;

      const currentMaterial = calculateSideMaterial(currentFen, rootTurn);
      minMaterial = Math.min(minMaterial, currentMaterial);
    }

    const netLoss = materialBefore - minMaterial;

    // Determine if it's a sacrifice
    const isSacrifice = netLoss >= BRILLIANT_CONFIG.SAC_CP_MIN;
    const isExchangeSac = netLoss >= BRILLIANT_CONFIG.SAC_EXCHANGE_MIN && netLoss < BRILLIANT_CONFIG.SAC_CP_MIN;

    return {
      isSacrifice: isSacrifice || isExchangeSac,
      materialLost: netLoss,
      immediateLoss,
      isExchangeSac,
      reason: isSacrifice ? 'material_sacrifice' : isExchangeSac ? 'exchange_sacrifice' : 'no_sacrifice'
    };
  } catch (e) {
    console.error('Error detecting sacrifice:', e);
    return { isSacrifice: false, materialLost: 0, reason: 'error' };
  }
}

/**
 * Evaluate uniqueness - count opponent's good replies
 * @param {Object} stockfish - Stockfish service
 * @param {string} afterMoveFen - FEN after the candidate move
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Uniqueness evaluation
 */
export async function evaluateUniqueness(stockfish, afterMoveFen, options = {}) {
  try {
    const { movetime = BRILLIANT_CONFIG.UNIQUENESS_MOVETIME, multiPV = 5 } = options;

    // Analyze opponent's replies
    const analysis = await stockfish.analyze(afterMoveFen, { movetime, multiPV });

    if (!analysis || !analysis.lines || analysis.lines.length === 0) {
      return { goodReplies: 0, pvGap: 0, isUnique: false, reason: 'no_analysis' };
    }

    const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
    const game = new Chess(afterMoveFen);
    const turn = game.turn();

    // Normalize scores from opponent's perspective
    const lines = analysis.lines.map(line => ({
      ...line,
      scoreForNode: evalForRoot(turn, turn, line.evaluation)
    })).sort((a, b) => b.scoreForNode - a.scoreForNode);

    const bestScore = lines[0].scoreForNode;
    const pvGap = lines.length > 1 ? Math.abs(bestScore - lines[1].scoreForNode) : 9999;

    // Count replies within tolerance of best
    const goodReplies = lines.filter(line =>
      Math.abs(bestScore - line.scoreForNode) <= BRILLIANT_CONFIG.UNIQUENESS_REPLY_EPS
    ).length;

    const isUnique = goodReplies <= BRILLIANT_CONFIG.UNIQUENESS_MAX_GOOD_REPLIES;

    return {
      goodReplies,
      pvGap,
      isUnique,
      bestReply: lines[0].pv?.[0],
      reason: isUnique ? 'unique' : 'multiple_good_replies'
    };
  } catch (e) {
    console.error('Error evaluating uniqueness:', e);
    return { goodReplies: 0, pvGap: 0, isUnique: false, reason: 'error' };
  }
}

/**
 * Check stability of a line by extending analysis
 * @param {Object} stockfish - Stockfish service
 * @param {string} fen - Starting FEN
 * @param {Array} pv - Principal variation to check
 * @param {string} rootTurn - Root turn
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Stability check result
 */
export async function checkStability(stockfish, fen, pv, rootTurn, options = {}) {
  try {
    const {
      movetime = BRILLIANT_CONFIG.STABILITY_MOVETIME,
      plies = BRILLIANT_CONFIG.STABILITY_PLIES
    } = options;

    if (!pv || pv.length === 0) {
      return { isStable: false, maxDrift: 9999, reason: 'no_pv' };
    }

    // Get initial evaluation
    const initialAnalysis = await stockfish.analyze(fen, { movetime, multiPV: 1 });
    const initialScore = evalForRoot(rootTurn, rootTurn, initialAnalysis.evaluation);

    let currentFen = fen;
    let maxDrift = 0;
    const evaluations = [initialScore];

    // Apply moves and check eval at each ply
    const pliesToCheck = Math.min(plies, pv.length);

    for (let i = 0; i < pliesToCheck; i++) {
      const move = pv[i];
      if (!move) break;

      currentFen = await applyMove(currentFen, move);
      if (!currentFen) break;

      // Analyze position
      const analysis = await stockfish.analyze(currentFen, { movetime, multiPV: 1 });

      const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
      const game = new Chess(currentFen);
      const nodeTurn = game.turn();

      const score = evalForRoot(rootTurn, nodeTurn, analysis.evaluation);
      evaluations.push(score);

      // Calculate drift from initial
      const drift = Math.abs(score - initialScore);
      maxDrift = Math.max(maxDrift, drift);

      // Early exit if drift too large
      if (maxDrift > BRILLIANT_CONFIG.STABILITY_DRIFT_CP * 2) break;
    }

    const isStable = maxDrift <= BRILLIANT_CONFIG.STABILITY_DRIFT_CP;

    return {
      isStable,
      maxDrift,
      evaluations,
      pliesChecked: evaluations.length - 1,
      reason: isStable ? 'stable' : 'eval_collapsed'
    };
  } catch (e) {
    console.error('Error checking stability:', e);
    return { isStable: false, maxDrift: 9999, reason: 'error' };
  }
}

/**
 * Calculate WDL delta if supported
 * @param {Object} beforeWdl - WDL before move {w, d, l}
 * @param {Object} afterWdl - WDL after move {w, d, l}
 * @param {string} rootTurn - Root turn
 * @returns {number} Change in win probability (-1 to 1)
 */
export function calculateWdlDelta(beforeWdl, afterWdl, rootTurn) {
  if (!beforeWdl || !afterWdl) return null;

  // Convert to win probability (0-1)
  const beforeWin = rootTurn === 'w'
    ? beforeWdl.w / 1000
    : beforeWdl.l / 1000;

  const afterWin = rootTurn === 'w'
    ? afterWdl.w / 1000
    : afterWdl.l / 1000;

  return afterWin - beforeWin;
}

/**
 * Check if position is already winning
 * @param {number} eval - Evaluation in centipawns
 * @returns {boolean} True if already winning
 */
export function isAlreadyWinning(evaluation) {
  return Math.abs(evaluation) >= BRILLIANT_CONFIG.WINNING_GUARD_CP;
}

/**
 * Determine game phase
 * @param {string} fen - Position FEN
 * @returns {string} 'opening' | 'middlegame' | 'endgame'
 */
export function getGamePhase(fen) {
  const pieceCount = (fen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;
  const moveNumber = parseInt(fen.split(' ')[5] || '1');

  if (moveNumber <= BRILLIANT_CONFIG.OPENING_MOVE_MAX &&
      pieceCount >= BRILLIANT_CONFIG.OPENING_PIECE_MIN) {
    return 'opening';
  }

  if (pieceCount <= BRILLIANT_CONFIG.ENDGAME_PIECE_MAX) {
    return 'endgame';
  }

  return 'middlegame';
}

/**
 * Cap mate values for arithmetic
 * @param {Object} evaluation - Engine evaluation
 * @returns {number} Capped centipawn value
 */
export function capMateValue(evaluation) {
  if (!evaluation || evaluation.type !== 'mate') {
    return evaluation?.value ?? 0;
  }

  const sign = evaluation.value > 0 ? 1 : -1;
  return sign * BRILLIANT_CONFIG.MATE_CP_CAP;
}

export default {
  calculateMaterial,
  calculateSideMaterial,
  detectSacrifice,
  evaluateUniqueness,
  checkStability,
  calculateWdlDelta,
  isAlreadyWinning,
  getGamePhase,
  capMateValue
};
