from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import chess

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


def material_gain_for_move(board: chess.Board, move: chess.Move) -> int:
    """
    Approximate immediate material gained (in centipawns) by playing `move`
    from `board`. Only looks at the captured piece (if any).
    """
    if not board.is_capture(move):
        return 0

    if board.is_en_passant(move):
        captured_type = chess.PAWN
    else:
        captured_piece = board.piece_at(move.to_square)
        if not captured_piece:
            return 0
        captured_type = captured_piece.piece_type

    return PIECE_VALUES.get(captured_type, 0)




def material_for_color(board: chess.Board, color: chess.Color) -> int:
    total = 0
    for ptype, val in PIECE_VALUES.items():
        total += len(board.pieces(ptype, color)) * val
    return total


# ======================================================================
# 1) SACRIFICE DETECTION
# ======================================================================

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
    Detect whether `move` is a *real* material sacrifice, using local exchange logic.
    """
    if params is None:
        params = SacrificeParams()

    mover_color = board.turn
    opponent_color = not mover_color

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

    # Apply our move: now it's opponent's turn
    b1 = board.copy(stack=False)
    b1.push(move)

    target_sq = move.to_square
    piece = b1.piece_at(target_sq)

    offered_piece_cp = 0
    num_attackers_opponent = 0
    num_attackers_mover = 0
    worst_net_loss = 0
    had_accepting_capture = False
    is_real_sac = False

    if piece is None or piece.color != mover_color:
        return SacrificeResult(
            is_real_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=0,
            num_attackers_opponent=0,
            num_attackers_mover=0,
        )

    offered_piece_cp = PIECE_VALUES.get(piece.piece_type, 0)

    # How much net material are we really putting at risk,
    # after accounting for the piece we just captured?
    risk_face_cp = max(0, offered_piece_cp - captured_cp)

    # If risk_face_cp is small, don’t treat this as a sacrifice.
    if risk_face_cp < params.min_offered_piece_cp:
        return SacrificeResult(
            is_real_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=offered_piece_cp,
            num_attackers_opponent=0,
            num_attackers_mover=0,
        )

    attackers_opponent = list(b1.attackers(opponent_color, target_sq))
    attackers_mover    = list(b1.attackers(mover_color, target_sq))

    num_attackers_opponent = len(attackers_opponent)
    num_attackers_mover    = len(attackers_mover)

    if num_attackers_opponent == 0:
        return SacrificeResult(
            is_real_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=offered_piece_cp,
            num_attackers_opponent=num_attackers_opponent,
            num_attackers_mover=num_attackers_mover,
        )

    accepting_moves = [
        mv for mv in b1.legal_moves
        if b1.is_capture(mv) and mv.to_square == target_sq
    ]
    had_accepting_capture = len(accepting_moves) > 0

    for accept in accepting_moves:
        attacker_piece = b1.piece_at(accept.from_square)
        if attacker_piece is None:
            continue

        if attacker_piece.piece_type == chess.KING and num_attackers_mover > 0:
            # Ignore defended-king captures as "accepting the sac"
            continue

        attacker_val = PIECE_VALUES.get(attacker_piece.piece_type, 0)
        has_defender = num_attackers_mover > 0

        if not has_defender:
            net_loss = risk_face_cp
        else:
            net_loss = risk_face_cp - attacker_val

        if net_loss > worst_net_loss:
            worst_net_loss = net_loss

    if had_accepting_capture and worst_net_loss >= params.net_loss_threshold_cp:
        is_real_sac = True

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


# ======================================================================
# 2) BASIC EVAL HELPERS + LABELS
# ======================================================================

def cp_for_player(eval_white_cp: float, mover_color: str) -> float:
    """
    Convert White-centric eval to mover-centric eval.
    +ve = good for mover, -ve = bad for mover.
    """
    return eval_white_cp if mover_color == 'w' else -eval_white_cp


def situation_from_cp(cp_player: float) -> str:
    """
    Bucket the mover's position into rough game states.
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


LABEL_ORDER = ["Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Blunder"]
LABEL_RANK = {name: i for i, name in enumerate(LABEL_ORDER)}


def base_label_from_cpl(cpl: float | None, multipv_rank: int | None) -> str:
    if cpl is None:
        return "Inaccuracy"

    if cpl <= 10:
        return "Best" if (multipv_rank == 1) else "Excellent"

    if cpl <= 30:
        return "Excellent"

    if cpl <= 80:
        return "Good"

    if cpl <= 250:
        return "Inaccuracy"

    if cpl <= 600:
        return "Mistake"

    return "Blunder"


def promote_label(current: str, minimum: str) -> str:
    if LABEL_RANK[current] < LABEL_RANK[minimum]:
        return minimum
    return current


def soften_label(current: str, maximum: str) -> str:
    if LABEL_RANK[current] > LABEL_RANK[maximum]:
        return maximum
    return current


def classify_basic_move(
    eval_before_white: float,
    eval_after_white: float,
    cpl: float | None,
    mover_color: str,           # 'w' or 'b'
    multipv_rank: int | None,
) -> str:
    """
    Core 6-type classifier:
        Best / Excellent / Good / Inaccuracy / Mistake / Blunder
    """
    # Convert to mover POV
    player_before = cp_for_player(eval_before_white, mover_color)
    player_after  = cp_for_player(eval_after_white,  mover_color)
    player_delta  = player_after - player_before  # +ve = got better for mover

    before_state = situation_from_cp(player_before)
    after_state  = situation_from_cp(player_after)

    # If CPL missing, approximate by eval change
    if cpl is None:
        cpl = abs(player_delta)

    # Base label purely from CPL + multipv rank
    label = base_label_from_cpl(cpl, multipv_rank)

    # ------------------------------------------------------------------
    # 1) Throwing away a *win*
    # ------------------------------------------------------------------
    if before_state in ("Winning", "Won") and after_state in ("Equalish", "Worse", "Lost"):
        # You were clearly winning or won; now you aren't
        if cpl >= 300:
            label = promote_label(label, "Blunder")
        elif cpl >= 200:
            label = promote_label(label, "Mistake")

    # ------------------------------------------------------------------
    # 2) Throwing away an *equal* position
    #     Equalish → Worse/Lost with big deterioration
    # ------------------------------------------------------------------
    if before_state == "Equalish" and after_state in ("Worse", "Lost"):
        if player_delta <= -200:            # big drop for the mover
            if cpl >= 300:
                label = promote_label(label, "Blunder")
            elif cpl >= 150:
                label = promote_label(label, "Mistake")

    # ------------------------------------------------------------------
    # 3) Already totally lost → soften complaints
    # ------------------------------------------------------------------
    if before_state == "Lost" and after_state == "Lost":
        # Never harsher than "Mistake"
        label = soften_label(label, "Mistake")
        # And small-ish CPL inside a lost game → Inaccuracy at worst
        if label == "Mistake" and cpl <= 250:
            label = "Inaccuracy"

    # ------------------------------------------------------------------
    # 4) Big rescues from bad positions
    # ------------------------------------------------------------------
    # Lost -> drawable or better (you found a miracle resource)
    if before_state == "Lost" and after_state in ("Equalish", "Winning", "Won"):
        if player_delta >= 300:
            if LABEL_RANK[label] > LABEL_RANK["Good"]:
                label = "Good"

    # Worse -> Equalish / Winning / Won (nice save, but not full miracle)
    if before_state == "Worse" and after_state in ("Equalish", "Winning", "Won"):
        if player_delta >= 250:
            if LABEL_RANK[label] > LABEL_RANK["Good"]:
                label = "Good"

    # Equalish -> Winning / Won (you convert equality to an advantage)
    if before_state == "Equalish" and after_state in ("Winning", "Won"):
        if player_delta >= 200:
            if LABEL_RANK[label] > LABEL_RANK["Good"]:
                label = "Good"

    # ------------------------------------------------------------------
    # 5) Already clearly better and still clearly better
    #     (Winning/Won → Winning/Won)
    # ------------------------------------------------------------------
    if before_state in ("Winning", "Won") and after_state in ("Winning", "Won"):
        # Don't scream "Blunder" when you're still crushing
        label = soften_label(label, "Mistake")
        if label == "Mistake" and cpl <= 250:
            label = "Inaccuracy"

    # ------------------------------------------------------------------
    # 6) Generic delta-based softening / hardening
    # ------------------------------------------------------------------
    # Large improvement for mover → be kinder
    if player_delta >= 100:
        if label == "Blunder":
            label = "Mistake"
        elif label == "Mistake":
            label = "Inaccuracy"
        elif label == "Inaccuracy":
            label = "Good"

    # Large worsening for mover → harsher
    if player_delta <= -150:
        if label == "Good":
            label = "Inaccuracy"
        elif label == "Inaccuracy" and cpl >= 150:
            label = "Mistake"

    # print("before", before_state, "after state", after_state,
    #       "delta", player_delta, "cpl", cpl, "label", label)
    debug_info = {
        "eval_before_white": eval_before_white,
        "eval_after_white": eval_after_white,
        "mover_color": mover_color,
        "player_before": player_before,
        "player_after": player_after,
        "player_delta": player_delta,
        "before_state": before_state,
        "after_state": after_state,
        "cpl": cpl,
        "multipv_rank": multipv_rank,
        "final_basic_label": label,
    }

    print("BASIC LABEL DEBUG:", debug_info)


    return label


# ======================================================================
# 3) MISS DETECTION
# ======================================================================


@dataclass
class MissParams:
    max_self_drop_cp: int = 500          # if we lose more than this, it's not just a Miss
    min_opportunity_cp: int = 200        # generic "big chance" threshold
    tactical_min_gain_cp: int = 200      # engine's shot must improve ≥ this to count as Miss candidate

    still_winning_cp: int = 300
    equal_band_cp: int = 150
    still_ok_cp: int = 600               # if after_pov <= -still_ok_cp, position is just bad

    min_save_gain_cp: int = 250
    min_conversion_gain_cp: int = 200

    # We keep this for possible future use, but we no longer rely on material gain logic
    missed_material_min_gain_cp: int = 200


def detect_miss(
    *,
    eval_pre_white: float,
    eval_after_white: float,
    eval_played_pre_white: float,
    eval_best_pre_white: Optional[float],
    mover_color: str,
    best_mate_in_plies: Optional[int] = None,
    played_mate_in_plies: Optional[int] = None,

    # Currently unused, kept only for API compatibility
    best_material_gain_cp: Optional[float] = None,
    played_material_gain_cp: Optional[float] = None,

    params: Optional[MissParams] = None,
) -> bool:
    if params is None:
        params = MissParams()

    if eval_best_pre_white is None:
        return False

    # Convert all evals to mover POV
    pre_pov     = cp_for_player(eval_pre_white,        mover_color)
    after_pov   = cp_for_player(eval_after_white,      mover_color)
    played_pov  = cp_for_player(eval_played_pre_white, mover_color)
    best_pov    = cp_for_player(eval_best_pre_white,   mover_color)

    # PRE → POST drop for mover
    self_drop   = pre_pov - after_pov          # >0 means we got worse
    # "Opportunity" from PRE: best vs played
    opportunity = best_pov - played_pov        # how much better best was than our move
    # How much better best would be than final position
    miss_gap    = best_pov - after_pov

    situation_before = situation_from_cp(pre_pov)

    print("MISS DEBUG:", {
        "pre_pov": pre_pov,
        "after_pov": after_pov,
        "played_pov": played_pov,
        "best_pov": best_pov,
        "self_drop": self_drop,
        "opportunity": opportunity,
        "miss_gap": miss_gap,
        "situation_before": situation_before,
        "best_material_gain_cp": best_material_gain_cp,
        "played_material_gain_cp": played_material_gain_cp,
    })

    # ------------------------------------------------------------------
    # 0) Global gates: don't call huge self-harm or busted positions "Miss"
    # ------------------------------------------------------------------
    if self_drop > params.max_self_drop_cp:
        # too much self-harm: this is just a big error, not a Miss
        return False

    if after_pov <= -params.still_ok_cp:
        # We're clearly worse after the move: that's a real blunder, not just a Miss.
        return False

    # ------------------------------------------------------------------
    # 1) Simple CP-based Miss:
    #    Engine's best move is much better than what we played.
    #    Use 'opportunity' (best_pov - played_pov) as the shot size.
    # ------------------------------------------------------------------
    cp_shot = max(opportunity, miss_gap)  # usually equal to opportunity

    if (
        cp_shot >= params.tactical_min_gain_cp and   # big tactical chance (e.g. ≥ 300cp)
        self_drop <= params.max_self_drop_cp and     # we didn't totally ruin our position
        after_pov > -params.still_ok_cp              # still not completely lost
    ):
        print("MISS DEBUG: simple_cp_based_miss = True", {
            "cp_shot": cp_shot,
            "opportunity": opportunity,
            "miss_gap": miss_gap,
        })
        return True

    # ------------------------------------------------------------------
    # 2) If *no* clear tactical / eval chance, no Miss
    # ------------------------------------------------------------------
    if opportunity < params.min_opportunity_cp and miss_gap < params.min_opportunity_cp:
        return False

    situation = situation_before

    # ------------------------------------------------------------------
    # 3) Missed short mate / kill shot while still winning
    # ------------------------------------------------------------------
    if best_mate_in_plies is not None:
        if best_pov >= params.still_winning_cp and after_pov >= params.still_winning_cp:
            # You had a winning kill-shot and still remained winning but didn't play it.
            return True

    # ------------------------------------------------------------------
    # 4) Missed conversion while clearly winning
    # ------------------------------------------------------------------
    if (
        situation in ("Winning", "Won") and
        pre_pov   >= params.still_winning_cp and
        best_pov  >= pre_pov + params.tactical_min_gain_cp and
        after_pov >= params.still_winning_cp
    ):
        return True

    # ------------------------------------------------------------------
    # 5) Missed defensive save (worse/lost -> drawable/OK)
    # ------------------------------------------------------------------
    if situation in ("Worse", "Lost"):
        if (
            opportunity >= params.min_save_gain_cp and
            best_pov   >= -params.still_ok_cp
        ):
            return True

    # ------------------------------------------------------------------
    # 6) Missed conversion (small edge / equal -> big edge)
    # ------------------------------------------------------------------
    if situation in ("Winning", "Equalish"):
        if (
            opportunity >= params.min_conversion_gain_cp and
            best_pov   >= pre_pov + params.min_conversion_gain_cp
        ):
            return True

    # ------------------------------------------------------------------
    # 7) Generic tactical Miss: equalish position, big tactical jump
    # ------------------------------------------------------------------
    is_equalish = abs(pre_pov) <= params.equal_band_cp
    is_big_tactical = (
        best_pov >= pre_pov + params.tactical_min_gain_cp and
        best_pov >= params.tactical_min_gain_cp
    )

    if is_equalish and is_big_tactical:
        return True

    # ------------------------------------------------------------------
    # 8) Fallback: generic "big opportunity missed"
    # ------------------------------------------------------------------
    if opportunity >= params.min_opportunity_cp:
        return True

    return False





# @dataclass
# class MissParams:
#     max_self_drop_cp: int = 500
#     min_opportunity_cp: int = 200
#     tactical_min_gain_cp: int = 300

#     still_winning_cp: int = 300
#     equal_band_cp: int = 150
#     still_ok_cp: int = 600

#     min_save_gain_cp: int = 250
#     min_conversion_gain_cp: int = 200

#     # NEW: threshold for "free material" missed
#     # e.g. 200–300cp = at least a clean pawn/piece win opportunity.
#     missed_material_min_gain_cp: int = 200


# def detect_miss(
#     *,
#     eval_pre_white: float,
#     eval_after_white: float,
#     eval_played_pre_white: float,
#     eval_best_pre_white: Optional[float],
#     mover_color: str,
#     best_mate_in_plies: Optional[int] = None,
#     played_mate_in_plies: Optional[int] = None,

#     # NEW: how much immediate material best move / played move win (mover POV-ish cp)
#     best_material_gain_cp: Optional[float] = None,
#     played_material_gain_cp: Optional[float] = None,

#     params: Optional[MissParams] = None,
# ) -> bool:
#     if params is None:
#         params = MissParams()

#     if eval_best_pre_white is None:
#         return False

#     # Convert all evals to mover POV
#     pre_pov     = cp_for_player(eval_pre_white,        mover_color)
#     after_pov   = cp_for_player(eval_after_white,      mover_color)
#     played_pov  = cp_for_player(eval_played_pre_white, mover_color)
#     best_pov    = cp_for_player(eval_best_pre_white,   mover_color)

#     # PRE → POST drop for mover
#     self_drop   = pre_pov - after_pov          # >0 means we got worse
#     # "Opportunity" from PRE: best vs played
#     opportunity = best_pov - played_pov        # how much better best was than our move
#     # How much better best would be than final position
#     miss_gap    = best_pov - after_pov

#     situation_before = situation_from_cp(pre_pov)

#     print("MISS DEBUG:", {
#         "pre_pov": pre_pov,
#         "after_pov": after_pov,
#         "played_pov": played_pov,
#         "best_pov": best_pov,
#         "self_drop": self_drop,
#         "opportunity": opportunity,
#         "miss_gap": miss_gap,
#         "situation_before": situation_before,
#         "best_material_gain_cp": best_material_gain_cp,
#         "played_material_gain_cp": played_material_gain_cp,
#     })

#     # ------------------------------------------------------------------
#     # 0) Global gates: don't call huge self-harm or busted positions "Miss"
#     # ------------------------------------------------------------------
#     if self_drop > params.max_self_drop_cp:
#         return False

#     if after_pov <= -params.still_ok_cp:
#         # We're clearly worse after the move: that's a real error, not just a Miss.
#         return False

#     # ------------------------------------------------------------------
#     # 1) SPECIAL CASE: missed *real* free material
#     # ------------------------------------------------------------------

#     # Determine if best move is a capture
#     best_move_is_capture = False
#     if best_move_uci:
#         try:
#             best_move = chess.Move.from_uci(best_move_uci)
#             best_move_is_capture = board.is_capture(best_move)
#         except Exception:
#             best_move_is_capture = False

#     if best_move_is_capture and best_material_gain_cp is not None and played_material_gain_cp is not None:

#         # Check if capturing was actually safe using sacrifice logic
#         sac_info = detect_sacrifice(board, best_move)

#         # Safe if opponent recaptures and we don't lose net material
#         safe_to_capture = (
#             not sac_info.is_real_sacrifice and
#             sac_info.worst_net_loss_cp <= 0
#         )

#         if (
#             safe_to_capture and                                # capture truly wins material
#             best_material_gain_cp >= params.missed_material_min_gain_cp and
#             played_material_gain_cp < best_material_gain_cp and
#             self_drop <= params.max_self_drop_cp and
#             after_pov > -params.still_ok_cp
#         ):
#             print("MISS DEBUG: missed_SAFE_free_material = True")
#             return True









#     # If engine says the best move immediately wins material (big enough),
#     # and our move does NOT take that material (or takes clearly less),
#     # and we didn't ruin our position -> count as Miss.
#     # if best_material_gain_cp is not None and played_material_gain_cp is not None:
#     #     if (
#     #         best_material_gain_cp >= params.missed_material_min_gain_cp and
#     #         played_material_gain_cp < best_material_gain_cp and
#     #         self_drop <= params.max_self_drop_cp and
#     #         after_pov > -params.still_ok_cp
#     #     ):
#     #         print("MISS DEBUG: missed_free_material = True")
#     #         return True

#     # ------------------------------------------------------------------
#     # 2) If *no* clear tactical / eval chance, no Miss
#     # ------------------------------------------------------------------
#     if opportunity < params.min_opportunity_cp and miss_gap < params.min_opportunity_cp:
#         return False

#     situation = situation_before

#     # ------------------------------------------------------------------
#     # 3) Missed short mate / kill shot while still winning
#     # ------------------------------------------------------------------
#     if best_mate_in_plies is not None:
#         if best_pov >= params.still_winning_cp and after_pov >= params.still_winning_cp:
#             # (Optionally you can restrict to small Mx window here, e.g. <= 3)
#             # if best_mate_in_plies <= 3 and (played_mate_in_plies is None or played_mate_in_plies > best_mate_in_plies + 1):
#             #     return True
#             return True

#     # ------------------------------------------------------------------
#     # 4) Missed conversion while clearly winning
#     # ------------------------------------------------------------------
#     if (
#         situation in ("Winning", "Won") and
#         pre_pov   >= params.still_winning_cp and
#         best_pov  >= pre_pov + params.tactical_min_gain_cp and
#         after_pov >= params.still_winning_cp
#     ):
#         return True

#     # ------------------------------------------------------------------
#     # 5) Missed defensive save (worse/lost -> drawable/OK)
#     # ------------------------------------------------------------------
#     if situation in ("Worse", "Lost"):
#         if (
#             opportunity >= params.min_save_gain_cp and
#             best_pov   >= -params.still_ok_cp
#         ):
#             return True

#     # ------------------------------------------------------------------
#     # 6) Missed conversion (small edge / equal -> big edge)
#     # ------------------------------------------------------------------
#     if situation in ("Winning", "Equalish"):
#         if (
#             opportunity >= params.min_conversion_gain_cp and
#             best_pov   >= pre_pov + params.min_conversion_gain_cp
#         ):
#             return True

#     # ------------------------------------------------------------------
#     # 7) Generic tactical Miss: equalish position, big tactical jump
#     # ------------------------------------------------------------------
#     is_equalish = abs(pre_pov) <= params.equal_band_cp
#     is_big_tactical = (
#         best_pov >= pre_pov + params.tactical_min_gain_cp and
#         best_pov >= params.tactical_min_gain_cp
#     )

#     if is_equalish and is_big_tactical:
#         return True

#     # ------------------------------------------------------------------
#     # 8) Fallback: generic "big opportunity missed"
#     # ------------------------------------------------------------------
#     if opportunity >= params.min_opportunity_cp:
#         return True

#     return False


# ------------------------------------------------------------------
# Sac Miss
# ------------------------------------------------------------------

@dataclass
class MissedAcceptSacParams:
    """
    Tunables for: 'you failed to accept a *bad* sacrifice from opponent'.
    All evals are in mover POV once converted with cp_for_player.
    """
    # How big the material at stake must be (net loss opponent is risking)
    min_material_gain_cp: int = 200   # ≥ 2 pawns or a small piece

    # How much better accepting is vs what we actually did (mover POV)
    min_eval_gain_cp: int = 150      # accepting improves our eval by ≥ 1.5 pawns

    # We don't call this a 'Miss' if our move completely self-destructs
    max_self_drop_cp: int = 500      # same idea as MissParams

    # Final position after our move must not be totally busted
    still_ok_cp: int = 120           # |cp| ≤ 1.2 pawns is "still OK/drawable"



@dataclass
class MissedAcceptSacResult:
    is_miss: bool
    reason: str
    pre_pov: float
    after_pov: float
    accept_pov: Optional[float]
    eval_gain_if_accept_cp: Optional[float]
    material_at_stake_cp: int
    accepted_in_game: bool


def detect_missed_accept_sacrifice(
    *,
    last_sac_result: "SacrificeResult" | None,
    sac_target_square: Optional[int],
    board_before: chess.Board,         # position BEFORE our move (after opponent's sac)
    played_move: chess.Move,           # our actual move
    eval_pre_white: float,             # eval from PRE (before our move), White POV
    eval_after_white: float,           # eval AFTER our move, White POV
    eval_accept_white: Optional[float],# eval AFTER a good accepting move, White POV
    mover_color: str,                  # 'w' or 'b' (the side to move now)
    params: Optional[MissedAcceptSacParams] = None,
) -> MissedAcceptSacResult:
    """
    Detects: 'we failed to accept a bad sacrifice from opponent' → Miss.

    Assumes:
      - last_sac_result describes opponent's previous move (a real sacrifice).
      - sac_target_square is the square where their sacrificed piece sits now.
      - board_before is AFTER opponent's sac, BEFORE our move.
      - eval_pre_white  = eval_before_cp (best/pre eval for PRE, White POV)
      - eval_after_white= eval_after_cp  (after our actual move, White POV)
      - eval_accept_white: eval after playing some GOOD accepting capture
                           (computed via engine in caller; can be None if not available)
    """
    if params is None:
        params = MissedAcceptSacParams()

    # ------------------------------------------------------------------
    # 0) If previous move was not a *real* sacrifice, nothing to do
    # ------------------------------------------------------------------
    if last_sac_result is None or not last_sac_result.is_real_sacrifice:
        return MissedAcceptSacResult(
            is_miss=False,
            reason="no_prior_sacrifice",
            pre_pov=0.0,
            after_pov=0.0,
            accept_pov=None,
            eval_gain_if_accept_cp=None,
            material_at_stake_cp=0,
            accepted_in_game=False,
        )

    if sac_target_square is None:
        return MissedAcceptSacResult(
            is_miss=False,
            reason="missing_sac_target_square",
            pre_pov=0.0,
            after_pov=0.0,
            accept_pov=None,
            eval_gain_if_accept_cp=None,
            material_at_stake_cp=0,
            accepted_in_game=False,
        )

    # Material at stake: opponent is risking at least this much
    material_at_stake_cp = max(
        last_sac_result.worst_net_loss_cp,
        last_sac_result.offered_piece_cp,
    )

    # If the sac isn't actually risking much, skip
    if material_at_stake_cp < params.min_material_gain_cp:
        return MissedAcceptSacResult(
            is_miss=False,
            reason="material_at_stake_too_small",
            pre_pov=0.0,
            after_pov=0.0,
            accept_pov=None,
            eval_gain_if_accept_cp=None,
            material_at_stake_cp=material_at_stake_cp,
            accepted_in_game=False,
        )

    # ------------------------------------------------------------------
    # 1) Find all accepting captures (our legal moves that capture on sac square)
    # ------------------------------------------------------------------
    accepting_moves = [
        mv for mv in board_before.legal_moves
        if board_before.is_capture(mv) and mv.to_square == sac_target_square
    ]

    if not accepting_moves:
        # No legal way to accept the sac → cannot say we 'missed' it
        return MissedAcceptSacResult(
            is_miss=False,
            reason="no_accepting_captures",
            pre_pov=0.0,
            after_pov=0.0,
            accept_pov=None,
            eval_gain_if_accept_cp=None,
            material_at_stake_cp=material_at_stake_cp,
            accepted_in_game=False,
        )

    # Did we actually accept in the game?
    accepted_in_game = (
        board_before.is_capture(played_move)
        and played_move.to_square == sac_target_square
    )

    if accepted_in_game:
        return MissedAcceptSacResult(
            is_miss=False,
            reason="we_accepted_sacrifice",
            pre_pov=0.0,
            after_pov=0.0,
            accept_pov=None,
            eval_gain_if_accept_cp=None,
            material_at_stake_cp=material_at_stake_cp,
            accepted_in_game=True,
        )

    # ------------------------------------------------------------------
    # 2) We did NOT accept: compare eval if we had accepted vs what we did
    # ------------------------------------------------------------------
    pre_pov   = cp_for_player(eval_pre_white,   mover_color)
    after_pov = cp_for_player(eval_after_white, mover_color)

    accept_pov = None
    eval_gain_if_accept = None

    if eval_accept_white is not None:
        accept_pov = cp_for_player(eval_accept_white, mover_color)
        eval_gain_if_accept = accept_pov - after_pov   # how much better accepting is vs what we played

    # If we don't know eval_accept, we can't confidently call Miss here
    if accept_pov is None or eval_gain_if_accept is None:
        return MissedAcceptSacResult(
            is_miss=False,
            reason="no_eval_for_accept_line",
            pre_pov=pre_pov,
            after_pov=after_pov,
            accept_pov=None,
            eval_gain_if_accept_cp=None,
            material_at_stake_cp=material_at_stake_cp,
            accepted_in_game=False,
        )

    # Basic safety gates: don't call huge self-destruction a 'Miss'
    self_drop = pre_pov - after_pov  # >0 means we made ourselves worse

    if self_drop > params.max_self_drop_cp:
        return MissedAcceptSacResult(
            is_miss=False,
            reason="self_drop_too_large",
            pre_pov=pre_pov,
            after_pov=after_pov,
            accept_pov=accept_pov,
            eval_gain_if_accept_cp=eval_gain_if_accept,
            material_at_stake_cp=material_at_stake_cp,
            accepted_in_game=False,
        )

    # We also don't want final position to be *totally busted* for us if we are calling this a Miss
    if after_pov <= -params.still_ok_cp:
        return MissedAcceptSacResult(
            is_miss=False,
            reason="final_position_too_bad",
            pre_pov=pre_pov,
            after_pov=after_pov,
            accept_pov=accept_pov,
            eval_gain_if_accept_cp=eval_gain_if_accept,
            material_at_stake_cp=material_at_stake_cp,
            accepted_in_game=False,
        )

    # Now the core logic:
    #  - opponent risked significant material
    #  - accepting keeps us at least 'OK'
    #  - accepting is clearly better than what we actually did
    if (
        material_at_stake_cp >= params.min_material_gain_cp and
        accept_pov > -params.still_ok_cp and                # accept line is OK for us
        eval_gain_if_accept >= params.min_eval_gain_cp      # big improvement vs our move
    ):
        print("MISS DEBUG (accept_sac):", {
            "pre_pov": pre_pov,
            "after_pov": after_pov,
            "accept_pov": accept_pov,
            "eval_gain_if_accept": eval_gain_if_accept,
            "material_at_stake_cp": material_at_stake_cp,
        })
        return MissedAcceptSacResult(
            is_miss=True,
            reason="missed_accept_sacrifice",
            pre_pov=pre_pov,
            after_pov=after_pov,
            accept_pov=accept_pov,
            eval_gain_if_accept_cp=eval_gain_if_accept,
            material_at_stake_cp=material_at_stake_cp,
            accepted_in_game=False,
        )

    return MissedAcceptSacResult(
        is_miss=False,
        reason="conditions_not_met",
        pre_pov=pre_pov,
        after_pov=after_pov,
        accept_pov=accept_pov,
        eval_gain_if_accept_cp=eval_gain_if_accept,
        material_at_stake_cp=material_at_stake_cp,
        accepted_in_game=False,
    )


# ======================================================================
# 4) BOOK MOVE DETECTION (simple wrapper)
# ======================================================================

@dataclass
class BookParams:
    """
    Placeholder – you now rely ONLY on a real opening database (Polyglot).
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
    return bool(in_opening_db)


# ======================================================================
# 5) SACRIFICE-BASED BRILLIANCY (Brilliant)
# ======================================================================








@dataclass
class SacBrilliancyParams:
    win_after_reply_cp: int = 120   # clearly winning after best reply
    win_after_accept_cp: int = 80   # clearly winning even after acceptance
    max_gap_to_best_cp: int = 120   # engine should not hate the sac
    max_adv_drop_cp: int = 80       # don't throw away too much advantage


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
    return eval_white_cp if mover_color == "w" else -eval_white_cp



def detect_sac_brilliancy(
    *,
    eval_before_white: float,
    eval_after_white: float,
    eval_best_pre_white: Optional[float],
    eval_played_pre_white: Optional[float],
    eval_best_reply_white: float,
    eval_accept_white: Optional[float],
    mover_color: str,
    sac_result: SacrificeResult,
    params: Optional[SacBrilliancyParams] = None,

    # NEW (optional): mate info from the engine, in plies
    mate_for_mover_before: Optional[int] = None,
    mate_for_mover_after: Optional[int] = None,
    mate_for_opponent_before: Optional[int] = None,
    mate_for_opponent_after: Optional[int] = None,
) -> SacBrilliancyResult:
    if params is None:
        params = SacBrilliancyParams()

    # If not a real sac, never Brilliant
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

    # --- 1) Base advantages (mover POV) ---
    adv_before_mover = adv_for_mover(eval_before_white, mover_color)
    adv_after_reply  = adv_for_mover(eval_best_reply_white, mover_color)
    adv_after_move   = adv_for_mover(eval_after_white,  mover_color)

    adv_after_accept: Optional[float] = None
    if eval_accept_white is not None:
        adv_after_accept = adv_for_mover(eval_accept_white, mover_color)

    # Game states based on mover POV
    before_state = situation_from_cp(adv_before_mover)   # Won / Winning / Equalish / Worse / Lost
    after_state  = situation_from_cp(adv_after_reply)    # we care about worst-case (best reply), not just after_move

    # --- 2) Gap to best from PRE (mover POV) ---
    gap_to_best: Optional[float] = None
    if eval_best_pre_white is not None:
        played_pre = eval_played_pre_white if eval_played_pre_white is not None else eval_after_white
        if mover_color == 'w':
            # best - played: positive = we lost something vs best
            gap_to_best = eval_best_pre_white - played_pre
        else:
            # For Black, more negative is better. played - best: positive = we lost something.
            gap_to_best = played_pre - eval_best_pre_white

    gap_ok = True
    if gap_to_best is not None:
        gap_ok = (gap_to_best <= params.max_gap_to_best_cp)

    # --- 3) Drop in advantage after BEST reply ---
    adv_drop = adv_before_mover - adv_after_reply

    drop_ok = True
    if adv_before_mover > params.win_after_reply_cp:
        # If we were already clearly winning, don't allow a huge drop
        drop_ok = (adv_drop <= params.max_adv_drop_cp)

    # --- 4) Thresholds reused from your original code ---
    lost_threshold_cp = 300
    draw_band_cp      = 60
    mate_max_plies    = 6   # M4/M5/M6 style brilliancies

    # ==================================================================
    # A) STATE-BASED WINNING SAC  (Equalish/Won → Winning/Won)
    # ==================================================================
    win_after_reply_ok = (adv_after_reply >= params.win_after_reply_cp)

    if eval_accept_white is not None:
        win_after_accept_ok = (adv_after_accept is not None and adv_after_accept >= params.win_after_accept_cp)
    else:
        win_after_accept_ok = True  # if no accept eval, don't block on this

    winning_sac = (
        sac_result.is_real_sacrifice
        and before_state in ("Equalish", "Winning", "Won")
        and after_state  in ("Winning", "Won")
        and win_after_reply_ok
        and win_after_accept_ok
        and gap_ok
        and drop_ok
    )

    # ==================================================================
    # B) STATE-BASED DRAW-RESCUE SAC (Lost/Worse → Equalish)
    # ==================================================================
    draw_rescue_sac = (
        sac_result.is_real_sacrifice
        and before_state in ("Worse", "Lost")
        and after_state  in ("Equalish", "Winning")
        and adv_before_mover <= -lost_threshold_cp
        and abs(adv_after_reply) <= draw_band_cp
        and (adv_after_accept is None or abs(adv_after_accept) <= draw_band_cp)
        and gap_ok
    )

    # ==================================================================
    # C) MATE-ATTACK BRILLIANCY (Equalish/Worse/Lost → sac → M≤6 for mover)
    # ==================================================================
    mate_attack_sac = False
    if mate_for_mover_after is not None and mate_for_mover_after <= mate_max_plies:
        if before_state in ("Equalish", "Worse", "Lost"):
            # We weren't already just mating them, now we have a forcing attack
            mate_attack_sac = (
                sac_result.is_real_sacrifice
                and gap_ok
            )

    # ==================================================================
    # D) MATE-DEFENSE BRILLIANCY (they had mate, sac busts it)
    # ==================================================================
    mate_defense_sac = False
    if mate_for_opponent_before is not None and mate_for_opponent_before <= mate_max_plies:
        # Opponent had a near mate
        no_more_mate = (
            mate_for_opponent_after is None or
            mate_for_opponent_after > mate_for_opponent_before + 4
        )
        if no_more_mate and before_state in ("Worse", "Lost"):
            mate_defense_sac = (
                sac_result.is_real_sacrifice
                and gap_ok
            )

    # ==================================================================
    # FINAL DECISION
    # ==================================================================
    is_brilliant = winning_sac or draw_rescue_sac or mate_attack_sac or mate_defense_sac

    if winning_sac:
        reason = "real_sac_still_winning_after_reply_and_accept"
    elif draw_rescue_sac:
        reason = "real_sac_draw_rescue_state_based"
    elif mate_attack_sac:
        reason = "real_sac_creates_forcing_mate_for_mover"
    elif mate_defense_sac:
        reason = "real_sac_defends_against_near_mate"
    else:
        # Keep detailed reasons to debug why a sac failed brilliancy tests
        if not gap_ok:
            reason = "engine_hates_sac_gap_too_large"
        elif not drop_ok:
            reason = "too_much_advantage_lost_after_best_reply"
        elif not win_after_reply_ok and not draw_rescue_sac:
            reason = "not_winning_after_best_reply"
        elif eval_accept_white is not None and not win_after_accept_ok:
            reason = "not_winning_after_accept"
        else:
            reason = "conditions_not_met"

    print("BRILL DEBUG (SAC-BASED):", {
        "mover_color": mover_color,
        "adv_before_mover": adv_before_mover,
        "adv_after_best_reply": adv_after_reply,
        "adv_after_move": adv_after_move,
        "adv_after_accept": adv_after_accept,
        "before_state": before_state,
        "after_state": after_state,
        "gap_to_best_cp": gap_to_best,
        "adv_drop": adv_drop,
        "is_real_sacrifice": sac_result.is_real_sacrifice,
        "winning_sac": winning_sac,
        "draw_rescue_sac": draw_rescue_sac,
        "mate_attack_sac": mate_attack_sac,
        "mate_defense_sac": mate_defense_sac,
        "mate_for_mover_before": mate_for_mover_before,
        "mate_for_mover_after": mate_for_mover_after,
        "mate_for_opponent_before": mate_for_opponent_before,
        "mate_for_opponent_after": mate_for_opponent_after,
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



# def detect_sac_brilliancy(
#     *,
#     eval_before_white: float,
#     eval_after_white: float,
#     eval_best_pre_white: Optional[float],
#     eval_played_pre_white: Optional[float],
#     eval_best_reply_white: float,
#     eval_accept_white: Optional[float],
#     mover_color: str,
#     sac_result: SacrificeResult,
#     params: Optional[SacBrilliancyParams] = None,
# ) -> SacBrilliancyResult:
#     if params is None:
#         params = SacBrilliancyParams()

#     if not sac_result.is_real_sacrifice:
#         return SacBrilliancyResult(
#             is_brilliant=False,
#             reason="not_sacrifice",
#             adv_before_mover=adv_for_mover(eval_before_white, mover_color),
#             adv_after_best_reply=adv_for_mover(eval_best_reply_white, mover_color),
#             adv_after_accept=None if eval_accept_white is None else adv_for_mover(eval_accept_white, mover_color),
#             gap_to_best_cp=None,
#             is_real_sacrifice=False,
#         )

#     adv_before_mover = adv_for_mover(eval_before_white, mover_color)
#     adv_after_reply  = adv_for_mover(eval_best_reply_white, mover_color)

#     adv_after_accept: Optional[float] = None
#     if eval_accept_white is not None:
#         adv_after_accept = adv_for_mover(eval_accept_white, mover_color)

#     gap_to_best: Optional[float] = None
#     if eval_best_pre_white is not None:
#         played_pre = eval_played_pre_white if eval_played_pre_white is not None else eval_after_white
#         if mover_color == 'w':
#             gap_to_best = eval_best_pre_white - played_pre
#         else:
#             gap_to_best = played_pre - eval_best_pre_white

#     gap_ok = True
#     if gap_to_best is not None:
#         gap_ok = (gap_to_best <= params.max_gap_to_best_cp)

#     adv_drop = adv_before_mover - adv_after_reply

#     drop_ok = True
#     if adv_before_mover > params.win_after_reply_cp:
#         drop_ok = (adv_drop <= params.max_adv_drop_cp)

#     win_after_reply_ok = (adv_after_reply >= params.win_after_reply_cp)

#     if eval_accept_white is not None:
#         win_after_accept_ok = (adv_after_accept is not None and adv_after_accept >= params.win_after_accept_cp)
#     else:
#         win_after_accept_ok = True

#     lost_threshold_cp = 300
#     draw_band_cp      = 60

#     winning_sac = (
#         sac_result.is_real_sacrifice
#         and win_after_reply_ok
#         and win_after_accept_ok
#         and gap_ok
#         and drop_ok
#     )

#     draw_rescue_sac = (
#         sac_result.is_real_sacrifice
#         and adv_before_mover <= -lost_threshold_cp
#         and abs(adv_after_reply) <= draw_band_cp
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
#         elif not drop_ok:
#             reason = "too_much_advantage_lost"
#         else:
#             reason = "unknown_fail"

#     print("BRILL DEBUG (SAC-BASED):", {
#         "mover_color": mover_color,
#         "adv_before_mover": adv_before_mover,
#         "adv_after_best_reply": adv_after_reply,
#         "adv_after_accept": adv_after_accept,
#         "gap_to_best_cp": gap_to_best,
#         "adv_drop": adv_drop,
#         "is_real_sacrifice": sac_result.is_real_sacrifice,
#         "win_after_reply_ok": win_after_reply_ok,
#         "win_after_accept_ok": win_after_accept_ok,
#         "gap_ok": gap_ok,
#         "drop_ok": drop_ok,
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



# ======================================================================
# 6) GREAT MOVE DETECTION (UPDATED)
# ======================================================================

@dataclass
class GreatMoveParams:
    """
    Tunables for 'Great' (!) moves (non-sac, non-book).

    We use mover-POV eval (via cp_for_player) and game states (via situation_from_cp)
    to define four Great patterns:

    Type 1: Perfect Conversion Great
        - cp_loss == 0 (within perfect_cp_loss_cp)
        - multipv_rank == 1
        - before_state < after_state  (state strictly improves)

    Type 2: Near-perfect Conversion Great
        - cp_loss <= near_cp_loss_cp
        - multipv_rank <= near_max_multipv_rank
        - before_state < after_state
        - mover_delta >= near_min_improvement_cp

    Type 3: Big Defensive Great (rescue from bad)
        - cp_loss == 0
        - multipv_rank == 1
        - before_state in {Worse, Lost}
        - (after_state in {Equalish, Winning, Won}
           OR (after_state == "Worse" and mover_delta >= defense_min_improvement_cp))

    Type 4: Intra-bucket Equalish Great
        - cp_loss == 0
        - multipv_rank == 1
        - before_state == after_state == "Equalish"
        - mover_delta >= intrabucket_equalish_min_improvement_cp

    We also ignore positions where eval is already huge (mate-ish) using
    max_abs_eval_for_great on mover-POV eval before/after.
    """
    # "Perfect" CP loss threshold (0 means exactly best)
    perfect_cp_loss_cp: int = 0

    # Near-perfect CP loss threshold for Type 2 (e.g. 30cp = 0.3 pawn)
    near_cp_loss_cp: int = 30

    # Minimum improvement (mover POV) for near-perfect conversions (Type 2)
    near_min_improvement_cp: int = 200

    # Minimum improvement for defensive rescues that stay in "Worse" (Type 3)
    defense_min_improvement_cp: int = 300

    # Minimum improvement for intra-bucket Equalish Great (Type 4)
    intrabucket_equalish_min_improvement_cp: int = 200

    # Don't call Great if evals are already huge (mover POV)
    max_abs_eval_for_great: int = 1500  # 15 pawns

    # Max multipv rank for near-perfect conversions (Type 2)
    near_max_multipv_rank: int = 2


@dataclass
class GreatMoveResult:
    is_great: bool
    reason: str
    mover_improvement_cp: float
    cp_loss_for_mover_cp: Optional[float]
    delta_eval_white_cp: float
    before_state: str = ""
    after_state: str = ""
    pattern: Optional[str] = None  # "conversion_perfect", "conversion_near", "defense", "intrabucket_equalish"


def detect_great_move(
    *,
    eval_before_white: float,                 # BEFORE move, White POV
    eval_after_white: float,                  # AFTER move, White POV
    eval_best_pre_white: Optional[float],     # best move eval from PRE, White POV
    eval_played_pre_white: Optional[float],   # played move eval from PRE, White POV
    mover_color: str,                         # 'w' or 'b'
    multipv_rank: Optional[int],              # PV rank for played move (1 = best)
    params: Optional[GreatMoveParams] = None,
) -> GreatMoveResult:
    """
    'Great' move definition (non-sac, non-book – filtered outside):

    Uses four patterns (see GreatMoveParams docstring). All work in mover POV.
    """
    if params is None:
        params = GreatMoveParams()

    # Need both best and played PRE evals to measure CP loss vs best
    if eval_best_pre_white is None or eval_played_pre_white is None:
        return GreatMoveResult(
            is_great=False,
            reason="missing_best_or_played_pre_eval",
            mover_improvement_cp=0.0,
            cp_loss_for_mover_cp=None,
            delta_eval_white_cp=0.0,
        )

    # --- 1) Convert to mover POV and derive states ---
    mover_before = cp_for_player(eval_before_white, mover_color)
    mover_after  = cp_for_player(eval_after_white,  mover_color)
    mover_delta  = mover_after - mover_before       # >0 = good for mover

    before_state = situation_from_cp(mover_before)  # "Won"/"Winning"/"Equalish"/"Worse"/"Lost"
    after_state  = situation_from_cp(mover_after)

    # raw white-centric delta (for logging only)
    delta_eval_white = eval_after_white - eval_before_white

    # Ignore positions that are already completely decided
    if abs(mover_before) >= params.max_abs_eval_for_great or abs(mover_after) >= params.max_abs_eval_for_great:
        return GreatMoveResult(
            is_great=False,
            reason="eval_too_large_matelike",
            mover_improvement_cp=mover_delta,
            cp_loss_for_mover_cp=None,
            delta_eval_white_cp=delta_eval_white,
            before_state=before_state,
            after_state=after_state,
        )

    # --- 2) CP loss vs engine-best from PRE (mover POV) ---
    if mover_color == "w":
        # More positive is better for White. If best_eval_pre > played_eval_pre,
        # we lost something vs best.
        cp_loss_for_mover = eval_best_pre_white - eval_played_pre_white
    else:
        # For Black, more negative is better. If played_eval_pre > best_eval_pre,
        # we lost something vs best.
        cp_loss_for_mover = eval_played_pre_white - eval_best_pre_white

    # Normalize multipv: if None, treat as best (1)
    norm_mpv = multipv_rank if multipv_rank is not None else 1

    # --- 3) Helper: state improvement check ---
    STATE_ORDER = ["Lost", "Worse", "Equalish", "Winning", "Won"]
    STATE_RANK = {s: i for i, s in enumerate(STATE_ORDER)}

    def state_rank(s: str) -> int:
        return STATE_RANK.get(s, 2)  # default to "Equalish" rank if unknown

    state_improves = state_rank(after_state) > state_rank(before_state)

    # Convenience flags
    perfect_loss = cp_loss_for_mover <= params.perfect_cp_loss_cp
    near_loss    = cp_loss_for_mover <= params.near_cp_loss_cp

    # --- 4) Type 1: Perfect Conversion Great ---
    type1_conversion_perfect = (
        perfect_loss and
        norm_mpv == 1 and
        state_improves
    )

    # --- 5) Type 2: Near-perfect Conversion Great ---
    type2_conversion_near = (
        near_loss and
        norm_mpv <= params.near_max_multipv_rank and
        state_improves and
        mover_delta >= params.near_min_improvement_cp
    )

    # --- 6) Type 3: Big Defensive Great (rescue from bad) ---
    is_bad_before = before_state in ("Worse", "Lost")
    is_better_after = after_state in ("Equalish", "Winning", "Won")

    type3_defense = (
        perfect_loss and
        norm_mpv == 1 and
        is_bad_before and
        (
            is_better_after or
            (after_state == "Worse" and mover_delta >= params.defense_min_improvement_cp)
        )
    )

    # --- 7) Type 4: Intra-bucket Equalish Great ---
    type4_intrabucket_equalish = (
        perfect_loss and
        norm_mpv == 1 and
        before_state == "Equalish" and
        after_state == "Equalish" and
        mover_delta >= params.intrabucket_equalish_min_improvement_cp
    )

    # --- 8) Aggregate decision ---
    is_great = (
        type1_conversion_perfect or
        type2_conversion_near or
        type3_defense or
        type4_intrabucket_equalish
    )

    if not is_great:
        # Debug log for non-great moves as well (useful for tuning)
        print("GREAT DEBUG:", {
            "before_state": before_state,
            "after_state": after_state,
            "mover_before_cp": mover_before,
            "mover_after_cp": mover_after,
            "mover_improvement_cp": mover_delta,
            "cp_loss_for_mover_cp": cp_loss_for_mover,
            "delta_eval_white_cp": delta_eval_white,
            "multipv_rank": norm_mpv,
            "type1_conversion_perfect": type1_conversion_perfect,
            "type2_conversion_near": type2_conversion_near,
            "type3_defense": type3_defense,
            "type4_intrabucket_equalish": type4_intrabucket_equalish,
            "is_great": False,
        })
        return GreatMoveResult(
            is_great=False,
            reason="conditions_not_met",
            mover_improvement_cp=mover_delta,
            cp_loss_for_mover_cp=cp_loss_for_mover,
            delta_eval_white_cp=delta_eval_white,
            before_state=before_state,
            after_state=after_state,
            pattern=None,
        )

    # Pick a pattern label (priority order)
    if type1_conversion_perfect:
        pattern = "conversion_perfect"
    elif type3_defense:
        pattern = "defense"
    elif type2_conversion_near:
        pattern = "conversion_near"
    else:
        pattern = "intrabucket_equalish"

    print("GREAT DEBUG:", {
        "before_state": before_state,
        "after_state": after_state,
        "mover_before_cp": mover_before,
        "mover_after_cp": mover_after,
        "mover_improvement_cp": mover_delta,
        "cp_loss_for_mover_cp": cp_loss_for_mover,
        "delta_eval_white_cp": delta_eval_white,
        "multipv_rank": norm_mpv,
        "pattern": pattern,
        "is_great": True,
    })

    return GreatMoveResult(
        is_great=True,
        reason="great_move",
        mover_improvement_cp=mover_delta,
        cp_loss_for_mover_cp=cp_loss_for_mover,
        delta_eval_white_cp=delta_eval_white,
        before_state=before_state,
        after_state=after_state,
        pattern=pattern,
    )




















# @dataclass
# class GreatMoveParams:
#     """
#     Tunables for 'Great' (!) moves (non-sac):

#     - Uses mover-POV eval (via cp_for_player).
#     - Requires a big improvement in the mover's position.
#     - Requires near-zero CP loss vs engine best from PRE.
#     - Ignores completely won / mate-ish positions to avoid spam.
#     """
#     # How much the mover's eval must improve (mover POV)
#     # (600 = 6 pawns; you can tweak to 800 if you want it rarer)
#     min_improvement_cp: int = 600

#     # Maximum CP loss vs engine-best from PRE (mover POV).
#     # 30cp ~ 0.3 pawn means "almost exactly engine move".
#     max_cp_loss_cp: int = 30

#     # Don't call Great if evals are in "mate-ish" / huge-adv territory.
#     # Applied to mover-POV eval BEFORE or AFTER the move.
#     max_abs_eval_for_great: int = 1500  # 15 pawns

#     min_improvement_conversion_cp: int = 300


# @dataclass
# class GreatMoveResult:
#     is_great: bool
#     reason: str
#     mover_improvement_cp: float
#     cp_loss_for_mover_cp: Optional[float]
#     delta_eval_white_cp: float
#     before_state: str = ""
#     after_state: str = ""
#     pattern: Optional[str] = None  # "conversion" or "defense" or None


# def detect_great_move(
#     *,
#     eval_before_white: float,                 # BEFORE move, White POV
#     eval_after_white: float,                  # AFTER move, White POV
#     eval_best_pre_white: Optional[float],     # best move eval from PRE, White POV
#     eval_played_pre_white: Optional[float],   # played move eval from PRE, White POV
#     mover_color: str,                         # 'w' or 'b'
#     params: Optional[GreatMoveParams] = None,
# ) -> GreatMoveResult:
#     """
#     'Great' move definition (non-sac, non-book – those are filtered outside):

#       1) Work in mover POV using cp_for_player + situation_from_cp.

#       2) Big improvement for mover:
#             mover_improvement_cp = mover_after - mover_before
#          require:
#             mover_improvement_cp >= min_improvement_cp

#       3) Near-best vs engine from PRE:
#             For White:
#                 cp_loss_for_mover = best_eval_pre - played_eval_pre
#             For Black:
#                 cp_loss_for_mover = played_eval_pre - best_eval_pre
#          require:
#             cp_loss_for_mover <= max_cp_loss_cp

#       4) Game-state patterns (mover POV):

#          Conversion Great (attacking):
#             - before_state in {Equalish, Winning}
#             - after_state  in {Winning, Won}

#          Defensive Great (saving):
#             - before_state in {Worse, Lost}
#             - after_state  in {Equalish, Winning, Won}

#       5) Ignore "mate-ish" / saturated evals:
#             if abs(mover_before) or abs(mover_after) >= max_abs_eval_for_great
#             → not Great (this stops spam when you're already +10 and mate in 2).
#     """
#     if params is None:
#         params = GreatMoveParams()

#     # Need both best and played PRE evals for CP-loss computation
#     if eval_best_pre_white is None or eval_played_pre_white is None:
#         return GreatMoveResult(
#             is_great=False,
#             reason="missing_best_or_played_pre_eval",
#             mover_improvement_cp=0.0,
#             cp_loss_for_mover_cp=None,
#             delta_eval_white_cp=0.0,
#         )

#     # --- 1) Convert to mover POV and bucket states ---
#     mover_before = cp_for_player(eval_before_white, mover_color)
#     mover_after  = cp_for_player(eval_after_white,  mover_color)
#     mover_delta  = mover_after - mover_before       # >0 good for mover

#     before_state = situation_from_cp(mover_before)  # Won / Winning / Equalish / Worse / Lost
#     after_state  = situation_from_cp(mover_after)

#     # raw white-centric delta if you want to log it
#     delta_eval_white = eval_after_white - eval_before_white

#     # --- 2) Guard against mate-ish / saturated evals ---
#     # Avoid calling Great in positions that are already completely decided
#     if abs(mover_before) >= params.max_abs_eval_for_great or abs(mover_after) >= params.max_abs_eval_for_great:
#         return GreatMoveResult(
#             is_great=False,
#             reason="eval_too_large_matelike",
#             mover_improvement_cp=mover_delta,
#             cp_loss_for_mover_cp=None,
#             delta_eval_white_cp=delta_eval_white,
#             before_state=before_state,
#             after_state=after_state,
#         )

#     # --- 3) Require big improvement for mover ---
#     # if mover_delta < params.min_improvement_cp:
#     #     return GreatMoveResult(
#     #         is_great=False,
#     #         reason="improvement_too_small",
#     #         mover_improvement_cp=mover_delta,
#     #         cp_loss_for_mover_cp=None,
#     #         delta_eval_white_cp=delta_eval_white,
#     #         before_state=before_state,
#     #         after_state=after_state,
#     #     )

#     # Allow a smaller threshold for clean Winning→Won conversions
#     winning_to_won = (before_state == "Winning" and after_state == "Won")

#     if winning_to_won:
#         # Need at least the smaller conversion threshold
#         if mover_delta < params.min_improvement_conversion_cp:
#             return GreatMoveResult(
#                 is_great=False,
#                 reason="improvement_too_small_winning_to_won",
#                 mover_improvement_cp=mover_delta,
#                 cp_loss_for_mover_cp=None,  # will be filled later if needed
#                 delta_eval_white_cp=delta_eval_white,
#                 before_state=before_state,
#                 after_state=after_state,
#             )
#     else:
#         # For all other patterns, use the original big threshold
#         if mover_delta < params.min_improvement_cp:
#             return GreatMoveResult(
#                 is_great=False,
#                 reason="improvement_too_small",
#                 mover_improvement_cp=mover_delta,
#                 cp_loss_for_mover_cp=None,
#                 delta_eval_white_cp=delta_eval_white,
#                 before_state=before_state,
#                 after_state=after_state,
#             )


#     # --- 4) CP loss vs engine-best from PRE (mover POV) ---
#     if mover_color == "w":
#         # More positive is better for White. If best_eval_pre > played_eval_pre,
#         # we lost something vs best.
#         cp_loss_for_mover = eval_best_pre_white - eval_played_pre_white
#     else:
#         # For Black, more negative is better. If played_eval_pre > best_eval_pre,
#         # we lost something vs best.
#         cp_loss_for_mover = eval_played_pre_white - eval_best_pre_white

#     if cp_loss_for_mover > params.max_cp_loss_cp:
#         return GreatMoveResult(
#             is_great=False,
#             reason="cp_loss_too_large",
#             mover_improvement_cp=mover_delta,
#             cp_loss_for_mover_cp=cp_loss_for_mover,
#             delta_eval_white_cp=delta_eval_white,
#             before_state=before_state,
#             after_state=after_state,
#         )

#     # --- 5) State-pattern filters: conversion or defensive Great ---
#     conversion_ok = (
#         before_state in ("Equalish", "Winning") and
#         after_state  in ("Winning", "Won")
#     )

#     defensive_ok = (
#         before_state in ("Worse", "Lost") and
#         after_state  in ("Equalish", "Winning", "Won")
#     )

#     if not (conversion_ok or defensive_ok):
#         return GreatMoveResult(
#             is_great=False,
#             reason="state_pattern_not_great",
#             mover_improvement_cp=mover_delta,
#             cp_loss_for_mover_cp=cp_loss_for_mover,
#             delta_eval_white_cp=delta_eval_white,
#             before_state=before_state,
#             after_state=after_state,
#         )

#     pattern = "conversion" if conversion_ok else "defense"

#     # --- 6) Passed all checks → Great move ---
#     print("GREAT DEBUG:", {
#         "before_state": before_state,
#         "after_state": after_state,
#         "mover_before_cp": mover_before,
#         "mover_after_cp": mover_after,
#         "mover_improvement_cp": mover_delta,
#         "cp_loss_for_mover_cp": cp_loss_for_mover,
#         "delta_eval_white_cp": delta_eval_white,
#         "pattern": pattern,
#     })

#     return GreatMoveResult(
#         is_great=True,
#         reason="great_move",
#         mover_improvement_cp=mover_delta,
#         cp_loss_for_mover_cp=cp_loss_for_mover,
#         delta_eval_white_cp=delta_eval_white,
#         before_state=before_state,
#         after_state=after_state,
#         pattern=pattern,
#     )

