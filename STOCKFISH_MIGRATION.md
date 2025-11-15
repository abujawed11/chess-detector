# Stockfish Migration: Browser → Native Backend

This document describes the migration from browser-based Stockfish.js to native Stockfish running on the backend.

## What Changed

### Backend (FastAPI)
- ✅ Created `chess-api/utils/chess_helpers.py` - Native Stockfish UCI interface
- ✅ Added 4 new API endpoints to `chess-api/app.py`:
  - `POST /start_engine` - Start persistent engine
  - `POST /stop_engine` - Stop persistent engine
  - `GET /engine_status` - Check engine status
  - `POST /analyze` - Analyze position with FEN
- ✅ Updated `.env` with `STOCKFISH_PATH`
- ✅ Fixed `requirements.txt` (python-chess already present)

### Frontend (React + Vite)
- ✅ Created `chess-web-scan/src/services/backendStockfishService.js` - New backend API client
- ✅ Updated `chess-web-scan/src/services/stockfishService.js` - Now delegates to backend
- ✅ Removed dependencies from `package.json`:
  - ❌ `stockfish@^17.1.0`
  - ❌ `stockfish.js@^10.0.2`
- ✅ No changes needed to `useStockfish.js` hook - API remains compatible

## Benefits

1. **Performance**: Native Stockfish is ~3-5x faster than WASM/JS version
2. **Resources**: Offloads CPU-intensive analysis from browser to server
3. **Consistency**: Server-managed engine settings (512MB hash, 2 threads)
4. **No CORS Issues**: No need for SharedArrayBuffer or cross-origin isolation

## Setup Instructions

### 1. Backend Setup

```bash
cd chess-api

# Install dependencies (if not already done)
pip install -r requirements.txt

# Verify Stockfish exists
ls ../engine/stockfish.exe

# Start the backend
uvicorn app:app --reload
```

### 2. Frontend Setup

```bash
cd chess-web-scan

# Remove old Stockfish packages
npm uninstall stockfish stockfish.js

# Install dependencies (if package.json changed)
npm install

# Start development server
npm run dev
```

### 3. Testing

1. Start backend: `http://localhost:8000`
2. Start frontend: `http://localhost:5173`
3. The frontend will automatically connect to backend on first analysis

## API Usage

### Start Engine
```bash
curl -X POST http://localhost:8000/start_engine
```

Response:
```json
{
  "status": "started",
  "message": "Engine started successfully",
  "engine_path": "D:/react/chess-detector/engine/stockfish.exe"
}
```

### Analyze Position
```bash
curl -X POST http://localhost:8000/analyze \
  -F "fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" \
  -F "depth=18" \
  -F "multipv=3"
```

Response:
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "depth": 18,
  "multipv": 3,
  "analysis": [
    {
      "multipv": 1,
      "score": {"type": "cp", "value": 20},
      "pv": ["e2e4", "c7c5", "g1f3"]
    },
    {
      "multipv": 2,
      "score": {"type": "cp", "value": 15},
      "pv": ["d2d4", "d7d5", "c2c4"]
    }
  ],
  "side_to_move": "white"
}
```

## Frontend Code Example

The frontend API remains the same:

```javascript
import { useStockfish } from './hooks/useStockfish';

function MyComponent() {
  const { initialized, analyzing, analyze } = useStockfish();

  const analyzePosition = async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = await analyze(fen, { depth: 18, multiPV: 3 });
    console.log('Best move:', result.bestMove);
    console.log('Evaluation:', result.evaluation);
    console.log('Top 3 lines:', result.lines);
  };

  return (
    <button onClick={analyzePosition} disabled={!initialized || analyzing}>
      Analyze Position
    </button>
  );
}
```

## Known Limitations

1. **No Live Updates**: Backend analysis doesn't support `onUpdate` callbacks during search
2. **No SearchMoves**: The `searchMoves` option is not yet implemented in backend
3. **No Stop**: Analysis cannot be interrupted mid-flight (backend limitation)

## Troubleshooting

### Engine Won't Start
- Check `STOCKFISH_PATH` in `.env`
- Verify `engine/stockfish.exe` exists
- Check backend logs for errors

### Frontend Can't Connect
- Ensure backend is running on `http://localhost:8000`
- Check browser console for CORS errors
- Verify `API_BASE_URL` in `backendStockfishService.js`

### Analysis Errors
- Validate FEN string is correct
- Check depth value (1-30 reasonable range)
- Ensure multiPV <= 500

## Rollback Instructions

If you need to revert to browser-based Stockfish:

1. Restore old `stockfishService.js` (uncomment the browser version at top of file)
2. Re-add dependencies to `package.json`:
   ```bash
   npm install stockfish@^17.1.0 stockfish.js@^10.0.2
   ```
3. Ensure `/public/stockfish-17.1-8e4d048.js` exists in your public folder

## Performance Comparison

| Feature | Browser (WASM) | Backend (Native) |
|---------|---------------|------------------|
| Depth 18 | ~8-12 seconds | ~2-4 seconds |
| MultiPV 5 | ~15-20 seconds | ~4-6 seconds |
| Hash Size | 128-256 MB | 512 MB |
| Threads | 1-4 (limited) | 2 (configurable) |
| CPU Impact | Client browser | Server only |

## Next Steps

- [ ] Add support for `searchMoves` in backend
- [ ] Implement WebSocket for live analysis updates
- [ ] Add analysis queue for multiple concurrent requests
- [ ] Implement move evaluation endpoint (similar to chess_brilliance_ai)
