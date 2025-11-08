import base64
import os
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from io import BytesIO
from inference import Detector

load_dotenv()

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