/**
 * Browser-Based Move Evaluation Service
 * Complete replacement for backend /evaluate endpoint
 * Uses browser Stockfish + JavaScript classification logic
 */

import { Chess } from 'chess.js';
import { getBrowserStockfish } from './browserStockfishService';
import {
  evalForWhite,
  cpForPlayer,
  materialGainForMove,
  computeBestLineMaterialGain,
  getSideToMove,
  isCheckmate,
  isStalemate,
  isGameOver,
  applyUciMove
} from '../utils/chessHelpers';
import {
  detectSacrifice,
  classifyBasicMove,
  detectMiss,
  detectSacBrilliancy,
  detectGreatMove,
  situationFromCp
} from '../utils/basicMoveLabels';
import { isBookMove } from '../utils/openingBook';

const MATE_CP = 32000;
const MATE_STEP = 1000;

/**
 * Helper: Get multipv rank and gap for played move
 */
function playedRankAndGap(uciMove, pvs, sideToMove) {
  if (!pvs || pvs.length === 0) {
    return [1, null, null, null];
  }

  const uciMoveNormalized = uciMove.toLowerCase().trim().replace('=', '');
  const K = pvs.length;

  const bestEvalCp = evalForWhite(pvs[0].score, sideToMove);

  for (let pvEntry of pvs) {
    const pv = pvEntry.pv || [];
    if (pv.length === 0) continue;

    const pvMove = pv[0].toLowerCase().trim().replace('=', '');

    let isMatch = false;
    if (pvMove === uciMoveNormalized) {
      isMatch = true;
    } else if (pvMove.length >= 4 && uciMoveNormalized.length >= 4 && pvMove.substring(0, 4) === uciMoveNormalized.substring(0, 4)) {
      if (pvMove.length === uciMoveNormalized.length) {
        if (pvMove.length === 4) {
          isMatch = true;
        } else if (pvMove.length === 5 && pvMove[4] === uciMoveNormalized[4]) {
          isMatch = true;
        }
      } else {
        isMatch = true;
      }
    }

    if (isMatch) {
      const rank = pvEntry.multipv;
      const playedEvalCp = evalForWhite(pvEntry.score, sideToMove);
      const topGap = Math.abs(bestEvalCp - playedEvalCp);
      console.log(`Move '${uciMoveNormalized}' found at rank ${rank}, gap=${topGap.toFixed(1)}cp`);
      return [rank, topGap, playedEvalCp, bestEvalCp];
    }
  }

  // Move not in top PVs - normal for mistakes/blunders
  console.log(`Move '${uciMoveNormalized}' not in top ${K} lines (ranked ${K + 1}+)`);
  return [K + 1, null, null, bestEvalCp];
}

/**
 * Analyze position or fail with retries
 */
async function analyzeOrFail(fen, depth, multipv, engine) {
  const tries = [
    [depth, multipv],
    [Math.max(8, depth - 4), multipv],
    [Math.max(6, depth - 6), 1]
  ];

  let lastErr = null;
  for (let i = 0; i < tries.length; i++) {
    const [d, k] = tries[i];
    try {
      engine.setPosition(fen);
      const result = await engine.analyzePosition({ depth: d, multiPV: k });
      if (result.lines && result.lines.length > 0) {
        if (i > 0) {
          console.log(`ℹ️ Depth reduced to ${d} (from ${depth}) for complex position`);
        }
        return result.lines;
      }
    } catch (e) {
      console.warn(`Engine attempt ${i + 1} failed (depth=${d}):`, e);
      lastErr = e;
    }
  }

  throw new Error(`No PVs returned for fen='${fen.substring(0, 60)}...'. Last error: ${lastErr}`);
}

/**
 * Get mate ply count from score
 */
function matePly(scoreDict) {
  if (!scoreDict) return null;
  if (scoreDict.type === 'mate') {
    try {
      return Math.abs(parseInt(scoreDict.value || 0));
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Evaluate a move using browser engine + JavaScript classification
 * This is the COMPLETE replacement for backend /evaluate
 *
 * @param {string} fen - FEN string BEFORE the move
 * @param {string} move - UCI move string
 * @param {number} depth - Search depth (default: 15 for browser)
 * @param {number} multipv - Number of lines (default: 5)
 * @returns {Promise<Object>} Complete evaluation with classification
 */
export async function evaluateMove(fen, move, depth = 15, multipv = 5) {
  try {
    const engine = getBrowserStockfish();

    // Ensure engine is initialized
    if (!engine.isReady) {
      await engine.init();
    }

    const boardBefore = new Chess(fen);
    const fenBefore = fen;
    const sideBefore = getSideToMove(fen);
    const fullmoveNumber = boardBefore.moveNumber();

    console.log(`📊 Evaluating move: ${move} for FEN: ${fen.substring(0, 60)}...`);

    // PRE analysis (multi-PV)
    const pre = await analyzeOrFail(fenBefore, depth, multipv, engine);
    const preScore = pre[0].score;
    const evalBeforeCp = evalForWhite(preScore, sideBefore);

    // Use let for variables that may be reassigned later
    let [multipvRank, topGap, playedEvalFromPre, bestEvalFromPre] = playedRankAndGap(
      move,
      pre,
      sideBefore
    );

    // Material gain calculations
    let bestMaterialGainCp = null;
    let playedMaterialGainCp = null;
    let bestMoveUci = null;

    // Best move from PRE
    if (pre && pre[0] && pre[0].pv && pre[0].pv.length > 0) {
      bestMoveUci = pre[0].pv[0];
      try {
        bestMaterialGainCp = materialGainForMove(boardBefore, bestMoveUci);
      } catch (e) {
        console.error('ERROR computing best_material_gain_cp:', e);
      }
    }

    // Played move material gain
    try {
      playedMaterialGainCp = materialGainForMove(boardBefore, move);
    } catch (e) {
      console.error('ERROR computing played_material_gain_cp:', e);
    }

    console.log('MATERIAL DEBUG:', {
      sideBefore,
      bestMoveUci,
      bestMaterialGainCp,
      playedMoveUci: move,
      playedMaterialGainCp
    });

    // Multi-move PV material gain
    const bestLineMaterialGainCp = computeBestLineMaterialGain(
      boardBefore,
      pre,
      sideBefore,
      4
    );

    console.log('BEST_LINE_MATERIAL_GAIN_CP:', bestLineMaterialGainCp);

    // POST analysis
    const postFen = applyUciMove(fen, move);
    if (!postFen) {
      throw new Error('Illegal move');
    }

    const boardAfter = new Chess(postFen);
    let postScore;

    if (isCheckmate(postFen)) {
      postScore = { type: 'mate', value: -1 };
      console.log('Position after move is CHECKMATE');
    } else if (isStalemate(postFen)) {
      postScore = { type: 'cp', value: 0 };
      console.log('Position after move is STALEMATE');
    } else if (isGameOver(postFen)) {
      postScore = { type: 'cp', value: 0 };
      console.log('Position after move is GAME OVER (draw)');
    } else {
      const post = await analyzeOrFail(postFen, depth, 1, engine);
      postScore = post[0].score;
    }

    const sideAfter = getSideToMove(postFen);
    const evalAfterCp = evalForWhite(postScore, sideAfter);

    console.log(`[EVAL] pre=${evalBeforeCp >= 0 ? '+' : ''}${evalBeforeCp} post=${evalAfterCp >= 0 ? '+' : ''}${evalAfterCp} (Δ ${evalAfterCp - evalBeforeCp >= 0 ? '+' : ''}${evalAfterCp - evalBeforeCp})`);

    // Stalemate-from-winning miss detection
    const moverAdvBefore = cpForPlayer(evalBeforeCp, sideBefore);
    const moverAdvAfter = cpForPlayer(evalAfterCp, sideBefore);

    const CLEAR_WIN_CP = 300;
    const DRAW_BAND_CP = 60;

    const wasClearlyWinningBefore = moverAdvBefore >= CLEAR_WIN_CP;
    const isDrawishAfter = Math.abs(moverAdvAfter) <= DRAW_BAND_CP;

    let isDrawResult = false;
    if (isStalemate(postFen)) {
      isDrawResult = true;
    } else if (isGameOver(postFen)) {
      const result = boardAfter.isGameOver();
      if (result) isDrawResult = true;
    }

    const stalemateFromWinMiss = wasClearlyWinningBefore && isDrawishAfter && isDrawResult;
    console.log('stalemate_from_win_miss:', stalemateFromWinMiss);

    // CPL calculation
    let cpl = null;
    if (playedEvalFromPre === null) {
      playedEvalFromPre = evalAfterCp;
    }

    if (bestEvalFromPre !== null) {
      cpl = Math.abs(bestEvalFromPre - playedEvalFromPre);
    }

    // Update topGap if it wasn't calculated earlier
    if (topGap === null && cpl !== null) {
      topGap = cpl;
    }

    const evalChange = evalAfterCp - evalBeforeCp;

    // Basic label
    const basicLabel = classifyBasicMove(
      evalBeforeCp,
      evalAfterCp,
      cpl,
      sideBefore,
      multipvRank
    );

    // Debug payload
    const debugPayload = {
      fenBefore,
      moveUci: move,
      sideBefore,
      fullmoveNumber,
      evalWhitePre: evalBeforeCp,
      evalWhiteAfter: evalAfterCp,
      evalWhitePlayedFromPre: playedEvalFromPre,
      evalWhiteBestFromPre: bestEvalFromPre,
      moverAdvBefore,
      moverAdvAfter,
      moverAdvDelta: moverAdvAfter - moverAdvBefore,
      multipvRank,
      topGapCp: topGap,
      cplCp: cpl,
      evalChangeCp: evalChange,
      bestMoveUci,
      bestMaterialGainCp,
      playedMaterialGainCp,
      wasClearlyWinningBefore,
      isDrawishAfter,
      stalemateFromWinMiss,
      basicLabel
    };
    console.log('CLASSIFY DEBUG:', debugPayload);

    // Sacrifice detection
    const uciMoveObj = move;
    const sacResult = detectSacrifice(
      boardBefore,
      uciMoveObj,
      null, // evalFunc not implemented in browser yet
      false  // disable eval-based rejection for Brilliancy
    );
    const isSacrifice = sacResult.isRealSacrifice;

    // Mate metadata
    const bestMateIn = matePly(preScore);
    const playedMateIn = matePly(postScore);

    const preIsMate = preScore.type === 'mate';
    const postIsMate = postScore.type === 'mate';

    const mateFlip = preIsMate && postIsMate && (evalBeforeCp * evalAfterCp < 0);
    let mateFlipSeverity = 0;
    if (mateFlip) {
      mateFlipSeverity = 6400 + 100 * ((bestMateIn || 0) + (playedMateIn || 0));
    }

    // Miss detection
    const missResult = detectMiss({
      evalPreWhite: evalBeforeCp,
      evalAfterWhite: evalAfterCp,
      evalPlayedPreWhite: playedEvalFromPre,
      evalBestPreWhite: bestEvalFromPre,
      moverColor: sideBefore,
      bestMateInPlies: bestMateIn,
      playedMateInPlies: playedMateIn,
      bestMaterialGainCp,
      playedMaterialGainCp,
      bestLineMaterialGainCp,
      boardBefore,
      move: uciMoveObj,
      bestMoveUci
    });

    const isMiss = missResult.isMiss;
    const missReason = missResult.reason;

    console.log('Miss detected:', isMiss, 'reason:', missReason);

    // Book detection
    const bookForMove = isBookMove(fenBefore, move);
    console.log('is_book:', bookForMove);

    // Sacrifice-based brilliancy
    const sacBrill = detectSacBrilliancy({
      evalBeforeWhite: evalBeforeCp,
      evalAfterWhite: evalAfterCp,
      evalBestPreWhite: bestEvalFromPre,
      evalPlayedPreWhite: playedEvalFromPre,
      evalBestReplyWhite: evalAfterCp,
      evalAcceptWhite: null,
      moverColor: sideBefore,
      sacResult
    });

    // Great move detection
    const greatInfo = detectGreatMove({
      evalBeforeWhite: evalBeforeCp,
      evalAfterWhite: evalAfterCp,
      evalBestPreWhite: bestEvalFromPre,
      evalPlayedPreWhite: playedEvalFromPre,
      moverColor: sideBefore,
      multipvRank,
      bestMoveUci,
      bestLineMaterialGainCp,
      playedMaterialGainCp,
      move: uciMoveObj,
      boardBefore
    });

    // Mate-flip catastrophe detection
    const evalBeforeMover = cpForPlayer(evalBeforeCp, sideBefore);
    const evalAfterMover = cpForPlayer(evalAfterCp, sideBefore);
    const evalSwingMover = evalAfterMover - evalBeforeMover;

    const mateFlipBlunder = mateFlip && evalSwingMover <= -800;

    // Final label priority
    let label;
    if (bookForMove) {
      label = 'Book';
    } else if (mateFlipBlunder) {
      label = 'Blunder';
    } else if (sacBrill.isBrilliant) {
      label = 'Brilliant';
    } else if (greatInfo.isGreat) {
      label = 'Great';
    } else if (stalemateFromWinMiss) {
      label = 'Miss';
    } else if (isMiss) {
      label = 'Miss';
    } else {
      label = basicLabel;
    }

    console.log('Label:', label);

    // Return in same format as backend
    return {
      // Main classification
      label,
      classification: label,

      // Evaluation scores
      fen_before: fenBefore,
      eval_before: evalBeforeCp,
      eval_after: evalAfterCp,
      eval_change: evalChange,
      cpl,

      // Move quality indicators
      multipv_rank: multipvRank,
      top_gap: topGap,

      // Score structures
      eval_before_struct: preScore,
      eval_after_struct: postScore,

      // Special flags
      is_sacrifice: isSacrifice,
      sacrifice_debug: sacResult,
      is_book: bookForMove,
      in_opening_db: bookForMove,
      miss_detected: isMiss,

      // Sub-classifications
      basic_label: basicLabel,
      exclam_label: mateFlipBlunder,

      // Mate information
      best_mate_in: bestMateIn,
      played_mate_in: playedMateIn,
      mate_flip: mateFlip,
      mate_flip_severity: mateFlipSeverity,

      // Brilliancy/Great
      sac_brilliancy: sacBrill,
      great_info: greatInfo,

      // Full response (for debugging)
      raw: debugPayload
    };
  } catch (error) {
    console.error('Browser evaluation failed:', error);
    throw error;
  }
}

/**
 * Get move badge info for rendering
 */
export function getMoveBadge(evaluation) {
  if (!evaluation) return null;

  const { label, is_sacrifice, cpl, eval_change } = evaluation;

  const badgeStyles = {
    'Brilliant': { symbol: '!!', color: '#1baca6', icon: '💎' },
    'Great': { symbol: '!', color: '#5c9fc4', icon: '⭐' },
    'Best': { symbol: '!', color: '#96bc4b', icon: '✓' },
    'Excellent': { symbol: '!?', color: '#9bc02a', icon: '✨' },
    'Good': { symbol: '✓', color: '#96af8b', icon: '' },
    'Book': { symbol: '⏺', color: '#a88865', icon: '📖' },
    'Inaccuracy': { symbol: '?!', color: '#f0c15c', icon: '⚠️' },
    'Mistake': { symbol: '?', color: '#e58f2b', icon: '❌' },
    'Blunder': { symbol: '??', color: '#ca3431', icon: '💥' },
    'Miss': { symbol: '❌', color: '#f0c15c', icon: '👁️' }
  };

  const style = badgeStyles[label] || badgeStyles['Good'];

  return {
    label,
    symbol: style.symbol,
    color: style.color,
    icon: style.icon,
    isSacrifice: is_sacrifice,
    cpl,
    evalChange: eval_change
  };
}

/**
 * Get move explanation text
 */
export function getMoveExplanation(evaluation) {
  if (!evaluation) return '';

  const { label, is_sacrifice, cpl, is_book, miss_detected } = evaluation;

  if (is_book) {
    return 'This is a known opening move from the book.';
  }

  if (label === 'Brilliant') {
    if (is_sacrifice) {
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

  if (miss_detected) {
    return `You missed a better opportunity. There was a move gaining ${Math.abs(cpl || 0)} centipawns.`;
  }

  if (label === 'Inaccuracy') {
    return `Slightly inaccurate. Lost ${cpl || 0} centipawns.`;
  }

  if (label === 'Mistake') {
    return `A mistake. Lost ${cpl || 0} centipawns.`;
  }

  if (label === 'Blunder') {
    return `Blunder! Lost ${cpl || 0} centipawns.`;
  }

  return `Evaluated as ${label}`;
}

export default {
  evaluateMove,
  getMoveBadge,
  getMoveExplanation
};
