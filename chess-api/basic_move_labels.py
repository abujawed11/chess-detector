"""
basic_move_labels.py

Core engine-based move classification:
    Best / Good / Inaccuracy / Mistake / Blunder
    + Brilliant / Great / Miss detection

This module assumes:
- eval_before_white and eval_after_white are Stockfish-style evaluations
  from WHITE's perspective, in centipawns, with mates mapped to big +/- values.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import chess

# ---------------------------------------------------------------------------
# Constants and Piece Values
# ---------------------------------------------------------------------------

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 300,
    chess.BISHOP: 300,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}

MIN_SAC_CP       = 300   # at least a minor piece effectively at risk
MIN_SEE_LOSS_CP  = 100   # SEE must say we lose ≥ 1 pawn locally
ATTACK_GAIN_CP   = 150   # if eval improves more than this, treat as attack, not "sac"
MATE_THRESHOLD   = 20000 # same idea as your existing mate cp mapping
MATE_CP          = 32000 # mate in 0 evaluation value
MATE_STEP        = 1000  # drop per ply for mate sequences

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def piece_cp(board: chess.Board, sq: chess.Square) -> int:
    p = board.piece_at(sq)
    return PIECE_VALUES.get(p.piece_type, 0) if p else 0


def naive_see(board: chess.Board, square: chess.Square, side_to_move: bool) -> int:
    """
    Very small static-exchange eval on `square`.
    Returns net cp for `side_to_move` assuming optimal local swaps.
    """
    def attackers(side):
        return sorted(
            (sq for sq in board.attackers(side, square)),
            key=lambda s: PIECE_VALUES[board.piece_at(s).piece_type]
        )

    gain = []
    occupied = set()
    color = side_to_move
    target_value = piece_cp(board, square)  # 0 if quiet

    while True:
        atk = [s for s in attackers(color) if s not in occupied]
        if not atk:
            break
        from_sq = atk[0]  # least valuable attacker
        gain.append(target_value)
        target_value = PIECE_VALUES[board.piece_at(from_sq).piece_type]
        occupied.add(from_sq)
        color = not color

    for i in range(len(gain) - 2, -1, -1):
        gain[i] = -max(-gain[i], gain[i + 1])
    return gain[0] if gain else 0


def cp_for_player(eval_white_cp: float, mover_color: str) -> float:
    """
    Convert White-centric eval to mover-centric eval.

    eval_white_cp: evaluation from White's perspective (Stockfish style)
    mover_color:   'w' if White just moved, 'b' if Black just moved

    Returns:
        cp where:
            +ve = good for the mover,
            -ve = bad for the mover.
    """
    return eval_white_cp if mover_color == 'w' else -eval_white_cp


def situation_from_cp(cp_player: float) -> str:
    """
    Bucket the mover's position into rough game states
    """
    if cp_player >= 800:
        return "Won"
    if cp_player >= 300:
        return "Winning"
    if cp_player > -300:
        return "Equalish"
    if cp_player > -800:
        return "Worse"
    return "Lost"


# ---------------------------------------------------------------------------
# Sacrifice Detection
# ---------------------------------------------------------------------------

def is_real_sacrifice(
    board_before: chess.Board,
    move: chess.Move,
    *,
    eval_before_white: float | None = None,
    eval_after_white: float | None = None,
    mover_color: str | None = None,
    eval_types: dict | None = None,
) -> bool:
    """
    Sacrifice detection tuned for brilliancy system.
    """
    print("Analysing sacrifice...............")
    board = board_before.copy()
    mover = board.turn
    from_sq, to_sq = move.from_square, move.to_square

    moved_piece = board_before.piece_at(from_sq)
    if moved_piece is None:
        return False

    moved_cp = PIECE_VALUES[moved_piece.piece_type]
    if moved_cp == 0:
        return False

    captured_cp = piece_cp(board_before, to_sq)

    # Handle en passant capture
    if board_before.is_en_passant(move):
        captured_cp = PIECE_VALUES[chess.PAWN]

    net_loss_cp = moved_cp - captured_cp
    if net_loss_cp < MIN_SAC_CP:
        return False

    see_net_for_mover = naive_see(board_before, to_sq, mover)

    if see_net_for_mover >= -MIN_SEE_LOSS_CP:
        return False

    # Forced mate sequences
    mate_before = (eval_types and eval_types.get("before") == "mate")
    mate_after  = (eval_types and eval_types.get("after")  == "mate")

    is_forced_mate_sequence = False
    if eval_before_white is not None and eval_after_white is not None:
        if abs(eval_before_white) >= MATE_THRESHOLD and abs(eval_after_white) >= MATE_THRESHOLD:
            if eval_before_white * eval_after_white > 0:
                is_forced_mate_sequence = True

    # Checkmate delivery
    is_checkmate_delivery = False
    if mate_after and eval_after_white is not None:
        if abs(eval_after_white) >= MATE_CP - (2 * MATE_STEP):
            is_checkmate_delivery = True

    if is_forced_mate_sequence and not is_checkmate_delivery:
        return False

    # Filter out pure attack-brilliancy
    if (
        eval_before_white is not None and
        eval_after_white is not None and
        mover_color is not None and
        not is_checkmate_delivery
    ):
        before_pov = cp_for_player(eval_before_white, mover_color)
        after_pov  = cp_for_player(eval_after_white,  mover_color)
        eval_gain  = after_pov - before_pov

        if eval_gain >= ATTACK_GAIN_CP:
            return False

    return True


# ---------------------------------------------------------------------------
# Basic Label Classification
# ---------------------------------------------------------------------------

LABEL_ORDER = ["Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Blunder"]
LABEL_RANK = {name: i for i, name in enumerate(LABEL_ORDER)}


def base_label_from_cpl(cpl: float | None, multipv_rank: int | None) -> str:
    """
    Raw engine severity → one of:
        Best / Excellent / Good / Inaccuracy / Mistake / Blunder

    cpl:
        Centipawn loss vs engine best (>= 0, already absolute).
    multipv_rank:
        1 if played move is engine PV #1, else >1 or None.
    """
    if cpl is None:
        # Fail-safe: if something went wrong, treat as Inaccuracy
        return "Inaccuracy"

    # Very near-perfect moves
    if cpl <= 10:
        # If it's literally PV#1, call it Best,
        # otherwise it's still almost perfect (Excellent).
        return "Best" if (multipv_rank == 1) else "Excellent"

    # Still extremely accurate: only a tiny CPL loss
    if cpl <= 30:
        return "Excellent"

    # Solid moves: you lost a bit more but still fine
    if cpl <= 80:
        return "Good"

    if cpl <= 200:
        return "Inaccuracy"
    if cpl <= 500:
        return "Mistake"
    return "Blunder"


def promote_label(current: str, minimum: str) -> str:
    """Ensure label is at least as severe as 'minimum'"""
    if LABEL_RANK[current] < LABEL_RANK[minimum]:
        return minimum
    return current


def soften_label(current: str, maximum: str) -> str:
    """Cap label so it is no more severe than 'maximum'"""
    if LABEL_RANK[current] > LABEL_RANK[maximum]:
        return maximum
    return current


def classify_basic_move(
    eval_before_white: float,
    eval_after_white: float,
    cpl: float | None,
    mover_color: str,
    multipv_rank: int | None,
) -> str:
    """
    Core 5-type classifier: Best / Good / Inaccuracy / Mistake / Blunder
    """
    player_before = cp_for_player(eval_before_white, mover_color)
    player_after  = cp_for_player(eval_after_white,  mover_color)
    player_delta  = player_after - player_before

    before_state = situation_from_cp(player_before)
    after_state  = situation_from_cp(player_after)

    if cpl is None:
        cpl = abs(player_delta)

    label = base_label_from_cpl(cpl, multipv_rank)

    # Throwing away a win
    if before_state in ("Winning", "Won") and after_state in ("Equalish", "Worse", "Lost"):
        if cpl >= 300:
            label = promote_label(label, "Blunder")
        elif cpl >= 200:
            label = promote_label(label, "Mistake")

    # Already totally lost
    if before_state == "Lost" and after_state == "Lost":
        label = soften_label(label, "Mistake")
        if label == "Mistake" and cpl <= 250:
            label = "Inaccuracy"

    # Large improvement for mover → be kinder than pure CPL
    if player_delta >= 100:  # mover improved by ≥ 1 pawn
        if label == "Blunder":
            label = "Mistake"
        elif label == "Mistake":
            label = "Inaccuracy"
        elif label == "Inaccuracy":
            label = "Good"
        elif label == "Good":
            label = "Excellent"  # Reward significant improvement

    # Large worsening for mover → be harsher
    if player_delta <= -150:  # mover worsened by ≥ 1.5 pawns
        if label == "Excellent":
            label = "Good"
        elif label == "Good":
            label = "Inaccuracy"
        elif label == "Inaccuracy" and cpl >= 150:
            label = "Mistake"

    # Huge rescue (optional but nice)
    # From completely lost to at least "not dead" with big improvement
    if before_state == "Lost" and after_state in ("Equalish", "Winning", "Won"):
        if player_delta >= 300:  # improved by ≥ 3 pawns
            # Never call such a move worse than Excellent
            if LABEL_RANK[label] > LABEL_RANK["Excellent"]:
                label = "Excellent"

    # Already totally winning
    if before_state == "Won" and after_state == "Won":
        label = soften_label(label, "Mistake")
        if label == "Mistake" and cpl <= 250:
            label = "Inaccuracy"

    print("before", before_state, "after state", after_state)

    return label


# ---------------------------------------------------------------------------
# Miss Detection
# ---------------------------------------------------------------------------

@dataclass
class MissParams:
    max_self_drop_cp: int = 80
    min_opportunity_cp: int = 250
    tactical_min_gain_cp: int = 350
    still_winning_cp: int = 300
    equal_band_cp: int = 150
    still_ok_cp: int = 120
    min_save_gain_cp: int = 300
    min_conversion_gain_cp: int = 250


def detect_miss(
    eval_before_white: float,
    eval_after_white: float,
    eval_best_white: Optional[float],
    mover_color: str,
    *,
    best_mate_in_plies: Optional[int] = None,
    played_mate_in_plies: Optional[int] = None,
    params: Optional[MissParams] = None,
) -> bool:
    """Pure 'Miss' detector"""
    if params is None:
        params = MissParams()

    if eval_best_white is None:
        return False

    before_pov = cp_for_player(eval_before_white, mover_color)
    after_pov  = cp_for_player(eval_after_white,  mover_color)
    best_pov   = cp_for_player(eval_best_white,   mover_color)

    self_drop   = before_pov - after_pov
    opportunity = best_pov   - before_pov
    miss_gap    = best_pov   - after_pov

    print("MISS DEBUG:", {
        "before_pov": before_pov,
        "after_pov": after_pov,
        "best_pov": best_pov,
        "self_drop": self_drop,
        "opportunity": opportunity,
        "miss_gap": miss_gap,
        "situation": situation_from_cp(before_pov),
    })

    if self_drop > params.max_self_drop_cp:
        return False

    if opportunity < params.min_opportunity_cp or miss_gap < params.min_opportunity_cp:
        return False

    situation = situation_from_cp(before_pov)

    # Missed mate
    if best_mate_in_plies is not None:
        if (
            best_pov  >= params.still_winning_cp and
            after_pov >= params.still_winning_cp
        ):
            return True

    # Kill shot missed
    if (
        situation in ("Winning", "Won") and
        before_pov >= params.still_winning_cp and
        best_pov   >= before_pov + params.tactical_min_gain_cp and
        after_pov  >= params.still_winning_cp
    ):
        return True

    # Missed defensive resource
    if situation in ("Worse", "Lost"):
        if (
            opportunity >= params.min_save_gain_cp and
            best_pov   >= -params.still_ok_cp
        ):
            return True

    # Missed conversion
    if situation in ("Winning", "Equalish"):
        if (
            opportunity >= params.min_conversion_gain_cp and
            best_pov   >= before_pov + params.min_conversion_gain_cp
        ):
            return True

    # Generic tactical Miss
    is_equalish = abs(before_pov) <= params.equal_band_cp
    is_big_tactical = (
        best_pov >= before_pov + params.tactical_min_gain_cp and
        best_pov >= params.tactical_min_gain_cp
    )

    if is_equalish and is_big_tactical:
        return True

    # Fallback
    if opportunity >= params.min_opportunity_cp:
        return True

    return False


# ---------------------------------------------------------------------------
# Book Move Detection
# ---------------------------------------------------------------------------

@dataclass
class BookParams:
    pass


def detect_book_move(
    *,
    fullmove_number: int,
    eval_before_white: float,
    eval_after_white: float,
    cpl: Optional[float],
    multipv_rank: Optional[int],
    in_opening_db: Optional[bool] = None,
    params: Optional[BookParams] = None,
) -> bool:
    """Decide whether a move should be labeled 'Book'"""
    return bool(in_opening_db)


# ---------------------------------------------------------------------------
# Brilliancy Detection
# ---------------------------------------------------------------------------

@dataclass
class BrilliancyParams:
    max_gap_to_best_cp: int = 60
    max_gap_mate_patterns_cp: int = 120
    attack_min_gain_cp: int = 200
    attack_min_final_cp: int = 300
    defense_lost_threshold_cp: int = -250
    defense_draw_band_cp: int = 80
    defense_min_rescue_gain_cp: int = 350
    stalemate_lost_threshold_cp: int = -500
    stalemate_draw_band_cp: int = 60
    stalemate_min_rescue_gain_cp: int = 600
    min_mate_flip_eval_swing_cp: int = 800
    min_mate_depth_plies: int = 1


@dataclass
class BrilliancyResult:
    is_brilliancy: bool
    kind: Optional[str] = None
    before_pov: float = 0.0
    after_pov: float = 0.0
    best_pov: Optional[float] = None
    delta_cp: float = 0.0
    gap_to_best_cp: Optional[float] = None
    rescue_gain_cp: Optional[float] = None


def detect_brilliancy_level(
    *,
    eval_before_white: float,
    eval_after_white: float,
    eval_best_white: Optional[float],
    mover_color: str,
    is_sacrifice: bool,
    is_book: bool,
    multipv_rank: Optional[int],
    played_eval_from_pre_white: Optional[float],
    best_mate_in_plies_pre: Optional[int],
    played_mate_in_plies_post: Optional[int],
    mate_flip: bool,
    params: Optional[BrilliancyParams] = None,
) -> BrilliancyResult:
    """Detect whether a move is 'brilliancy-level'"""
    if params is None:
        params = BrilliancyParams()

    if is_book:
        return BrilliancyResult(is_brilliancy=False)

    before_pov = cp_for_player(eval_before_white, mover_color)
    after_pov  = cp_for_player(eval_after_white,  mover_color)
    best_pov   = cp_for_player(eval_best_white,   mover_color) if eval_best_white is not None else None

    if played_eval_from_pre_white is not None and eval_best_white is not None:
        played_pov_pre = cp_for_player(played_eval_from_pre_white, mover_color)
        gap_to_best = best_pov - played_pov_pre
    elif best_pov is not None:
        gap_to_best = best_pov - after_pov
    else:
        gap_to_best = None

    rescue_gain = (best_pov - before_pov) if best_pov is not None else None
    delta = after_pov - before_pov
    situation = situation_from_cp(before_pov)

    def make_result(kind: Optional[str]) -> BrilliancyResult:
        return BrilliancyResult(
            is_brilliancy=(kind is not None),
            kind=kind,
            before_pov=before_pov,
            after_pov=after_pov,
            best_pov=best_pov,
            delta_cp=delta,
            gap_to_best_cp=gap_to_best,
            rescue_gain_cp=rescue_gain,
        )

    print("BRILL DEBUG:", {
        "before_pov": before_pov,
        "after_pov": after_pov,
        "best_pov": best_pov,
        "delta_cp": delta,
        "gap_to_best_cp": gap_to_best,
        "situation": situation_from_cp(before_pov),
        "is_sacrifice": is_sacrifice,
        "multipv_rank": multipv_rank,
    })

    def near_best_general() -> bool:
        if best_pov is None or gap_to_best is None:
            return False
        return abs(gap_to_best) <= params.max_gap_to_best_cp

    def near_best_mate_pattern() -> bool:
        if best_pov is None or gap_to_best is None:
            return False
        return abs(gap_to_best) <= params.max_gap_mate_patterns_cp

    # Attack / conversion brilliancy
    is_attack_candidate = (
        delta >= params.attack_min_gain_cp and
        after_pov >= params.attack_min_final_cp
    )
    if is_attack_candidate and near_best_general():
        return make_result("attack")

    # Defensive brilliancy
    is_lost_or_worse = before_pov <= params.defense_lost_threshold_cp
    is_drawish_after = abs(after_pov) <= params.defense_draw_band_cp
    defense_rescue_gain = after_pov - before_pov

    is_defense_candidate = (
        is_lost_or_worse and
        is_drawish_after and
        defense_rescue_gain >= params.defense_min_rescue_gain_cp
    )

    if is_defense_candidate:
        if best_pov is None or near_best_general():
            return make_result("defense")

    # Stalemate / draw-rescue
    is_very_lost = before_pov <= params.stalemate_lost_threshold_cp
    is_drawish_after_strict = abs(after_pov) <= params.stalemate_draw_band_cp
    stalemate_rescue_gain = after_pov - before_pov

    is_stalemate_candidate = (
        is_very_lost and
        is_drawish_after_strict and
        stalemate_rescue_gain >= params.stalemate_min_rescue_gain_cp
    )

    if is_stalemate_candidate:
        if best_pov is None or near_best_mate_pattern():
            return make_result("stalemate_rescue")

    # Mate-flip brilliancy
    if mate_flip:
        eval_swing = after_pov - before_pov

        if eval_swing >= params.min_mate_flip_eval_swing_cp and after_pov > 0:
            return make_result("mate_flip")

    if best_mate_in_plies_pre is not None and best_mate_in_plies_pre <= params.min_mate_depth_plies:
        if played_mate_in_plies_post is None or played_mate_in_plies_post > best_mate_in_plies_pre + 2:
            if after_pov - before_pov >= params.defense_min_rescue_gain_cp:
                if best_pov is None or near_best_mate_pattern():
                    return make_result("mate_flip")

    # Pure sacrifice brilliancy
    if is_sacrifice:
        if before_pov >= 300 and after_pov >= 300:
            if best_pov is None or (gap_to_best is not None and abs(gap_to_best) <= 120):
                return make_result("attack")

    return make_result(None)


# ---------------------------------------------------------------------------
# Final Exclamation Label
# ---------------------------------------------------------------------------

@dataclass
class ExclamParams:
    min_mate_flip_eval_swing_cp: int = 800


def classify_exclam_move(
    *,
    eval_before_white: float,
    eval_after_white: float,
    eval_best_white: Optional[float],
    mover_color: str,
    is_sacrifice: bool,
    is_book: bool,
    multipv_rank: Optional[int],
    played_eval_from_pre_white: Optional[float],
    best_mate_in_plies_pre: Optional[int],
    played_mate_in_plies_post: Optional[int],
    mate_flip: bool,
    br_params: Optional[BrilliancyParams] = None,
    ex_params: Optional[ExclamParams] = None,
) -> tuple[Optional[str], BrilliancyResult]:
    """
    Decide if a move deserves: Brilliant (!!) / Great (!) / Blunder (mate-flip)
    """
    if ex_params is None:
        ex_params = ExclamParams()

    before_pov = cp_for_player(eval_before_white, mover_color)
    after_pov  = cp_for_player(eval_after_white,  mover_color)
    eval_swing = after_pov - before_pov

    # Mate-flip catastrophe
    if mate_flip and eval_swing <= -ex_params.min_mate_flip_eval_swing_cp:
        dummy_result = BrilliancyResult(
            is_brilliancy=False,
            kind=None,
            before_pov=before_pov,
            after_pov=after_pov,
            best_pov=None,
            delta_cp=eval_swing,
            gap_to_best_cp=None,
            rescue_gain_cp=None,
        )
        return "Blunder", dummy_result

    # General brilliancy detection
    brill = detect_brilliancy_level(
        eval_before_white=eval_before_white,
        eval_after_white=eval_after_white,
        eval_best_white=eval_best_white,
        mover_color=mover_color,
        is_sacrifice=is_sacrifice,
        is_book=is_book,
        multipv_rank=multipv_rank,
        played_eval_from_pre_white=played_eval_from_pre_white,
        best_mate_in_plies_pre=best_mate_in_plies_pre,
        played_mate_in_plies_post=played_mate_in_plies_post,
        mate_flip=mate_flip,
        params=br_params,
    )

    print("EXCLAM DEBUG:", {
        "is_brilliancy": brill.is_brilliancy,
        "brilliancy_kind": brill.kind,
        "is_sacrifice": is_sacrifice,
        "before_pov": brill.before_pov,
        "after_pov": brill.after_pov,
        "best_pov": brill.best_pov,
        "gap_to_best_cp": brill.gap_to_best_cp,
    })

    if not brill.is_brilliancy:
        return None, brill

    if is_sacrifice:
        print("  → Final label: Brilliant (!! - brilliancy + sacrifice)")
        return "Brilliant", brill
    else:
        print("  → Final label: Great (! - brilliancy without sacrifice)")
        return "Great", brill
