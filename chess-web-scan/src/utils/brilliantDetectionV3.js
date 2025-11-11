/**
 * Brilliant Move Detection V3
 * Based on Chess.com-style 7-case classification system
 * Tested and validated against Chess.com's brilliant move labels
 */

import { evalForRoot, normalizeLines } from './moveClassification.js';
import { detectSacrifice } from './brilliantHelpers.js';

/**
 * Analyze if a move is brilliant using 7-case system
 * @param {Object} stockfish - Stockfish service
 * @param {string} beforeFen - FEN before the move
 * @param {string} move - Move in UCI format
 * @param {Object} analysisData - Pre-computed analysis data
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Brilliant analysis result
 */
export async function analyzeBrilliantV3(stockfish, beforeFen, move, analysisData = {}, options = {}) {
  const { depth = 20 } = options;

  try {
    const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
    const rootChess = new Chess(beforeFen);
    const rootTurn = rootChess.turn();

    // Use pre-computed data if available, otherwise analyze
    let evalBefore, evalAfter, multipvRank, gapToSecond, isSacrifice;

    if (analysisData.evalBefore !== undefined && analysisData.evalAfter !== undefined) {
      // Use provided analysis data
      evalBefore = analysisData.evalBefore;
      evalAfter = analysisData.evalAfter;
      multipvRank = analysisData.multipvRank || 99;
      gapToSecond = analysisData.gapToSecond || 0;
      isSacrifice = analysisData.isSacrifice !== undefined
        ? analysisData.isSacrifice
        : await checkIfSacrifice(beforeFen, move, rootTurn);
    } else {
      // Perform analysis
      const result = await performBrilliantAnalysis(stockfish, beforeFen, move, depth);
      evalBefore = result.evalBefore;
      evalAfter = result.evalAfter;
      multipvRank = result.multipvRank;
      gapToSecond = result.gapToSecond;
      isSacrifice = result.isSacrifice;
    }

    // Calculate evaluation change (from player's perspective)
    const evalChange = evalAfter - evalBefore;

    console.log(`🎯 Brilliant V3 Check:`, {
      move,
      evalBefore: evalBefore.toFixed(1),
      evalAfter: evalAfter.toFixed(1),
      evalChange: evalChange.toFixed(1),
      multipvRank,
      gapToSecond: gapToSecond.toFixed(0),
      isSacrifice
    });

    // Apply 7-case brilliant detection system
    const result = detectBrilliantByCase(
      evalBefore,
      evalAfter,
      evalChange,
      multipvRank,
      gapToSecond,
      isSacrifice
    );

    console.log(`${result.isBrilliant ? '✅' : '❌'} ${result.reason}`);

    return {
      isBrilliantV3: result.isBrilliant,
      brilliantCase: result.case,
      reason: result.reason,
      confidence: result.confidence,
      evalBefore,
      evalAfter,
      evalChange,
      multipvRank,
      gapToSecond,
      isSacrifice
    };

  } catch (error) {
    console.error('Error in Brilliant V3 analysis:', error);
    return {
      isBrilliantV3: false,
      brilliantCase: null,
      reason: `Error: ${error.message}`,
      confidence: 0
    };
  }
}

/**
 * Perform full analysis to get all needed metrics
 */
async function performBrilliantAnalysis(stockfish, beforeFen, move, depth) {
  const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
  const rootChess = new Chess(beforeFen);
  const rootTurn = rootChess.turn();

  // 1. Analyze position before move (MultiPV to get engine's top moves)
  const beforeAnalysis = await stockfish.analyze(beforeFen, { depth, multiPV: 5 });
  const beforeLines = normalizeLines(beforeAnalysis.lines || [], rootTurn);

  if (beforeLines.length === 0) {
    throw new Error('No engine lines returned');
  }

  const bestScore = beforeLines[0]?.scoreForRoot ?? 0;
  const secondScore = beforeLines.length > 1 ? beforeLines[1]?.scoreForRoot : bestScore;
  const gapToSecond = Math.abs(bestScore - secondScore);

  // Find rank of played move
  let multipvRank = 99;
  const moveLower = move.toLowerCase();
  for (let i = 0; i < beforeLines.length; i++) {
    const pvMove = beforeLines[i]?.pv?.[0]?.toLowerCase();
    if (!pvMove) continue;

    // Match move (handle promotions)
    if (pvMove === moveLower ||
        pvMove.substring(0, 4) === moveLower.substring(0, 4)) {
      multipvRank = i + 1;
      break;
    }
  }

  // 2. Get eval from root perspective (before move)
  const evalBefore = bestScore; // Best move score = position eval

  // 3. Apply move and analyze after position
  rootChess.move({
    from: move.substring(0, 2),
    to: move.substring(2, 4),
    promotion: move.length > 4 ? move[4] : undefined
  });
  const afterFen = rootChess.fen();

  const afterAnalysis = await stockfish.analyze(afterFen, { depth, multiPV: 1 });
  const afterChess = new Chess(afterFen);
  const afterTurn = afterChess.turn();

  // Important: Eval after is from ROOT player's perspective (not opponent's)
  const evalAfter = evalForRoot(rootTurn, afterTurn, afterAnalysis.evaluation);

  // 4. Check if it's a sacrifice
  const isSacrifice = await checkIfSacrifice(beforeFen, move, rootTurn);

  return {
    evalBefore,
    evalAfter,
    multipvRank,
    gapToSecond,
    isSacrifice
  };
}

/**
 * Check if move is a sacrifice
 */
async function checkIfSacrifice(beforeFen, move, rootTurn) {
  try {
    const sacrificeResult = await detectSacrifice(beforeFen, move, [move], rootTurn);
    return sacrificeResult.isSacrifice;
  } catch (error) {
    // Fallback: simple material check
    const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
    const chess = new Chess(beforeFen);

    const fromSquare = move.substring(0, 2);
    const toSquare = move.substring(2, 4);

    const movingPiece = chess.get(fromSquare);
    const capturedPiece = chess.get(toSquare);

    if (!movingPiece) return false;

    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const movedValue = pieceValues[movingPiece.type] || 0;
    const capturedValue = capturedPiece ? (pieceValues[capturedPiece.type] || 0) : 0;

    // Sacrifice if we give up more material than we take
    return movedValue > capturedValue && movedValue >= 3; // At least minor piece
  }
}

/**
 * Detect brilliant move using 7-case system
 * This matches Chess.com's brilliant move classification
 */
function detectBrilliantByCase(evalBefore, evalAfter, evalChange, multipvRank, gapToSecond, isSacrifice) {

  // Case 1: Non-obvious sacrifice
  // Engine didn't see it (rank ≥5), but position improved dramatically
  if (isSacrifice && multipvRank >= 5 && evalChange >= 200) {
    return {
      isBrilliant: true,
      case: 1,
      reason: `Case 1: Non-obvious sacrifice (rank ${multipvRank}, gain +${evalChange.toFixed(0)}cp)`,
      confidence: 0.95
    };
  }

  // Case 2: Top engine sacrifice - maintains/improves position without being already winning
  if (isSacrifice && multipvRank <= 2 && evalChange >= 0 && evalAfter > -300 && evalBefore < 300) {
    return {
      isBrilliant: true,
      case: 2,
      reason: `Case 2: Top engine sacrifice (rank ${multipvRank}, maintained position)`,
      confidence: 0.90
    };
  }

  // Case 3: Defensive brilliancy
  // Turning a losing/bad position into equal or winning
  if (evalBefore <= -200 && evalAfter >= -50 && multipvRank <= 3) {
    return {
      isBrilliant: true,
      case: 3,
      reason: `Case 3: Defensive brilliancy (${evalBefore.toFixed(0)} → ${evalAfter.toFixed(0)}cp)`,
      confidence: 0.92
    };
  }

  // Case 4: "Only Move" (Forced Brilliancy)
  // Large gap (≥300cp) between best and 2nd best means all other moves are significantly worse
  if (multipvRank === 1 && gapToSecond >= 300 && evalChange >= 0) {
    return {
      isBrilliant: true,
      case: 4,
      reason: `Case 4: Only move (gap ${gapToSecond.toFixed(0)}cp to 2nd best)`,
      confidence: 0.88
    };
  }

  // Case 5: Quiet brilliancy
  // Non-sacrificial move with massive evaluation swing
  if (!isSacrifice && multipvRank <= 3 && evalChange >= 250 && evalBefore < 200) {
    return {
      isBrilliant: true,
      case: 5,
      reason: `Case 5: Quiet brilliancy (gain +${evalChange.toFixed(0)}cp without sacrifice)`,
      confidence: 0.85
    };
  }

  // Case 6: Compensation sacrifice
  // Small immediate eval loss but strong position (long-term sacrifice)
  if (isSacrifice && multipvRank <= 2 && evalChange >= -100 && evalChange < 0 && evalAfter >= -150) {
    return {
      isBrilliant: true,
      case: 6,
      reason: `Case 6: Compensation sacrifice (${evalChange.toFixed(0)}cp loss with compensation)`,
      confidence: 0.80
    };
  }

  // Case 7: Forced tactical sacrifice
  // Immediate eval drops but it's clearly best (indicates forced winning sequence)
  if (isSacrifice && multipvRank === 1 && gapToSecond >= 200 && evalChange < 0) {
    return {
      isBrilliant: true,
      case: 7,
      reason: `Case 7: Forced tactical sacrifice (best by ${gapToSecond.toFixed(0)}cp despite ${evalChange.toFixed(0)}cp drop)`,
      confidence: 0.93
    };
  }

  // Not brilliant - doesn't match any case
  return {
    isBrilliant: false,
    case: null,
    reason: `No brilliant case matched (rank ${multipvRank}, ${isSacrifice ? 'sacrifice' : 'no sacrifice'}, Δ${evalChange.toFixed(0)}cp)`,
    confidence: 0
  };
}

/**
 * Quick check if we should run brilliant analysis
 */
export function shouldCheckBrilliantV3(cpLoss, multipvRank, moveNumber, pieceCount) {
  // Skip mate positions (cpLoss > 100000 means mate)
  if (cpLoss > 100000) {
    console.log('   V3: Skipping mate position');
    return false;
  }

  // Only check near-best moves (allow up to 100cp loss for sacrifices)
  if (cpLoss > 100) {
    console.log('   V3: cpLoss too high:', cpLoss);
    return false;
  }

  // Skip trivial openings
  if (moveNumber <= 3 && pieceCount >= 32) {
    console.log('   V3: Skipping trivial opening');
    return false;
  }

  // Check moves that are either:
  // 1. Top 3 engine moves (might be Cases 2, 4, 6, 7)
  // 2. Non-obvious moves that might be Case 1
  if (multipvRank <= 3 || multipvRank >= 5) {
    console.log('   V3: Rank check passed:', multipvRank);
    return true;
  }

  console.log('   V3: Rank 4 not interesting');
  return false;
}

/**
 * Create analysis data from existing evaluation
 * Use this to avoid re-analyzing when you already have the data
 */
export function createAnalysisData(lines, move, rootTurn, afterEval, isSacrifice) {

  if (!lines || lines.length === 0) {
    return null;
  }

  // Find move rank
  let multipvRank = 99;
  const moveLower = move.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const pvMove = lines[i]?.pv?.[0]?.toLowerCase();
    if (pvMove === moveLower || pvMove?.substring(0, 4) === moveLower.substring(0, 4)) {
      multipvRank = i + 1;
      break;
    }
  }

  const evalBefore = lines[0]?.scoreForRoot ?? 0;
  const secondScore = lines.length > 1 ? lines[1]?.scoreForRoot : evalBefore;
  const gapToSecond = Math.abs(evalBefore - secondScore);

  return {
    evalBefore,
    evalAfter: afterEval,
    multipvRank,
    gapToSecond,
    isSacrifice
  };
}

export default {
  analyzeBrilliantV3,
  shouldCheckBrilliantV3,
  createAnalysisData
};
