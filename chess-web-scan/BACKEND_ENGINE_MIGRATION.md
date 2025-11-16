# Backend Engine Migration - Complete Implementation

## Overview

Successfully migrated from browser-based WASM Stockfish to **backend native Stockfish only**.

All position analysis (evaluation bar, engine lines, best move, auto-analyze) now comes from the backend native Stockfish engine running via FastAPI.

---

## What Changed

### 1. Backend (`chess-api/app.py`)

#### Updated `/analyze` Endpoint

The `/analyze` endpoint now returns data in a format that exactly matches what the frontend expects:

**Request:**
```
POST /analyze
Content-Type: multipart/form-data

fen: <FEN string>
depth: <integer> (default: 18)
multipv: <integer> (default: 3)
```

**Response:**
```json
{
  "evaluation": {
    "type": "cp" | "mate",
    "value": 42
  },
  "lines": [
    {
      "multipv": 1,
      "cp": 42,
      "mate": null,
      "depth": 18,
      "pv": ["e2e4", "e7e5", "g1f3"],
      "pvSan": "e4 e5 Nf3"
    }
  ],
  "depth": 18,
  "bestMove": "e2e4"
}
```

**Key Features:**
- Validates FEN before analysis
- Uses persistent engine if available (better performance)
- Converts PV moves to SAN notation (optional but included)
- Proper error handling with HTTP 400/500 status codes
- Logging for debugging

### 2. Frontend Hook (`chess-web-scan/src/hooks/useStockfish.js`)

**Completely rewritten** to use backend HTTP calls only. No WASM/web worker code.

**API (unchanged for compatibility):**

```javascript
const { 
  initialized,    // boolean - backend engine ready
  analyzing,      // boolean - analysis in progress
  analyze,        // function(fen, { depth, multiPV })
  error,          // string | null - last error
  getThreadInfo,  // function() - thread config
  setThreads      // function(count) - set threads (no-op for backend)
} = useStockfish();
```

**Key Features:**
- Initializes backend engine on mount via `/start_engine`
- Retries initialization if it fails
- Proper abort handling for cancelled requests
- Detailed console logging for debugging
- Zero dependencies on WASM/web worker code

### 3. Backend Service (`chess-web-scan/src/services/backendStockfishService.js`)

**Updated** to parse the new response format from `/analyze`.

The service now directly returns the backend response format without transformation, since the backend already returns the correct structure.

### 4. Configuration

#### Vite Config (`chess-web-scan/vite.config.js`)

**Removed WASM-specific headers:**
- No longer need `Cross-Origin-Embedder-Policy`
- No longer need `Cross-Origin-Opener-Policy`

These were required for SharedArrayBuffer (multi-threaded WASM), but are not needed for backend-only approach.

#### Environment Variables

Both services now use environment variables for the API URL:

```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
```

**To configure:** Create a `.env` file in `chess-web-scan/`:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

For production, set this to your production backend URL.

---

## What Stayed the Same

### `Analysis.jsx` - NO CHANGES NEEDED ✅

The Analysis component works **exactly as before** with zero modifications. The hook API is identical:

```javascript
// Same calls work as before
const result = await analyze(currentFen, { depth: analysisDepth, multiPV: 3 });
setCurrentEval(result.evaluation);
setEngineLines(result.lines || []);
const bestMove = result.lines[0]?.pv[0];
```

### Move Classification - Still Uses `/evaluate` ✅

The move classification system (Brilliant, Best, Good, Blunder, etc.) still uses the separate `/evaluate` endpoint and is **unchanged**.

---

## How It Works

### Analysis Flow

1. **User plays a move or navigates in Analysis screen**
2. **`Analysis.jsx` calls `analyze(fen, { depth, multiPV })`**
3. **`useStockfish` hook makes HTTP POST to `/analyze`**
4. **Backend FastAPI server:**
   - Validates FEN
   - Sends position to native Stockfish
   - Parses multi-PV results
   - Converts to frontend format
   - Returns JSON response
5. **Frontend receives and displays:**
   - Evaluation bar (from `result.evaluation`)
   - Engine lines (from `result.lines`)
   - Best move arrow (from `result.bestMove`)

### Performance

**Backend Engine Advantages:**
- ✅ **Native Stockfish** - Full strength, no WASM performance penalty
- ✅ **Persistent engine** - Reused across requests (faster)
- ✅ **Server hardware** - Uses server CPU/RAM (not user's browser)
- ✅ **Configurable threads** - Backend can use 4+ threads easily
- ✅ **No browser limitations** - No COOP/COEP headers needed

**Trade-offs:**
- ⚠️ **Network latency** - Adds HTTP request time (~50-200ms depending on network)
- ⚠️ **Server load** - All analysis happens server-side
- ⚠️ **Cannot abort** - Backend continues processing even if user cancels

---

## Testing

### 1. Start Backend

```bash
cd chess-api
# Ensure STOCKFISH_PATH is set in .env
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start Frontend

```bash
cd chess-web-scan
npm run dev
```

Frontend will be at `http://localhost:5173`

### 3. Test Analysis Screen

1. Go to Analysis screen
2. Check console for: `✅ Backend Stockfish initialized successfully`
3. Make moves - should see:
   - Evaluation bar updating
   - Engine lines showing top 3 moves
   - Move classifications (Best/Good/Blunder/etc.)
4. Enable "Show Best Move" - should see green arrow
5. Click "Get Hint" - should show best move once

### 4. Check Backend Logs

You should see:
```
📊 /analyze request: FEN=rnbqkbnr/pppppppp... depth=20 multipv=3
✅ /analyze complete in 0.42s: eval={'type': 'cp', 'value': 24} bestMove=e2e4
```

---

## Troubleshooting

### "Backend engine not initialized"

**Check:**
1. Is backend running? `curl http://localhost:8000/health`
2. Is STOCKFISH_PATH set correctly in backend `.env`?
3. Does Stockfish binary exist and is executable?

**Solution:**
```bash
# Check engine status
curl http://localhost:8000/engine_status

# Manually start engine
curl -X POST http://localhost:8000/start_engine
```

### Analysis hangs or times out

**Check:**
1. Backend logs for errors
2. Network tab in browser DevTools - look for `/analyze` request
3. Depth setting - higher depths take longer (depth 20+ can take 2-10 seconds)

**Solution:**
- Lower depth in Analysis screen (try depth 15)
- Check backend server isn't overloaded
- Ensure persistent engine is running (faster than creating new engine each time)

### "CORS error" in browser console

**Check:**
1. Backend CORS_ORIGINS includes your frontend URL
2. In `chess-api/.env`:
   ```
   CORS_ORIGINS=http://localhost:5173,http://localhost:5174
   ```

### Engine gives weird evaluations

**Check:**
1. FEN is valid - backend validates and returns 400 if invalid
2. Position isn't game-over (checkmate/stalemate)
3. Backend is using correct Stockfish version (should be Stockfish 14+)

---

## API Reference

### `useStockfish` Hook

```typescript
interface UseStockfishReturn {
  initialized: boolean;
  analyzing: boolean;
  error: string | null;
  analyze: (fen: string, options: AnalyzeOptions) => Promise<AnalysisResult>;
  getThreadInfo: () => ThreadInfo;
  setThreads: (count: number) => Promise<boolean>;
  stop: () => void;
}

interface AnalyzeOptions {
  depth?: number;      // Default: 18
  multiPV?: number;    // Default: 3
}

interface AnalysisResult {
  evaluation: {
    type: 'cp' | 'mate';
    value: number;
  };
  lines: Line[];
  depth: number;
  bestMove: string;    // UCI format, e.g. "e2e4"
}

interface Line {
  multipv: number;
  cp: number | null;
  mate: number | null;
  depth: number;
  pv: string[];        // UCI moves
  pvSan?: string;      // SAN notation (optional)
  score: Score;        // Original score object
}

interface ThreadInfo {
  current: number;
  max: number;
  supportsMultiThreading: boolean;
}
```

---

## Future Enhancements

### Potential Improvements:

1. **Analysis Queue** - Queue multiple analysis requests instead of aborting previous
2. **Caching** - Cache analysis results for previously-seen positions
3. **Streaming** - Stream partial results as engine searches (WebSocket)
4. **Abort Support** - Add backend support to actually stop engine mid-search
5. **Dynamic Threads** - Allow frontend to request thread count via endpoint
6. **Analysis Priority** - Different depths/priorities for different request types

---

## Summary

✅ **Complete migration from WASM to backend native Stockfish**
✅ **Analysis.jsx unchanged - drop-in replacement**
✅ **Move classification unchanged - still uses /evaluate**
✅ **Clean, production-ready code with error handling**
✅ **Detailed logging for debugging**
✅ **Environment variable configuration**
✅ **Full compatibility with existing UI/UX**

All analysis now flows through the backend, leveraging native Stockfish for maximum strength and performance.

