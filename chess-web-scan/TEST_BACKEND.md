# How to Verify Backend Stockfish is Working

## Method 1: Browser Console Logs

1. Open your app in browser
2. Press **F12** to open DevTools
3. Go to **Console** tab
4. Start an analysis
5. Look for these messages:

### ✅ Backend (Native) - You should see:
```
🚀 Initializing Backend Stockfish (attempt 1/3)...
✅ Backend Stockfish initialized successfully
  🔧 Engine: D:/react/chess-detector/engine/stockfish.exe
  🧵 Threads: 2 (backend managed)
  💾 Hash: 512 MB (backend managed)
🔍 Starting backend analysis: { fen: "rnbq...", depth: 18, multiPV: 3 }
✅ Backend analysis complete in 2.3s
```

### ❌ Browser (WASM) - You would see instead:
```
🚀 Initializing Stockfish (attempt 1/3)...
📤 Sending UCI handshake to engine...
📥 Engine response: uciok
✅ Stockfish 17.1 WASM initialized successfully
  🧵 Threads: 4 (CPU cores: 8)
  💾 Hash: 128 MB
```

## Method 2: Network Tab

1. Open DevTools (F12)
2. Go to **Network** tab
3. Start an analysis
4. Look for requests:

### ✅ Backend - You should see:
```
POST  /start_engine   200  (10ms)
POST  /analyze        200  (2.5s)
```

### ❌ Browser - You would see:
```
(No network requests to localhost:8000 for Stockfish)
```

## Method 3: Backend Terminal

In your terminal where you started the FastAPI server, you should see:

```bash
INFO:     127.0.0.1:xxxxx - "POST /start_engine HTTP/1.1" 200 OK
[OK] STOCKFISH_PATH loaded: D:\react\chess-detector\engine\stockfish.exe
Starting persistent Stockfish engine...
Stockfish engine started (Hash=512MB, Threads=2)

INFO:     127.0.0.1:xxxxx - "POST /analyze HTTP/1.1" 200 OK
Analyzing FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1...
[EVAL] pre=+20 post=+25 (Δ +5)
Analysis complete in 2.34s
```

## Method 4: Test API Directly

Run this in your terminal:

```bash
# Test backend health
curl http://localhost:8000/health

# Should return: {"ok": true}

# Test engine start
curl -X POST http://localhost:8000/start_engine

# Should return: {"status": "started", "message": "Engine started successfully", ...}

# Test analysis
curl -X POST http://localhost:8000/analyze \
  -F "fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" \
  -F "depth=18" \
  -F "multipv=3"

# Should return JSON with analysis results
```

## Method 5: Performance Check

Backend should be **3-5x faster**:

- **Browser (WASM)**: Depth 18 takes ~8-12 seconds
- **Backend (Native)**: Depth 18 takes ~2-4 seconds

Time your analysis and compare!

## Troubleshooting

### If you see browser logs but no backend requests:

1. **Backend not running**
   ```bash
   cd chess-api
   uvicorn app:app --reload
   ```

2. **Wrong port** - Check API_BASE in frontend:
   ```javascript
   // chess-web-scan/src/services/backendStockfishService.js
   const API_BASE_URL = 'http://localhost:8000';
   ```

3. **CORS Error** - Check backend logs for:
   ```
   Access to fetch at 'http://localhost:8000/analyze' from origin 'http://localhost:5173'
   has been blocked by CORS policy
   ```

   If you see this, verify CORS_ORIGINS in `.env`:
   ```
   CORS_ORIGINS=http://localhost:5173
   ```

### If you still see "Stockfish 17.1 WASM initialized":

The old browser code is still running. Check:

1. Did you remove stockfish packages?
   ```bash
   npm uninstall stockfish stockfish.js
   ```

2. Did you restart the dev server?
   ```bash
   npm run dev
   ```

3. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

4. Check `stockfishService.js` - should import from `backendStockfishService`:
   ```javascript
   import { getBackendStockfish } from './backendStockfishService';
   ```

## Success Checklist

- [ ] Browser console shows "Backend Stockfish initialized"
- [ ] Backend console shows "POST /start_engine" and "POST /analyze" requests
- [ ] Network tab shows requests to localhost:8000
- [ ] Analysis completes in 2-4 seconds (not 8-12 seconds)
- [ ] No references to "WASM" or "worker" in console
- [ ] Engine path shown: `D:/react/chess-detector/engine/stockfish.exe`
