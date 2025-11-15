/**
 * Move Classification System
 * Chess.com-style move classification with accurate evaluation
 * Enhanced with advanced logic from basic_move_labels.py
 */

import { analyzeBrilliantMove, shouldCheckBrilliant } from './brilliantDetection.js';
import { analyzeBrilliantV3, shouldCheckBrilliantV3, createAnalysisData } from './brilliantDetectionV3.js';
import { detectTacticalMotifs, generateMoveExplanation } from './moveExplanation.js';
import { isBookMove as checkPolyglotBook } from './openingBook.js';

// ============================================================================
// CONSTANTS (from basic_move_labels.py)
// ============================================================================

const PIECE_VALUES = {
  p: 100,  // PAWN
  n: 300,  // KNIGHT
  b: 300,  // BISHOP
  r: 500,  // ROOK
  q: 900,  // QUEEN
  k: 0     // KING
};

// Sacrifice detection thresholds
const MIN_SAC_CP = 300;        // At least a minor piece effectively at risk
const MIN_SEE_LOSS_CP = 100;   // SEE must say we lose ≥ 1 pawn locally
const ATTACK_GAIN_CP = 150;    // If eval improves more than this, treat as attack, not "sac"
const MATE_THRESHOLD = 20000;  // Same idea as existing mate cp mapping
const MATE_CP = 32000;         // Mate in 0 evaluation value
const MATE_STEP = 1000;        // Drop per ply for mate sequences

// Move classification labels and order
const LABEL_ORDER = ["Best", "Good", "Inaccuracy", "Mistake", "Blunder"];
const LABEL_RANK = Object.fromEntries(LABEL_ORDER.map((name, i) => [name, i]));

// ============================================================================
// HELPER FUNCTIONS (from basic_move_labels.py)
// ============================================================================

/**
 * Convert White-centric eval to mover-centric eval
 * @param {number} evalWhiteCp - Evaluation from White's perspective (Stockfish style)
 * @param {string} moverColor - 'w' if White just moved, 'b' if Black just moved
 * @returns {number} cp where +ve = good for the mover, -ve = bad for the mover
 */
function cpForPlayer(evalWhiteCp, moverColor) {
  return moverColor === 'w' ? evalWhiteCp : -evalWhiteCp;
}

/**
 * Bucket the mover's position into rough game states
 * @param {number} cpPlayer - Evaluation from the mover's perspective
 * @returns {string} "Won" | "Winning" | "Equalish" | "Worse" | "Lost"
 */
function situationFromCp(cpPlayer) {
  if (cpPlayer >= 800) return "Won";          // Totally winning (e.g. +8.0 or more)
  if (cpPlayer >= 300) return "Winning";      // Clearly better
  if (cpPlayer > -300) return "Equalish";     // Roughly equal / unclear
  if (cpPlayer > -800) return "Worse";        // Clearly worse
  return "Lost";                              // Basically busted
}

/**
 * Get piece value in centipawns
 * @param {Object} chess - Chess.js instance
 * @param {string} square - Square notation (e.g., 'e4')
 * @returns {number} Piece value in centipawns
 */
function pieceCp(chess, square) {
  const piece = chess.get(square);
  return piece ? (PIECE_VALUES[piece.type] || 0) : 0;
}

/**
 * Promote label to ensure it is at least as severe as 'minimum' (towards Blunder)
 * @param {string} current - Current label
 * @param {string} minimum - Minimum severity
 * @returns {string} Promoted label
 */
function promoteLabel(current, minimum) {
  if (LABEL_RANK[current] < LABEL_RANK[minimum]) {
    return minimum;
  }
  return current;
}

/**
 * Soften label so it is no more severe than 'maximum'
 * @param {string} current - Current label
 * @param {string} maximum - Maximum severity
 * @returns {string} Softened label
 */
function softenLabel(current, maximum) {
  if (LABEL_RANK[current] > LABEL_RANK[maximum]) {
    return maximum;
  }
  return current;
}

/**
 * Very simple static-exchange eval on a square
 * Returns net cp for side_to_move assuming optimal local swaps
 * @param {Object} chess - Chess.js instance
 * @param {string} square - Target square (e.g., 'e4')
 * @param {boolean} sideToMove - true for white, false for black
 * @returns {number} Net centipawns for side to move
 */
function naiveSee(chess, square, sideToMove) {
  // Get all attackers of this square for a given color
  function getAttackers(color) {
    const attackers = [];
    const pieces = chess.board();

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = pieces[row][col];
        if (!piece || piece.color !== color) continue;

        const from = String.fromCharCode(97 + col) + (8 - row);

        // Check if this piece attacks the target square
        const moves = chess.moves({ square: from, verbose: true });
        if (moves.some(m => m.to === square)) {
          attackers.push({
            square: from,
            value: PIECE_VALUES[piece.type] || 0,
            type: piece.type
          });
        }
      }
    }

    // Sort by piece value (least valuable first)
    return attackers.sort((a, b) => a.value - b.value);
  }

  const gain = [];
  const occupied = new Set();
  let color = sideToMove ? 'w' : 'b';
  let targetValue = pieceCp(chess, square); // 0 if quiet

  while (true) {
    const atk = getAttackers(color).filter(a => !occupied.has(a.square));
    if (atk.length === 0) break;

    const fromSq = atk[0]; // Least valuable attacker
    gain.push(targetValue);
    targetValue = fromSq.value;
    occupied.add(fromSq.square);
    color = color === 'w' ? 'b' : 'w';
  }

  // Minimax-like evaluation
  for (let i = gain.length - 2; i >= 0; i--) {
    gain[i] = -Math.max(-gain[i], gain[i + 1] || 0);
  }

  return gain.length > 0 ? gain[0] : 0;
}

/**
 * Detect if a move is a real material sacrifice
 * @param {Object} chess - Chess.js instance (before move)
 * @param {string} move - Move in UCI format (e.g., 'e2e4')
 * @param {Object} options - Sacrifice detection options
 * @returns {boolean} True if move is a real material sacrifice
 */
async function isRealSacrifice(chess, move, options = {}) {
  const {
    evalBeforeWhite = null,
    evalAfterWhite = null,
    moverColor = null,
    evalTypes = null
  } = options;

  console.log("Analysing sacrifice...............");

  const fromSq = move.substring(0, 2);
  const toSq = move.substring(2, 4);

  const movedPiece = chess.get(fromSq);
  if (!movedPiece) return false;

  const movedCp = PIECE_VALUES[movedPiece.type] || 0;
  if (movedCp === 0) {
    // Kings / nonsense: not a sacrifice
    return false;
  }

  let capturedCp = pieceCp(chess, toSq);

  // Handle en passant capture
  const moves = chess.moves({ verbose: true });
  const moveObj = moves.find(m => m.from === fromSq && m.to === toSq);
  if (moveObj && moveObj.flags.includes('e')) {
    // En passant
    capturedCp = PIECE_VALUES.p;
  }

  const netLossCp = movedCp - capturedCp;
  if (netLossCp < MIN_SAC_CP) {
    // Not enough material at stake to count as a "sac" for brilliancy
    return false;
  }

  // Local static-exchange evaluation on destination square
  const mover = chess.turn() === 'w';
  const seeNetForMover = naiveSee(chess, toSq, mover);

  // If SEE says we are not really losing there, it's not a material sacrifice.
  // IMPORTANT: This filters out "protected" checkmate deliveries (e.g., Rd8# where rook is defended).
  // Only moves that are ACTUALLY hanging/losing material pass this check.
  if (seeNetForMover >= -MIN_SEE_LOSS_CP) {
    return false;
  }

  // --- Forced mate sequences: don't call every mating move a 'sac' ---
  const mateBefore = evalTypes && evalTypes.before === "mate";
  const mateAfter = evalTypes && evalTypes.after === "mate";

  let isForcedMateSequence = false;
  if (evalBeforeWhite !== null && evalAfterWhite !== null) {
    if (Math.abs(evalBeforeWhite) >= MATE_THRESHOLD && Math.abs(evalAfterWhite) >= MATE_THRESHOLD) {
      if (evalBeforeWhite * evalAfterWhite > 0) {  // Same side mating
        isForcedMateSequence = true;
      }
    }
  }

  // SPECIAL CASE: Allow sacrifices for checkmate delivery or very short mates (1-2 plies)
  // These are the brilliant finishing blows that should count as sacrifices
  let isCheckmateDelivery = false;
  if (mateAfter && evalAfterWhite !== null) {
    // After the move, it's mate. Check how close to actual checkmate:
    // Very high eval (close to MATE_CP) means mate in very few moves
    // MATE_CP = 32000, MATE_STEP = 1000
    // mate in 0 (checkmate): 32000
    // mate in 1: 31000
    // mate in 2: 30000
    if (Math.abs(evalAfterWhite) >= MATE_CP - (2 * MATE_STEP)) {  // Mate in 0, 1, or 2
      isCheckmateDelivery = true;
    }
  }

  if (isForcedMateSequence && !isCheckmateDelivery) {
    // Long mate sequence clean-up (no real time to accept the material) -> not a 'sac'
    // But if it's delivering checkmate or mate in 1-2, allow it!
    return false;
  }

  // --- Filter out pure attack-brilliancy where eval jumps UP a lot ---
  // EXCEPTION: Don't apply this filter for checkmate deliveries - those are real sacrifices!
  if (
    evalBeforeWhite !== null &&
    evalAfterWhite !== null &&
    moverColor !== null &&
    !isCheckmateDelivery  // Allow sacrifices when delivering checkmate
  ) {
    const beforePov = cpForPlayer(evalBeforeWhite, moverColor);
    const afterPov = cpForPlayer(evalAfterWhite, moverColor);
    const evalGain = afterPov - beforePov;

    // If the move *greatly* improves our eval, we treat it as an attack brilliancy
    // (your detect_brilliancy_level will already catch it),
    // but not as a "material sacrifice" for !!.
    if (evalGain >= ATTACK_GAIN_CP) {
      return false;
    }
  }

  // If we reach here:
  // - non-trivial material debit
  // - SEE says the square is locally losing
  // - not just forced-mate clean-up
  // - not a huge eval-improving attack move
  return true;
}

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

// ============================================================================
// BASE MOVE CLASSIFICATION (from basic_move_labels.py)
// ============================================================================

/**
 * Base label from CPL only
 * @param {number|null} cpl - Centipawn loss vs engine best (>= 0, already absolute)
 * @param {number|null} multipvRank - 1 if played move is engine PV #1, else >1 or None
 * @returns {string} "Best" | "Good" | "Inaccuracy" | "Mistake" | "Blunder"
 */
function baseLabelFromCpl(cpl, multipvRank) {
  if (cpl === null) {
    // Fail-safe: if something went wrong, treat as Inaccuracy
    return "Inaccuracy";
  }

  // Near-perfect moves
  if (cpl <= 20) {
    // If it's literally PV#1, call it Best,
    // otherwise it's still very strong (Good).
    return (multipvRank === 1) ? "Best" : "Good";
  }

  if (cpl <= 60) return "Good";
  if (cpl <= 200) return "Inaccuracy";
  if (cpl <= 500) return "Mistake";
  return "Blunder";
}

/**
 * Core 5-type classifier: Best / Good / Inaccuracy / Mistake / Blunder
 * @param {number} evalBeforeWhite - Engine eval BEFORE the move, from WHITE's perspective (cp)
 * @param {number} evalAfterWhite - Engine eval AFTER the move, from WHITE's perspective (cp)
 * @param {number|null} cpl - Centipawn loss vs engine best from the PRE position (>= 0 or None)
 * @param {string} moverColor - Which side made the move: 'w' for White, 'b' for Black
 * @param {number|null} multipvRank - Rank of the played move in the PRE multiPV (1 = engine best)
 * @returns {string} Classification label
 */
export function classifyBasicMove(evalBeforeWhite, evalAfterWhite, cpl, moverColor, multipvRank) {
  // ---------- Convert to player POV ----------
  const playerBefore = cpForPlayer(evalBeforeWhite, moverColor);
  const playerAfter = cpForPlayer(evalAfterWhite, moverColor);
  const playerDelta = playerAfter - playerBefore;   // >0 helped mover, <0 hurt mover

  const beforeState = situationFromCp(playerBefore);
  const afterState = situationFromCp(playerAfter);

  // Normalize CPL
  let normalizedCpl = cpl;
  if (normalizedCpl === null) {
    // crude fallback: at least use how much eval changed for the mover
    normalizedCpl = Math.abs(playerDelta);
  }

  // ---------- 1) Base label from CPL ----------
  let label = baseLabelFromCpl(normalizedCpl, multipvRank);

  // ---------- 2) Throwing away a win (punish harder) ----------
  if ((beforeState === "Winning" || beforeState === "Won") &&
      (afterState === "Equalish" || afterState === "Worse" || afterState === "Lost")) {
    // You were clearly better, now not anymore
    if (normalizedCpl >= 300) {
      label = promoteLabel(label, "Blunder");
    } else if (normalizedCpl >= 200) {
      label = promoteLabel(label, "Mistake");
    }
  }

  // ---------- 3) Already totally lost (soften a bit) ----------
  if (beforeState === "Lost" && afterState === "Lost") {
    // Don't spam blunders in a -10 vs -12 type position
    label = softenLabel(label, "Mistake");   // cap at Mistake
    if (label === "Mistake" && normalizedCpl <= 250) {
      label = "Inaccuracy";
    }
  }

  // ---------- 4) Normal positions: tweak by player_delta ----------
  // Large improvement for mover → be kinder than pure CPL
  if (playerDelta >= 100) {  // mover improved by ≥ 1 pawn
    if (label === "Blunder") {
      label = "Mistake";
    } else if (label === "Mistake") {
      label = "Inaccuracy";
    } else if (label === "Inaccuracy") {
      label = "Good";
    }
  }

  // Large worsening for mover → be harsher
  if (playerDelta <= -150) {  // mover worsened by ≥ 1.5 pawns
    if (label === "Good") {
      label = "Inaccuracy";
    } else if (label === "Inaccuracy" && normalizedCpl >= 150) {
      label = "Mistake";
    }
  }

  // ---------- 5) Huge rescue (optional but nice) ----------
  // From completely lost to at least "not dead" with big improvement
  if (beforeState === "Lost" && (afterState === "Equalish" || afterState === "Winning" || afterState === "Won")) {
    if (playerDelta >= 300) {  // improved by ≥ 3 pawns
      // Never call such a move worse than Good
      if (LABEL_RANK[label] > LABEL_RANK["Good"]) {
        label = "Good";
      }
    }
  }

  // ---------- 6) Already totally winning (soften a bit, symmetric to Lost->Lost) ----------
  if (beforeState === "Won" && afterState === "Won") {
    // Don't spam blunders when you're +10 and stay +10/+12
    label = softenLabel(label, "Mistake");   // cap at Mistake
    if (label === "Mistake" && normalizedCpl <= 250) {
      label = "Inaccuracy";
    }
  }

  console.log("before", beforeState, "after state", afterState);

  return label;
}

// ============================================================================
// MISS DETECTION (from basic_move_labels.py)
// ============================================================================

/**
 * Miss detection parameters
 */
const MISS_PARAMS = {
  maxSelfDropCp: 80,           // If mover worsens more than this, it's not a Miss
  minOpportunityCp: 250,       // Generic "big chance" threshold
  tacticalMinGainCp: 350,      // Clear tactical/material win (~pawn+)
  stillWinningCp: 300,         // >= this is clearly winning
  equalBandCp: 150,            // |cp| <= this is "equalish"
  stillOkCp: 120,              // >= -this counts as drawable / OK
  minSaveGainCp: 300,          // For "missed save" (lost → drawable)
  minConversionGainCp: 250     // Small edge → big edge
};

/**
 * Detect if a move is a 'Miss' (missed opportunity)
 * @param {number} evalBeforeWhite - WHITE POV eval before move
 * @param {number} evalAfterWhite - WHITE POV eval after move
 * @param {number|null} evalBestWhite - WHITE POV eval of engine best from PRE, or null
 * @param {string} moverColor - 'w' or 'b'
 * @param {Object} options - Additional options
 * @returns {boolean} True if this is a Miss
 */
export function detectMiss(evalBeforeWhite, evalAfterWhite, evalBestWhite, moverColor, options = {}) {
  const {
    bestMateInPlies = null,
    playedMateInPlies = null,
    params = MISS_PARAMS
  } = options;

  // Need best-line eval; otherwise we don't know the missed opportunity.
  if (evalBestWhite === null) {
    return false;
  }

  // Convert everything to mover POV
  const beforePov = cpForPlayer(evalBeforeWhite, moverColor);
  const afterPov = cpForPlayer(evalAfterWhite, moverColor);
  const bestPov = cpForPlayer(evalBestWhite, moverColor);

  // Deltas
  const selfDrop = beforePov - afterPov;        // >0 means we worsened our own eval
  const opportunity = bestPov - beforePov;       // how much better best-line is vs current
  const missGap = bestPov - afterPov;            // how much better best-line is vs what we got

  console.log("MISS DEBUG:", {
    beforePov,
    afterPov,
    bestPov,
    selfDrop,
    opportunity,
    missGap,
    situation: situationFromCp(beforePov),
  });

  // --- Global gates ---
  // If we clearly worsened the eval, this move belongs to Inaccuracy/Mistake/Blunder, not Miss.
  if (selfDrop > params.maxSelfDropCp) {
    return false;
  }

  // If the missed improvement is small, not a Miss.
  if (opportunity < params.minOpportunityCp || missGap < params.minOpportunityCp) {
    return false;
  }

  const situation = situationFromCp(beforePov);

  // --- 1) Missed mate / kill shot while still winning ---
  if (bestMateInPlies !== null) {
    // best line contains a mate for the mover
    if (bestPov >= params.stillWinningCp && afterPov >= params.stillWinningCp) {
      // you had a forced mate and still stayed winning, but didn't take it
      return true;
    }
  }

  // Even without mate, a huge boost while staying winning -> kill shot missed
  if (
    (situation === "Winning" || situation === "Won") &&
    beforePov >= params.stillWinningCp &&
    bestPov >= beforePov + params.tacticalMinGainCp &&
    afterPov >= params.stillWinningCp
  ) {
    return true;
  }

  // --- 2) Missed defensive resource / save (lost -> drawable) ---
  if (situation === "Worse" || situation === "Lost") {
    if (
      opportunity >= params.minSaveGainCp &&
      bestPov >= -params.stillOkCp  // best line gives at least drawable chances
    ) {
      return true;
    }
  }

  // --- 3) Missed conversion (edge -> big edge) ---
  if (situation === "Winning" || situation === "Equalish") {
    if (
      opportunity >= params.minConversionGainCp &&
      bestPov >= beforePov + params.minConversionGainCp
    ) {
      return true;
    }
  }

  // --- 4) Generic tactical Miss: equalish, big tactical jump available ---
  const isEqualish = Math.abs(beforePov) <= params.equalBandCp;
  const isBigTactical = (
    bestPov >= beforePov + params.tacticalMinGainCp &&
    bestPov >= params.tacticalMinGainCp
  );

  if (isEqualish && isBigTactical) {
    return true;
  }

  // --- 5) Fallback: big opportunity, small self-harm -> generic Miss ---
  if (opportunity >= params.minOpportunityCp) {
    return true;
  }

  return false;
}

// ============================================================================
// BOOK MOVE DETECTION (from basic_move_labels.py)
// ============================================================================

/**
 * Detect if a move should be labeled 'Book'
 * Only return True if the move is found in the real opening DB
 * @param {Object} options - Book detection options
 * @returns {boolean} True if this is a book move
 */
export function detectBookMove(options = {}) {
  const {
    fullmoveNumber = null,
    evalBeforeWhite = null,
    evalAfterWhite = null,
    cpl = null,
    multipvRank = null,
    inOpeningDb = null
  } = options;

  // Only trust the real DB signal
  return Boolean(inOpeningDb);
}

// ============================================================================
// BRILLIANCY DETECTION (from basic_move_labels.py)
// ============================================================================

/**
 * Brilliancy detection parameters
 */
const BRILLIANCY_PARAMS = {
  maxGapToBestCp: 60,             // How close to engine best the move must be (general)
  maxGapMatePatternsCp: 120,      // For very sharp mate / stalemate rescues we allow a bit more slack
  attackMinGainCp: 200,           // How much the eval must improve for attack brilliancy
  attackMinFinalCp: 300,          // Final eval must be at least clearly winning
  defenseLostThresholdCp: -250,  // Before <= this => clearly worse/lost
  defenseDrawBandCp: 80,          // After in [-80, +80] => drawable/ok
  defenseMinRescueGainCp: 350,    // Gain from before to after for defense
  stalemateLostThresholdCp: -500, // Really lost before
  stalemateDrawBandCp: 60,        // After very close to 0.00
  stalemateMinRescueGainCp: 600,  // Huge swing to draw
  minMateFlipEvalSwingCp: 800,    // Swing in eval to treat as brilliancy
  minMateDepthPlies: 1            // Mate depth must be at least this
};

/**
 * Detect whether a move is 'brilliancy-level'
 * @param {Object} options - Brilliancy detection options
 * @returns {Object} { isBrilliancy: boolean, kind: string|null, debug: {...} }
 */
export function detectBrilliancyLevel(options = {}) {
  const {
    evalBeforeWhite,
    evalAfterWhite,
    evalBestWhite = null,
    moverColor,
    isSacrifice = false,
    isBook = false,
    multipvRank = null,
    playedEvalFromPreWhite = null,
    bestMateInPliesPre = null,
    playedMateInPliesPost = null,
    mateFlip = false,
    params = BRILLIANCY_PARAMS
  } = options;

  // 0) Never call Book moves brilliant
  if (isBook) {
    return { isBrilliancy: false, kind: null, debug: {} };
  }

  // Convert evals to mover POV
  const beforePov = cpForPlayer(evalBeforeWhite, moverColor);
  const afterPov = cpForPlayer(evalAfterWhite, moverColor);
  const bestPov = evalBestWhite !== null ? cpForPlayer(evalBestWhite, moverColor) : null;

  // If we know eval of played move from PRE, use that for gap_to_best; else use AFTER.
  let gapToBest = null;
  if (playedEvalFromPreWhite !== null && evalBestWhite !== null) {
    const playedPovPre = cpForPlayer(playedEvalFromPreWhite, moverColor);
    gapToBest = bestPov - playedPovPre;
  } else if (bestPov !== null) {
    gapToBest = bestPov - afterPov;
  }

  // Rescue gain if best_pov is known
  const rescueGain = (bestPov !== null) ? (bestPov - beforePov) : null;

  const delta = afterPov - beforePov;
  const situation = situationFromCp(beforePov);

  const debugInfo = {
    beforePov,
    afterPov,
    bestPov,
    delta,
    gapToBest,
    situation,
    isSacrifice,
    multipvRank,
  };

  console.log("BRILL DEBUG:", debugInfo);

  // Small helpers
  const nearBestGeneral = () => {
    if (bestPov === null || gapToBest === null) return false;
    return Math.abs(gapToBest) <= params.maxGapToBestCp;
  };

  const nearBestMatePattern = () => {
    if (bestPov === null || gapToBest === null) return false;
    return Math.abs(gapToBest) <= params.maxGapMatePatternsCp;
  };

  // -----------------------------------------------------------------------
  // Pattern A: Attack / conversion brilliancy
  // (equal/small edge -> clearly winning)
  // -----------------------------------------------------------------------
  const isAttackCandidate = (
    delta >= params.attackMinGainCp &&
    afterPov >= params.attackMinFinalCp
  );
  if (isAttackCandidate && nearBestGeneral()) {
    return { isBrilliancy: true, kind: "attack", debug: debugInfo };
  }

  // -----------------------------------------------------------------------
  // Pattern B: Defensive brilliancy (lost -> drawable/ok)
  // -----------------------------------------------------------------------
  const isLostOrWorse = beforePov <= params.defenseLostThresholdCp;
  const isDrawishAfter = Math.abs(afterPov) <= params.defenseDrawBandCp;
  const defenseRescueGain = afterPov - beforePov;

  const isDefenseCandidate = (
    isLostOrWorse &&
    isDrawishAfter &&
    defenseRescueGain >= params.defenseMinRescueGainCp
  );

  if (isDefenseCandidate) {
    // Prefer near-best if we know best_pov, otherwise trust the rescue shape.
    if (bestPov === null || nearBestGeneral()) {
      return { isBrilliancy: true, kind: "defense", debug: debugInfo };
    }
  }

  // -----------------------------------------------------------------------
  // Pattern C: Stalemate / draw-rescue brilliancy
  // (very lost -> near-0 draw; typical "sacrifice for stalemate" scenario)
  // -----------------------------------------------------------------------
  const isVeryLost = beforePov <= params.stalemateLostThresholdCp;
  const isDrawishAfterStrict = Math.abs(afterPov) <= params.stalemateDrawBandCp;
  const stalemateRescueGain = afterPov - beforePov;

  const isStalemateCandidate = (
    isVeryLost &&
    isDrawishAfterStrict &&
    stalemateRescueGain >= params.stalemateMinRescueGainCp
  );

  if (isStalemateCandidate) {
    if (bestPov === null || nearBestMatePattern()) {
      return { isBrilliancy: true, kind: "stalemate_rescue", debug: debugInfo };
    }
  }

  // -----------------------------------------------------------------------
  // Pattern D: Mate-flip / mate-rescue brilliancy
  // -----------------------------------------------------------------------
  if (mateFlip) {
    const evalSwing = afterPov - beforePov;

    // Good mate flip for mover: big positive swing and final eval > 0
    if (evalSwing >= params.minMateFlipEvalSwingCp && afterPov > 0) {
      return { isBrilliancy: true, kind: "mate_flip", debug: debugInfo };
    }

    // Bad mate flip for mover (we'll let higher-level logic call this Blunder)
    // Just fall through and return 'no brilliancy' here.
  }

  // Also treat "killing a short mate against us" as a mate-rescue brilliancy.
  if (bestMateInPliesPre !== null && bestMateInPliesPre <= params.minMateDepthPlies) {
    // There was a very short mate in the best line (against the mover).
    // If after our move the mate disappears or becomes much longer and eval improves a lot,
    // this is a brilliancy-level save.
    if (playedMateInPliesPost === null || playedMateInPliesPost > bestMateInPliesPre + 2) {
      if (afterPov - beforePov >= params.defenseMinRescueGainCp) {
        if (bestPov === null || nearBestMatePattern()) {
          return { isBrilliancy: true, kind: "mate_flip", debug: debugInfo };
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Pattern E: Pure sacrifice brilliancy in a winning position
  // -----------------------------------------------------------------------
  if (isSacrifice) {
    // Must be at least clearly better before and after
    if (beforePov >= 300 && afterPov >= 300) {
      // Engine should not hate the move
      if (bestPov === null || (gapToBest !== null && Math.abs(gapToBest) <= 120)) {
        return { isBrilliancy: true, kind: "attack", debug: debugInfo };
      }
    }
  }

  // -----------------------------------------------------------------------
  // No brilliancy pattern matched
  // -----------------------------------------------------------------------
  return { isBrilliancy: false, kind: null, debug: debugInfo };
}

/**
 * Exclamation classification parameters
 */
const EXCLAM_PARAMS = {
  minMateFlipEvalSwingCp: 800  // Same idea as in BrilliancyParams
};

/**
 * Classify exclamation moves (Brilliant !! / Great ! / mate-flip Blunder)
 * @param {Object} options - Classification options
 * @returns {Object} { label: string|null, brilliancyResult: {...} }
 */
export function classifyExclamMove(options = {}) {
  const {
    evalBeforeWhite,
    evalAfterWhite,
    evalBestWhite = null,
    moverColor,
    isSacrifice = false,
    isBook = false,
    multipvRank = null,
    playedEvalFromPreWhite = null,
    bestMateInPliesPre = null,
    playedMateInPliesPost = null,
    mateFlip = false,
    brilliancyParams = BRILLIANCY_PARAMS,
    exclamParams = EXCLAM_PARAMS
  } = options;

  // First: compute mover POV evals
  const beforePov = cpForPlayer(evalBeforeWhite, moverColor);
  const afterPov = cpForPlayer(evalAfterWhite, moverColor);
  const evalSwing = afterPov - beforePov;

  // 1) Mate-flip catastrophe (Blunder) check:
  // "if suppose the engine says mate in 4 for white and white plays a move
  //  that flips mate in favor of black, then its a blunder"
  if (mateFlip && evalSwing <= -exclamParams.minMateFlipEvalSwingCp) {
    // Force 'Blunder' label here; brilliancy-level will be considered False.
    const dummyResult = {
      isBrilliancy: false,
      kind: null,
      debug: {
        beforePov,
        afterPov,
        bestPov: null,
        delta: evalSwing,
        gapToBest: null,
        rescueGain: null,
      }
    };
    return { label: "Blunder", brilliancyResult: dummyResult };
  }

  // 2) General brilliancy-level detection (attack / defense / stalemate / good mate-flip)
  const brill = detectBrilliancyLevel({
    evalBeforeWhite,
    evalAfterWhite,
    evalBestWhite,
    moverColor,
    isSacrifice,
    isBook,
    multipvRank,
    playedEvalFromPreWhite,
    bestMateInPliesPre,
    playedMateInPliesPost,
    mateFlip,
    params: brilliancyParams
  });

  console.log("EXCLAM DEBUG:", {
    isBrilliancy: brill.isBrilliancy,
    brilliancyKind: brill.kind,
    isSacrifice,
    beforePov: brill.debug.beforePov,
    afterPov: brill.debug.afterPov,
    bestPov: brill.debug.bestPov,
    gapToBest: brill.debug.gapToBest,
  });

  if (!brill.isBrilliancy) {
    return { label: null, brilliancyResult: brill };
  }

  // 3) Map brilliancy-level + sacrifice into Brilliant (!!) vs Great (!)
  // "for Brilliancy (!!), Sacrifice is must,
  //  if the move is Brilliancy level but without sacrifice, then its Great (!)"

  if (isSacrifice) {
    console.log("  → Final label: Brilliant (!! - brilliancy + sacrifice)");
    return { label: "Brilliant", brilliancyResult: brill };
  } else {
    console.log("  → Final label: Great (! - brilliancy without sacrifice)");
    return { label: "Great", brilliancyResult: brill };
  }
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
    isBrilliant = false,
    missedOpportunity = false, // Miss: failed to take advantage of a tactical opportunity
    slowerMate = null // 'inaccuracy', 'good', or null (for slower mates)
  } = options;

  // Slower mate classification takes priority
  // Playing M5 when M3 is available should be classified as inaccuracy/good
  if (slowerMate === 'inaccuracy') {
    return {
      classification: 'inaccuracy',
      label: 'Inaccuracy',
      color: '#f0c15c',
      cpLoss
    };
  }

  if (slowerMate === 'good') {
    return {
      classification: 'good',
      label: 'Good',
      color: '#96af8b',
      cpLoss
    };
  }

  // Missed mate is a BLUNDER only if it also loses significant advantage
  // If you miss mate but still maintain position, it's a "Miss" instead
  if (missedMate && cpLoss >= 200) {
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

  // Miss (Ø): Missed a tactical opportunity, checkmate, or chance to punish opponent
  // Chess.com: Move is decent but missed significant advantage or forced mate
  // Examples:
  //   - Had M2 (mate in 2) available but played a good developing move
  //   - Could win a piece with a fork but played a normal continuation
  //   - Opponent blundered but you didn't punish it
  if (missedOpportunity) {
    return {
      classification: 'miss',
      label: 'Miss',
      color: '#ffa500', // Orange color for missed opportunities (Ø symbol)
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
  const { depth = 20, epsilon = 10, skipBrilliant = false } = options;

  console.log('\n' + '='.repeat(80));
  console.log('🚀 STARTING ADVANCED MOVE CLASSIFICATION');
  console.log('='.repeat(80));
  console.log('📍 FEN:', fen);
  console.log('🎯 Move:', move);
  console.log('⚙️ Options:', { depth, epsilon, skipBrilliant });
  console.log('='.repeat(80) + '\n');

  const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
  const rootChess = new Chess(fen);
  const rootTurn = rootChess.turn();

  // Check if move is in opening book using Polyglot book or simple book
  // This matches the Python implementation: is_book_move(fen, move)
  console.log('📚 STEP 1: Opening Book Detection');
  console.log('─'.repeat(80));
  let inOpeningDb = false;
  try {
    console.log('   Calling checkPolyglotBook...');
    console.log('   FEN:', fen);
    console.log('   Move:', move);
    inOpeningDb = await checkPolyglotBook(fen, move);
    console.log(`✅ Opening book check complete: ${inOpeningDb ? 'BOOK MOVE ✓' : 'NOT in book ✗'}`);
  } catch (error) {
    console.error('❌ [OPENING_BOOK] Error checking book:');
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    console.error('   Full error:', error);
    inOpeningDb = false;
  }

  // Fallback: check if opening phase for legacy book move detection
  const isBookLegacy = isOpeningPhase(fen);
  console.log(`📖 Legacy book detection: ${isBookLegacy}`);
  console.log('─'.repeat(80) + '\n');

  console.log('🔍 STEP 2: Engine Analysis');
  console.log('─'.repeat(80));

  // 1) Root MultiPV analysis
  console.log('⚙️ Analyzing position with MultiPV=3...');
  const root = await stockfish.analyze(fen, { depth, multiPV: 3 });
  const lines = normalizeLines(root.lines, rootTurn);
  const bestMove = lines[0]?.pv?.[0];
  console.log(`✅ Best move from engine: ${bestMove}`);
  console.log(`📊 Top 3 moves:`, lines.slice(0, 3).map((l, i) => `#${i+1}: ${l.pv[0]} (${l.scoreForRoot}cp)`));

  // Diagnostics
  const pv2Gap = lines.length > 1 ? (lines[0].scoreForRoot - lines[1].scoreForRoot) : 0;
  const forced = pv2Gap >= 200;
  console.log(`🎯 PV2 Gap: ${pv2Gap}cp (${forced ? 'FORCED' : 'not forced'})`);

  // 2) Score the player's move at the root using searchmoves
  console.log(`⚙️ Analyzing played move: ${move}...`);
  const ourRoot = await stockfish.analyze(fen, {
    depth,
    multiPV: 1,
    searchMoves: [move],
  });
  const ourRootScore = evalForRoot(rootTurn, rootTurn, ourRoot.evaluation);
  console.log(`✅ Played move eval: ${ourRootScore}cp`);

  // 3) Score the best move at the root using searchmoves
  console.log(`⚙️ Analyzing best move: ${bestMove}...`);
  const bestRoot = await stockfish.analyze(fen, {
    depth,
    multiPV: 1,
    searchMoves: [bestMove],
  });
  const bestRootScore = evalForRoot(rootTurn, rootTurn, bestRoot.evaluation);
  console.log(`✅ Best move eval: ${bestRootScore}cp`);

  // 4) Calculate CP-loss from root perspective
  const cpLoss = Math.max(0, bestRootScore - ourRootScore);
  console.log(`📉 CPL (Centipawn Loss): ${cpLoss}cp`);
  console.log('─'.repeat(80) + '\n');

  // Top-N / epsilon rules
  const inTop3 = lines.slice(0, 3).some(
    l => l.pv[0]?.toLowerCase() === move.toLowerCase()
  );
  const ourLine = lines.find(
    l => l.pv[0]?.toLowerCase() === move.toLowerCase()
  );
  const withinEps = ourLine ? (lines[0].scoreForRoot - ourLine.scoreForRoot) <= epsilon : false;

  // Detect if best move delivers mate
  const bestMoveIsMate = lines[0]?.evaluation?.type === 'mate';
  const ourMoveIsMate = ourRoot.evaluation?.type === 'mate';

  // Missed mate = best move delivers mate but our move doesn't
  const missedMate = bestMoveIsMate && !ourMoveIsMate;

  // Count pieces for brilliant detection and game phase
  const pieceCount = (fen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;

  // Enhanced Brilliant Move Detection (V3 - Chess.com-style 7-case system)
  let isBrilliantV3 = false;
  let brilliantAnalysisV3 = null;

  // Check if we should run V3 brilliant analysis
  const moveNumber = parseInt(fen.split(' ')[5] || '1');

  // Calculate actual multipv rank
  let actualMultipvRank = 99;
  const moveLower = move.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const pvMove = lines[i]?.pv?.[0]?.toLowerCase();
    if (pvMove === moveLower || pvMove?.substring(0, 4) === moveLower.substring(0, 4)) {
      actualMultipvRank = i + 1;
      break;
    }
  }

  console.log(`🔍 V3 Pre-check: cpLoss=${cpLoss.toFixed(1)}, rank=${actualMultipvRank}, moveNum=${moveNumber}, pieces=${pieceCount}`);

  const shouldRunV3 = shouldCheckBrilliantV3(cpLoss, actualMultipvRank, moveNumber, pieceCount);
  console.log(`   Should run V3? ${shouldRunV3}`);

  if (!skipBrilliant && shouldRunV3) {
    try {
      // Detect sacrifice
      const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
      const chessForSac = new Chess(fen);
      const fromSq = move.substring(0, 2);
      const toSq = move.substring(2, 4);
      const movingPiece = chessForSac.get(fromSq);
      const capturedPiece = chessForSac.get(toSq);
      const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      const movedValue = movingPiece ? (pieceValues[movingPiece.type] || 0) : 0;
      const capturedValue = capturedPiece ? (pieceValues[capturedPiece.type] || 0) : 0;
      const isSacrifice = movedValue > capturedValue && movedValue >= 3;

      console.log(`   Sacrifice check: moved=${movedValue}, captured=${capturedValue}, isSac=${isSacrifice}`);

      // Create analysis data from what we already computed
      const analysisData = {
        evalBefore: bestRootScore,
        evalAfter: ourRootScore,
        multipvRank: actualMultipvRank,
        gapToSecond: pv2Gap,
        isSacrifice
      };

      console.log(`   Running V3 analysis...`);
      brilliantAnalysisV3 = await analyzeBrilliantV3(stockfish, fen, move, analysisData, { depth });
      isBrilliantV3 = brilliantAnalysisV3.isBrilliantV3;

      if (isBrilliantV3) {
        console.log(`🌟 BRILLIANT V3 DETECTED: ${brilliantAnalysisV3.reason}`);
      } else {
        console.log(`   Not brilliant: ${brilliantAnalysisV3.reason}`);
      }
    } catch (error) {
      console.error('❌ Brilliant V3 analysis failed:', error);
      isBrilliantV3 = false;
    }
  } else {
    console.log(`   Skipping V3 analysis (skipBrilliant=${skipBrilliant}, shouldRunV3=${shouldRunV3})`);
  }

  // Enhanced Brilliant Move Detection (V2 - Legacy)
  let isBrilliantV2 = false;
  let brilliantAnalysis = null;

  // Only run V2 if V3 didn't find brilliant (V3 is more accurate)
  if (!isBrilliantV3 && !skipBrilliant && shouldCheckBrilliant(fen, move, cpLoss, forced)) {
    try {
      brilliantAnalysis = await analyzeBrilliantMove(stockfish, fen, move, {
        depth,
        useAdaptive: true
      });
      isBrilliantV2 = brilliantAnalysis.isBrilliantV2;
    } catch (error) {
      console.error('Brilliant V2 analysis failed:', error);
      isBrilliantV2 = false;
    }
  }

  // Use V3 if found, otherwise fall back to V2
  const isBrilliant = isBrilliantV3 || isBrilliantV2;

  // ============================================================================
  // NEW ADVANCED LOGIC (from basic_move_labels.py)
  // ============================================================================

  console.log('🧠 STEP 3: Advanced Classification Logic (from Python)');
  console.log('─'.repeat(80));

  // Prepare evaluation values for advanced logic
  // Convert mate evaluations to centipawns (White POV)
  const convertMateToCP = (evaluation) => {
    if (!evaluation) return 0;
    if (evaluation.type === 'mate') {
      const mateValue = evaluation.value;
      const sign = mateValue > 0 ? 1 : -1;
      // Closer mates have higher values
      return sign * (MATE_CP - Math.abs(mateValue) * MATE_STEP);
    }
    return evaluation.value || 0;
  };

  const evalBeforeWhite = bestRootScore; // eval before move (best move from PRE)
  const evalAfterWhite = ourRootScore;   // eval after move (played move)
  const evalBestWhite = bestRootScore;   // eval of best move
  const moverColor = rootTurn; // 'w' or 'b'

  // Get mate information
  const bestMateInPlies = bestMoveIsMate ? Math.abs(lines[0]?.evaluation?.value || 0) : null;
  const playedMateInPlies = ourMoveIsMate ? Math.abs(ourRoot.evaluation?.value || 0) : null;

  // Detect mate flip
  const evalTypes = {
    before: bestMoveIsMate ? 'mate' : 'cp',
    after: ourMoveIsMate ? 'mate' : 'cp'
  };

  // Check for mate flip (both are mate but different signs)
  let mateFlip = false;
  if (lines[0]?.evaluation?.type === 'mate' && ourRoot.evaluation?.type === 'mate') {
    const bestMateValue = lines[0].evaluation.value;
    const ourMateValue = ourRoot.evaluation.value;
    // Mate flip = signs are different (one side mating changes to other side)
    mateFlip = (bestMateValue > 0 && ourMateValue < 0) || (bestMateValue < 0 && ourMateValue > 0);
  }

  // Advanced sacrifice detection using SEE
  console.log('🎯 A) Sacrifice Detection (SEE-based)');
  let isRealSac = false;
  try {
    const Chess = (await import('chess.js/dist/esm/chess.js')).Chess;
    const chessForSacrifice = new Chess(fen);
    isRealSac = await isRealSacrifice(chessForSacrifice, move, {
      evalBeforeWhite,
      evalAfterWhite,
      moverColor,
      evalTypes
    });
    console.log(`   ➜ Real sacrifice: ${isRealSac ? '✓ YES (material hanging)' : '✗ NO (protected/equal)'}`);
  } catch (error) {
    console.error('   ❌ Sacrifice detection failed:', error);
    isRealSac = false;
  }

  // Classify using new advanced logic
  console.log('📊 B) Basic Move Classification');
  const basicLabel = classifyBasicMove(
    evalBeforeWhite,
    evalAfterWhite,
    cpLoss,
    moverColor,
    actualMultipvRank
  );
  console.log(`   ➜ Basic label: ${basicLabel} (from context-aware classification)`);

  // Detect miss
  console.log('🔍 C) Miss Detection (Missed Opportunities)');
  const isMiss = detectMiss(
    evalBeforeWhite,
    evalAfterWhite,
    evalBestWhite,
    moverColor,
    {
      bestMateInPlies,
      playedMateInPlies
    }
  );
  console.log(`   ➜ Is Miss: ${isMiss ? '✓ YES (opportunity missed)' : '✗ NO'}`);

  // Detect book move using advanced logic
  // This matches Python app.py:996-1002
  console.log('📚 D) Book Move Wrapper');
  const isBookAdvanced = detectBookMove({
    fullmoveNumber: moveNumber,
    evalBeforeWhite,
    evalAfterWhite,
    cpl: cpLoss,
    multipvRank: actualMultipvRank,
    inOpeningDb: inOpeningDb // Use Polyglot book detection result
  });
  console.log(`   ➜ Book move (wrapper): ${isBookAdvanced ? '✓ YES' : '✗ NO'}`);

  // Detect brilliancy/great using advanced logic
  console.log('🌟 E) Brilliancy/Great Detection (!! / !)');
  const exclamResult = classifyExclamMove({
    evalBeforeWhite,
    evalAfterWhite,
    evalBestWhite,
    moverColor,
    isSacrifice: isRealSac,
    isBook: isBookAdvanced,
    multipvRank: actualMultipvRank,
    playedEvalFromPreWhite: evalAfterWhite,
    bestMateInPliesPre: bestMateInPlies,
    playedMateInPliesPost: playedMateInPlies,
    mateFlip
  });

  const advancedLabel = exclamResult.label;
  const brilliancyResult = exclamResult.brilliancyResult;

  console.log(`   ➜ Exclam label: ${advancedLabel || 'null (no special label)'}`);
  console.log(`   ➜ Brilliancy detected: ${brilliancyResult.isBrilliancy ? '✓ YES' : '✗ NO'}`);
  console.log(`   ➜ Brilliancy kind: ${brilliancyResult.kind || 'none'}`);

  console.log('\n📋 SUMMARY OF ADVANCED CLASSIFICATION:');
  console.log('   ├─ Opening Book: ' + (inOpeningDb ? '✓ BOOK MOVE' : '✗ not book'));
  console.log('   ├─ Real Sacrifice: ' + (isRealSac ? '✓ YES' : '✗ no'));
  console.log('   ├─ Basic Label: ' + basicLabel);
  console.log('   ├─ Miss: ' + (isMiss ? '✓ YES' : '✗ no'));
  console.log('   ├─ Brilliancy: ' + (brilliancyResult.isBrilliancy ? `✓ ${brilliancyResult.kind}` : '✗ no'));
  console.log('   └─ Exclam Label: ' + (advancedLabel || 'none'));
  console.log('─'.repeat(80) + '\n');

  // ============================================================================
  // END NEW ADVANCED LOGIC
  // ============================================================================

  // Detect slower mate (playing M5 when M3 available)
  // If both moves deliver mate but ours is slower, classify based on difference
  let slowerMateClassification = null;
  if (bestMoveIsMate && ourMoveIsMate) {
    const bestMateIn = Math.abs(lines[0]?.evaluation?.value || 0);
    const ourMateIn = Math.abs(ourRoot.evaluation?.value || 0);
    const mateDiff = ourMateIn - bestMateIn;

    if (mateDiff >= 2) {
      // 2+ moves slower = Inaccuracy (e.g., M5 when M3 available)
      slowerMateClassification = 'inaccuracy';
      console.log(`⏱️ Slower mate detected: Played M${ourMateIn} when M${bestMateIn} available → Inaccuracy`);
    } else if (mateDiff === 1) {
      // 1 move slower = Good (e.g., M4 when M3 available)
      slowerMateClassification = 'good';
      console.log(`⏱️ Slower mate detected: Played M${ourMateIn} when M${bestMateIn} available → Good`);
    }
    // mateDiff === 0 or negative = Best (fastest mate)
  }

  // Detect missed opportunity (Miss classification)
  // Case 1: Missed a checkmate (M1, M2, M3, etc.) but played a decent move
  // Case 2: Missed significant material/positional advantage (200+ CP) but played decent move
  const missedMateOpportunity =
    bestMoveIsMate && // Best move delivers mate
    !ourMoveIsMate && // Our move doesn't deliver mate
    cpLoss < 200; // But our move isn't a blunder (still maintains decent position)

  const missedMaterialOpportunity =
    !bestMoveIsMate && // Not about missing mate
    cpLoss < 100 && // Move isn't terrible
    bestRootScore >= 200 && // Best move offered significant advantage (2+ pawns)
    cpLoss >= 50 && // But player missed it (some CP loss)
    !isBook; // Not in opening theory

  const missedOpportunity = missedMateOpportunity || missedMaterialOpportunity;

  console.log('📊 Miss detection:', {
    missedMateOpportunity,
    missedMaterialOpportunity,
    bestMoveIsMate,
    ourMoveIsMate,
    cpLoss,
    bestRootScore
  });

  // ============================================================================
  // FINAL CLASSIFICATION (using advanced logic)
  // ============================================================================

  console.log('🏆 STEP 4: Final Classification (Priority System)');
  console.log('─'.repeat(80));
  console.log('Priority order (matches Python app.py:1024-1033):');
  console.log('   1. Book moves (in_opening_db)');
  console.log('   2. Mate-flip Blunder (exclam_label == "Blunder")');
  console.log('   3. Brilliant / Great (exclam_label in ("Brilliant", "Great"))');
  console.log('   4. Miss (is_miss)');
  console.log('   5. Basic classification (basic_label)');
  console.log('─'.repeat(80));

  let finalClassification;
  let classificationSource = 'advanced'; // Track which system classified the move

  // Priority 1: Book moves (matches Python: if in_opening_db)
  if (inOpeningDb) {
    finalClassification = {
      classification: 'book',
      label: 'Book',
      color: '#a88865',
      cpLoss: 0
    };
    console.log('🎯 Priority #1 TRIGGERED: Book Move');
    console.log('   ➜ FINAL: Book (from Polyglot opening book)');
  }
  // Priority 2: Mate-flip blunder (catastrophic)
  else if (advancedLabel === 'Blunder' && mateFlip) {
    finalClassification = {
      classification: 'blunder',
      label: 'Blunder',
      color: '#fa412d',
      cpLoss
    };
    console.log('🎯 Priority #2 TRIGGERED: Mate-flip Blunder');
    console.log('   ➜ FINAL: Blunder (catastrophic mate flip)');
  }
  // Priority 3: Brilliant / Great moves
  else if (advancedLabel === 'Brilliant') {
    finalClassification = {
      classification: 'brilliant',
      label: 'Brilliant',
      color: '#1baca6',
      cpLoss
    };
    console.log('🎯 Priority #3 TRIGGERED: Brilliant Move (!! with sacrifice)');
    console.log('   ➜ FINAL: Brilliant');
  }
  else if (advancedLabel === 'Great') {
    finalClassification = {
      classification: 'great',
      label: 'Great',
      color: '#5cb3a6', // Slightly different color for Great
      cpLoss
    };
    console.log('🎯 Priority #3 TRIGGERED: Great Move (! without sacrifice)');
    console.log('   ➜ FINAL: Great');
  }
  // Priority 4: Miss
  else if (isMiss) {
    finalClassification = {
      classification: 'miss',
      label: 'Miss',
      color: '#ffa500',
      cpLoss
    };
    console.log('🎯 Priority #4 TRIGGERED: Miss (missed opportunity)');
    console.log('   ➜ FINAL: Miss');
  }
  // Priority 5: Basic classification
  else {
    // Map advanced basicLabel to classification format
    const labelToClassification = {
      'Best': { classification: 'best', label: 'Best', color: '#9bc02a' },
      'Good': { classification: 'good', label: 'Good', color: '#96af8b' },
      'Inaccuracy': { classification: 'inaccuracy', label: 'Inaccuracy', color: '#f0c15c' },
      'Mistake': { classification: 'mistake', label: 'Mistake', color: '#e58f2a' },
      'Blunder': { classification: 'blunder', label: 'Blunder', color: '#fa412d' }
    };

    finalClassification = {
      ...(labelToClassification[basicLabel] || labelToClassification['Inaccuracy']),
      cpLoss
    };
    console.log('🎯 Priority #5 TRIGGERED: Basic Classification');
    console.log(`   ➜ FINAL: ${basicLabel} (context-aware: before=${situationFromCp(cpForPlayer(evalBeforeWhite, moverColor))}, after=${situationFromCp(cpForPlayer(evalAfterWhite, moverColor))})`);
  }

  // Keep old classification for comparison/fallback
  const classificationOld = classifyMove(cpLoss, {
    inTop3,
    withinEps,
    forced,
    missedMate,
    isBook: isBookLegacy && cpLoss <= 10, // Legacy book detection
    isBrilliant,
    missedOpportunity,
    slowerMate: slowerMateClassification
  });

  const classification = finalClassification;

  console.log('─'.repeat(80));
  console.log('✅ CLASSIFICATION COMPLETE!');
  console.log('   Final Result:', classification.label);
  console.log('   Classification:', classification.classification);
  console.log('   CPL:', cpLoss + 'cp');
  console.log('   Source: Advanced Python Logic');
  console.log('─'.repeat(80) + '\n');

  // Generate position after the move for tactical analysis
  const chessAfter = new Chess(fen);
  let fenAfter = fen;
  try {
    chessAfter.move({
      from: move.substring(0, 2),
      to: move.substring(2, 4),
      promotion: move.length > 4 ? move[4] : undefined
    });
    fenAfter = chessAfter.fen();
  } catch (e) {
    console.warn('Could not apply move for explanation analysis:', e);
  }

  // Detect tactical motifs
  const motifs = detectTacticalMotifs(fen, fenAfter, move, {
    cpLoss,
    missedMate: missedMateOpportunity,
    isBrilliant: isBrilliantV3 || isBrilliantV2
  });

  // Get best move in SAN notation
  let bestMoveSan = bestMove;
  try {
    const tempChess = new Chess(fen);
    const moveObj = tempChess.move({
      from: bestMove.substring(0, 2),
      to: bestMove.substring(2, 4),
      promotion: bestMove.length > 4 ? bestMove[4] : undefined
    });
    bestMoveSan = moveObj?.san || bestMove;
  } catch (e) {
    // Keep UCI notation if SAN conversion fails
  }

  // Get player move in SAN notation
  let playerMoveSan = move;
  try {
    const tempChess = new Chess(fen);
    const moveObj = tempChess.move({
      from: move.substring(0, 2),
      to: move.substring(2, 4),
      promotion: move.length > 4 ? move[4] : undefined
    });
    playerMoveSan = moveObj?.san || move;
  } catch (e) {
    // Keep UCI notation if SAN conversion fails
  }

  // Generate natural language explanation
  const explanation = generateMoveExplanation({
    classification: classification.classification,
    cpLoss,
    bestMove,
    bestMoveSan,
    playerMove: move,
    playerMoveSan,
    evalBefore: { type: 'cp', value: bestRootScore },
    evalAfter: { type: 'cp', value: ourRootScore },
    bestLine: lines[0]?.pv || [],
    motifs,
    fenBefore: fen,
    fenAfter,
    missedMate: missedMateOpportunity,
    mateInMoves: bestMoveIsMate ? Math.abs(lines[0]?.evaluation?.value || 0) : null,
    isBrilliant: isBrilliantV3 || isBrilliantV2,
    brilliantAnalysis: brilliantAnalysisV3 || brilliantAnalysis
  });

  const result = {
    ...classification,
    bestMove,
    bestMoveSan,
    playerMoveSan,
    cpLoss,
    lines,
    forced,
    missedMate,
    missedMateOpportunity: missedMateOpportunity || false, // Missed M1/M2/M3 but played decent move
    bestMoveIsMate, // Best move delivers mate
    mateInMoves: bestMoveIsMate ? Math.abs(lines[0]?.evaluation?.value || 0) : null,
    isBook: inOpeningDb, // Real Polyglot/simple book detection
    isBookLegacy: isBookLegacy && cpLoss <= 15, // Legacy heuristic-based detection
    isBrilliant,
    isBrilliantV2,
    isBrilliantV3, // V3 detection (Chess.com-style 7-case system)
    brilliantAnalysis, // V2 detailed analysis (gates, reasons, confidence)
    brilliantAnalysisV3, // V3 analysis (case, reason, confidence)
    engineEval: bestRootScore,
    moveEval: ourRootScore,
    motifs, // Tactical motifs detected
    explanation, // Natural language explanation

    // Advanced logic results (from basic_move_labels.py)
    advancedLogic: {
      basicLabel,                    // Best/Good/Inaccuracy/Mistake/Blunder
      exclamLabel: advancedLabel,    // Brilliant/Great/null
      isMiss,                        // Miss detection
      isRealSacrifice: isRealSac,    // Real sacrifice (SEE-based)
      inOpeningDb,                   // Polyglot/simple book detection (matches Python)
      isBookAdvanced,                // Book move (advanced detection wrapper)
      brilliancyResult,              // Full brilliancy analysis
      mateFlip,                      // Mate flip detection
      classificationSource,          // 'advanced' or other
      classificationOld              // Old classification for comparison
    }
  };

  console.log('\n' + '='.repeat(80));
  console.log('🎉 ANALYSIS COMPLETE - FINAL RESULT');
  console.log('='.repeat(80));
  console.log('Move:', move, '→', result.label);
  console.log('Classification:', result.classification);
  console.log('CPL:', cpLoss + 'cp');
  console.log('\n📊 Details:');
  console.log('   ├─ Book Move:', inOpeningDb ? '✓ YES' : '✗ no');
  console.log('   ├─ Sacrifice:', isRealSac ? '✓ YES' : '✗ no');
  console.log('   ├─ Brilliancy:', brilliancyResult.isBrilliancy ? `✓ ${brilliancyResult.kind}` : '✗ no');
  console.log('   ├─ Miss:', isMiss ? '✓ YES' : '✗ no');
  console.log('   ├─ Best Move:', bestMove);
  console.log('   ├─ Engine Eval:', bestRootScore + 'cp');
  console.log('   └─ Played Eval:', ourRootScore + 'cp');
  console.log('='.repeat(80) + '\n\n');

  return result;
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
    miss: 0,
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
