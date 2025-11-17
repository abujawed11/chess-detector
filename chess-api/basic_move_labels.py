# """
# basic_move_labels.py

# Core engine-based move classification:
#     Best / Good / Inaccuracy / Mistake / Blunder
#     + Brilliant / Great / Miss detection

# This module assumes:
# - eval_before_white and eval_after_white are Stockfish-style evaluations
#   from WHITE's perspective, in centipawns, with mates mapped to big +/- values.
# """

# from __future__ import annotations

# from dataclasses import dataclass
# from typing import Optional
# import chess

# # ---------------------------------------------------------------------------
# # Constants and Piece Values
# # ---------------------------------------------------------------------------

# PIECE_VALUES = {
#     chess.PAWN: 100,
#     chess.KNIGHT: 300,
#     chess.BISHOP: 300,
#     chess.ROOK: 500,
#     chess.QUEEN: 900,
#     chess.KING: 0,
# }

# MIN_SAC_CP       = 300   # at least a minor piece effectively at risk
# MIN_SEE_LOSS_CP  = 100   # SEE must say we lose ≥ 1 pawn locally
# ATTACK_GAIN_CP   = 150   # if eval improves more than this, treat as attack, not "sac"
# MATE_THRESHOLD   = 20000 # same idea as your existing mate cp mapping
# MATE_CP          = 32000 # mate in 0 evaluation value
# MATE_STEP        = 1000  # drop per ply for mate sequences

# # ---------------------------------------------------------------------------
# # Helper Functions
# # ---------------------------------------------------------------------------

# def piece_cp(board: chess.Board, sq: chess.Square) -> int:
#     p = board.piece_at(sq)
#     return PIECE_VALUES.get(p.piece_type, 0) if p else 0


# def naive_see(board: chess.Board, square: chess.Square, side_to_move: bool) -> int:
#     """
#     Very small static-exchange eval on `square`.
#     Returns net cp for `side_to_move` assuming optimal local swaps.
#     """
#     def attackers(side):
#         return sorted(
#             (sq for sq in board.attackers(side, square)),
#             key=lambda s: PIECE_VALUES[board.piece_at(s).piece_type]
#         )

#     gain = []
#     occupied = set()
#     color = side_to_move
#     target_value = piece_cp(board, square)  # 0 if quiet

#     while True:
#         atk = [s for s in attackers(color) if s not in occupied]
#         if not atk:
#             break
#         from_sq = atk[0]  # least valuable attacker
#         gain.append(target_value)
#         target_value = PIECE_VALUES[board.piece_at(from_sq).piece_type]
#         occupied.add(from_sq)
#         color = not color

#     for i in range(len(gain) - 2, -1, -1):
#         gain[i] = -max(-gain[i], gain[i + 1])
#     return gain[0] if gain else 0


# def cp_for_player(eval_white_cp: float, mover_color: str) -> float:
#     """
#     Convert White-centric eval to mover-centric eval.

#     eval_white_cp: evaluation from White's perspective (Stockfish style)
#     mover_color:   'w' if White just moved, 'b' if Black just moved

#     Returns:
#         cp where:
#             +ve = good for the mover,
#             -ve = bad for the mover.
#     """
#     return eval_white_cp if mover_color == 'w' else -eval_white_cp


# def situation_from_cp(cp_player: float) -> str:
#     """
#     Bucket the mover's position into rough game states
#     """
#     if cp_player >= 800:
#         return "Won"
#     if cp_player >= 300:
#         return "Winning"
#     if cp_player > -300:
#         return "Equalish"
#     if cp_player > -800:
#         return "Worse"
#     return "Lost"


# # ---------------------------------------------------------------------------
# # Sacrifice Detection
# # ---------------------------------------------------------------------------

# def is_real_sacrifice(
#     board_before: chess.Board,
#     move: chess.Move,
#     *,
#     eval_before_white: float | None = None,
#     eval_after_white: float | None = None,
#     mover_color: str | None = None,
#     eval_types: dict | None = None,
# ) -> bool:
#     """
#     Sacrifice detection tuned for brilliancy system.
#     """
#     print("Analysing sacrifice...............")
#     board = board_before.copy()
#     mover = board.turn
#     from_sq, to_sq = move.from_square, move.to_square

#     moved_piece = board_before.piece_at(from_sq)
#     if moved_piece is None:
#         return False

#     moved_cp = PIECE_VALUES[moved_piece.piece_type]
#     if moved_cp == 0:
#         return False

#     captured_cp = piece_cp(board_before, to_sq)

#     # Handle en passant capture
#     if board_before.is_en_passant(move):
#         captured_cp = PIECE_VALUES[chess.PAWN]

#     net_loss_cp = moved_cp - captured_cp
#     if net_loss_cp < MIN_SAC_CP:
#         return False

#     see_net_for_mover = naive_see(board_before, to_sq, mover)

#     if see_net_for_mover >= -MIN_SEE_LOSS_CP:
#         return False

#     # Forced mate sequences
#     mate_before = (eval_types and eval_types.get("before") == "mate")
#     mate_after  = (eval_types and eval_types.get("after")  == "mate")

#     is_forced_mate_sequence = False
#     if eval_before_white is not None and eval_after_white is not None:
#         if abs(eval_before_white) >= MATE_THRESHOLD and abs(eval_after_white) >= MATE_THRESHOLD:
#             if eval_before_white * eval_after_white > 0:
#                 is_forced_mate_sequence = True

#     # Checkmate delivery
#     is_checkmate_delivery = False
#     if mate_after and eval_after_white is not None:
#         if abs(eval_after_white) >= MATE_CP - (2 * MATE_STEP):
#             is_checkmate_delivery = True

#     if is_forced_mate_sequence and not is_checkmate_delivery:
#         return False

#     # Filter out pure attack-brilliancy
#     if (
#         eval_before_white is not None and
#         eval_after_white is not None and
#         mover_color is not None and
#         not is_checkmate_delivery
#     ):
#         before_pov = cp_for_player(eval_before_white, mover_color)
#         after_pov  = cp_for_player(eval_after_white,  mover_color)
#         eval_gain  = after_pov - before_pov

#         if eval_gain >= ATTACK_GAIN_CP:
#             return False

#     return True


# # ---------------------------------------------------------------------------
# # Basic Label Classification
# # ---------------------------------------------------------------------------

# LABEL_ORDER = ["Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Blunder"]
# LABEL_RANK = {name: i for i, name in enumerate(LABEL_ORDER)}


# def base_label_from_cpl(cpl: float | None, multipv_rank: int | None) -> str:
#     """
#     Raw engine severity → one of:
#         Best / Excellent / Good / Inaccuracy / Mistake / Blunder

#     cpl:
#         Centipawn loss vs engine best (>= 0, already absolute).
#     multipv_rank:
#         1 if played move is engine PV #1, else >1 or None.
#     """
#     if cpl is None:
#         # Fail-safe: if something went wrong, treat as Inaccuracy
#         return "Inaccuracy"

#     # Very near-perfect moves
#     if cpl <= 10:
#         # If it's literally PV#1, call it Best,
#         # otherwise it's still almost perfect (Excellent).
#         return "Best" if (multipv_rank == 1) else "Excellent"

#     # Still extremely accurate: only a tiny CPL loss
#     if cpl <= 30:
#         return "Excellent"

#     # Solid moves: you lost a bit more but still fine
#     if cpl <= 80:
#         return "Good"

#     if cpl <= 200:
#         return "Inaccuracy"
#     if cpl <= 500:
#         return "Mistake"
#     return "Blunder"


# def promote_label(current: str, minimum: str) -> str:
#     """Ensure label is at least as severe as 'minimum'"""
#     if LABEL_RANK[current] < LABEL_RANK[minimum]:
#         return minimum
#     return current


# def soften_label(current: str, maximum: str) -> str:
#     """Cap label so it is no more severe than 'maximum'"""
#     if LABEL_RANK[current] > LABEL_RANK[maximum]:
#         return maximum
#     return current


# def classify_basic_move(
#     eval_before_white: float,
#     eval_after_white: float,
#     cpl: float | None,
#     mover_color: str,
#     multipv_rank: int | None,
# ) -> str:
#     """
#     Core 5-type classifier: Best / Good / Inaccuracy / Mistake / Blunder
#     """
#     player_before = cp_for_player(eval_before_white, mover_color)
#     player_after  = cp_for_player(eval_after_white,  mover_color)
#     player_delta  = player_after - player_before

#     before_state = situation_from_cp(player_before)
#     after_state  = situation_from_cp(player_after)

#     if cpl is None:
#         cpl = abs(player_delta)

#     label = base_label_from_cpl(cpl, multipv_rank)

#     # Throwing away a win
#     if before_state in ("Winning", "Won") and after_state in ("Equalish", "Worse", "Lost"):
#         if cpl >= 300:
#             label = promote_label(label, "Blunder")
#         elif cpl >= 200:
#             label = promote_label(label, "Mistake")

#     # Already totally lost
#     if before_state == "Lost" and after_state == "Lost":
#         label = soften_label(label, "Mistake")
#         if label == "Mistake" and cpl <= 250:
#             label = "Inaccuracy"

#     # Large improvement for mover → be kinder than pure CPL
#     if player_delta >= 100:  # mover improved by ≥ 1 pawn
#         if label == "Blunder":
#             label = "Mistake"
#         elif label == "Mistake":
#             label = "Inaccuracy"
#         elif label == "Inaccuracy":
#             label = "Good"
#         elif label == "Good":
#             label = "Excellent"  # Reward significant improvement

#     # Large worsening for mover → be harsher
#     if player_delta <= -150:  # mover worsened by ≥ 1.5 pawns
#         if label == "Excellent":
#             label = "Good"
#         elif label == "Good":
#             label = "Inaccuracy"
#         elif label == "Inaccuracy" and cpl >= 150:
#             label = "Mistake"

#     # Huge rescue (optional but nice)
#     # From completely lost to at least "not dead" with big improvement
#     if before_state == "Lost" and after_state in ("Equalish", "Winning", "Won"):
#         if player_delta >= 300:  # improved by ≥ 3 pawns
#             # Never call such a move worse than Excellent
#             if LABEL_RANK[label] > LABEL_RANK["Excellent"]:
#                 label = "Excellent"

#     # Already totally winning
#     if before_state == "Won" and after_state == "Won":
#         label = soften_label(label, "Mistake")
#         if label == "Mistake" and cpl <= 250:
#             label = "Inaccuracy"

#     print("before", before_state, "after state", after_state)

#     return label


# # ---------------------------------------------------------------------------
# # Miss Detection
# # ---------------------------------------------------------------------------

# @dataclass
# class MissParams:
#     max_self_drop_cp: int = 80
#     min_opportunity_cp: int = 250
#     tactical_min_gain_cp: int = 350
#     still_winning_cp: int = 300
#     equal_band_cp: int = 150
#     still_ok_cp: int = 120
#     min_save_gain_cp: int = 300
#     min_conversion_gain_cp: int = 250


# def detect_miss(
#     eval_before_white: float,
#     eval_after_white: float,
#     eval_best_white: Optional[float],
#     mover_color: str,
#     *,
#     best_mate_in_plies: Optional[int] = None,
#     played_mate_in_plies: Optional[int] = None,
#     params: Optional[MissParams] = None,
# ) -> bool:
#     """Pure 'Miss' detector"""
#     if params is None:
#         params = MissParams()

#     if eval_best_white is None:
#         return False

#     before_pov = cp_for_player(eval_before_white, mover_color)
#     after_pov  = cp_for_player(eval_after_white,  mover_color)
#     best_pov   = cp_for_player(eval_best_white,   mover_color)

#     self_drop   = before_pov - after_pov
#     opportunity = best_pov   - before_pov
#     miss_gap    = best_pov   - after_pov

#     print("MISS DEBUG:", {
#         "before_pov": before_pov,
#         "after_pov": after_pov,
#         "best_pov": best_pov,
#         "self_drop": self_drop,
#         "opportunity": opportunity,
#         "miss_gap": miss_gap,
#         "situation": situation_from_cp(before_pov),
#     })

#     if self_drop > params.max_self_drop_cp:
#         return False

#     if opportunity < params.min_opportunity_cp or miss_gap < params.min_opportunity_cp:
#         return False

#     situation = situation_from_cp(before_pov)

#     # Missed mate
#     if best_mate_in_plies is not None:
#         if (
#             best_pov  >= params.still_winning_cp and
#             after_pov >= params.still_winning_cp
#         ):
#             return True

#     # Kill shot missed
#     if (
#         situation in ("Winning", "Won") and
#         before_pov >= params.still_winning_cp and
#         best_pov   >= before_pov + params.tactical_min_gain_cp and
#         after_pov  >= params.still_winning_cp
#     ):
#         return True

#     # Missed defensive resource
#     if situation in ("Worse", "Lost"):
#         if (
#             opportunity >= params.min_save_gain_cp and
#             best_pov   >= -params.still_ok_cp
#         ):
#             return True

#     # Missed conversion
#     if situation in ("Winning", "Equalish"):
#         if (
#             opportunity >= params.min_conversion_gain_cp and
#             best_pov   >= before_pov + params.min_conversion_gain_cp
#         ):
#             return True

#     # Generic tactical Miss
#     is_equalish = abs(before_pov) <= params.equal_band_cp
#     is_big_tactical = (
#         best_pov >= before_pov + params.tactical_min_gain_cp and
#         best_pov >= params.tactical_min_gain_cp
#     )

#     if is_equalish and is_big_tactical:
#         return True

#     # Fallback
#     if opportunity >= params.min_opportunity_cp:
#         return True

#     return False


# # ---------------------------------------------------------------------------
# # Book Move Detection
# # ---------------------------------------------------------------------------

# @dataclass
# class BookParams:
#     pass


# def detect_book_move(
#     *,
#     fullmove_number: int,
#     eval_before_white: float,
#     eval_after_white: float,
#     cpl: Optional[float],
#     multipv_rank: Optional[int],
#     in_opening_db: Optional[bool] = None,
#     params: Optional[BookParams] = None,
# ) -> bool:
#     """Decide whether a move should be labeled 'Book'"""
#     return bool(in_opening_db)


# # ---------------------------------------------------------------------------
# # Brilliancy Detection
# # ---------------------------------------------------------------------------

# @dataclass
# class BrilliancyParams:
#     max_gap_to_best_cp: int = 60
#     max_gap_mate_patterns_cp: int = 120
#     attack_min_gain_cp: int = 200
#     attack_min_final_cp: int = 300
#     defense_lost_threshold_cp: int = -250
#     defense_draw_band_cp: int = 80
#     defense_min_rescue_gain_cp: int = 350
#     stalemate_lost_threshold_cp: int = -500
#     stalemate_draw_band_cp: int = 60
#     stalemate_min_rescue_gain_cp: int = 600
#     min_mate_flip_eval_swing_cp: int = 800
#     min_mate_depth_plies: int = 1


# @dataclass
# class BrilliancyResult:
#     is_brilliancy: bool
#     kind: Optional[str] = None
#     before_pov: float = 0.0
#     after_pov: float = 0.0
#     best_pov: Optional[float] = None
#     delta_cp: float = 0.0
#     gap_to_best_cp: Optional[float] = None
#     rescue_gain_cp: Optional[float] = None


# def detect_brilliancy_level(
#     *,
#     eval_before_white: float,
#     eval_after_white: float,
#     eval_best_white: Optional[float],
#     mover_color: str,
#     is_sacrifice: bool,
#     is_book: bool,
#     multipv_rank: Optional[int],
#     played_eval_from_pre_white: Optional[float],
#     best_mate_in_plies_pre: Optional[int],
#     played_mate_in_plies_post: Optional[int],
#     mate_flip: bool,
#     params: Optional[BrilliancyParams] = None,
# ) -> BrilliancyResult:
#     """Detect whether a move is 'brilliancy-level'"""
#     if params is None:
#         params = BrilliancyParams()

#     if is_book:
#         return BrilliancyResult(is_brilliancy=False)

#     before_pov = cp_for_player(eval_before_white, mover_color)
#     after_pov  = cp_for_player(eval_after_white,  mover_color)
#     best_pov   = cp_for_player(eval_best_white,   mover_color) if eval_best_white is not None else None

#     if played_eval_from_pre_white is not None and eval_best_white is not None:
#         played_pov_pre = cp_for_player(played_eval_from_pre_white, mover_color)
#         gap_to_best = best_pov - played_pov_pre
#     elif best_pov is not None:
#         gap_to_best = best_pov - after_pov
#     else:
#         gap_to_best = None

#     rescue_gain = (best_pov - before_pov) if best_pov is not None else None
#     delta = after_pov - before_pov
#     situation = situation_from_cp(before_pov)

#     def make_result(kind: Optional[str]) -> BrilliancyResult:
#         return BrilliancyResult(
#             is_brilliancy=(kind is not None),
#             kind=kind,
#             before_pov=before_pov,
#             after_pov=after_pov,
#             best_pov=best_pov,
#             delta_cp=delta,
#             gap_to_best_cp=gap_to_best,
#             rescue_gain_cp=rescue_gain,
#         )

#     print("BRILL DEBUG:", {
#         "before_pov": before_pov,
#         "after_pov": after_pov,
#         "best_pov": best_pov,
#         "delta_cp": delta,
#         "gap_to_best_cp": gap_to_best,
#         "situation": situation_from_cp(before_pov),
#         "is_sacrifice": is_sacrifice,
#         "multipv_rank": multipv_rank,
#     })

#     def near_best_general() -> bool:
#         if best_pov is None or gap_to_best is None:
#             return False
#         return abs(gap_to_best) <= params.max_gap_to_best_cp

#     def near_best_mate_pattern() -> bool:
#         if best_pov is None or gap_to_best is None:
#             return False
#         return abs(gap_to_best) <= params.max_gap_mate_patterns_cp

#     # Attack / conversion brilliancy
#     is_attack_candidate = (
#         delta >= params.attack_min_gain_cp and
#         after_pov >= params.attack_min_final_cp
#     )
#     if is_attack_candidate and near_best_general():
#         return make_result("attack")

#     # Defensive brilliancy
#     is_lost_or_worse = before_pov <= params.defense_lost_threshold_cp
#     is_drawish_after = abs(after_pov) <= params.defense_draw_band_cp
#     defense_rescue_gain = after_pov - before_pov

#     is_defense_candidate = (
#         is_lost_or_worse and
#         is_drawish_after and
#         defense_rescue_gain >= params.defense_min_rescue_gain_cp
#     )

#     if is_defense_candidate:
#         if best_pov is None or near_best_general():
#             return make_result("defense")

#     # Stalemate / draw-rescue
#     is_very_lost = before_pov <= params.stalemate_lost_threshold_cp
#     is_drawish_after_strict = abs(after_pov) <= params.stalemate_draw_band_cp
#     stalemate_rescue_gain = after_pov - before_pov

#     is_stalemate_candidate = (
#         is_very_lost and
#         is_drawish_after_strict and
#         stalemate_rescue_gain >= params.stalemate_min_rescue_gain_cp
#     )

#     if is_stalemate_candidate:
#         if best_pov is None or near_best_mate_pattern():
#             return make_result("stalemate_rescue")

#     # Mate-flip brilliancy
#     if mate_flip:
#         eval_swing = after_pov - before_pov

#         if eval_swing >= params.min_mate_flip_eval_swing_cp and after_pov > 0:
#             return make_result("mate_flip")

#     if best_mate_in_plies_pre is not None and best_mate_in_plies_pre <= params.min_mate_depth_plies:
#         if played_mate_in_plies_post is None or played_mate_in_plies_post > best_mate_in_plies_pre + 2:
#             if after_pov - before_pov >= params.defense_min_rescue_gain_cp:
#                 if best_pov is None or near_best_mate_pattern():
#                     return make_result("mate_flip")

#     # Pure sacrifice brilliancy
#     if is_sacrifice:
#         if before_pov >= 300 and after_pov >= 300:
#             if best_pov is None or (gap_to_best is not None and abs(gap_to_best) <= 120):
#                 return make_result("attack")

#     return make_result(None)


# # ---------------------------------------------------------------------------
# # Final Exclamation Label
# # ---------------------------------------------------------------------------

# @dataclass
# class ExclamParams:
#     min_mate_flip_eval_swing_cp: int = 800


# def classify_exclam_move(
#     *,
#     eval_before_white: float,
#     eval_after_white: float,
#     eval_best_white: Optional[float],
#     mover_color: str,
#     is_sacrifice: bool,
#     is_book: bool,
#     multipv_rank: Optional[int],
#     played_eval_from_pre_white: Optional[float],
#     best_mate_in_plies_pre: Optional[int],
#     played_mate_in_plies_post: Optional[int],
#     mate_flip: bool,
#     br_params: Optional[BrilliancyParams] = None,
#     ex_params: Optional[ExclamParams] = None,
# ) -> tuple[Optional[str], BrilliancyResult]:
#     """
#     Decide if a move deserves: Brilliant (!!) / Great (!) / Blunder (mate-flip)
#     """
#     if ex_params is None:
#         ex_params = ExclamParams()

#     before_pov = cp_for_player(eval_before_white, mover_color)
#     after_pov  = cp_for_player(eval_after_white,  mover_color)
#     eval_swing = after_pov - before_pov

#     # Mate-flip catastrophe
#     if mate_flip and eval_swing <= -ex_params.min_mate_flip_eval_swing_cp:
#         dummy_result = BrilliancyResult(
#             is_brilliancy=False,
#             kind=None,
#             before_pov=before_pov,
#             after_pov=after_pov,
#             best_pov=None,
#             delta_cp=eval_swing,
#             gap_to_best_cp=None,
#             rescue_gain_cp=None,
#         )
#         return "Blunder", dummy_result

#     # General brilliancy detection
#     brill = detect_brilliancy_level(
#         eval_before_white=eval_before_white,
#         eval_after_white=eval_after_white,
#         eval_best_white=eval_best_white,
#         mover_color=mover_color,
#         is_sacrifice=is_sacrifice,
#         is_book=is_book,
#         multipv_rank=multipv_rank,
#         played_eval_from_pre_white=played_eval_from_pre_white,
#         best_mate_in_plies_pre=best_mate_in_plies_pre,
#         played_mate_in_plies_post=played_mate_in_plies_post,
#         mate_flip=mate_flip,
#         params=br_params,
#     )

#     print("EXCLAM DEBUG:", {
#         "is_brilliancy": brill.is_brilliancy,
#         "brilliancy_kind": brill.kind,
#         "is_sacrifice": is_sacrifice,
#         "before_pov": brill.before_pov,
#         "after_pov": brill.after_pov,
#         "best_pov": brill.best_pov,
#         "gap_to_best_cp": brill.gap_to_best_cp,
#     })

#     if not brill.is_brilliancy:
#         return None, brill

#     if is_sacrifice:
#         print("  → Final label: Brilliant (!! - brilliancy + sacrifice)")
#         return "Brilliant", brill
#     else:
#         print("  → Final label: Great (! - brilliancy without sacrifice)")
#         return "Great", brill






"""
basic_move_labels.py

Core engine-based move classification:
    Best / Good / Inaccuracy / Mistake / Blunder

This module assumes:
- eval_before_white and eval_after_white are Stockfish-style evaluations
  from WHITE's perspective, in centipawns, with mates mapped to big +/- values.
  (Exactly what you're already computing as eval_before_cp / eval_after_cp.)

- cpl = |best_eval_from_pre - played_eval_from_pre| from the PRE position,
  also in WHITE POV (same as your current CPL).

We convert these to the mover's POV and then classify the move.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import chess

# ---------------------------------------------------------------------------
# 1) Helpers: convert to player POV, bucket the situation
# ---------------------------------------------------------------------------

import chess
from dataclasses import dataclass
from typing import Optional

# ------------------------------------------------------------
# Piece values + simple material helper
# ------------------------------------------------------------

PIECE_VALUES = {
    chess.PAWN:   100,
    chess.KNIGHT: 300,
    chess.BISHOP: 300,
    chess.ROOK:   500,
    chess.QUEEN:  900,
}

def material_for_color(board: chess.Board, color: chess.Color) -> int:
    total = 0
    for ptype, val in PIECE_VALUES.items():
        total += len(board.pieces(ptype, color)) * val
    return total


@dataclass
class SacrificeParams:
    """
    Thresholds for sacrifice detection.
    All values are in centipawns.
    """
    # Min *net* loss (after capture + ideal recapture) to treat as real sac
    net_loss_threshold_cp: int = 180   # ~ minor piece or better

    # Min face value of the offered piece (don’t call pawn nudges “sacs”)
    min_offered_piece_cp: int = 200    # tune if you want pawn sacs


@dataclass
class SacrificeResult:
    """
    Output of detect_sacrifice().
    """
    is_real_sacrifice: bool
    # Logging info:
    worst_net_loss_cp: int          # max net (offered - taker) over accepting lines
    had_accepting_capture: bool
    offered_piece_cp: int
    num_attackers_opponent: int
    num_attackers_mover: int


def detect_sacrifice(
    board: chess.Board,
    move: chess.Move,
    params: Optional[SacrificeParams] = None,
) -> SacrificeResult:
    """
    Detect whether `move` is a *real* material sacrifice, using local exchange logic:

    - Look at the piece we move to the target square.
    - From the position after our move, consider all *legal* opponent captures
      on that square ("accepting the sac").
    - For each capture, approximate net loss:

        if we have NO defenders:
            net_loss = value(our_piece)
        else if attacker is not king:
            net_loss = value(our_piece) - value(attacker)
        else:
            # king capture on defended piece is not treated as sac

    - If the worst net_loss >= net_loss_threshold_cp, we call it a sacrifice.
    """
    if params is None:
        params = SacrificeParams()

    mover_color = board.turn
    opponent_color = not mover_color

    # --- determine what is captured BEFORE move is applied ---
    captured_cp = 0
    moving_piece = board.piece_at(move.from_square)

    if moving_piece is None:
        return SacrificeResult(
            is_real_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=0,
            num_attackers_opponent=0,
            num_attackers_mover=0,
        )

    if board.is_capture(move):
        if board.is_en_passant(move):
            captured_cp = PIECE_VALUES[chess.PAWN]
        else:
            captured_piece = board.piece_at(move.to_square)
            if captured_piece and captured_piece.color == opponent_color:
                captured_cp = PIECE_VALUES.get(captured_piece.piece_type, 0)

    

    # Position before move (for logging only)
    # material_before = material_for_color(board, mover_color)

    # Apply our move: now it's opponent's turn
    b1 = board.copy(stack=False)
    b1.push(move)

    target_sq = move.to_square
    piece = b1.piece_at(target_sq)

    # Defaults for "not a normal sac pattern"
    offered_piece_cp = 0
    num_attackers_opponent = 0
    num_attackers_mover = 0
    worst_net_loss = 0
    had_accepting_capture = False
    is_real_sac = False

    # If there is no piece of ours on the target square after the move,
    # we don't treat this as a standard "offer this piece" sac.
    if piece is None or piece.color != mover_color:
        return SacrificeResult(
            is_real_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=0,
            num_attackers_opponent=0,
            num_attackers_mover=0,
        )

    # offered_piece_cp = PIECE_VALUES.get(piece.piece_type, 0)




    # if offered_piece_cp < params.min_offered_piece_cp:
    #     # too small to care (you can lower this to include pawn sacs)
    #     return SacrificeResult(
    #         is_real_sacrifice=False,
    #         worst_net_loss_cp=0,
    #         had_accepting_capture=False,
    #         offered_piece_cp=offered_piece_cp,
    #         num_attackers_opponent=0,
    #         num_attackers_mover=0,
    #     )

    offered_piece_cp = PIECE_VALUES.get(piece.piece_type, 0)

    # How much net material are we really putting at risk,
    # after accounting for the piece we just captured?
    risk_face_cp = max(0, offered_piece_cp - captured_cp)

    # If risk_face_cp is small, don’t treat this as a sacrifice.
    # This kills cases like QxQ where captured_cp == offered_piece_cp.
    if risk_face_cp < params.min_offered_piece_cp:
        return SacrificeResult(
            is_real_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=offered_piece_cp,
            num_attackers_opponent=0,
            num_attackers_mover=0,
        )


    # Attackers after our move
    attackers_opponent = list(b1.attackers(opponent_color, target_sq))
    attackers_mover    = list(b1.attackers(mover_color, target_sq))

    num_attackers_opponent = len(attackers_opponent)
    num_attackers_mover    = len(attackers_mover)

    # If opponent has no attackers, no one can even "accept" the sac
    if num_attackers_opponent == 0:
        return SacrificeResult(
            is_real_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=offered_piece_cp,
            num_attackers_opponent=num_attackers_opponent,
            num_attackers_mover=num_attackers_mover,
        )

    # All legal moves where opponent captures on the target square
    accepting_moves = [
        mv for mv in b1.legal_moves
        if b1.is_capture(mv) and mv.to_square == target_sq
    ]
    had_accepting_capture = len(accepting_moves) > 0

    # Now evaluate net loss for each accepting capture
    for accept in accepting_moves:
        # Which piece is doing the capture?
        attacker_piece = b1.piece_at(accept.from_square)
        if attacker_piece is None:
            continue

        # Specifically handle king: if king is the ONLY attacker and we have backup,
        # we usually don't treat that as a sac in your definition.
        if attacker_piece.piece_type == chess.KING and num_attackers_mover > 0:
            # Treat "defended queen vs king" as non-sac line
            continue

        attacker_val = PIECE_VALUES.get(attacker_piece.piece_type, 0)

        # Do we have any defenders at all?
        has_defender = num_attackers_mover > 0

        # if not has_defender:
        #     # If no one can recapture, we lose the *full* piece value
        #     net_loss = offered_piece_cp
        # else:
        #     # If we *can* recapture:
        #     #   Queen taken by queen => net_loss ~ 0 (swap queens)
        #     #   Queen taken by rook  => net_loss ~ 900 - 500 = 400 (real sac)
        #     #   Rook taken by bishop => net_loss ~ 500 - 300 = 200 (maybe sac)
        #     net_loss = offered_piece_cp - attacker_val

        if not has_defender:
            # We can lose *all* of the risked material
            net_loss = risk_face_cp
        else:
            # We lose risk_face_cp but may get attacker back.
            # Rough approximation: net loss = risk - attacker_val
            net_loss = risk_face_cp - attacker_val


        if net_loss > worst_net_loss:
            worst_net_loss = net_loss

    # Final decision: treat as real sacrifice if worst net_loss is large enough
    if had_accepting_capture and worst_net_loss >= params.net_loss_threshold_cp:
        is_real_sac = True

    # Optional debug:
    print("SAC DEBUG:", {
        "move": move.uci(),
        "offered_piece_cp": offered_piece_cp,
        "captured_cp": captured_cp,
        "risk_face_cp": risk_face_cp,
        "num_attackers_opponent": num_attackers_opponent,
        "num_attackers_mover": num_attackers_mover,
        "worst_net_loss_cp": worst_net_loss,
        "had_accepting_capture": had_accepting_capture,
        "is_real_sacrifice": is_real_sac,
    })

    return SacrificeResult(
        is_real_sacrifice=is_real_sac,
        worst_net_loss_cp=worst_net_loss,
        had_accepting_capture=had_accepting_capture,
        offered_piece_cp=offered_piece_cp,
        num_attackers_opponent=num_attackers_opponent,
        num_attackers_mover=num_attackers_mover,
    )


def is_real_sacrifice(board: chess.Board, move: chess.Move, params: Optional[SacrificeParams] = None) -> bool:
    return detect_sacrifice(board, move, params).is_real_sacrifice


##--------------------End Sacrifice Logic------------------


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
    Bucket the mover's position into rough game states, using
    evaluation from the mover's perspective (cp_player).

    Tunable thresholds, but these are a good starting point.
    """
    if cp_player >= 800:
        return "Won"          # totally winning (e.g. +8.0 or more)
    if cp_player >= 300:
        return "Winning"      # clearly better
    if cp_player > -300:
        return "Equalish"     # roughly equal / unclear
    if cp_player > -800:
        return "Worse"        # clearly worse
    return "Lost"             # basically busted


# ---------------------------------------------------------------------------
# 2) Base label from CPL only
# ---------------------------------------------------------------------------

# Order from best to worst:
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
    """
    Ensure label is at least as severe as 'minimum' (towards Blunder).

    Example:
        promote_label("Inaccuracy", "Mistake") -> "Mistake"
        promote_label("Blunder", "Mistake")    -> "Blunder"
    """
    if LABEL_RANK[current] < LABEL_RANK[minimum]:
        return minimum
    return current


def soften_label(current: str, maximum: str) -> str:
    """
    Cap label so it is no more severe than 'maximum'.

    Example:
        soften_label("Blunder", "Mistake") -> "Mistake"
        soften_label("Good", "Mistake")    -> "Good"
    """
    if LABEL_RANK[current] > LABEL_RANK[maximum]:
        return maximum
    return current


# ---------------------------------------------------------------------------
# 3) Main classifier for the core 6 labels
# ---------------------------------------------------------------------------

def classify_basic_move(
    eval_before_white: float,
    eval_after_white: float,
    cpl: float | None,
    mover_color: str,           # 'w' or 'b'
    multipv_rank: int | None,   # 1..K or None if unknown
) -> str:
    """
    Core 6-type classifier:
        Best / Excellent / Good / Inaccuracy / Mistake / Blunder

    Args:
        eval_before_white:
            Engine eval BEFORE the move, from WHITE's perspective (cp).
        eval_after_white:
            Engine eval AFTER the move, from WHITE's perspective (cp).
        cpl:
            Centipawn loss vs engine best from the PRE position (>= 0 or None).
        mover_color:
            Which side made the move: 'w' for White, 'b' for Black.
        multipv_rank:
            Rank of the played move in the PRE multiPV (1 = engine best).
    """

    # ---------- Convert to player POV ----------
    player_before = cp_for_player(eval_before_white, mover_color)
    player_after  = cp_for_player(eval_after_white,  mover_color)
    player_delta  = player_after - player_before   # >0 helped mover, <0 hurt mover

    before_state = situation_from_cp(player_before)
    after_state  = situation_from_cp(player_after)

    # Normalize CPL
    if cpl is None:
        # crude fallback: at least use how much eval changed for the mover
        cpl = abs(player_delta)

    # ---------- 1) Base label from CPL ----------
    label = base_label_from_cpl(cpl, multipv_rank)

    # ---------- 2) Throwing away a win (punish harder) ----------
    if before_state in ("Winning", "Won") and after_state in ("Equalish", "Worse", "Lost"):
        # You were clearly better, now not anymore
        if cpl >= 300:
            label = promote_label(label, "Blunder")
        elif cpl >= 200:
            label = promote_label(label, "Mistake")

    # ---------- 3) Already totally lost (soften a bit) ----------
    if before_state == "Lost" and after_state == "Lost":
        # Don’t spam blunders in a -10 vs -12 type position
        label = soften_label(label, "Mistake")   # cap at Mistake
        if label == "Mistake" and cpl <= 250:
            label = "Inaccuracy"

    # ---------- 4) Normal positions: tweak by player_delta ----------
    # Large improvement for mover → be kinder than pure CPL
    if player_delta >= 100:  # mover improved by ≥ 1 pawn
        if label == "Blunder":
            label = "Mistake"
        elif label == "Mistake":
            label = "Inaccuracy"
        elif label == "Inaccuracy":
            label = "Good"

    # Large worsening for mover → be harsher
    if player_delta <= -150:  # mover worsened by ≥ 1.5 pawns
        if label == "Good":
            label = "Inaccuracy"
        elif label == "Inaccuracy" and cpl >= 150:
            label = "Mistake"

    # ---------- 5) Huge rescue (optional but nice) ----------
    # From completely lost to at least "not dead" with big improvement
    if before_state == "Lost" and after_state in ("Equalish", "Winning", "Won"):
        if player_delta >= 300:  # improved by ≥ 3 pawns
            # Never call such a move worse than Good
            if LABEL_RANK[label] > LABEL_RANK["Good"]:
                label = "Good"

    # ---------- 6) Already totally winning (soften a bit, symmetric to Lost->Lost) ----------
    if before_state == "Won" and after_state == "Won":
        # Don't spam blunders when you're +10 and stay +10/+12
        label = soften_label(label, "Mistake")   # cap at Mistake
        if label == "Mistake" and cpl <= 250:
            label = "Inaccuracy"

    print("before", before_state, "after state", after_state)

    return label


# ---------------------------------------------------------------------------
# 4) "Miss" detection (tactical / concrete chance missed, but no self-harm)
# ---------------------------------------------------------------------------

# @dataclass
# class MissParams:
#     # We only call something Miss if the move itself didn't really damage the eval
#     max_self_drop_cp: int = 80          # if mover worsens more than this, it's not a Miss

#     # How big the missed opportunity must be (in mover POV)
#     min_opportunity_cp: int = 250       # generic "big chance" threshold
#     tactical_min_gain_cp: int = 350     # clear tactical/material win (~pawn+)

#     # Bands for interpretation
#     still_winning_cp: int = 300         # ≥ this is clearly winning
#     equal_band_cp: int = 150           # |cp| ≤ this is "equalish"
#     still_ok_cp: int = 120             # ≥ -this counts as drawable / OK

#     # How much improvement counts as save / conversion
#     min_save_gain_cp: int = 300        # for "missed save" (lost → drawable)
#     min_conversion_gain_cp: int = 250  # small edge → big edge

@dataclass
class MissParams:
    max_self_drop_cp: int = 120        # was 80
    min_opportunity_cp: int = 200      # was 250
    tactical_min_gain_cp: int = 300    # was 350

    still_winning_cp: int = 300
    equal_band_cp: int = 150          # tighter "equalish" zone, was 150
    still_ok_cp: int = 120

    min_save_gain_cp: int = 250       # was 300
    min_conversion_gain_cp: int = 200 # was 250


def detect_miss(
    eval_before_white: float,
    eval_after_white: float,
    eval_best_white: Optional[float],
    mover_color: str,
    *,
    best_mate_in_plies: Optional[int] = None,
    played_mate_in_plies: Optional[int] = None,   # reserved if we need later
    params: Optional[MissParams] = None,
) -> bool:
    """
    Pure 'Miss' detector. Does NOT depend on any of your old miss logic.

    All eval_* are from WHITE's perspective.
    It converts to mover POV internally.

    Returns:
        True  -> classify as 'Miss'
        False -> do NOT classify as 'Miss'
    """
    if params is None:
        params = MissParams()

    # Need best-line eval; otherwise we don't know the missed opportunity.
    if eval_best_white is None:
        return False

    # Convert everything to mover POV
    before_pov = cp_for_player(eval_before_white, mover_color)
    after_pov  = cp_for_player(eval_after_white,  mover_color)
    best_pov   = cp_for_player(eval_best_white,   mover_color)

    # Deltas
    self_drop   = before_pov - after_pov        # >0 means we worsened our own eval
    opportunity = best_pov   - before_pov       # how much better best-line is vs current
    miss_gap    = best_pov   - after_pov        # how much better best-line is vs what we got

    print("MISS DEBUG:", {
        "before_pov": before_pov,
        "after_pov": after_pov,
        "best_pov": best_pov,
        "self_drop": self_drop,
        "opportunity": opportunity,
        "miss_gap": miss_gap,
        "situation": situation_from_cp(before_pov),
    })

    # --- Global gates ---
    # If we clearly worsened the eval, this move belongs to Inaccuracy/Mistake/Blunder, not Miss.
    if self_drop > params.max_self_drop_cp:
        return False

    # If the missed improvement is small, not a Miss.
    # if opportunity < params.min_opportunity_cp or miss_gap < params.min_opportunity_cp:
    if opportunity < params.min_opportunity_cp and miss_gap < params.min_opportunity_cp:
        return False

    situation = situation_from_cp(before_pov)  # uses the same Won/Winning/Equalish/Worse/Lost mapping you already have

    # --- 1) Missed mate / kill shot while still winning ---

    if best_mate_in_plies is not None:
        # best line contains a mate for the mover
        if (
            best_pov  >= params.still_winning_cp and
            after_pov >= params.still_winning_cp
        ):
            # you had a forced mate and still stayed winning, but didn’t take it
            return True

    # Even without mate, a huge boost while staying winning -> kill shot missed
    if (
        situation in ("Winning", "Won") and
        before_pov >= params.still_winning_cp and
        best_pov   >= before_pov + params.tactical_min_gain_cp and
        after_pov  >= params.still_winning_cp
    ):
        return True

    # --- 2) Missed defensive resource / save (lost -> drawable) ---

    if situation in ("Worse", "Lost"):
        if (
            opportunity >= params.min_save_gain_cp and
            best_pov   >= -params.still_ok_cp  # best line gives at least drawable chances
        ):
            return True

    # --- 3) Missed conversion (edge -> big edge) ---

    if situation in ("Winning", "Equalish"):
        if (
            opportunity >= params.min_conversion_gain_cp and
            best_pov   >= before_pov + params.min_conversion_gain_cp
        ):
            return True

    # --- 4) Generic tactical Miss: equalish, big tactical jump available ---

    is_equalish = abs(before_pov) <= params.equal_band_cp
    is_big_tactical = (
        best_pov >= before_pov + params.tactical_min_gain_cp and
        best_pov >= params.tactical_min_gain_cp
    )

    if is_equalish and is_big_tactical:
        return True

    # --- 5) Fallback: big opportunity, small self-harm -> generic Miss ---

    if opportunity >= params.min_opportunity_cp:
        return True

    return False


# ---------------------------------------------------------------------------
# BOOK MOVE DETECTION
# ---------------------------------------------------------------------------

@dataclass
class BookParams:
    """
    Book parameters placeholder.
    We now rely ONLY on a real opening database (Polyglot),
    so no heuristic thresholds are used here anymore.
    """
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
    """
    Decide whether a move should be labeled 'Book'.

    NEW SIMPLE RULE:
    - Only return True if the move is found in the real opening DB
      (Polyglot `book.bin` via opening_book.is_book_move).
    - Ignore all heuristic logic based on eval, CPL, move number, etc.

    This guarantees:
    - No 'Book' labels in random middle-game/end-game FENs.
    - No 'Book' labels if the book file is missing.
    """
    # Only trust the real DB signal
    return bool(in_opening_db)


# ---------------------------------------------------------------------------
# 5) Brilliancy-level detection (OLD general patterns, still kept)
# ---------------------------------------------------------------------------

@dataclass
class BrilliancyParams:
    """
    Tunables for detecting brilliancy-level moves.
    All values are in centipawns from the mover's POV.
    """

    # How close to engine best the move must be (general)
    max_gap_to_best_cp: int = 60          # ≈ 0.6 pawn

    # For very sharp mate / stalemate rescues we allow a bit more slack
    max_gap_mate_patterns_cp: int = 120   # ≈ 1.2 pawns

    # --- Attack/conversion brilliancy (equal/small edge -> big win) ---
    attack_min_gain_cp: int = 200         # how much the eval must improve
    attack_min_final_cp: int = 300        # final eval must be at least clearly winning

    # --- Defensive brilliancy (lost -> drawable/ok) ---
    defense_lost_threshold_cp: int = -250 # before <= this => clearly worse/lost
    defense_draw_band_cp: int = 80        # after in [-80, +80] => drawable/ok
    defense_min_rescue_gain_cp: int = 350 # gain from before to after

    # --- Stalemate/draw-rescue brilliancy (very lost -> draw) ---
    stalemate_lost_threshold_cp: int = -500   # really lost before
    stalemate_draw_band_cp: int = 60         # after very close to 0.00
    stalemate_min_rescue_gain_cp: int = 600  # huge swing to draw

    # --- Mate-flip brilliancy ---
    min_mate_flip_eval_swing_cp: int = 800    # swing in eval to treat as brilliancy
    min_mate_depth_plies: int = 1             # mate depth must be at least this


@dataclass
class BrilliancyResult:
    """
    Result of the brilliancy-level detector.

    kind can be:
      "attack"
      "defense"
      "stalemate_rescue"
      "mate_flip"
      None
    """
    is_brilliancy: bool
    kind: Optional[str] = None
    # debug info for tuning:
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
    """
    OLD general brilliancy detector (attack/defense/stalemate/mate-flip patterns).
    Kept for compatibility. New sac-based brilliancy logic is added later.
    """
    if params is None:
        params = BrilliancyParams()

    # 0) Never call Book moves brilliant
    if is_book:
        return BrilliancyResult(is_brilliancy=False)

    # Convert evals to mover POV
    before_pov = cp_for_player(eval_before_white, mover_color)
    after_pov  = cp_for_player(eval_after_white,  mover_color)
    best_pov   = cp_for_player(eval_best_white,   mover_color) if eval_best_white is not None else None

    # If we know eval of played move from PRE, use that for gap_to_best; else use AFTER.
    if played_eval_from_pre_white is not None and eval_best_white is not None:
        played_pov_pre = cp_for_player(played_eval_from_pre_white, mover_color)
        gap_to_best = best_pov - played_pov_pre
    elif best_pov is not None:
        gap_to_best = best_pov - after_pov
    else:
        gap_to_best = None

    # Rescue gain if best_pov is known
    rescue_gain = (best_pov - before_pov) if best_pov is not None else None

    delta = after_pov - before_pov

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

    print("BRILL DEBUG (OLD):", {
        "before_pov": before_pov,
        "after_pov": after_pov,
        "best_pov": best_pov,
        "delta_cp": delta,
        "gap_to_best_cp": gap_to_best,
        "situation": situation_from_cp(before_pov),
        "is_sacrifice": is_sacrifice,
        "multipv_rank": multipv_rank,
    })

    # Small helpers
    def near_best_general() -> bool:
        """Near-best constraint for non-mate patterns."""
        if best_pov is None or gap_to_best is None:
            return False
        return abs(gap_to_best) <= params.max_gap_to_best_cp

    def near_best_mate_pattern() -> bool:
        """Looser near-best for mate / stalemate patterns."""
        if best_pov is None or gap_to_best is None:
            return False
        return abs(gap_to_best) <= params.max_gap_mate_patterns_cp

    # -----------------------------------------------------------------------
    # Pattern A: Attack / conversion brilliancy
    # (equal/small edge -> clearly winning)
    # -----------------------------------------------------------------------
    is_attack_candidate = (
        delta >= params.attack_min_gain_cp and
        after_pov >= params.attack_min_final_cp
    )
    if is_attack_candidate and near_best_general():
        return make_result("attack")

    # -----------------------------------------------------------------------
    # Pattern B: Defensive brilliancy (lost -> drawable/ok)
    # -----------------------------------------------------------------------
    is_lost_or_worse = before_pov <= params.defense_lost_threshold_cp
    is_drawish_after = abs(after_pov) <= params.defense_draw_band_cp
    defense_rescue_gain = after_pov - before_pov

    is_defense_candidate = (
        is_lost_or_worse and
        is_drawish_after and
        defense_rescue_gain >= params.defense_min_rescue_gain_cp
    )

    if is_defense_candidate:
        # Prefer near-best if we know best_pov, otherwise trust the rescue shape.
        if best_pov is None or near_best_general():
            return make_result("defense")

    # -----------------------------------------------------------------------
    # Pattern C: Stalemate / draw-rescue brilliancy
    # (very lost -> near-0 draw; typical "sacrifice for stalemate" scenario)
    # -----------------------------------------------------------------------
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

    # -----------------------------------------------------------------------
    # Pattern D: Mate-flip / mate-rescue brilliancy
    # -----------------------------------------------------------------------
    if mate_flip:
        eval_swing = after_pov - before_pov

        # Good mate flip for mover: big positive swing and final eval > 0
        if eval_swing >= params.min_mate_flip_eval_swing_cp and after_pov > 0:
            return make_result("mate_flip")

    # Also treat "killing a short mate against us" as a mate-rescue brilliancy.
    if best_mate_in_plies_pre is not None and best_mate_in_plies_pre <= params.min_mate_depth_plies:
        # There was a very short mate in the best line (against the mover).
        # If after our move the mate disappears or becomes much longer and eval improves a lot,
        # this is a brilliancy-level save.
        if played_mate_in_plies_post is None or played_mate_in_plies_post > best_mate_in_plies_pre + 2:
            if after_pov - before_pov >= params.defense_min_rescue_gain_cp:
                if best_pov is None or near_best_mate_pattern():
                    return make_result("mate_flip")

    # -----------------------------------------------------------------------
    # Pattern E: Pure sacrifice brilliancy in a winning position (OLD)
    # -----------------------------------------------------------------------
    if is_sacrifice:
        # Must be at least clearly better before and after
        if before_pov >= 300 and after_pov >= 300:
            # Engine should not hate the move
            if best_pov is None or (gap_to_best is not None and abs(gap_to_best) <= 120):
                return make_result("attack")

    # -----------------------------------------------------------------------
    # No brilliancy pattern matched
    # -----------------------------------------------------------------------
    return make_result(None)


# ---------------------------------------------------------------------------
# 6) Final exclamation label helper (Brilliant !! / Great ! / mate-flip Blunder)
# ---------------------------------------------------------------------------

@dataclass
class ExclamParams:
    """
    Parameters for mapping brilliancy + mate-flip into:
        - Brilliant (!!)
        - Great (!)
        - Blunder (for catastrophic mate-flip against mover)
    """
    min_mate_flip_eval_swing_cp: int = 800  # same idea as in BrilliancyParams


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
    Decide if a move deserves a special exclamation label, using OLD general patterns:

        - Brilliant (!!)  -> brilliancy-level AND is_sacrifice
        - Great (!)       -> brilliancy-level AND NOT is_sacrifice
        - Blunder         -> catastrophic mate-flip against the mover
        - None            -> no special exclam label (fall back to Best/Good/etc.)

    NEW sac-based brilliancy logic is provided separately (see detect_sac_brilliancy).
    """
    if ex_params is None:
        ex_params = ExclamParams()

    # First: compute mover POV evals
    before_pov = cp_for_player(eval_before_white, mover_color)
    after_pov  = cp_for_player(eval_after_white,  mover_color)
    eval_swing = after_pov - before_pov

    # 1) Mate-flip catastrophe (Blunder) check
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

    # 2) General brilliancy-level detection (OLD)
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

    print("EXCLAM DEBUG (OLD):", {
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


# ---------------------------------------------------------------------------
# 7) NEW sacrifice-based brilliancy detector (your custom logic)
# ---------------------------------------------------------------------------

@dataclass
class SacBrilliancyParams:
    """
    Tunables for sacrifice-based brilliancy (your definition):

    - Move is a REAL sacrifice (detect_sacrifice says so)
    - After opponent's BEST REPLY, mover is clearly better
    - Even if opponent ACCEPTS the sac, mover is clearly better
    - Engine does not hate the move (close enough to best from PRE)
    - NEW: The move does not throw away too much advantage (max_adv_drop_cp)
    """
    # How good the mover must be AFTER opponent's best reply
    win_after_reply_cp: int = 120   # ≈ +1.2 pawn advantage

    # How good the mover must be even if opponent ACCEPTS the sac
    win_after_accept_cp: int = 80   # ≈ +0.8 pawn advantage

    # How far from engine best we allow the sac move to be (from PRE)
    max_gap_to_best_cp: int = 120   # ≈ 1.2 pawns

    # NEW: maximum drop in the mover's advantage we tolerate
    # (adv_before_mover - adv_after_best_reply) ≤ max_adv_drop_cp
    max_adv_drop_cp: int = 80       # ≈ 0.8 pawn drop allowed


@dataclass
class SacBrilliancyResult:
    is_brilliant: bool
    reason: str
    adv_before_mover: float
    adv_after_best_reply: float
    adv_after_accept: Optional[float]
    gap_to_best_cp: Optional[float]
    is_real_sacrifice: bool


def adv_for_mover(eval_white_cp: float, mover_color: str) -> float:
    """
    Convert White-POV eval into 'advantage for mover', without changing your
    internal White-only eval model.
    """
    return eval_white_cp if mover_color == "w" else -eval_white_cp


def detect_sac_brilliancy(
    *,
    eval_before_white: float,
    eval_after_white: float,
    eval_best_pre_white: Optional[float],
    eval_played_pre_white: Optional[float],
    eval_best_reply_white: float,
    eval_accept_white: Optional[float],
    mover_color: str,         # 'w' or 'b'
    sac_result: "SacrificeResult",
    params: Optional[SacBrilliancyParams] = None,
) -> SacBrilliancyResult:
    """
    NEW brilliancy logic that matches your verbal definition:

      - Mover plays a REAL sacrifice (piece hangs with no backup and net material loss)
      - After opponent's BEST reply (whether he takes or not), mover is clearly better
      - Even if opponent ACCEPTS the sac, mover is still clearly better
      - Engine does not hate the sac (gap to best small)
      - NEW: Mover does not throw away too much of their advantage

    All eval_* are from WHITE POV.
    """
    if params is None:
        params = SacBrilliancyParams()

    # -----------------------------------------------------------------------
    # 0) Must be a real sacrifice
    # -----------------------------------------------------------------------
    if not sac_result.is_real_sacrifice:
        return SacBrilliancyResult(
            is_brilliant=False,
            reason="not_sacrifice",
            adv_before_mover=adv_for_mover(eval_before_white, mover_color),
            adv_after_best_reply=adv_for_mover(eval_best_reply_white, mover_color),
            adv_after_accept=None if eval_accept_white is None else adv_for_mover(eval_accept_white, mover_color),
            gap_to_best_cp=None,
            is_real_sacrifice=False,
        )

    # -----------------------------------------------------------------------
    # 1) Convert evals to "advantage for mover"
    # -----------------------------------------------------------------------
    adv_before_mover = adv_for_mover(eval_before_white, mover_color)
    adv_after_reply  = adv_for_mover(eval_best_reply_white, mover_color)

    adv_after_accept: Optional[float] = None
    if eval_accept_white is not None:
        adv_after_accept = adv_for_mover(eval_accept_white, mover_color)

    # -----------------------------------------------------------------------
    # 2) Engine gap-to-best from PRE (CPL-style)
    # -----------------------------------------------------------------------
    gap_to_best: Optional[float] = None
    if eval_best_pre_white is not None:
        # If the caller didn't give a separate "played from PRE" eval, fall back
        # to eval_after_white (still from White POV)
        played_pre = eval_played_pre_white if eval_played_pre_white is not None else eval_after_white

        if mover_color == 'w':
            # For White: gap = best - played (positive => our move is worse)
            gap_to_best = eval_best_pre_white - played_pre
        else:
            # For Black: more negative eval is better for us.
            # best_eval_white < played_eval_white -> our move is worse for Black
            gap_to_best = played_pre - eval_best_pre_white

    gap_ok = True
    if gap_to_best is not None:
        gap_ok = (gap_to_best <= params.max_gap_to_best_cp)

    # -----------------------------------------------------------------------
    # 3) NEW: advantage drop constraint (how much did we worsen?)
    # -----------------------------------------------------------------------
    # Positive adv_drop means our position got worse for the mover.
    adv_drop = adv_before_mover - adv_after_reply

    drop_ok = True
    # Only apply the drop constraint if we were already clearly winning.
    if adv_before_mover > params.win_after_reply_cp:
        drop_ok = (adv_drop <= params.max_adv_drop_cp)

    # -----------------------------------------------------------------------
    # 4) Basic win/draw conditions for the sac
    # -----------------------------------------------------------------------
    # Mover must be clearly better after best reply
    win_after_reply_ok = (adv_after_reply >= params.win_after_reply_cp)

    # Mover must be clearly better even after ACCEPTING the sac
    if eval_accept_white is not None:
        win_after_accept_ok = (adv_after_accept >= params.win_after_accept_cp)
    else:
        # If no accepting capture exists, don't require this condition
        win_after_accept_ok = True

    # --- thresholds for draw-rescue brilliance ---
    lost_threshold_cp = 300   # ≥ 3 pawns worse = clearly lost
    draw_band_cp      = 60    # |cp| ≤ 0.6 pawn = essentially draw

    # -----------------------------------------------------------------------
    # 5a) Mode 1: winning sac brilliancy (existing + new drop_ok)
    # -----------------------------------------------------------------------
    winning_sac = (
        sac_result.is_real_sacrifice
        and win_after_reply_ok
        and win_after_accept_ok
        and gap_ok
        and drop_ok
    )

    # -----------------------------------------------------------------------
    # 5b) Mode 2: draw-rescue sac brilliancy
    # -----------------------------------------------------------------------
    draw_rescue_sac = (
        sac_result.is_real_sacrifice
        and adv_before_mover <= -lost_threshold_cp           # we were lost
        and abs(adv_after_reply) <= draw_band_cp             # now it's drawn
        and (adv_after_accept is None or abs(adv_after_accept) <= draw_band_cp)
        and gap_ok
    )

    # -----------------------------------------------------------------------
    # 6) Final decision + reason
    # -----------------------------------------------------------------------
    is_brilliant = winning_sac or draw_rescue_sac

    if winning_sac:
        reason = "real_sac_and_still_winning"
    elif draw_rescue_sac:
        reason = "real_sac_draw_rescue"
    else:
        if not win_after_reply_ok and not draw_rescue_sac:
            reason = "not_winning_or_drawing_after_best_reply"
        elif eval_accept_white is not None and not win_after_accept_ok:
            reason = "not_winning_after_accept"
        elif not gap_ok:
            reason = "engine_hates_sac"
        elif not drop_ok:
            reason = "too_much_advantage_lost"
        else:
            reason = "unknown_fail"

    print("BRILL DEBUG (SAC-BASED):", {
        "mover_color": mover_color,
        "adv_before_mover": adv_before_mover,
        "adv_after_best_reply": adv_after_reply,
        "adv_after_accept": adv_after_accept,
        "gap_to_best_cp": gap_to_best,
        "adv_drop": adv_drop,
        "is_real_sacrifice": sac_result.is_real_sacrifice,
        "win_after_reply_ok": win_after_reply_ok,
        "win_after_accept_ok": win_after_accept_ok,
        "gap_ok": gap_ok,
        "drop_ok": drop_ok,
        "is_brilliant": is_brilliant,
        "reason": reason,
    })

    return SacBrilliancyResult(
        is_brilliant=is_brilliant,
        reason=reason,
        adv_before_mover=adv_before_mover,
        adv_after_best_reply=adv_after_reply,
        adv_after_accept=adv_after_accept,
        gap_to_best_cp=gap_to_best,
        is_real_sacrifice=sac_result.is_real_sacrifice,
    )
















# @dataclass
# class SacBrilliancyParams:
#     """
#     Tunables for sacrifice-based brilliancy (your definition):

#     - Move is a REAL sacrifice (detect_sacrifice says so)
#     - After opponent's BEST REPLY, mover is clearly better
#     - Even if opponent ACCEPTS the sac, mover is clearly better
#     - Engine does not hate the move (close enough to best from PRE)
#     """
#     # How good the mover must be AFTER opponent's best reply
#     win_after_reply_cp: int = 120   # ≈ +1.2 pawn advantage

#     # How good the mover must be even if opponent ACCEPTS the sac
#     win_after_accept_cp: int = 80   # ≈ +0.8 pawn advantage

#     # How far from engine best we allow the sac move to be (from PRE)
#     max_gap_to_best_cp: int = 120   # ≈ 1.2 pawns

#     # NEW: how much advantage you're allowed to lose and still call it brilliant
#     max_adv_drop_cp: int = 80       # ≈ 0.8 pawn drop


# @dataclass
# class SacBrilliancyResult:
#     is_brilliant: bool
#     reason: str
#     adv_before_mover: float
#     adv_after_best_reply: float
#     adv_after_accept: Optional[float]
#     gap_to_best_cp: Optional[float]
#     is_real_sacrifice: bool


# def adv_for_mover(eval_white_cp: float, mover_color: str) -> float:
#     """
#     Convert White-POV eval into 'advantage for mover', without changing your
#     internal White-only eval model.
#     """
#     return eval_white_cp if mover_color == "w" else -eval_white_cp


# def detect_sac_brilliancy(
#     *,
#     eval_before_white: float,
#     eval_after_white: float,
#     eval_best_pre_white: Optional[float],
#     eval_played_pre_white: Optional[float],
#     eval_best_reply_white: float,
#     eval_accept_white: Optional[float],
#     mover_color: str,         # 'w' or 'b'
#     sac_result: SacrificeResult,
#     params: Optional[SacBrilliancyParams] = None,
# ) -> SacBrilliancyResult:
#     """
#     NEW brilliancy logic that matches your verbal definition:

#       - Mover plays a REAL sacrifice (piece hangs with no backup and net material loss)
#       - After opponent's BEST reply (whether he takes or not), mover is clearly better
#       - Even if opponent ACCEPTS the sac, mover is still clearly better
#       - Engine does not hate the sac (gap to best small)

#     All eval_* are from WHITE POV.
#     """
#     if params is None:
#         params = SacBrilliancyParams()

#     # 0) Must be a real sacrifice
#     if not sac_result.is_real_sacrifice:
#         return SacBrilliancyResult(
#             is_brilliant=False,
#             reason="not_sacrifice",
#             adv_before_mover=adv_for_mover(eval_before_white, mover_color),
#             adv_after_best_reply=adv_for_mover(eval_best_reply_white, mover_color),
#             adv_after_accept=None,
#             gap_to_best_cp=None,
#             is_real_sacrifice=False,
#         )

#     # 1) Convert evals to "advantage for mover"
#     adv_before_mover = adv_for_mover(eval_before_white, mover_color)
#     adv_after_reply  = adv_for_mover(eval_best_reply_white, mover_color)

#     adv_after_accept = None
#     if eval_accept_white is not None:
#         adv_after_accept = adv_for_mover(eval_accept_white, mover_color)

#     # 2) Engine gap-to-best from PRE
#     gap_to_best = None
#     if eval_best_pre_white is not None:
#         played_pre = eval_played_pre_white if eval_played_pre_white is not None else eval_after_white

#         if mover_color == 'w':
#             # For White: gap = best - played (positive => our move is worse)
#             gap_to_best = eval_best_pre_white - played_pre
#         else:
#             # For Black: more negative eval is better.
#             # best_eval_white < played_eval_white -> our move is worse for Black
#             gap_to_best = played_pre - eval_best_pre_white

#     gap_ok = True
#     if gap_to_best is not None:
#         gap_ok = (gap_to_best <= params.max_gap_to_best_cp)

#     # 3) Mover must be clearly better after best reply
#     win_after_reply_ok = (adv_after_reply >= params.win_after_reply_cp)

#     # 4) Mover must be clearly better even after ACCEPTING the sac
#     if eval_accept_white is not None:
#         win_after_accept_ok = (adv_after_accept >= params.win_after_accept_cp)
#     else:
#         # If no accepting capture exists, don't require this condition
#         win_after_accept_ok = True

#         # --- NEW: thresholds for draw-rescue brilliance ---
#     lost_threshold_cp = 300   # ≥ 3 pawns worse = clearly lost
#     draw_band_cp      = 60    # |cp| ≤ 0.6 pawn = essentially draw


    
#     # 5a) Mode 1: winning sac brilliancy (existing)
#     winning_sac = (
#         sac_result.is_real_sacrifice
#         and win_after_reply_ok
#         and win_after_accept_ok
#         and gap_ok
#     )

#     # 5b) Mode 2: draw-rescue sac brilliancy
#     draw_rescue_sac = (
#         sac_result.is_real_sacrifice
#         and adv_before_mover <= -lost_threshold_cp           # we were lost
#         and abs(adv_after_reply) <= draw_band_cp             # now it's drawn
#         and (adv_after_accept is None or abs(adv_after_accept) <= draw_band_cp)
#         and gap_ok
#     )

#     is_brilliant = winning_sac or draw_rescue_sac

#     if winning_sac:
#         reason = "real_sac_and_still_winning"
#     elif draw_rescue_sac:
#         reason = "real_sac_draw_rescue"
#     else:
#         if not win_after_reply_ok and not draw_rescue_sac:
#             reason = "not_winning_or_drawing_after_best_reply"
#         elif eval_accept_white is not None and not win_after_accept_ok:
#             reason = "not_winning_after_accept"
#         elif not gap_ok:
#             reason = "engine_hates_sac"
#         else:
#             reason = "unknown_fail"

#     # 5) Combine all conditions
#     # is_brilliant = (
#     #     sac_result.is_real_sacrifice
#     #     and win_after_reply_ok
#     #     and win_after_accept_ok
#     #     and gap_ok
#     # )

#     # if is_brilliant:
#     #     reason = "real_sac_and_still_winning"
#     # else:
#     #     if not win_after_reply_ok:
#     #         reason = "not_winning_after_best_reply"
#     #     elif eval_accept_white is not None and not win_after_accept_ok:
#     #         reason = "not_winning_after_accept"
#     #     elif not gap_ok:
#     #         reason = "engine_hates_sac"
#     #     else:
#     #         reason = "unknown_fail"

#     print("BRILL DEBUG (SAC-BASED):", {
#         "mover_color": mover_color,
#         "adv_before_mover": adv_before_mover,
#         "adv_after_best_reply": adv_after_reply,
#         "adv_after_accept": adv_after_accept,
#         "gap_to_best_cp": gap_to_best,
#         "is_real_sacrifice": sac_result.is_real_sacrifice,
#         "win_after_reply_ok": win_after_reply_ok,
#         "win_after_accept_ok": win_after_accept_ok,
#         "gap_ok": gap_ok,
#         "is_brilliant": is_brilliant,
#         "reason": reason,
#     })

#     return SacBrilliancyResult(
#         is_brilliant=is_brilliant,
#         reason=reason,
#         adv_before_mover=adv_before_mover,
#         adv_after_best_reply=adv_after_reply,
#         adv_after_accept=adv_after_accept,
#         gap_to_best_cp=gap_to_best,
#         is_real_sacrifice=sac_result.is_real_sacrifice,
#     )
