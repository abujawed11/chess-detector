/**
 * Enhanced Brilliant Move Detection System
 * Precision-focused brilliant move detection with comprehensive gates
 */

import { BRILLIANT_CONFIG, getDynamicEngineParams } from './brilliantConfig.js';
import {
  detectSacrifice,
  evaluateUniqueness,
  checkStability,
  calculateWdlDelta,
  isAlreadyWinning,
  getGamePhase
} from './brilliantHelpers.js';
import { evalForRoot, normalizeLines } from './moveClassification.js';

/**
 * Analyze a move for Brilliant classification (V2)
 * @param {Object} stockfish - Stockfish service with analyze method
 * @param {string} beforeFen - FEN before the move
 * @param {string} move - Move in UCI format
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Detailed brilliant analysis result
 */
export async function analyzeBrilliantMove(stockfish, beforeFen, move, options = {}) {
  const {
    useAdaptive = true,
    depth = 20,
    movetime = BRILLIANT_CONFIG.DEFAULT_MOVETIME
  } = options;

  const reasons = [];
  const gates = {
    sacrifice: false,
    nearBest: false,
    forcing: false,
    uniqueness: false,
    nonTrivial: false,
    stability: false
  };

  try {
    // Import Chess for position manipulation
    const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
    const rootChess = new Chess(beforeFen);
    const rootTurn = rootChess.turn();
    const pieceCount = (beforeFen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;
    const gamePhase = getGamePhase(beforeFen);

    // Determine analysis parameters
    let analysisParams;
    if (useAdaptive) {
      analysisParams = getDynamicEngineParams(beforeFen, 100, pieceCount);
    } else {
      analysisParams = { movetime, depth, multiPV: BRILLIANT_CONFIG.ROOT_MULTIPV };
    }

    console.log(`🔍 Analyzing potential brilliant move: ${move} | Phase: ${gamePhase}`);

    // STEP 1: ROOT MULTIPV ANALYSIS
    const rootAnalysis = await stockfish.analyze(beforeFen, {
      ...analysisParams,
      multiPV: BRILLIANT_CONFIG.ROOT_MULTIPV
    });

    const lines = normalizeLines(rootAnalysis.lines || [], rootTurn);
    if (lines.length === 0) {
      return {
        isBrilliantV2: false,
        gates,
        reasons: ['no_engine_lines'],
        confidence: 0
      };
    }

    const bestMove = lines[0]?.pv?.[0];
    const bestScore = lines[0]?.scoreForRoot ?? 0;
    const pvGapBefore = lines.length > 1 ? (lines[0].scoreForRoot - lines[1].scoreForRoot) : 0;
    const beforeWdl = rootAnalysis.wdl || null;

    // STEP 2: SCORE THE CANDIDATE MOVE AT ROOT
    const ourRootAnalysis = await stockfish.analyze(beforeFen, {
      movetime: analysisParams.movetime,
      multiPV: 1,
      searchMoves: [move]
    });

    const ourScore = evalForRoot(rootTurn, rootTurn, ourRootAnalysis.evaluation);
    const cpLoss = Math.max(0, bestScore - ourScore);

    // GATE 1: NEAR-BEST AT ROOT
    const isNearBest = cpLoss <= BRILLIANT_CONFIG.NEAR_BEST_EPS;
    gates.nearBest = isNearBest;

    if (isNearBest) {
      reasons.push(`nearBest<=${BRILLIANT_CONFIG.NEAR_BEST_EPS}cp (loss=${cpLoss.toFixed(1)})`);
    } else {
      reasons.push(`FAILED: cpLoss=${cpLoss.toFixed(1)} > ${BRILLIANT_CONFIG.NEAR_BEST_EPS}cp`);
      return {
        isBrilliantV2: false,
        gates,
        reasons,
        cpLoss,
        confidence: 0
      };
    }

    // Apply move to get position after
    const afterFen = rootChess.move({ from: move.substring(0, 2), to: move.substring(2, 4), promotion: move[4] })
      ? rootChess.fen()
      : null;

    if (!afterFen) {
      return {
        isBrilliantV2: false,
        gates,
        reasons: ['invalid_move'],
        confidence: 0
      };
    }

    // GATE 2: SACRIFICE DETECTION
    const ourPv = ourRootAnalysis.lines?.[0]?.pv || [];
    const sacrificeResult = await detectSacrifice(beforeFen, move, ourPv, rootTurn);

    gates.sacrifice = sacrificeResult.isSacrifice;

    if (sacrificeResult.isSacrifice) {
      reasons.push(`sacrifice>=${BRILLIANT_CONFIG.SAC_CP_MIN}cp (lost=${sacrificeResult.materialLost})`);
    } else {
      reasons.push(`FAILED: no_sacrifice (lost=${sacrificeResult.materialLost})`);
      return {
        isBrilliantV2: false,
        gates,
        reasons,
        sacrificeResult,
        confidence: 0
      };
    }

    // STEP 3: ANALYZE POSITION AFTER MOVE
    const afterAnalysis = await stockfish.analyze(afterFen, {
      movetime: analysisParams.movetime,
      multiPV: BRILLIANT_CONFIG.ROOT_MULTIPV
    });

    const afterChess = new Chess(afterFen);
    const afterTurn = afterChess.turn();
    const linesAfter = normalizeLines(afterAnalysis.lines || [], rootTurn);
    const afterWdl = afterAnalysis.wdl || null;

    // Note: after the move, we're looking from ROOT perspective but opponent's turn
    // PV gap should be from opponent's best options
    const pvGapAfter = linesAfter.length > 1
      ? Math.abs(linesAfter[0].scoreForRoot - linesAfter[1].scoreForRoot)
      : 0;

    // GATE 3: FORCING / LARGE PV GAP AFTER
    const forcingThreshold = gamePhase === 'opening'
      ? BRILLIANT_CONFIG.FORCING_GAP_OPENING
      : BRILLIANT_CONFIG.FORCING_GAP_AFTER;

    gates.forcing = pvGapAfter >= forcingThreshold;

    if (gates.forcing) {
      reasons.push(`pvGapAfter=${pvGapAfter.toFixed(0)} >= ${forcingThreshold}cp`);
    } else {
      reasons.push(`WEAK: pvGapAfter=${pvGapAfter.toFixed(0)} < ${forcingThreshold}cp`);
    }

    // GATE 4: UNIQUENESS (opponent has few good replies)
    const uniquenessResult = await evaluateUniqueness(stockfish, afterFen, {
      movetime: BRILLIANT_CONFIG.UNIQUENESS_MOVETIME,
      multiPV: 5
    });

    gates.uniqueness = uniquenessResult.isUnique;

    if (gates.uniqueness) {
      reasons.push(`uniqueness<=${BRILLIANT_CONFIG.UNIQUENESS_MAX_GOOD_REPLIES} (found=${uniquenessResult.goodReplies})`);
    } else {
      reasons.push(`WEAK: tooManyGoodReplies=${uniquenessResult.goodReplies}`);
    }

    // GATE 5: NON-TRIVIALITY (not already crushing)
    const evalBefore = bestScore;
    const alreadyWinning = isAlreadyWinning(evalBefore);

    // For non-trivial, require one of:
    // a) Not already winning
    // b) WDL jump if available
    // c) Very forcing (pvGapAfter >= 350)

    let nonTrivialPass = false;

    if (!alreadyWinning) {
      nonTrivialPass = true;
      reasons.push(`nonTrivial: evalBefore=${evalBefore.toFixed(0)} < ${BRILLIANT_CONFIG.WINNING_GUARD_CP}cp`);
    } else {
      // Already winning - need stronger evidence
      if (beforeWdl && afterWdl) {
        const wdlDelta = calculateWdlDelta(beforeWdl, afterWdl, rootTurn);
        if (wdlDelta !== null && wdlDelta >= BRILLIANT_CONFIG.WDL_JUMP_MIN) {
          nonTrivialPass = true;
          reasons.push(`wdlJump=${(wdlDelta * 100).toFixed(1)}% >= ${BRILLIANT_CONFIG.WDL_JUMP_MIN * 100}%`);
        }
      }

      if (!nonTrivialPass && pvGapAfter >= 350) {
        nonTrivialPass = true;
        reasons.push(`forcingDespiteWinning: pvGap=${pvGapAfter.toFixed(0)} >= 350cp`);
      }

      if (!nonTrivialPass) {
        reasons.push(`FAILED: alreadyWinning=${evalBefore.toFixed(0)} without WDL jump`);
      }
    }

    gates.nonTrivial = nonTrivialPass;

    if (!nonTrivialPass) {
      return {
        isBrilliantV2: false,
        gates,
        reasons,
        confidence: 0.3
      };
    }

    // GATE 6: STABILITY CHECK
    const stabilityResult = await checkStability(
      stockfish,
      beforeFen,
      ourPv,
      rootTurn,
      {
        movetime: BRILLIANT_CONFIG.STABILITY_MOVETIME,
        plies: BRILLIANT_CONFIG.STABILITY_PLIES
      }
    );

    gates.stability = stabilityResult.isStable;

    if (gates.stability) {
      reasons.push(`stability: maxDrift=${stabilityResult.maxDrift.toFixed(0)} <= ${BRILLIANT_CONFIG.STABILITY_DRIFT_CP}cp over ${stabilityResult.pliesChecked} plies`);
    } else {
      reasons.push(`WEAK: unstable maxDrift=${stabilityResult.maxDrift.toFixed(0)} > ${BRILLIANT_CONFIG.STABILITY_DRIFT_CP}cp`);
    }

    // PHASE-SPECIFIC RULES
    if (gamePhase === 'endgame') {
      // Endgame: require uniqueness (only move) to be very strict
      if (uniquenessResult.goodReplies > 1) {
        reasons.push(`FAILED: endgame requires uniqueness (found ${uniquenessResult.goodReplies} replies)`);
        return {
          isBrilliantV2: false,
          gates,
          reasons,
          confidence: 0.4
        };
      }
    }

    // FINAL DECISION: ALL CRITICAL GATES MUST PASS
    const criticalGates = [
      gates.sacrifice,
      gates.nearBest,
      gates.forcing || gates.uniqueness, // At least one
      gates.nonTrivial,
      gates.stability
    ];

    const allCriticalPass = criticalGates.every(g => g === true);

    // Calculate confidence based on gates
    let confidence = 0;
    if (gates.sacrifice) confidence += 0.25;
    if (gates.nearBest) confidence += 0.15;
    if (gates.forcing) confidence += 0.20;
    if (gates.uniqueness) confidence += 0.15;
    if (gates.nonTrivial) confidence += 0.15;
    if (gates.stability) confidence += 0.10;

    const isBrilliantV2 = allCriticalPass && confidence >= 0.85;

    if (isBrilliantV2) {
      reasons.unshift(`✓ BRILLIANT CONFIRMED (confidence=${(confidence * 100).toFixed(0)}%)`);
    } else {
      reasons.unshift(`✗ Not Brilliant (confidence=${(confidence * 100).toFixed(0)}%, needs >=85%)`);
    }

    return {
      isBrilliantV2,
      gates,
      reasons,
      confidence,
      cpLoss,
      sacrificeResult,
      uniquenessResult,
      stabilityResult,
      pvGapBefore,
      pvGapAfter,
      gamePhase,
      evalBefore
    };

  } catch (error) {
    console.error('Error in brilliant analysis:', error);
    return {
      isBrilliantV2: false,
      gates,
      reasons: [`ERROR: ${error.message}`],
      confidence: 0
    };
  }
}

/**
 * Quick check if a move is worth detailed brilliant analysis
 * @param {string} beforeFen - FEN before move
 * @param {string} move - UCI move
 * @param {number} cpLoss - Centipawn loss
 * @param {boolean} forced - Is position forced
 * @returns {boolean} True if worth analyzing
 */
export function shouldCheckBrilliant(beforeFen, move, cpLoss, forced) {
  // Only check moves that are near-best
  if (cpLoss > BRILLIANT_CONFIG.NEAR_BEST_EPS) return false;

  // Skip if in trivial opening
  const pieceCount = (beforeFen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;
  const moveNumber = parseInt(beforeFen.split(' ')[5] || '1');

  if (moveNumber <= 3 && pieceCount >= 32) return false;

  // Prefer forced positions
  if (forced) return true;

  // Check game phase
  const phase = getGamePhase(beforeFen);
  if (phase === 'middlegame') return true;

  return false;
}

export default {
  analyzeBrilliantMove,
  shouldCheckBrilliant
};
