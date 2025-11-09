/**
 * Brilliant Move Detection Configuration
 * Tunable thresholds for precision-focused brilliant move detection
 */

export const BRILLIANT_CONFIG = {
  // 1. SACRIFICE DETECTION
  SAC_CP_MIN: 300,                    // Minimum material loss (minor piece)
  SAC_EXCHANGE_MIN: 150,              // Exchange sacrifice minimum (R-N)
  SAC_RECOVERY_PLIES: 2,              // Plies to check for immediate recovery

  // 2. ROOT NEAR-BEST
  NEAR_BEST_EPS: 10,                  // Centipawn tolerance for "near-best"
  ROOT_MULTIPV: 5,                    // Number of PVs at root

  // 3. FORCING / UNIQUENESS
  FORCING_GAP_AFTER: 250,             // PV1-PV2 gap after move (normal)
  FORCING_GAP_OPENING: 300,           // Higher threshold in openings
  UNIQUENESS_MAX_GOOD_REPLIES: 2,    // Max "good" opponent replies
  UNIQUENESS_REPLY_EPS: 50,           // CP tolerance for "good" reply

  // 4. NON-TRIVIALITY
  WINNING_GUARD_CP: 400,              // Already-winning threshold
  WDL_JUMP_MIN: 0.10,                 // Min WDL win probability increase (10%)

  // 5. STABILITY
  STABILITY_PLIES: 8,                 // Plies to extend PV for stability
  STABILITY_DRIFT_CP: 60,             // Max allowed CP drift in stability check
  STABILITY_MIN_PLIES: 6,             // Minimum plies for stability
  STABILITY_MAX_PLIES: 10,            // Maximum plies for stability

  // 6. PHASE AWARENESS
  ENDGAME_PIECE_MAX: 10,              // Max pieces for endgame phase
  OPENING_MOVE_MAX: 8,                // Max move number for opening
  OPENING_PIECE_MIN: 30,              // Min pieces for opening phase

  // 7. ENGINE SETTINGS
  MATE_CP_CAP: 2000,                  // CP value for mate arithmetic
  DEFAULT_MOVETIME: 1000,             // Default analysis time (ms)
  STABILITY_MOVETIME: 600,            // Time for stability checks
  UNIQUENESS_MOVETIME: 800,           // Time for uniqueness checks

  // 8. MATERIAL VALUES
  PIECE_VALUES: {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0
  }
};

/**
 * Get adaptive engine parameters based on position
 */
export function getDynamicEngineParams(fen, pvGap = 100, pieceCount = 32) {
  const base = { movetime: 1000, depth: 20, multiPV: 5 };

  const moveNum = parseInt(fen.split(' ')[5] || '1');
  const isOpening = moveNum <= BRILLIANT_CONFIG.OPENING_MOVE_MAX &&
                   pieceCount >= BRILLIANT_CONFIG.OPENING_PIECE_MIN;
  const isEndgame = pieceCount <= BRILLIANT_CONFIG.ENDGAME_PIECE_MAX;
  const isComplex = pvGap < 60;

  if (isOpening) {
    base.movetime = 1200;
    base.depth = 22;
  } else if (isEndgame) {
    base.movetime = 1400;
    base.depth = 25;
    base.multiPV = 3;
  } else if (isComplex) {
    base.movetime = 1400;
    base.depth = 24;
  } else if (pvGap > 200) {
    base.movetime = 800;
    base.depth = 18;
  }

  return base;
}

/**
 * Update a specific config value
 */
export function updateBrilliantConfig(key, value) {
  if (key in BRILLIANT_CONFIG) {
    BRILLIANT_CONFIG[key] = value;
    return true;
  }
  return false;
}

/**
 * Reset config to defaults
 */
export function resetBrilliantConfig() {
  Object.assign(BRILLIANT_CONFIG, {
    SAC_CP_MIN: 300,
    SAC_EXCHANGE_MIN: 150,
    SAC_RECOVERY_PLIES: 2,
    NEAR_BEST_EPS: 10,
    ROOT_MULTIPV: 5,
    FORCING_GAP_AFTER: 250,
    FORCING_GAP_OPENING: 300,
    UNIQUENESS_MAX_GOOD_REPLIES: 2,
    UNIQUENESS_REPLY_EPS: 50,
    WINNING_GUARD_CP: 400,
    WDL_JUMP_MIN: 0.10,
    STABILITY_PLIES: 8,
    STABILITY_DRIFT_CP: 60,
    STABILITY_MIN_PLIES: 6,
    STABILITY_MAX_PLIES: 10,
    ENDGAME_PIECE_MAX: 10,
    OPENING_MOVE_MAX: 8,
    OPENING_PIECE_MIN: 30,
    MATE_CP_CAP: 2000,
    DEFAULT_MOVETIME: 1000,
    STABILITY_MOVETIME: 600,
    UNIQUENESS_MOVETIME: 800,
    PIECE_VALUES: {
      p: 100, n: 320, b: 330, r: 500, q: 900, k: 0
    }
  });
}

export default BRILLIANT_CONFIG;
