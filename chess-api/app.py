import base64
import os
import sys
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
        if persistent_engine is not None:
            return JSONResponse({
                "status": "already_running",
                "message": "Engine is already running"
            })

        logger.info(f"STOCKFISH_PATH from env: {os.getenv('STOCKFISH_PATH')}")
        logger.info(f"ENGINE_PATH being used: {ENGINE_PATH}")
        logger.info(f"Engine file exists: {os.path.exists(ENGINE_PATH)}")

        logger.info("Starting persistent Stockfish engine...")
        hash_mb = 512
        threads = 2
        persistent_engine = start_engine({"Hash": hash_mb, "Threads": threads})
        logger.info(f"Stockfish engine started (Hash={hash_mb}MB, Threads={threads})")

        return JSONResponse({
            "status": "started",
            "message": "Engine started successfully",
            "engine_path": ENGINE_PATH
        })
    except Exception as e:
        logger.error(f"Failed to start engine: {str(e)}", exc_info=True)
        return JSONResponse({
            "status": "error",
            "message": str(e)
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
    Analyze a chess position from FEN string

    Args:
        fen: FEN string of the position to analyze
        depth: Search depth (default: 18)
        multipv: Number of principal variations to return (default: 3)

    Returns:
        List of analysis results with scores and principal variations
    """
    global persistent_engine

    try:
        logger.info(f"Analyzing FEN: {fen[:60]}... (depth={depth}, multipv={multipv})")

        # Validate FEN
        try:
            board = chess.Board(fen)
        except Exception as e:
            return JSONResponse({
                "error": "INVALID_FEN",
                "message": f"Invalid FEN string: {str(e)}"
            }, status_code=400)

        # Analyze using persistent engine if available, otherwise create temporary one
        if persistent_engine is not None:
            results = analyze_fen_multipv_persistent(fen, persistent_engine, depth=depth, multipv=multipv)
        else:
            results = analyze_fen_multipv(fen, depth=depth, multipv=multipv)

        return JSONResponse({
            "fen": fen,
            "depth": depth,
            "multipv": multipv,
            "analysis": results,
            "side_to_move": "white" if board.turn == chess.WHITE else "black"
        })

    except Exception as e:
        logger.error(f"Error in /analyze: {str(e)}", exc_info=True)
        return JSONResponse({
            "error": "ANALYSIS_FAILED",
            "message": str(e)
        }, status_code=500)