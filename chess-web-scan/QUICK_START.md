# Quick Start - Backend Engine Setup

## 🚀 You're ready to go! Here's how to use the new backend-only engine:

### Step 1: Configure API URL (if needed)

If your backend is NOT at `http://localhost:8000`, create a `.env` file in `chess-web-scan/`:

```bash
# chess-web-scan/.env
VITE_API_BASE_URL=http://YOUR_SERVER_IP:5001
```

Replace with your actual backend URL.

### Step 2: Start Backend

```bash
cd chess-api
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

**Important:** Make sure `STOCKFISH_PATH` is set in `chess-api/.env`:
```bash
STOCKFISH_PATH=/usr/local/bin/stockfish
```

### Step 3: Start Frontend

```bash
cd chess-web-scan
npm run dev
```

### Step 4: Test It

1. Open `http://localhost:5173` in your browser
2. Go to the **Analysis** screen
3. Check browser console - should see:
   ```
   ✅ Backend Stockfish initialized successfully
   ```
4. Make some moves and watch:
   - Evaluation bar update automatically
   - Engine lines show top 3 moves
   - Move gets classified (Best/Good/Inaccuracy/etc.)

---

## What's Different?

### ✅ Analysis.jsx - NO CHANGES NEEDED

Your existing `Analysis.jsx` code works exactly as before. The `useStockfish` hook has the same API, it just calls the backend instead of using WASM.

### ✅ All these work automatically:
- Auto-analyze toggle
- Show best move toggle  
- Get hint button
- Depth selection (10/15/20)
- Engine lines display
- Evaluation bar
- Move classification

### 🔧 What Changed Under the Hood:
- `useStockfish.js` - Now calls backend `/analyze` endpoint via HTTP
- `app.py` `/analyze` endpoint - Returns frontend-compatible format
- `vite.config.js` - Removed WASM-specific headers (no longer needed)

---

## Debugging

### Check Backend Status

```bash
curl http://localhost:8000/engine_status
```

Should return:
```json
{
  "running": true,
  "engine_path": "/usr/local/bin/stockfish",
  "engine_exists": true
}
```

### Check Analysis Works

```bash
curl -X POST http://localhost:8000/analyze \
  -F "fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" \
  -F "depth=15" \
  -F "multipv=3"
```

Should return JSON with evaluation, lines, and bestMove.

### Browser Console

Open DevTools (F12) and check console for:
- `✅ Backend Stockfish initialized successfully` on load
- `✅ Analysis complete in X.XXs` after each move
- Any errors will be logged with `❌` prefix

---

## Performance Notes

**Typical Analysis Times:**
- Depth 10: ~0.1-0.3 seconds
- Depth 15: ~0.3-0.8 seconds  
- Depth 20: ~1-3 seconds
- Depth 25: ~3-10 seconds

**Plus network latency** (~50-200ms depending on your network).

**Backend uses:**
- 4 threads (configurable in `app.py`)
- 512 MB hash (configurable in `app.py`)
- Persistent engine (reused across requests for speed)

---

## Need Help?

See `BACKEND_ENGINE_MIGRATION.md` for full documentation including:
- Complete API reference
- Troubleshooting guide
- Architecture details
- How it all works

---

## Summary

✅ Backend-only Stockfish engine is now active
✅ No WASM/web worker code is used
✅ Analysis.jsx unchanged - same API, new backend
✅ All features work identically to before
✅ Native Stockfish = maximum strength

**Enjoy your native Stockfish-powered analysis! 🎯**


