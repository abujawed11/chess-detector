from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional
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
    Thresholds for sacrifice detection (all in centipawns).
    - small_sac_threshold_cp: minimum net loss to call it *any* sacrifice
    - big_sac_threshold_cp:   minimum net loss to call it a *big* sac
      (for brilliancies, etc.)
    - min_offered_piece_cp:   ignore cases where the offered piece face
      value (minus captured piece) is too small (e.g. pawn nudges)
    """
    small_sac_threshold_cp: int = 80    # ~1 pawn
    big_sac_threshold_cp:   int = 250   # ~minor piece / exchange
    min_offered_piece_cp:   int = 200   # require at least piece-sized risk


@dataclass
class SacrificeResult:
    """
    Output of detect_sacrifice().
    """
    is_real_sacrifice: bool       # >= small_sac_threshold_cp
    is_big_sacrifice: bool        # >= big_sac_threshold_cp (for brilliancy)
    worst_net_loss_cp: int        # max net (offered - taker) over accepting lines
    had_accepting_capture: bool
    offered_piece_cp: int
    num_attackers_opponent: int
    num_attackers_mover: int


def detect_sacrifice(
    board: chess.Board,
    move: chess.Move,
    params: Optional[SacrificeParams] = None,
    eval_func: Optional[Callable[[chess.Board], float]] = None,  # NEW
    use_eval_reject_filter: bool = True,   # NEW
) -> SacrificeResult:
    """
    Detect whether `move` is a material sacrifice using local exchange logic.
    - is_real_sacrifice: net loss >= small_sac_threshold_cp
    - is_big_sacrifice:  net loss >= big_sac_threshold_cp
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
            is_big_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=0,
            num_attackers_opponent=0,
            num_attackers_mover=0,
        )

    # Immediate capture value (what we take now)
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

    # If our moved piece is no longer there (e.g. promotion weirdness), bail
    if piece is None or piece.color != mover_color:
        return SacrificeResult(
            is_real_sacrifice=False,
            is_big_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=0,
            num_attackers_opponent=0,
            num_attackers_mover=0,
        )

    offered_piece_cp = PIECE_VALUES.get(piece.piece_type, 0)

    # How much face-value material are we putting at risk,
    # after accounting for the piece we just captured?
    risk_face_cp = max(0, offered_piece_cp - captured_cp)

    # If risk is too small, don't treat this as a sacrifice at all.
    if risk_face_cp < params.min_offered_piece_cp:
        return SacrificeResult(
            is_real_sacrifice=False,
            is_big_sacrifice=False,
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

    # No way to "accept" the sac if they can't capture the piece.
    if num_attackers_opponent == 0:
        return SacrificeResult(
            is_real_sacrifice=False,
            is_big_sacrifice=False,
            worst_net_loss_cp=0,
            had_accepting_capture=False,
            offered_piece_cp=offered_piece_cp,
            num_attackers_opponent=num_attackers_opponent,
            num_attackers_mover=num_attackers_mover,
        )

    # All legal captures that take our just-moved piece on target_sq.
    # accepting_moves = [
    #     mv for mv in b1.legal_moves
    #     if b1.is_capture(mv) and mv.to_square == target_sq
    # ]
    # had_accepting_capture = len(accepting_moves) > 0

    # for accept in accepting_moves:
    #     attacker_piece = b1.piece_at(accept.from_square)
    #     if attacker_piece is None:
    #         continue

    #     # Optional: don't count suicidal king captures if square is defended
    #     if attacker_piece.piece_type == chess.KING and num_attackers_mover > 0:
    #         continue

    #     attacker_val = PIECE_VALUES.get(attacker_piece.piece_type, 0)
    #     has_defender = num_attackers_mover > 0

    #     if not has_defender:
    #         # If we can't recapture at all, we just lose the face-value risk.
    #         net_loss = risk_face_cp
    #     else:
    #         # They take our piece (risk_face_cp), then we recapture their attacker.
    #         net_loss = risk_face_cp - attacker_val

    #     if net_loss > worst_net_loss:
    #         worst_net_loss = net_loss

        # All legal captures that take our just-moved piece on target_sq.
    accepting_moves = [
        mv for mv in b1.legal_moves
        if b1.is_capture(mv) and mv.to_square == target_sq
    ]
    had_accepting_capture = len(accepting_moves) > 0

    # NEW: track best (i.e. worst for us) eval after acceptance, mover POV
    best_after_accept_pov = float('+inf')  # we want min over all accepts

    for accept in accepting_moves:
        attacker_piece = b1.piece_at(accept.from_square)
        if attacker_piece is None:
            continue

        # Optional: don't count suicidal king captures if square is defended
        if attacker_piece.piece_type == chess.KING and num_attackers_mover > 0:
            continue

        attacker_val = PIECE_VALUES.get(attacker_piece.piece_type, 0)
        has_defender = num_attackers_mover > 0

        if not has_defender:
            # If we can't recapture at all, we just lose the face-value risk.
            net_loss = risk_face_cp
        else:
            # They take our piece (risk_face_cp), then we recapture their attacker.
            net_loss = risk_face_cp - attacker_val

        if net_loss > worst_net_loss:
            worst_net_loss = net_loss

        # ------------ NEW PART: engine eval of accept line ------------
        if eval_func is not None:
            b2 = b1.copy(stack=False)
            b2.push(accept)
            # eval from White POV
            eval_accept_white = eval_func(b2)
            # convert to mover POV
            after_accept_pov = cp_for_player(eval_accept_white, mover_color)

            # opponent chooses the capture that minimizes our eval
            if after_accept_pov < best_after_accept_pov:
                best_after_accept_pov = after_accept_pov
        # ------------ END NEW PART ------------

        # If we had an eval_func, and even the BEST accepting capture
        # still leaves the mover at least roughly OK (>= -50cp),
        # then this is NOT a real sacrifice – it's a tactical trick.
        if (
            use_eval_reject_filter
            and eval_func is not None
            and best_after_accept_pov != float('+inf')
        ):
            # threshold can be tuned; -50cp means "not clearly worse"
            if best_after_accept_pov >= -50:
                print("SAC DEBUG: Accepting never gives opponent real advantage -> not a sacrifice")
                return SacrificeResult(
                    is_real_sacrifice=False,
                    is_big_sacrifice=False,
                    worst_net_loss_cp=0,
                    had_accepting_capture=had_accepting_capture,
                    offered_piece_cp=offered_piece_cp,
                    num_attackers_opponent=num_attackers_opponent,
                    num_attackers_mover=num_attackers_mover,
                )



    # if eval_func is not None and best_after_accept_pov != float('+inf'):
    #     # threshold can be tuned; -50cp means "not clearly worse"
    #     if best_after_accept_pov >= -50:
    #         print("SAC DEBUG: Accepting never gives opponent real advantage -> not a sacrifice")
    #         return SacrificeResult(
    #             is_real_sacrifice=False,
    #             is_big_sacrifice=False,
    #             worst_net_loss_cp=0,
    #             had_accepting_capture=had_accepting_capture,
    #             offered_piece_cp=offered_piece_cp,
    #             num_attackers_opponent=num_attackers_opponent,
    #             num_attackers_mover=num_attackers_mover,
    #         )



    # Use the two thresholds you specified
    is_real_sacrifice = had_accepting_capture and \
        worst_net_loss >= params.small_sac_threshold_cp
    is_big_sacrifice  = had_accepting_capture and \
        worst_net_loss >= params.big_sac_threshold_cp

    print("SAC DEBUG:", {
        "move": move.uci(),
        "offered_piece_cp": offered_piece_cp,
        "captured_cp": captured_cp,
        "risk_face_cp": risk_face_cp,
        "num_attackers_opponent": num_attackers_opponent,
        "num_attackers_mover": num_attackers_mover,
        "worst_net_loss_cp": worst_net_loss,
        "had_accepting_capture": had_accepting_capture,
        "is_real_sacrifice": is_real_sacrifice,
        "is_big_sacrifice": is_big_sacrifice,
    })

    return SacrificeResult(
        is_real_sacrifice=is_real_sacrifice,
        is_big_sacrifice=is_big_sacrifice,
        worst_net_loss_cp=worst_net_loss,
        had_accepting_capture=had_accepting_capture,
        offered_piece_cp=offered_piece_cp,
        num_attackers_opponent=num_attackers_opponent,
        num_attackers_mover=num_attackers_mover,
    )


def is_real_sacrifice(board: chess.Board, move: chess.Move,
                      params: Optional[SacrificeParams] = None) -> bool:
    """
    Convenience helper for backwards compatibility:
    returns True if it's at least a *small* sacrifice.
    """
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




# ======================================================================
# 3) ADVANCED MISS DETECTION (FULL REPLACEMENT)
# ======================================================================

@dataclass
class MissResult:
    is_miss: bool
    reason: str


@dataclass
class MissParams:
    max_self_drop_cp: int = 750
    min_opportunity_cp: int = 200
    tactical_min_gain_cp: int = 200

    still_winning_cp: int = 300
    still_ok_cp: int = 600
    equal_band_cp: int = 150

    min_save_gain_cp: int = 250
    min_conversion_gain_cp: int = 200

    # Free material
    missed_material_min_gain_cp: int = 200

    # Forced mate
    mate_miss_max_plies: int = 4
    mate_miss_tolerance_plies: int = 1


def detect_miss(
    *,
    eval_pre_white: float,
    eval_after_white: float,
    eval_played_pre_white: float,
    eval_best_pre_white: Optional[float],
    mover_color: str,
    best_mate_in_plies: Optional[int] = None,
    played_mate_in_plies: Optional[int] = None,

    best_material_gain_cp: Optional[float] = None,
    played_material_gain_cp: Optional[float] = None,
    best_line_material_gain_cp: Optional[float] = None,

    board_before: Optional[chess.Board] = None,
    move: Optional[chess.Move] = None,
    best_move_uci: Optional[str] = None,

    params: Optional[MissParams] = None,
) -> MissResult:

    if params is None:
        params = MissParams()

    if eval_best_pre_white is None:
        return MissResult(False, "")

    # Convert all evals to mover POV
    pre_pov   = cp_for_player(eval_pre_white,        mover_color)
    after_pov = cp_for_player(eval_after_white,      mover_color)
    played_pov = cp_for_player(eval_played_pre_white, mover_color)
    best_pov   = cp_for_player(eval_best_pre_white,   mover_color)

    self_drop   = pre_pov - after_pov
    opportunity = best_pov - played_pov
    miss_gap    = best_pov - after_pov

    before_state = situation_from_cp(pre_pov)
    after_state  = situation_from_cp(after_pov)

    # 0) If the move is a real sacrifice → never a miss
    if board_before and move:
        sac_info = detect_sacrifice(board_before, move)
        if sac_info.is_real_sacrifice:
            return MissResult(False, "")

    # 1) Forced mate missed
    if best_mate_in_plies is not None:
        if best_mate_in_plies <= params.mate_miss_max_plies:
            lost_forced_mate = (
                played_mate_in_plies is None or
                played_mate_in_plies > best_mate_in_plies + params.mate_miss_tolerance_plies
            )
            if (
                lost_forced_mate and
                before_state in ("Winning", "Won") and
                after_state  in ("Winning", "Won")
            ):
                return MissResult(True, "missed_forced_mate")

    # 2) Huge blunder → not a Miss
    if self_drop > params.max_self_drop_cp:
        return MissResult(False, "")

    if after_pov <= -params.still_ok_cp:
        return MissResult(False, "")

    # 3) SAFE FREE MATERIAL MISSED
    # if best_material_gain_cp is not None:
    #     if (
    #         best_material_gain_cp >= params.missed_material_min_gain_cp and
    #         (played_material_gain_cp or 0) < best_material_gain_cp and
    #         self_drop <= params.max_self_drop_cp
    #     ):
    #         # Check safety with sacrifice logic on best move
    #         if best_move_uci and board_before:
    #             try:
    #                 best_mv = chess.Move.from_uci(best_move_uci)
    #                 if board_before.is_capture(best_mv):
    #                     sac_info2 = detect_sacrifice(board_before, best_mv)
    #                     safe = not sac_info2.is_real_sacrifice
    #                     if safe:
    #                         return MissResult(True, "missed_safe_free_material")
    #             except:
    #                 pass

        # 3) SAFE FREE MATERIAL MISSED (now checks PV result as well)
    if (
        best_material_gain_cp is not None and
        best_line_material_gain_cp is not None and
        best_move_uci and
        board_before is not None
    ):
        # PV must actually leave us clearly up material
        if best_line_material_gain_cp >= params.missed_material_min_gain_cp:
            if (
                best_material_gain_cp >= params.missed_material_min_gain_cp and
                (played_material_gain_cp or 0) < best_material_gain_cp and
                self_drop <= params.max_self_drop_cp
            ):
                try:
                    best_mv = chess.Move.from_uci(best_move_uci)
                    if board_before.is_capture(best_mv):
                        sac_info2 = detect_sacrifice(board_before, best_mv)
                        safe = not sac_info2.is_real_sacrifice
                        if safe:
                            print("MISS DEBUG: missed_safe_free_material = True", {
                                "best_material_gain_cp": best_material_gain_cp,
                                "played_material_gain_cp": played_material_gain_cp,
                                "best_line_material_gain_cp": best_line_material_gain_cp,
                            })
                            return MissResult(True, "missed_safe_free_material")
                except Exception:
                    pass


    # 4) PV material win missed (ignore played_material_gain_cp; trust PV)
    if best_line_material_gain_cp is not None and best_move_uci and move is not None:
        played_uci = move.uci()

        # Only if we did NOT start the best PV
        if played_uci != best_move_uci:
            if (
                # PV shows a *real* big win (queen, piece, etc.)
                best_line_material_gain_cp >= params.missed_material_min_gain_cp and

                # We're not completely dead-lost beforehand
                before_state not in ("Lost",) and

                # We didn't totally destroy our position (otherwise it's pure blunder)
                self_drop <= params.max_self_drop_cp
            ):
                print("MISS DEBUG: missed_pv_material_gain = True", {
                    "best_line_material_gain_cp": best_line_material_gain_cp,
                    "before_state": before_state,
                    "after_state": after_state,
                    "best_move_uci": best_move_uci,
                    "played_move_uci": played_uci,
                })
                return MissResult(True, "missed_pv_material_gain")


        # 4) PV material win missed (STRICT + only if we did NOT play the PV move)
    # if best_line_material_gain_cp is not None and best_move_uci and move is not None:
    #     played_uci = move.uci()

    #     # If we actually played the engine's best move, it's *not* a PV miss.
    #     if played_uci != best_move_uci:
    #         played_gain = played_material_gain_cp or 0
    #         extra_gain  = best_line_material_gain_cp - played_gain

    #         if (
    #             # PV wins clearly more material than our move
    #             extra_gain >= params.missed_material_min_gain_cp and  # e.g. 200–300

    #             # We're not totally lost before/after
    #             before_state not in ("Lost",) and
    #             after_state  not in ("Lost",) and

    #             # We didn't nuke our position (then it's a blunder, not Miss)
    #             self_drop <= params.max_self_drop_cp and

    #             # Tactic should matter – mostly in equal / winning positions
    #             before_state in ("Equalish", "Winning")
    #         ):
    #             print("MISS DEBUG: missed_pv_material_gain = True", {
    #                 "best_line_material_gain_cp": best_line_material_gain_cp,
    #                 "played_material_gain_cp": played_gain,
    #                 "extra_gain_cp": extra_gain,
    #                 "before_state": before_state,
    #                 "after_state": after_state,
    #                 "best_move_uci": best_move_uci,
    #                 "played_move_uci": played_uci,
    #             })
    #             return MissResult(True, "missed_pv_material_gain")



    # if best_line_material_gain_cp is not None:
    #     played_gain = played_material_gain_cp or 0
    #     extra_gain = best_line_material_gain_cp - played_gain

    #     if (
    #         # Must clearly win more material than what we got
    #         extra_gain >= 250 and

    #         # We are not dead lost before and after
    #         before_state not in ("Lost",) and
    #         after_state  not in ("Lost",) and

    #         # We didn't blunder our position
    #         self_drop <= params.max_self_drop_cp and

    #         # The PV tactic should matter: only when position is <= Winning
    #         before_state in ("Equalish", "Winning") and

    #         # Our move didn't keep the tactic alive
    #         played_gain < best_line_material_gain_cp
    #     ):
    #         return MissResult(True, "missed_pv_material_gain")


    # 5) Simple tactical miss
    # cp_shot = max(opportunity, miss_gap)
    # if (
    #     cp_shot >= params.tactical_min_gain_cp and
    #     self_drop <= params.max_self_drop_cp and
    #     after_pov > -params.still_ok_cp
    # ):
    #     return MissResult(True, "big_tactical_miss")

    # 6) No big chance → no miss
    # if cp_shot < params.min_opportunity_cp:
    #     return MissResult(False, "")

    # 7) Missed conversion while winning
    # if (
    #     before_state in ("Winning", "Won") and
    #     after_state  in ("Winning", "Won") and
    #     miss_gap >= params.min_conversion_gain_cp
    # ):
    #     return MissResult(True, "missed_conversion_while_winning")

    # 8) Missed defensive save
    # if before_state in ("Worse", "Lost"):
    #     if (
    #         opportunity >= params.min_save_gain_cp and
    #         best_pov >= pre_pov + params.min_save_gain_cp
    #     ):
    #         return MissResult(True, "missed_defensive_save")

    # 9) Equal → winning missed
    # if before_state in ("Equalish", "Winning"):
    #     if (
    #         opportunity >= params.min_conversion_gain_cp and
    #         best_pov >= pre_pov + params.min_conversion_gain_cp
    #     ):
    #         return MissResult(True, "missed_small_conversion")

    # 10) Equalish big tactical
    # if abs(pre_pov) <= params.equal_band_cp:
    #     if best_pov >= pre_pov + params.tactical_min_gain_cp:
    #         return MissResult(True, "equalish_big_tactical")

    # 11) Fallback
    # if opportunity >= params.min_opportunity_cp:
    #     if best_pov >= pre_pov + params.min_conversion_gain_cp:
    #         return MissResult(True, "fallback_big_opportunity")

    return MissResult(False, "")






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
    is_big_sacrifice: bool   # ← ADD THIS


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

    # If not a *big* sac, never Brilliant
    if not sac_result.is_big_sacrifice:
        return SacBrilliancyResult(
            is_brilliant=False,
            reason="not_sacrifice",
            adv_before_mover=adv_for_mover(eval_before_white, mover_color),
            adv_after_best_reply=adv_for_mover(eval_best_reply_white, mover_color),
            adv_after_accept=None if eval_accept_white is None else adv_for_mover(eval_accept_white, mover_color),
            gap_to_best_cp=None,
            is_real_sacrifice=sac_result.is_real_sacrifice,
            is_big_sacrifice=False,
        )

    # --- 1) Base advantages (mover POV) ---
    adv_before_mover = adv_for_mover(eval_before_white, mover_color)
    adv_after_reply  = adv_for_mover(eval_best_reply_white, mover_color)
    adv_after_move   = adv_for_mover(eval_after_white,  mover_color)

    adv_after_accept: Optional[float] = None
    if eval_accept_white is not None:
        adv_after_accept = adv_for_mover(eval_accept_white, mover_color)

    # Game states based on mover POV
    before_state = situation_from_cp(adv_before_mover)
    after_state  = situation_from_cp(adv_after_reply)

    # --- 2) Gap to best from PRE (mover POV) ---
    gap_to_best: Optional[float] = None
    if eval_best_pre_white is not None:
        played_pre = eval_played_pre_white if eval_played_pre_white is not None else eval_after_white
        if mover_color == 'w':
            gap_to_best = eval_best_pre_white - played_pre
        else:
            gap_to_best = played_pre - eval_best_pre_white

    gap_ok = True
    if gap_to_best is not None:
        gap_ok = (gap_to_best <= params.max_gap_to_best_cp)

    # --- 3) Advantage drop after best reply ---
    adv_drop = adv_before_mover - adv_after_reply

    drop_ok = True
    if adv_before_mover > params.win_after_reply_cp:
        drop_ok = (adv_drop <= params.max_adv_drop_cp)

    win_after_reply_ok = (adv_after_reply >= params.win_after_reply_cp)

    if eval_accept_white is not None:
        win_after_accept_ok = (adv_after_accept is not None and adv_after_accept >= params.win_after_accept_cp)
    else:
        win_after_accept_ok = True

    # Mate rescue / attack flags (optional, you already had these)
    lost_threshold_cp = 300
    draw_band_cp      = 60

    winning_sac = (
        sac_result.is_real_sacrifice and
        before_state in ("Equalish", "Winning", "Won") and
        after_state  in ("Winning", "Won")
    )

    draw_rescue_sac = (
        sac_result.is_real_sacrifice and
        before_state in ("Worse", "Lost") and
        abs(adv_after_reply) <= draw_band_cp
    )

    mate_attack_sac = (
        mate_for_mover_after is not None and
        mate_for_mover_after <= 5
    )

    mate_defense_sac = (
        mate_for_opponent_before is not None and
        mate_for_opponent_before <= 5 and
        (mate_for_opponent_after is None or mate_for_opponent_after > mate_for_opponent_before + 2)
    )

    # Final Brilliant flag
    is_brilliant = (
        sac_result.is_big_sacrifice and
        gap_ok and
        drop_ok and
        (winning_sac or draw_rescue_sac or mate_attack_sac or mate_defense_sac) and
        win_after_reply_ok and
        win_after_accept_ok
    )

    # Reason string (for debug)
    if is_brilliant:
        reason = "brilliant_sacrifice"
    else:
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
        "is_big_sacrifice": sac_result.is_big_sacrifice,
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
        is_big_sacrifice=sac_result.is_big_sacrifice,
    )



# ======================================================================
# 6) GREAT MOVE DETECTION (UPDATED)
# ======================================================================

@dataclass
class GreatMoveParams:

    # "Perfect" CP loss threshold (0 means exactly best)
    perfect_cp_loss_cp: int = 0

    # Near-perfect CP loss threshold for Type 2 (e.g. 30cp = 0.3 pawn)
    near_cp_loss_cp: int = 30

    # Minimum improvement (mover POV) for near-perfect conversions (Type 2)
    near_min_improvement_cp: int = 80

    # Minimum improvement for defensive rescues that stay in "Worse" (Type 3)
    defense_min_improvement_cp: int = 60

     # Minimum improvement when state improves (Lost/Worse → Equalish/Winning/Won)
    defense_state_min_improvement_cp: int = 60

    # Minimum improvement for intra-bucket Equalish Great (Type 4)
    intrabucket_equalish_min_improvement_cp: int = 150

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
    eval_before_white: float,
    eval_after_white: float,
    eval_best_pre_white: Optional[float],
    eval_played_pre_white: Optional[float],
    mover_color: str,
    multipv_rank: Optional[int],

    # PV-based fields
    best_move_uci: Optional[str] = None,
    best_line_material_gain_cp: Optional[int] = None,
    played_material_gain_cp: Optional[int] = None,
    move: Optional[chess.Move] = None,
    board_before: Optional[chess.Board] = None,

    params: Optional[GreatMoveParams] = None,
) -> GreatMoveResult:
    """
    PURE PV-CENTRIC 'Great' (!) move detector.

    - No CPL buckets (Best/Good/Inaccuracy/etc. handled elsewhere).
    - No CP-loss-vs-best patterns (perfect/near-perfect conversion).
    - We only use eval/CP as *gates* to check that the PV tactic
      actually changes the game (big eval jump, rescue from bad, etc.).

    Patterns:

      1) pv_tactical_win  (PV starter, big winning tactic)
      2) pv_defense       (PV starter, only defensive resource)
      3) pv_alternative   (Different move, same big tactical win)
    """
    if params is None:
        params = GreatMoveParams()

    # -------------------------------------------------------
    # 1) Basic POV + states (computed ONCE)
    # -------------------------------------------------------
    mover_before = cp_for_player(eval_before_white, mover_color)
    mover_after  = cp_for_player(eval_after_white,  mover_color)
    mover_delta  = mover_after - mover_before          # >0 = good for mover

    before_state = situation_from_cp(mover_before)     # "Won"/"Winning"/"Equalish"/"Worse"/"Lost"
    after_state  = situation_from_cp(mover_after)

    delta_eval_white = eval_after_white - eval_before_white

    # Ignore positions that are already completely decided (mate-ish)
    if (
        abs(mover_before) >= params.max_abs_eval_for_great or
        abs(mover_after)  >= params.max_abs_eval_for_great
    ):
        return GreatMoveResult(
            is_great=False,
            reason="eval_too_large_matelike",
            mover_improvement_cp=mover_delta,
            cp_loss_for_mover_cp=None,
            delta_eval_white_cp=delta_eval_white,
            before_state=before_state,
            after_state=after_state,
            pattern=None,
        )

    # We still keep multipv rank normalized (can be used later if needed)
    norm_mpv = multipv_rank if multipv_rank is not None else 1

    # -------------------------------------------------------
    # 2) Require basic PV data
    # -------------------------------------------------------
    if best_move_uci is None or best_line_material_gain_cp is None or move is None:
        return GreatMoveResult(
            is_great=False,
            reason="missing_pv_data",
            mover_improvement_cp=mover_delta,
            cp_loss_for_mover_cp=None,
            delta_eval_white_cp=delta_eval_white,
            before_state=before_state,
            after_state=after_state,
            pattern=None,
        )

    played_uci = move.uci()

    # -------------------------------------------------------
    # Helper: quick "was I clearly worse before?"
    # -------------------------------------------------------
    was_bad_before = before_state in ("Worse", "Lost")
    became_good_or_equal = after_state in ("Equalish", "Winning", "Won")

    # -------------------------------------------------------
    # 3) Pattern #1: PV STARTER — Tactical win that changes the game
    #    - You play the engine's best move
    #    - PV line wins big material (≥ 300cp)
    #    - Position actually improves for the mover (mover_delta)
    #    - Typically from Equalish/Worse/Lost to something better
    # -------------------------------------------------------
    if (
        played_uci == best_move_uci and
        best_line_material_gain_cp >= 300 and
        mover_delta >= 120 and                      # eval jumps meaningfully
        before_state in ("Equalish", "Worse", "Lost")
    ):
        return GreatMoveResult(
            is_great=True,
            reason="pv_starter_tactical_win",
            mover_improvement_cp=mover_delta,
            cp_loss_for_mover_cp=None,
            delta_eval_white_cp=delta_eval_white,
            before_state=before_state,
            after_state=after_state,
            pattern="pv_tactical_win",
        )

    # -------------------------------------------------------
    # 4) Pattern #2: PV STARTER — Defensive resource
    #    - You were clearly worse before (Worse/Lost)
    #    - You play the best move
    #    - Best PV line saves a lot (≥ 150cp of material swing)
    #    - Position improves significantly (often to Equalish+)
    # -------------------------------------------------------
    if (
        played_uci == best_move_uci and
        best_line_material_gain_cp >= 150 and
        was_bad_before and
        became_good_or_equal and
        mover_delta >= 150
    ):
        return GreatMoveResult(
            is_great=True,
            reason="pv_starter_defensive_resource",
            mover_improvement_cp=mover_delta,
            cp_loss_for_mover_cp=None,
            delta_eval_white_cp=delta_eval_white,
            before_state=before_state,
            after_state=after_state,
            pattern="pv_defense",
        )

    # -------------------------------------------------------
    # 5) Pattern #3: PV ALTERNATIVE — Different move, same big tactic
    #    - Played move is NOT engine's top move
    #    - But its PV also wins big material
    #    - Both best PV and played PV are large tactical wins
    #    - Position improves non-trivially from Equalish/Worse/Lost
    # -------------------------------------------------------
    if (
        played_uci != best_move_uci and
        played_material_gain_cp is not None and
        best_line_material_gain_cp >= 400 and      # both lines huge
        played_material_gain_cp >= 300 and
        mover_delta >= 100 and
        before_state in ("Equalish", "Worse", "Lost")
    ):
        return GreatMoveResult(
            is_great=True,
            reason="pv_alternative_combination",
            mover_improvement_cp=mover_delta,
            cp_loss_for_mover_cp=None,
            delta_eval_white_cp=delta_eval_white,
            before_state=before_state,
            after_state=after_state,
            pattern="pv_alternative",
        )

    # -------------------------------------------------------
    # 6) No Great pattern matched
    # -------------------------------------------------------
    # (Optional) debug print for tuning:
    print("GREAT DEBUG:", {
        "before_state": before_state,
        "after_state": after_state,
        "mover_before_cp": mover_before,
        "mover_after_cp": mover_after,
        "mover_delta": mover_delta,
        "best_move_uci": best_move_uci,
        "played_uci": played_uci,
        "best_line_material_gain_cp": best_line_material_gain_cp,
        "played_material_gain_cp": played_material_gain_cp,
        "norm_mpv": norm_mpv,
    })

    return GreatMoveResult(
        is_great=False,
        reason="conditions_not_met",
        mover_improvement_cp=mover_delta,
        cp_loss_for_mover_cp=None,
        delta_eval_white_cp=delta_eval_white,
        before_state=before_state,
        after_state=after_state,
        pattern=None,
    )

