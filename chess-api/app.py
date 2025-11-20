import base64
import os
import sys
import time
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from io import BytesIO
from inference import Detector
import logging
import chess

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Add path setup for utils
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Import chess helpers
from utils.chess_helpers import (
    analyze_fen_multipv,
    analyze_fen_multipv_persistent,
    start_engine,
    ENGINE_PATH,
)

# Import move classification logic
from basic_move_labels import (
    classify_basic_move,
    detect_great_move,
    detect_miss,
    detect_missed_accept_sacrifice,
    detect_sacrifice,
    detect_sac_brilliancy,
    material_gain_for_move,
)

from opening_book import is_book_move

from basic_move_labels import cp_for_player

# from basic_move_labels import (
#     classify_basic_move,
#     detect_miss,
#     detect_book_move,
#     classify_exclam_move,
#     is_real_sacrifice,
# )

# from opening_book import is_book_move

BOARD_MODEL_PATH = os.getenv("BOARD_MODEL_PATH")
PIECES_MODEL_PATH = os.getenv("PIECES_MODEL_PATH")
BOARD_CONF = float(os.getenv("BOARD_CONF", 0.25))
PIECES_CONF = float(os.getenv("PIECES_CONF", 0.25))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

app = FastAPI(title="Chess Detector API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models once at startup
DETECTOR = Detector(
    board_model_path=BOARD_MODEL_PATH,
    pieces_model_path=PIECES_MODEL_PATH,
    board_conf=BOARD_CONF,
    pieces_conf=PIECES_CONF,
)

# Global persistent Stockfish engine
persistent_engine = None

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/infer")
async def infer(
    file: UploadFile = File(...),
    flip_ranks: bool = Form(False),
    corners: str = Form(None)  # JSON string of corners [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
):
    try:
        import json
        content = await file.read()
        image = Image.open(BytesIO(content))

        # Parse manual corners if provided
        manual_corners = None
        if corners:
            try:
                manual_corners = json.loads(corners)
            except:
                pass

        result, overlay_png, debug_png = DETECTOR.run(
            image,
            flip_ranks=flip_ranks,
            manual_corners=manual_corners
        )

        # Encode overlay image (warped board with detections)
        overlay_b64 = base64.b64encode(overlay_png).decode("ascii")
        result["overlay_png_base64"] = f"data:image/png;base64,{overlay_b64}"

        # Encode debug image (original image with detected corners)
        debug_b64 = base64.b64encode(debug_png).decode("ascii")
        result["debug_png_base64"] = f"data:image/png;base64,{debug_b64}"

        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


# Stockfish Engine Endpoints
@app.post("/start_engine")
async def start_engine_endpoint():
    """Start the persistent Stockfish engine"""
    global persistent_engine
    try:
        # Check if already running and healthy
        if persistent_engine is not None:
            try:
                proc, send, recv = persistent_engine
                if proc.poll() is None:  # Process is still alive
                    logger.info("Engine already running and healthy")
                    return JSONResponse({
                        "status": "already_running",
                        "message": "Engine is already running",
                        "engine_path": ENGINE_PATH
                    })
                else:
                    logger.warning(f"Existing engine process died (returncode={proc.returncode}), restarting...")
                    persistent_engine = None
            except Exception as check_error:
                logger.warning(f"Error checking existing engine: {check_error}, will restart")
                persistent_engine = None

        # Log environment
        logger.info(f"STOCKFISH_PATH from env: {os.getenv('STOCKFISH_PATH')}")
        logger.info(f"ENGINE_PATH being used: {ENGINE_PATH}")
        logger.info(f"Engine file exists: {os.path.exists(ENGINE_PATH)}")

        if not os.path.exists(ENGINE_PATH):
            raise FileNotFoundError(f"Stockfish binary not found at: {ENGINE_PATH}")

        logger.info("Starting persistent Stockfish engine...")
        hash_mb = 512
        threads = 4
        
        try:
            persistent_engine = start_engine({"Hash": hash_mb, "Threads": threads})
            logger.info(f"Stockfish engine started successfully (Hash={hash_mb}MB, Threads={threads})")
        except Exception as start_error:
            logger.error(f"Failed to start engine: {start_error}", exc_info=True)
            persistent_engine = None
            raise

        return JSONResponse({
            "status": "started",
            "message": "Engine started successfully",
            "engine_path": ENGINE_PATH,
            "hash_mb": hash_mb,
            "threads": threads
        })
        
    except FileNotFoundError as e:
        logger.error(f"Stockfish binary not found: {str(e)}")
        return JSONResponse({
            "status": "error",
            "message": f"Stockfish binary not found: {str(e)}",
            "engine_path": ENGINE_PATH
        }, status_code=500)
    except Exception as e:
        logger.error(f"Failed to start engine: {str(e)}", exc_info=True)
        return JSONResponse({
            "status": "error",
            "message": f"Engine initialization failed: {str(e)}",
            "details": str(type(e).__name__)
        }, status_code=500)


@app.post("/stop_engine")
async def stop_engine_endpoint():
    """Stop the persistent Stockfish engine"""
    global persistent_engine
    try:
        if persistent_engine is None:
            return JSONResponse({
                "status": "not_running",
                "message": "Engine is not running"
            })

        logger.info("Stopping persistent Stockfish engine...")
        proc, send, recv = persistent_engine
        try:
            proc.kill()
        except Exception:
            pass
        persistent_engine = None
        logger.info("Engine stopped")

        return JSONResponse({
            "status": "stopped",
            "message": "Engine stopped successfully"
        })
    except Exception as e:
        logger.error(f"Failed to stop engine: {str(e)}")
        return JSONResponse({
            "status": "error",
            "message": str(e)
        }, status_code=500)


@app.get("/engine_status")
async def engine_status():
    """Get the status of the Stockfish engine"""
    return JSONResponse({
        "running": persistent_engine is not None,
        "engine_path": ENGINE_PATH,
        "engine_exists": os.path.exists(ENGINE_PATH)
    })


@app.post("/analyze")
async def analyze_position(
    fen: str = Form(...),
    depth: int = Form(18),
    multipv: int = Form(3)
):
    """
    Analyze a chess position from FEN string - returns frontend-compatible format

    Args:
        fen: FEN string of the position to analyze
        depth: Search depth (default: 18)
        multipv: Number of principal variations to return (default: 3)

    Returns:
        {
            "evaluation": { "type": "cp" | "mate", "value": number },
            "lines": [
                {
                    "multipv": number,
                    "cp": number | null,
                    "mate": number | null,
                    "depth": number,
                    "pv": ["e2e4", "e7e5", ...],
                    "pvSan": "1. e4 e5 2. Nf3 Nc6 ..." (optional)
                }
            ],
            "depth": number,
            "bestMove": "e2e4"
        }
    """
    global persistent_engine

    try:
        start_time = time.time()
        logger.info(f"📊 /analyze request: FEN={fen[:60]}... depth={depth} multipv={multipv}")

        # Validate FEN
        try:
            board = chess.Board(fen)
        except Exception as e:
            logger.error(f"Invalid FEN: {str(e)}")
            return JSONResponse({
                "error": "INVALID_FEN",
                "message": f"Invalid FEN string: {str(e)}"
            }, status_code=400)

        # Analyze using persistent engine if available, otherwise create temporary one
        results = None
        if persistent_engine is not None:
            try:
                results = analyze_fen_multipv_persistent(fen, persistent_engine, depth=depth, multipv=multipv)
            except Exception as engine_error:
                logger.error(f"Persistent engine failed: {str(engine_error)}")
                logger.info("Restarting persistent engine...")
                
                # Kill the dead engine
                try:
                    proc, send, recv = persistent_engine
                    proc.kill()
                except:
                    pass
                
                # Restart persistent engine
                try:
                    persistent_engine = start_engine({"Hash": 512, "Threads": 4})
                    logger.info("Engine restarted successfully")
                    # Try analysis again with new engine
                    results = analyze_fen_multipv_persistent(fen, persistent_engine, depth=depth, multipv=multipv)
                except Exception as restart_error:
                    logger.error(f"Failed to restart engine: {str(restart_error)}")
                    # Fall back to temporary engine
                    logger.info("Falling back to temporary engine...")
                    persistent_engine = None
        
        # If persistent engine not available or failed, use temporary engine
        if results is None:
            logger.info("Using temporary engine for analysis")
            results = analyze_fen_multipv(fen, depth=depth, multipv=multipv)

        if not results:
            logger.warning("No analysis results returned from engine")
            return JSONResponse({
                "error": "NO_RESULTS",
                "message": "Engine returned no analysis results"
            }, status_code=500)

        # Convert to frontend-compatible format
        # Frontend expects { evaluation, lines, depth, bestMove }
        lines = []
        for item in results:
            score = item.get("score", {})
            pv = item.get("pv", [])
            
            line = {
                "multipv": item.get("multipv", 1),
                "cp": score.get("value") if score.get("type") == "cp" else None,
                "mate": score.get("value") if score.get("type") == "mate" else None,
                "depth": depth,
                "pv": pv,
                "score": score  # Include original score for compatibility
            }
            
            # Optional: Convert PV to SAN notation
            try:
                temp_board = chess.Board(fen)
                san_moves = []
                for uci_move in pv[:10]:  # Limit to first 10 moves for performance
                    try:
                        move = chess.Move.from_uci(uci_move)
                        san = temp_board.san(move)
                        san_moves.append(san)
                        temp_board.push(move)
                    except:
                        break
                if san_moves:
                    line["pvSan"] = " ".join(san_moves)
            except Exception:
                pass
            
            lines.append(line)

        # Top evaluation is from the first line
        evaluation = results[0].get("score", {"type": "cp", "value": 0}) if results else {"type": "cp", "value": 0}
        
        # Best move is the first move of the first PV
        best_move = results[0].get("pv", [None])[0] if results else None

        elapsed = time.time() - start_time
        logger.info(f"✅ /analyze complete in {elapsed:.2f}s: eval={evaluation} bestMove={best_move}")

        return JSONResponse({
            "evaluation": evaluation,
            "lines": lines,
            "depth": depth,
            "bestMove": best_move,
            # Extra metadata (optional)
            "fen": fen,
            "side_to_move": "white" if board.turn == chess.WHITE else "black"
        })

    except Exception as e:
        logger.error(f"Error in /analyze: {str(e)}", exc_info=True)
        return JSONResponse({
            "error": "ANALYSIS_FAILED",
            "message": str(e)
        }, status_code=500)


# Material values for evaluation
PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 300,
    chess.BISHOP: 300,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}

MATE_CP   = 32000
MATE_STEP = 1000


def eval_for_white(score: dict, side_to_move: str) -> int:
    """
    Convert a Stockfish score dict + side_to_move into a centipawn eval
    from White's perspective ONLY.
    +ve => good for White, -ve => good for Black
    """
    if not score:
        return 0

    t = score.get("type")
    v = score.get("value", 0)

    if t == "cp":
        try:
            v = int(v)
        except Exception:
            v = 0
        return v if side_to_move == "w" else -v

    if t == "mate":
        try:
            v = int(v)
        except Exception:
            v = 0

        sign_for_white = 1 if side_to_move == "w" else -1
        white_mate_val = v * sign_for_white

        if white_mate_val == 0:
            return 0

        n = abs(white_mate_val)
        base = max(0, MATE_CP - MATE_STEP * n)
        return base if white_mate_val > 0 else -base

    try:
        return int(v)
    except Exception:
        return 0


def played_rank_and_gap(uci_move, pvs, side_to_move: str):
    """
    Return (rank, top_gap_cp, played_eval_cp, best_eval_cp)
    """
    if not pvs:
        return (1, None, None, None)

    uci_move_normalized = uci_move.lower().strip().replace("=", "")
    K = len(pvs)

    best_eval_cp = eval_for_white(pvs[0]["score"], side_to_move)

    for pv_entry in pvs:
        pv = pv_entry.get("pv", [])
        if not pv:
            continue

        pv_move = pv[0].lower().strip().replace("=", "")

        is_match = False
        if pv_move == uci_move_normalized:
            is_match = True
        elif len(pv_move) >= 4 and len(uci_move_normalized) >= 4 and pv_move[:4] == uci_move_normalized[:4]:
            if len(pv_move) == len(uci_move_normalized):
                if len(pv_move) == 4:
                    is_match = True
                elif len(pv_move) == 5 and pv_move[4] == uci_move_normalized[4]:
                    is_match = True
            else:
                is_match = True

        if is_match:
            rank = pv_entry["multipv"]
            played_eval_cp = eval_for_white(pv_entry["score"], side_to_move)
            top_gap = abs(best_eval_cp - played_eval_cp)
            logger.info(f"Move '{uci_move_normalized}' found at rank {rank}, gap={top_gap:.1f}cp")
            return (rank, top_gap, played_eval_cp, best_eval_cp)

    logger.warning(f"Move '{uci_move_normalized}' not found in any PV")
    return (K + 1, None, None, best_eval_cp)


def analyze_or_fail(fen: str, depth: int, multipv: int, engine):
    """Return PV list or raise with a clear message after retries"""
    tries = [
        (depth, multipv),
        (max(8, depth - 4), multipv),
        (max(6, depth - 6), 1),
    ]
    last_err = None
    for d, k in tries:
        try:
            if engine is not None:
                pvs = analyze_fen_multipv_persistent(fen, engine, depth=d, multipv=k)
            else:
                pvs = analyze_fen_multipv(fen, depth=d, multipv=k)
            if pvs:
                return pvs
        except Exception as e:
            last_err = e
    raise RuntimeError(f"No PVs returned for fen='{fen[:60]}...'. Last error: {last_err}")



# def eval_best_accept_line_white(
#     board_before: chess.Board,
#     sac_target_square: int,
#     mover_color: str,
#     depth: int,
#     engine,
# ) -> Optional[float]:
#     """
#     Compute eval_from_white POV after the *best* accepting capture
#     on sac_target_square, from board_before.

#     Returns:
#         eval_accept_white (centipawns from White POV) or None
#         if no accepting capture exists.
#     """
#     # Find all legal accepting captures
#     accepting_moves = [
#         mv for mv in board_before.legal_moves
#         if board_before.is_capture(mv) and mv.to_square == sac_target_square
#     ]

#     if not accepting_moves:
#         return None

#     best_eval_white = None
#     best_eval_mover = None

#     for mv in accepting_moves:
#         b_accept = board_before.copy(stack=False)
#         b_accept.push(mv)
#         accept_fen = b_accept.fen()

#         # Analyze accept position
#         post = analyze_or_fail(accept_fen, depth, 1, engine)
#         score_accept = post[0]["score"]

#         side_after_accept = "w" if b_accept.turn == chess.WHITE else "b"
#         eval_accept_white = eval_for_white(score_accept, side_after_accept)

#         # Choose the accept line that is best for the *mover*
#         mover_eval = cp_for_player(eval_accept_white, mover_color)
#         if best_eval_white is None:
#             best_eval_white = eval_accept_white
#             best_eval_mover = mover_eval
#         else:
#             if mover_eval > best_eval_mover:
#                 best_eval_white = eval_accept_white
#                 best_eval_mover = mover_eval

#     return best_eval_white



@app.post("/evaluate")
async def evaluate_move(
    fen: str = Form(...),
    move: str = Form(...),
    depth: int = Form(18),
    multipv: int = Form(5)
):
    """
    Evaluate a move and classify it (Best/Good/Inaccuracy/Mistake/Blunder/Brilliant/Great/Miss/Book)

    Args:
        fen: FEN string of position BEFORE the move
        move: UCI move string (e.g., "e2e4")
        depth: Search depth (default: 18)
        multipv: Number of principal variations (default: 5)

    Returns:
        Complete move evaluation with classification
    """
    def mate_ply(score_dict):
        if not score_dict:
            return None
        if score_dict.get("type") == "mate":
            try:
                return abs(int(score_dict.get("value", 0)))
            except Exception:
                return None
        return None

    global persistent_engine

    logger.info(f"Evaluating move: {move} for FEN: {fen[:60]}...")

    try:
        board_before = chess.Board(fen)
        fen_before = fen
        side_before = "w" if board_before.turn == chess.WHITE else "b"
        fullmove_number = board_before.fullmove_number

        # PRE analysis (multi-PV)
        pre = analyze_or_fail(fen_before, depth, multipv, persistent_engine)
        pre_score = pre[0]["score"]
        eval_before_cp = eval_for_white(pre_score, side_before)

        multipv_rank, top_gap, played_eval_from_pre, best_eval_from_pre = played_rank_and_gap(
            move, pre, side_before
        )



        # --- NEW: material gain for best move vs played move (from PRE position) ---
        best_material_gain_cp = None
        played_material_gain_cp = None
        best_move_uci = None   # <--- add this

        # Best move from PRE (engine)
        try:
            # Assuming your engine output has "pv": ["e2e4", "d2d4", ...]
            if pre and "pv" in pre[0] and pre[0]["pv"]:
                best_move_uci = pre[0]["pv"][0]
                best_move_obj = chess.Move.from_uci(best_move_uci)
                best_material_gain_cp = material_gain_for_move(board_before, best_move_obj)
        except Exception as e:
            print("ERROR computing best_material_gain_cp:", e)

        # Played move from PRE
        try:
            played_move_obj = chess.Move.from_uci(move)
            played_material_gain_cp = material_gain_for_move(board_before, played_move_obj)
        except Exception as e:
            print("ERROR computing played_material_gain_cp:", e)


        print("MATERIAL DEBUG:", {
            # "fen": pre_fen,              # whatever your FEN variable is there
            "side_before": side_before,
            "best_move_uci": best_move_uci if pre and "pv" in pre[0] and pre[0]["pv"] else None,
            "best_material_gain_cp": best_material_gain_cp,
            "played_move_uci": move,
            "played_material_gain_cp": played_material_gain_cp,
        })


        # POST analysis (single PV)
        board_after = board_before.copy()
        board_after.push_uci(move)
        post_fen = board_after.fen()

        # Check if game over
        if board_after.is_checkmate():
            post_score = {"type": "mate", "value": -1}
            logger.info(f"Position after move is CHECKMATE")
        elif board_after.is_stalemate():
            post_score = {"type": "cp", "value": 0}
            logger.info(f"Position after move is STALEMATE")
        elif board_after.is_game_over():
            post_score = {"type": "cp", "value": 0}
            logger.info(f"Position after move is GAME OVER (draw)")
        else:
            post = analyze_or_fail(post_fen, depth, 1, persistent_engine)
            post_score = post[0]["score"]

        side_after = "w" if board_after.turn == chess.WHITE else "b"
        eval_after_cp = eval_for_white(post_score, side_after)

        logger.info(f"[EVAL] pre={eval_before_cp:+} post={eval_after_cp:+} (Δ {eval_after_cp - eval_before_cp:+})")

        # --- Stalemate-from-winning Miss detection ---
        mover_adv_before = cp_for_player(eval_before_cp, side_before)   # PRE eval for mover
        mover_adv_after  = cp_for_player(eval_after_cp,  side_before)   # POST eval for mover

        # "clearly winning" threshold (you can tweak 300→400 later if needed)
        CLEAR_WIN_CP = 300   # ~3 pawns
        DRAW_BAND_CP = 60    # |cp| <= 60 ≈ drawn

        was_clearly_winning_before = mover_adv_before >= CLEAR_WIN_CP
        is_drawish_after           = abs(mover_adv_after) <= DRAW_BAND_CP

        # Check if the game result is actually a draw
        is_draw_result = False
        if board_after.is_stalemate():
            is_draw_result = True
        elif board_after.is_game_over():
            # Could be draw by insufficient material, repetition, etc.
            if board_after.result() == "1/2-1/2":
                is_draw_result = True

        stalemate_from_win_miss = was_clearly_winning_before and is_drawish_after and is_draw_result

        print("stalemate_from_win_miss:", stalemate_from_win_miss)


        # CPL calculation
        if played_eval_from_pre is None:
            played_eval_from_pre = eval_after_cp

        cpl = abs(best_eval_from_pre - played_eval_from_pre) if best_eval_from_pre is not None else None

        if top_gap is None:
            top_gap = cpl

        eval_change = eval_after_cp - eval_before_cp

        # Basic label
        basic_label = classify_basic_move(
            eval_before_white=eval_before_cp,
            eval_after_white=eval_after_cp,
            cpl=cpl,
            mover_color=side_before,
            multipv_rank=multipv_rank,
        )


                # 🔍 MASTER DEBUG BLOCK: all important eval-related variables
        debug_payload = {
            "fen_before": fen_before,
            "move_uci": move,
            "side_before": side_before,
            "fullmove_number": fullmove_number,

            # Engine evals (WHITE POV)
            "eval_white_pre": eval_before_cp,
            "eval_white_after": eval_after_cp,
            "eval_white_played_from_pre": played_eval_from_pre,
            "eval_white_best_from_pre": best_eval_from_pre,

            # Mover POV
            "mover_adv_before": mover_adv_before,
            "mover_adv_after": mover_adv_after,
            "mover_adv_delta": mover_adv_after - mover_adv_before,

            # Multipv / CPL
            "multipv_rank": multipv_rank,
            "top_gap_cp": top_gap,
            "cpl_cp": cpl,
            "eval_change_cp": eval_change,

            # Material info
            "best_move_uci": best_move_uci,
            "best_material_gain_cp": best_material_gain_cp,
            "played_material_gain_cp": played_material_gain_cp,

            # Stalemate-from-win miss flags
            "was_clearly_winning_before": was_clearly_winning_before,
            "is_drawish_after": is_drawish_after,
            "stalemate_from_win_miss": stalemate_from_win_miss,

            # Base label before exclam / Miss / Book
            "basic_label": basic_label,
        }
        logger.info("CLASSIFY DEBUG: %s", debug_payload)
        print("CLASSIFY DEBUG: %s", debug_payload)

        print("Basic label:", basic_label)

        # print("Basic label:", basic_label)

        # --- Sacrifice detection (returns full SacrificeResult) ---
        uci_move_obj = chess.Move.from_uci(move)
        sac_result = detect_sacrifice(board_before, uci_move_obj)
        is_sacrifice = sac_result.is_real_sacrifice

        # --- Mate metadata ---
        best_mate_in = mate_ply(pre_score)
        played_mate_in = mate_ply(post_score)

        pre_is_mate = pre_score.get("type") == "mate"
        post_is_mate = post_score.get("type") == "mate"

        mate_flip = bool(pre_is_mate and post_is_mate and (eval_before_cp * eval_after_cp < 0))
        mate_flip_severity = 0
        if mate_flip:
            mate_flip_severity = 6400 + 100 * ((best_mate_in or 0) + (played_mate_in or 0))


        # is_miss = detect_miss(
        #     eval_pre_white=eval_before_cp,              # best-line eval from PRE
        #     eval_after_white=eval_after_cp,            # eval after move
        #     eval_played_pre_white=played_eval_from_pre,# your move's eval from PRE
        #     eval_best_pre_white=best_eval_from_pre,    # best move eval from PRE
        #     mover_color=side_before,
        #     best_mate_in_plies=best_mate_in,
        #     played_mate_in_plies=played_mate_in,
        #     best_material_gain_cp=best_material_gain_cp,
        #     played_material_gain_cp=played_material_gain_cp,
        # )

        is_miss = detect_miss(
            eval_pre_white=eval_before_cp,
            eval_after_white=eval_after_cp,
            eval_played_pre_white=played_eval_from_pre,
            eval_best_pre_white=best_eval_from_pre,
            mover_color=side_before,
            best_mate_in_plies=best_mate_in,
            played_mate_in_plies=played_mate_in,
            best_material_gain_cp=best_material_gain_cp,
            played_material_gain_cp=played_material_gain_cp,
            board=board_before,
            move=uci_move_obj,
        )



        print("Miss detected:", is_miss)


        # opp_sac_result = detect_sacrifice(board_before, uci_move_obj)
        sac_target_square = uci_move_obj.to_square
        # is_sacrifice = sac_result.is_real_sacrifice

        played_move_obj = chess.Move.from_uci(move)


        # --- Eval if we had accepted the sacrifice (for MissedAcceptSac) ---
        # eval_accept_white = None

        # # Here we are *assuming* this move is the side responding to a sac.
        # # In a full game pipeline, you'd instead pass the opponent's sac_result/target.
        # if sac_result.is_real_sacrifice:
        #     # For "missed accept", we actually want: position AFTER opponent's sac,
        #     # BEFORE our move. In this API we only have one move at a time, so
        #     # this is just a template for your full game analyzer.
        #     eval_accept_white = eval_best_accept_line_white(
        #         board_before=board_before,
        #         sac_target_square=sac_target_square,
        #         mover_color=side_before,
        #         depth=depth,
        #         engine=persistent_engine,
        #     )




        # miss_accept_result = detect_missed_accept_sacrifice(
        #     last_sac_result=is_sacrifice,
        #     sac_target_square=sac_target_square,
        #     board_before=board_before,
        #     played_move=played_move_obj,
        #     eval_pre_white=eval_before_cp,
        #     eval_after_white=eval_after_cp,
        #     eval_accept_white=eval_accept_white,  # eval if we had captured
        #     mover_color=side_before,
        # )

        # is_miss_accept_sac = miss_accept_result.is_miss



        # --- Book detection (custom opening DB) ---

        book_for_move = is_book_move(fen_before, move)  # move is UCI string




        print("is_book: ", book_for_move)

        # --- NEW sacrifice-based brilliancy (your custom logic) ---
        # Here:
        #   - eval_best_reply_white  = eval_after_cp (engine post eval)
        #   - eval_accept_white      = None for now (we're not forcing the capture line yet)
        sac_brill = detect_sac_brilliancy(
            eval_before_white=eval_before_cp,
            eval_after_white=eval_after_cp,
            eval_best_pre_white=best_eval_from_pre,
            eval_played_pre_white=played_eval_from_pre,
            eval_best_reply_white=eval_after_cp,
            eval_accept_white=None,
            mover_color=side_before,
            sac_result=sac_result,
        )

        # --- NEW Great move detection (non-sacrifice, big delta_eval, no CP loss) ---

        great_info = detect_great_move(
            eval_before_white=eval_before_cp,
            eval_after_white=eval_after_cp,
            eval_best_pre_white=best_eval_from_pre,
            eval_played_pre_white=played_eval_from_pre,
            mover_color=side_before,
            multipv_rank=multipv_rank,   # ← IMPORTANT
        )

        # --- Mate-flip catastrophe detection (Blunder) ---
        # Use mover POV swing; threshold ~800cp like old ExclamParams
        eval_before_mover = cp_for_player(eval_before_cp, side_before)
        eval_after_mover  = cp_for_player(eval_after_cp,  side_before)
        eval_swing_mover  = eval_after_mover - eval_before_mover

        mate_flip_blunder = bool(
            mate_flip and eval_swing_mover <= -800
        )

        # --- Final label priority:
        # Book > mate-flip Blunder > sac-based Brilliant > general exclam (Brilliant/Great) > Miss > basic
        if book_for_move:
            label = "Book"
        elif mate_flip_blunder:
            label = "Blunder"
        elif sac_brill.is_brilliant:
            label = "Brilliant"
        elif great_info.is_great:
            label = "Great"
        elif stalemate_from_win_miss:
            label = "Miss"
        elif is_miss:
            label = "Miss"
        else:
            label = basic_label



        print("Label: ", label)
        return JSONResponse({
            "fen_before": fen_before,
            "eval_before": eval_before_cp,
            "eval_after": eval_after_cp,
            "eval_change": eval_change,
            "multipv_rank": multipv_rank,
            "top_gap": top_gap,
            "cpl": cpl,
            "eval_before_struct": pre_score,
            "eval_after_struct": post_score,
            "is_sacrifice": is_sacrifice,
            "sacrifice_debug": sac_result.__dict__,       # NEW: see net_loss, attackers, etc.
            "best_mate_in": best_mate_in,
            "played_mate_in": played_mate_in,
            "mate_flip": mate_flip,
            "mate_flip_severity": mate_flip_severity,
            "basic_label": basic_label,
            "miss_detected": is_miss,
            "is_book": book_for_move,
            "in_opening_db": book_for_move,  # Raw book detection flag
            "exclam_label": mate_flip_blunder,
            # "brilliancy_info": brill_info.__dict__ if brill_info else None,
            "sac_brilliancy": sac_brill.__dict__,         # NEW: reason + adv values
            "label": label,
        })


    except Exception as e:
        logger.error(f"Error in /evaluate: {str(e)}", exc_info=True)
        return JSONResponse({
            "error": "EVALUATION_FAILED",
            "message": str(e),
        }, status_code=500)