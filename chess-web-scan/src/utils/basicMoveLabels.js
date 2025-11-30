/**
 * Basic Move Labels - JavaScript port of basic_move_labels.py
 * Handles move classification, sacrifice detection, brilliancy, miss detection, etc.
 */

import { Chess } from 'chess.js';
import { cpForPlayer, materialGainForMove, PIECE_VALUES } from './chessHelpers';

// ============================================================
// 1) SACRIFICE DETECTION
// ============================================================

export const SACRIFICE_PARAMS = {
  smallSacThresholdCp: 80,    // Minimum net loss for any sacrifice
  bigSacThresholdCp: 250,     // Minimum net loss for big sacrifice
  minOfferedPieceCp: 200       // Minimum piece value to consider
};

export class SacrificeResult {
  constructor({
    isRealSacrifice = false,
    isBigSacrifice = false,
    worstNetLossCp = 0,
    hadAcceptingCapture = false,
    offeredPieceCp = 0,
    numAttackersOpponent = 0,
    numAttackersMover = 0
  }) {
    this.isRealSacrifice = isRealSacrifice;
    this.isBigSacrifice = isBigSacrifice;
    this.worstNetLossCp = worstNetLossCp;
    this.hadAcceptingCapture = hadAcceptingCapture;
    this.offeredPieceCp = offeredPieceCp;
    this.numAttackersOpponent = numAttackersOpponent;
    this.numAttackersMover = numAttackersMover;
  }
}

/**
 * Detect if a move is a material sacrifice
 * @param {Chess} board - chess.js instance (before move)
 * @param {string} uciMove - UCI move string
 * @param {Function} evalFunc - Optional eval function for position
 * @param {boolean} useEvalRejectFilter - Use eval-based rejection
 * @returns {SacrificeResult}
 */
export function detectSacrifice(board, uciMove, evalFunc = null, useEvalRejectFilter = true) {
  const moverColor = board.turn();
  const opponentColor = moverColor === 'w' ? 'b' : 'w';

  const from = uciMove.substring(0, 2);
  const to = uciMove.substring(2, 4);
  const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

  // Get moving piece
  const movingPiece = board.get(from);
  if (!movingPiece) {
    return new SacrificeResult({});
  }

  let capturedCp = 0;

  // Check if it's a capture
  const capturedPiece = board.get(to);
  if (capturedPiece && capturedPiece.color === opponentColor) {
    capturedCp = PIECE_VALUES[capturedPiece.type] || 0;
  }

  // Apply move
  const move = board.move({ from, to, promotion });
  if (!move) {
    return new SacrificeResult({});
  }

  const targetSq = to;
  const piece = board.get(targetSq);

  if (!piece || piece.color !== moverColor) {
    board.undo();
    return new SacrificeResult({});
  }

  const offeredPieceCp = PIECE_VALUES[piece.type] || 0;

  // Risk face value
  const riskFaceCp = Math.max(0, offeredPieceCp - capturedCp);

  // If risk too small, not a sacrifice
  if (riskFaceCp < SACRIFICE_PARAMS.minOfferedPieceCp) {
    board.undo();
    return new SacrificeResult({ offeredPieceCp });
  }

  // Count attackers
  const attackersOpponent = countAttackers(board, to, opponentColor);
  const attackersMover = countAttackers(board, to, moverColor);

  const numAttackersOpponent = attackersOpponent.length;
  const numAttackersMover = attackersMover.length;

  if (numAttackersOpponent === 0) {
    board.undo();
    return new SacrificeResult({
      offeredPieceCp,
      numAttackersOpponent,
      numAttackersMover
    });
  }

  // Calculate worst net loss from accepting captures
  let worstNetLoss = 0;
  let hadAcceptingCapture = false;
  let bestAfterAcceptPov = Infinity;

  const acceptingMoves = getAcceptingMoves(board, to);
  hadAcceptingCapture = acceptingMoves.length > 0;

  for (let acceptMove of acceptingMoves) {
    const attacker = board.get(acceptMove.from);
    if (!attacker) continue;

    // Skip suicidal king captures
    if (attacker.type === 'k' && numAttackersMover > 0) {
      continue;
    }

    const attackerVal = PIECE_VALUES[attacker.type] || 0;
    const hasDefender = numAttackersMover > 0;

    let netLoss;
    if (!hasDefender) {
      netLoss = riskFaceCp;
    } else {
      netLoss = riskFaceCp - attackerVal;
    }

    if (netLoss > worstNetLoss) {
      worstNetLoss = netLoss;
    }

    // Eval-based filter (if provided)
    if (evalFunc !== null) {
      // Apply accepting capture
      const acceptedMove = board.move(acceptMove);
      if (acceptedMove) {
        const evalAcceptWhite = evalFunc(board);
        const afterAcceptPov = cpForPlayer(evalAcceptWhite, moverColor);

        if (afterAcceptPov < bestAfterAcceptPov) {
          bestAfterAcceptPov = afterAcceptPov;
        }

        board.undo();
      }
    }
  }

  // Use eval filter if enabled
  if (useEvalRejectFilter && evalFunc !== null && bestAfterAcceptPov !== Infinity) {
    if (bestAfterAcceptPov >= -50) {
      console.log('SAC DEBUG: Accepting never gives opponent real advantage -> not a sacrifice');
      board.undo();
      return new SacrificeResult({
        offeredPieceCp,
        numAttackersOpponent,
        numAttackersMover,
        hadAcceptingCapture
      });
    }
  }

  const isRealSacrifice = hadAcceptingCapture && worstNetLoss >= SACRIFICE_PARAMS.smallSacThresholdCp;
  const isBigSacrifice = hadAcceptingCapture && worstNetLoss >= SACRIFICE_PARAMS.bigSacThresholdCp;

  console.log('SAC DEBUG:', {
    move: uciMove,
    offeredPieceCp,
    capturedCp,
    riskFaceCp,
    numAttackersOpponent,
    numAttackersMover,
    worstNetLossCp: worstNetLoss,
    hadAcceptingCapture,
    isRealSacrifice,
    isBigSacrifice
  });

  board.undo();

  return new SacrificeResult({
    isRealSacrifice,
    isBigSacrifice,
    worstNetLossCp: worstNetLoss,
    hadAcceptingCapture,
    offeredPieceCp,
    numAttackersOpponent,
    numAttackersMover
  });
}

/**
 * Count attackers of a square
 */
function countAttackers(board, square, color) {
  const attackers = [];
  const pieces = board.board();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = pieces[rank][file];
      if (piece && piece.color === color) {
        const from = String.fromCharCode(97 + file) + (8 - rank);
        const moves = board.moves({ square: from, verbose: true });
        if (moves.some(m => m.to === square)) {
          attackers.push({ from, piece: piece.type });
        }
      }
    }
  }

  return attackers;
}

/**
 * Get all moves that capture the piece on a given square
 */
function getAcceptingMoves(board, square) {
  const moves = board.moves({ verbose: true });
  return moves.filter(m => m.to === square && m.captured);
}

// ============================================================
// 2) BASIC MOVE CLASSIFICATION
// ============================================================

const LABEL_ORDER = ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];
const LABEL_RANK = {};
LABEL_ORDER.forEach((label, i) => {
  LABEL_RANK[label] = i;
});

/**
 * Get situation from centipawn evaluation
 */
export function situationFromCp(cpPlayer) {
  if (cpPlayer >= 800) return 'Won';
  if (cpPlayer >= 300) return 'Winning';
  if (cpPlayer > -300) return 'Equalish';
  if (cpPlayer > -800) return 'Worse';
  return 'Lost';
}

/**
 * Get base label from CPL and multipv rank
 */
function baseLabelFromCpl(cpl, multipvRank) {
  if (cpl === null || cpl === undefined) return 'Inaccuracy';

  if (cpl <= 10) return multipvRank === 1 ? 'Best' : 'Excellent';
  if (cpl <= 30) return 'Excellent';
  if (cpl <= 80) return 'Good';
  if (cpl <= 250) return 'Inaccuracy';
  if (cpl <= 600) return 'Mistake';
  return 'Blunder';
}

/**
 * Promote label to at least minimum
 */
function promoteLabel(current, minimum) {
  if (LABEL_RANK[current] < LABEL_RANK[minimum]) {
    return minimum;
  }
  return current;
}

/**
 * Soften label to at most maximum
 */
function softenLabel(current, maximum) {
  if (LABEL_RANK[current] > LABEL_RANK[maximum]) {
    return maximum;
  }
  return current;
}

/**
 * Classify basic move (Best/Good/Inaccuracy/Mistake/Blunder)
 */
export function classifyBasicMove(evalBeforeWhite, evalAfterWhite, cpl, moverColor, multipvRank) {
  const playerBefore = cpForPlayer(evalBeforeWhite, moverColor);
  const playerAfter = cpForPlayer(evalAfterWhite, moverColor);
  const playerDelta = playerAfter - playerBefore;

  const beforeState = situationFromCp(playerBefore);
  const afterState = situationFromCp(playerAfter);

  // If CPL missing, approximate
  if (cpl === null || cpl === undefined) {
    cpl = Math.abs(playerDelta);
  }

  let label = baseLabelFromCpl(cpl, multipvRank);

  // Throwing away a win
  if (['Winning', 'Won'].includes(beforeState) && ['Equalish', 'Worse', 'Lost'].includes(afterState)) {
    if (cpl >= 300) label = promoteLabel(label, 'Blunder');
    else if (cpl >= 200) label = promoteLabel(label, 'Mistake');
  }

  // Throwing away equal position
  if (beforeState === 'Equalish' && ['Worse', 'Lost'].includes(afterState)) {
    if (playerDelta <= -200) {
      if (cpl >= 300) label = promoteLabel(label, 'Blunder');
      else if (cpl >= 150) label = promoteLabel(label, 'Mistake');
    }
  }

  // Already lost -> soften
  if (beforeState === 'Lost' && afterState === 'Lost') {
    label = softenLabel(label, 'Mistake');
    if (label === 'Mistake' && cpl <= 250) {
      label = 'Inaccuracy';
    }
  }

  // Big rescues
  if (beforeState === 'Lost' && ['Equalish', 'Winning', 'Won'].includes(afterState)) {
    if (playerDelta >= 300 && LABEL_RANK[label] > LABEL_RANK['Good']) {
      label = 'Good';
    }
  }

  if (beforeState === 'Worse' && ['Equalish', 'Winning', 'Won'].includes(afterState)) {
    if (playerDelta >= 250 && LABEL_RANK[label] > LABEL_RANK['Good']) {
      label = 'Good';
    }
  }

  if (beforeState === 'Equalish' && ['Winning', 'Won'].includes(afterState)) {
    if (playerDelta >= 200 && LABEL_RANK[label] > LABEL_RANK['Good']) {
      label = 'Good';
    }
  }

  // Already winning -> soften
  if (['Winning', 'Won'].includes(beforeState) && ['Winning', 'Won'].includes(afterState)) {
    label = softenLabel(label, 'Mistake');
    if (label === 'Mistake' && cpl <= 250) {
      label = 'Inaccuracy';
    }
  }

  // Generic delta-based adjustments
  if (playerDelta >= 100) {
    if (label === 'Blunder') label = 'Mistake';
    else if (label === 'Mistake') label = 'Inaccuracy';
    else if (label === 'Inaccuracy') label = 'Good';
  }

  if (playerDelta <= -150) {
    if (label === 'Good') label = 'Inaccuracy';
    else if (label === 'Inaccuracy' && cpl >= 150) label = 'Mistake';
  }

  console.log('BASIC LABEL DEBUG:', {
    evalBeforeWhite,
    evalAfterWhite,
    moverColor,
    playerBefore,
    playerAfter,
    playerDelta,
    beforeState,
    afterState,
    cpl,
    multipvRank,
    finalBasicLabel: label
  });

  return label;
}

// ============================================================
// 3) MISS DETECTION
// ============================================================

export const MISS_PARAMS = {
  maxSelfDropCp: 750,
  minOpportunityCp: 200,
  tacticalMinGainCp: 200,
  stillWinningCp: 300,
  stillOkCp: 600,
  equalBandCp: 150,
  minSaveGainCp: 250,
  minConversionGainCp: 200,
  missedMaterialMinGainCp: 200,
  pvMaterialToleranceCp: 100,
  mateMissMaxPlies: 4,
  mateMissTolerancePlies: 1
};

export class MissResult {
  constructor(isMiss = false, reason = '') {
    this.isMiss = isMiss;
    this.reason = reason;
  }
}

/**
 * Detect missed opportunities
 */
export function detectMiss({
  evalPreWhite,
  evalAfterWhite,
  evalPlayedPreWhite,
  evalBestPreWhite,
  moverColor,
  bestMateInPlies = null,
  playedMateInPlies = null,
  bestMaterialGainCp = null,
  playedMaterialGainCp = null,
  bestLineMaterialGainCp = null,
  boardBefore = null,
  move = null,
  bestMoveUci = null
}) {
  if (evalBestPreWhite === null || evalBestPreWhite === undefined) {
    return new MissResult(false, '');
  }

  const prePov = cpForPlayer(evalPreWhite, moverColor);
  const afterPov = cpForPlayer(evalAfterWhite, moverColor);
  const playedPov = cpForPlayer(evalPlayedPreWhite, moverColor);
  const bestPov = cpForPlayer(evalBestPreWhite, moverColor);

  const selfDrop = prePov - afterPov;
  const opportunity = bestPov - playedPov;
  const missGap = bestPov - afterPov;

  const beforeState = situationFromCp(prePov);
  const afterState = situationFromCp(afterPov);

  // 0) If move is a real sacrifice -> never a miss
  if (boardBefore && move) {
    const sacInfo = detectSacrifice(boardBefore, move);
    if (sacInfo.isRealSacrifice) {
      return new MissResult(false, '');
    }
  }

  // 1) Forced mate missed
  if (bestMateInPlies !== null && bestMateInPlies <= MISS_PARAMS.mateMissMaxPlies) {
    const lostForcedMate =
      playedMateInPlies === null ||
      playedMateInPlies > bestMateInPlies + MISS_PARAMS.mateMissTolerancePlies;

    if (lostForcedMate && ['Winning', 'Won'].includes(beforeState) && ['Winning', 'Won'].includes(afterState)) {
      return new MissResult(true, 'missed_forced_mate');
    }
  }

  // 2) Huge blunder -> not a miss
  if (selfDrop > MISS_PARAMS.maxSelfDropCp) {
    return new MissResult(false, '');
  }

  if (afterPov <= -MISS_PARAMS.stillOkCp) {
    return new MissResult(false, '');
  }

  // 3) Safe free material missed
  if (
    bestMaterialGainCp !== null &&
    bestLineMaterialGainCp !== null &&
    bestMoveUci &&
    boardBefore
  ) {
    if (bestLineMaterialGainCp >= MISS_PARAMS.missedMaterialMinGainCp) {
      if (
        bestMaterialGainCp >= MISS_PARAMS.missedMaterialMinGainCp &&
        (playedMaterialGainCp || 0) < bestMaterialGainCp &&
        selfDrop <= MISS_PARAMS.maxSelfDropCp
      ) {
        try {
          const from = bestMoveUci.substring(0, 2);
          const to = bestMoveUci.substring(2, 4);
          const piece = boardBefore.get(to);
          if (piece) {
            const sacInfo2 = detectSacrifice(boardBefore, bestMoveUci);
            const safe = !sacInfo2.isRealSacrifice;
            if (safe) {
              console.log('MISS DEBUG: missed_safe_free_material = True', {
                bestMaterialGainCp,
                playedMaterialGainCp,
                bestLineMaterialGainCp
              });
              return new MissResult(true, 'missed_safe_free_material');
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    }
  }

  // 4) PV material win missed
  if (bestLineMaterialGainCp !== null && bestMoveUci && move) {
    const playedUci = move;
    const playedGain = playedMaterialGainCp || 0;

    if (playedUci !== bestMoveUci) {
      const extraMaterial = bestLineMaterialGainCp - playedGain;

      if (
        bestLineMaterialGainCp >= MISS_PARAMS.missedMaterialMinGainCp &&
        extraMaterial >= MISS_PARAMS.pvMaterialToleranceCp &&
        beforeState !== 'Lost' &&
        selfDrop <= MISS_PARAMS.maxSelfDropCp
      ) {
        console.log('MISS DEBUG: missed_pv_material_gain = True', {
          bestLineMaterialGainCp,
          playedMaterialGainCp: playedGain,
          extraMaterialMissed: extraMaterial,
          beforeState,
          afterState,
          bestMoveUci,
          playedMoveUci: playedUci
        });
        return new MissResult(true, 'missed_pv_material_gain');
      }
    }
  }

  return new MissResult(false, '');
}

// ============================================================
// 4) BRILLIANCY DETECTION (Sacrifice-based)
// ============================================================

export const SAC_BRILLIANCY_PARAMS = {
  winAfterReplyCp: 120,
  winAfterAcceptCp: 80,
  maxGapToBestCp: 120,
  maxAdvDropCp: 80
};

export class SacBrilliancyResult {
  constructor({
    isBrilliant = false,
    reason = '',
    advBeforeMover = 0,
    advAfterBestReply = 0,
    advAfterAccept = null,
    gapToBestCp = null,
    isRealSacrifice = false,
    isBigSacrifice = false
  }) {
    this.isBrilliant = isBrilliant;
    this.reason = reason;
    this.advBeforeMover = advBeforeMover;
    this.advAfterBestReply = advAfterBestReply;
    this.advAfterAccept = advAfterAccept;
    this.gapToBestCp = gapToBestCp;
    this.isRealSacrifice = isRealSacrifice;
    this.isBigSacrifice = isBigSacrifice;
  }
}

function advForMover(evalWhiteCp, moverColor) {
  return moverColor === 'w' ? evalWhiteCp : -evalWhiteCp;
}

/**
 * Detect sacrifice-based brilliancy
 */
export function detectSacBrilliancy({
  evalBeforeWhite,
  evalAfterWhite,
  evalBestPreWhite,
  evalPlayedPreWhite,
  evalBestReplyWhite,
  evalAcceptWhite,
  moverColor,
  sacResult
}) {
  if (!sacResult.isBigSacrifice) {
    return new SacBrilliancyResult({
      reason: 'not_sacrifice',
      advBeforeMover: advForMover(evalBeforeWhite, moverColor),
      advAfterBestReply: advForMover(evalBestReplyWhite, moverColor),
      advAfterAccept: evalAcceptWhite !== null ? advForMover(evalAcceptWhite, moverColor) : null,
      isRealSacrifice: sacResult.isRealSacrifice,
      isBigSacrifice: false
    });
  }

  const advBeforeMover = advForMover(evalBeforeWhite, moverColor);
  const advAfterReply = advForMover(evalBestReplyWhite, moverColor);
  const advAfterMove = advForMover(evalAfterWhite, moverColor);

  let advAfterAccept = null;
  if (evalAcceptWhite !== null) {
    advAfterAccept = advForMover(evalAcceptWhite, moverColor);
  }

  const beforeState = situationFromCp(advBeforeMover);
  const afterState = situationFromCp(advAfterReply);

  // Gap to best
  let gapToBest = null;
  if (evalBestPreWhite !== null) {
    const playedPre = evalPlayedPreWhite !== null ? evalPlayedPreWhite : evalAfterWhite;
    if (moverColor === 'w') {
      gapToBest = evalBestPreWhite - playedPre;
    } else {
      gapToBest = playedPre - evalBestPreWhite;
    }
  }

  const gapOk = gapToBest !== null ? gapToBest <= SAC_BRILLIANCY_PARAMS.maxGapToBestCp : true;

  // Adv drop
  const advDrop = advBeforeMover - advAfterReply;
  let dropOk = true;
  if (advBeforeMover > SAC_BRILLIANCY_PARAMS.winAfterReplyCp) {
    dropOk = advDrop <= SAC_BRILLIANCY_PARAMS.maxAdvDropCp;
  }

  const winAfterReplyOk = advAfterReply >= SAC_BRILLIANCY_PARAMS.winAfterReplyCp;

  let winAfterAcceptOk = true;
  if (evalAcceptWhite !== null) {
    winAfterAcceptOk = advAfterAccept !== null && advAfterAccept >= SAC_BRILLIANCY_PARAMS.winAfterAcceptCp;
  }

  const winningSac =
    sacResult.isRealSacrifice &&
    ['Equalish', 'Winning', 'Won'].includes(beforeState) &&
    ['Winning', 'Won'].includes(afterState);

  const drawRescueSac =
    sacResult.isRealSacrifice &&
    ['Worse', 'Lost'].includes(beforeState) &&
    Math.abs(advAfterReply) <= 60;

  const isBrilliant =
    sacResult.isBigSacrifice &&
    gapOk &&
    dropOk &&
    (winningSac || drawRescueSac) &&
    winAfterReplyOk &&
    winAfterAcceptOk;

  let reason;
  if (isBrilliant) {
    reason = 'brilliant_sacrifice';
  } else if (!gapOk) {
    reason = 'engine_hates_sac_gap_too_large';
  } else if (!dropOk) {
    reason = 'too_much_advantage_lost_after_best_reply';
  } else if (!winAfterReplyOk && !drawRescueSac) {
    reason = 'not_winning_after_best_reply';
  } else if (evalAcceptWhite !== null && !winAfterAcceptOk) {
    reason = 'not_winning_after_accept';
  } else {
    reason = 'conditions_not_met';
  }

  console.log('BRILL DEBUG (SAC-BASED):', {
    moverColor,
    advBeforeMover,
    advAfterBestReply: advAfterReply,
    advAfterMove,
    advAfterAccept,
    beforeState,
    afterState,
    gapToBestCp: gapToBest,
    advDrop,
    isRealSacrifice: sacResult.isRealSacrifice,
    isBigSacrifice: sacResult.isBigSacrifice,
    winningSac,
    drawRescueSac,
    isBrilliant,
    reason
  });

  return new SacBrilliancyResult({
    isBrilliant,
    reason,
    advBeforeMover,
    advAfterBestReply: advAfterReply,
    advAfterAccept,
    gapToBestCp: gapToBest,
    isRealSacrifice: sacResult.isRealSacrifice,
    isBigSacrifice: sacResult.isBigSacrifice
  });
}

// ============================================================
// 5) GREAT MOVE DETECTION
// ============================================================

export const GREAT_MOVE_PARAMS = {
  maxAbsEvalForGreat: 1500
};

export class GreatMoveResult {
  constructor({
    isGreat = false,
    reason = '',
    moverImprovementCp = 0,
    cpLossForMoverCp = null,
    deltaEvalWhiteCp = 0,
    beforeState = '',
    afterState = '',
    pattern = null
  }) {
    this.isGreat = isGreat;
    this.reason = reason;
    this.moverImprovementCp = moverImprovementCp;
    this.cpLossForMoverCp = cpLossForMoverCp;
    this.deltaEvalWhiteCp = deltaEvalWhiteCp;
    this.beforeState = beforeState;
    this.afterState = afterState;
    this.pattern = pattern;
  }
}

/**
 * Detect great move (PV-centric tactical win)
 */
export function detectGreatMove({
  evalBeforeWhite,
  evalAfterWhite,
  evalBestPreWhite,
  evalPlayedPreWhite,
  moverColor,
  multipvRank,
  bestMoveUci = null,
  bestLineMaterialGainCp = null,
  playedMaterialGainCp = null,
  move = null,
  boardBefore = null
}) {
  const moverBefore = cpForPlayer(evalBeforeWhite, moverColor);
  const moverAfter = cpForPlayer(evalAfterWhite, moverColor);
  const moverDelta = moverAfter - moverBefore;

  const beforeState = situationFromCp(moverBefore);
  const afterState = situationFromCp(moverAfter);

  const deltaEvalWhite = evalAfterWhite - evalBeforeWhite;

  // Ignore mate-ish positions
  if (Math.abs(moverBefore) >= GREAT_MOVE_PARAMS.maxAbsEvalForGreat ||
      Math.abs(moverAfter) >= GREAT_MOVE_PARAMS.maxAbsEvalForGreat) {
    return new GreatMoveResult({
      reason: 'eval_too_large_matelike',
      moverImprovementCp: moverDelta,
      deltaEvalWhiteCp: deltaEvalWhite,
      beforeState,
      afterState
    });
  }

  // Require PV data
  if (!bestMoveUci || bestLineMaterialGainCp === null || !move) {
    return new GreatMoveResult({
      reason: 'missing_pv_data',
      moverImprovementCp: moverDelta,
      deltaEvalWhiteCp: deltaEvalWhite,
      beforeState,
      afterState
    });
  }

  const playedUci = move;
  const wasBadBefore = ['Worse', 'Lost'].includes(beforeState);
  const becameGoodOrEqual = ['Equalish', 'Winning', 'Won'].includes(afterState);

  // Pattern #1: PV starter - tactical win
  if (
    playedUci === bestMoveUci &&
    bestLineMaterialGainCp >= 300 &&
    moverDelta >= 120 &&
    ['Equalish', 'Worse', 'Lost'].includes(beforeState)
  ) {
    return new GreatMoveResult({
      isGreat: true,
      reason: 'pv_starter_tactical_win',
      moverImprovementCp: moverDelta,
      deltaEvalWhiteCp: deltaEvalWhite,
      beforeState,
      afterState,
      pattern: 'pv_tactical_win'
    });
  }

  // Pattern #2: PV starter - defensive resource
  if (
    playedUci === bestMoveUci &&
    bestLineMaterialGainCp >= 150 &&
    wasBadBefore &&
    becameGoodOrEqual &&
    moverDelta >= 150
  ) {
    return new GreatMoveResult({
      isGreat: true,
      reason: 'pv_starter_defensive_resource',
      moverImprovementCp: moverDelta,
      deltaEvalWhiteCp: deltaEvalWhite,
      beforeState,
      afterState,
      pattern: 'pv_defense'
    });
  }

  // Pattern #3: PV alternative - different move, same big tactic
  if (
    playedUci !== bestMoveUci &&
    playedMaterialGainCp !== null &&
    bestLineMaterialGainCp >= 400 &&
    playedMaterialGainCp >= 300 &&
    moverDelta >= 100 &&
    ['Equalish', 'Worse', 'Lost'].includes(beforeState)
  ) {
    return new GreatMoveResult({
      isGreat: true,
      reason: 'pv_alternative_combination',
      moverImprovementCp: moverDelta,
      deltaEvalWhiteCp: deltaEvalWhite,
      beforeState,
      afterState,
      pattern: 'pv_alternative'
    });
  }

  console.log('GREAT DEBUG:', {
    beforeState,
    afterState,
    moverBeforeCp: moverBefore,
    moverAfterCp: moverAfter,
    moverDelta,
    bestMoveUci,
    playedUci,
    bestLineMaterialGainCp,
    playedMaterialGainCp
  });

  return new GreatMoveResult({
    reason: 'conditions_not_met',
    moverImprovementCp: moverDelta,
    deltaEvalWhiteCp: deltaEvalWhite,
    beforeState,
    afterState
  });
}

export default {
  detectSacrifice,
  classifyBasicMove,
  detectMiss,
  detectSacBrilliancy,
  detectGreatMove,
  situationFromCp,
  cpForPlayer,
  PIECE_VALUES
};
