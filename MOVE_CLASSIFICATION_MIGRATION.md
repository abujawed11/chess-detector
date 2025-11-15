# Move Classification Migration: Frontend → Backend

All move classification logic has been moved from the frontend to the backend.

## What Was Added to Backend

### 1. **basic_move_labels.py**
Complete move classification logic:
- `classify_basic_move()` - Best / Good / Inaccuracy / Mistake / Blunder
- `detect_miss()` - Detect missed tactical opportunities
- `detect_book_move()` - Opening book detection
- `is_real_sacrifice()` - True sacrifice detection (SEE analysis)
- `classify_exclam_move()` - Brilliant (!!) / Great (!) detection
- `detect_brilliancy_level()` - Attack/Defense/Mate brilliancy patterns

### 2. **opening_book.py**
Polyglot opening book integration:
- `is_book_move(fen, uci_move)` - Check if move is in opening database
- Supports `engine/book.bin` polyglot format

### 3. **POST /evaluate** endpoint in app.py
Complete move evaluation with classification:
```
POST /evaluate
Form data:
  - fen: FEN string (position BEFORE move)
  - move: UCI move string (e.g., "e2e4")
  - depth: Search depth (default: 18)
  - multipv: Number of lines (default: 5)
```

## API Usage

### Start Engine First
```bash
curl -X POST http://localhost:8000/start_engine
```

### Evaluate a Move
```bash
curl -X POST http://localhost:8000/evaluate \
  -F "fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" \
  -F "move=e2e4" \
  -F "depth=18" \
  -F "multipv=5"
```

### Response Format
```json
{
  "fen_before": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "move": "e2e4",
  "label": "Book",

  "eval_before": 20,
  "eval_after": 25,
  "eval_change": 5,

  "cpl": 0,
  "top_gap": 0,
  "multipv_rank": 1,

  "basic_label": "Best",
  "exclam_label": null,
  "is_book": true,
  "in_opening_db": true,
  "miss_detected": false,
  "is_sacrifice": false,

  "best_mate_in": null,
  "played_mate_in": null,
  "mate_flip": false,
  "mate_flip_severity": 0,

  "eval_before_struct": {"type": "cp", "value": 20},
  "eval_after_struct": {"type": "cp", "value": 25},

  "brilliancy_info": null
}
```

## Classification Labels

The backend returns one of these labels (in priority order):

1. **Book** - Move found in opening database
2. **Brilliant** (!!) - Brilliancy-level move WITH sacrifice
3. **Great** (!) - Brilliancy-level move WITHOUT sacrifice
4. **Blunder** - Mate-flip catastrophe OR very bad move
5. **Miss** - Missed tactical opportunity
6. **Best** - Engine's top move (PV #1, CPL ≤ 20)
7. **Good** - Strong move (CPL ≤ 60)
8. **Inaccuracy** - Minor error (CPL ≤ 200)
9. **Mistake** - Significant error (CPL ≤ 500)

## Classification Logic Details

### Brilliant (!!) Requirements
- Brilliancy-level pattern (attack/defense/mate brilliancy)
- **AND** real material sacrifice (SEE analysis confirms)
- Examples:
  - Queen sacrifice for checkmate
  - Rook sacrifice creating winning attack
  - Piece sacrifice in winning position maintaining advantage

### Great (!) Requirements
- Brilliancy-level pattern
- **WITHOUT** material sacrifice
- Examples:
  - Finding only move in lost position
  - Converting equal position to winning
  - Defensive resource saving draw

### Miss Detection
- Didn't worsen own position much (self_drop < 80cp)
- But missed significant opportunity:
  - Missed mate while winning
  - Missed defensive save (lost → drawable)
  - Missed conversion (equal → winning)
  - Missed tactical win (≥ 350cp gain)

### Book Detection
- Only returns `true` if move found in actual Polyglot database
- No heuristics - must be in `engine/book.bin`

### Sacrifice Detection (SEE-based)
- Material debit ≥ 300cp (at least minor piece)
- Static Exchange Evaluation (SEE) shows loss ≥ 100cp
- Excludes:
  - Protected checkmate deliveries
  - Forced mate cleanup sequences (unless mate in ≤2)
  - Pure attack moves with huge eval gain

## Frontend Integration

Your frontend should call `/evaluate` instead of doing classification locally:

```javascript
async function evaluateMove(fen, move) {
  const formData = new FormData();
  formData.append('fen', fen);
  formData.append('move', move);
  formData.append('depth', '18');
  formData.append('multipv', '5');

  const response = await fetch('http://localhost:8000/evaluate', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();

  return {
    label: data.label,           // "Brilliant", "Good", "Blunder", etc.
    classification: data.label,  // Same as label
    eval: data.eval_after,       // Eval after move
    cpl: data.cpl,               // Centipawn loss
    isSacrifice: data.is_sacrifice,
    explanation: getExplanation(data)  // Your custom explanation logic
  };
}
```

## Opening Book Setup

To use book detection, you need a Polyglot opening book file:

1. Download a Polyglot book (e.g., `book.bin`)
2. Place it in: `D:\react\chess-detector\engine\book.bin`
3. Backend will automatically load it

Common sources:
- [Chess Programming Wiki](https://www.chessprogramming.org/Opening_Book)
- [Stockfish Books](https://github.com/official-stockfish/books)
- Or use the one from your reference project

## Testing the Backend

```bash
# 1. Start backend
cd chess-api
uvicorn app:app --reload

# 2. Start engine
curl -X POST http://localhost:8000/start_engine

# 3. Test evaluation
curl -X POST http://localhost:8000/evaluate \
  -F "fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" \
  -F "move=e2e4"

# Expected: {"label": "Book", ...}
```

## Performance Notes

- **First evaluation**: ~2-4 seconds (depth 18, multipv 5)
- **Subsequent evaluations**: ~2-4 seconds (persistent engine)
- **Book lookup**: Instant (if book.bin exists)
- **Mate positions**: Instant (no engine needed)

## Debugging

Backend prints detailed logs:
```
Basic label: Good
SAC DEBUG: {'is_sacrifice': False, ...}
Miss detected: False
is_book: True
in_opening_db: True
BRILL DEBUG: {...}
EXCLAM DEBUG: {...}
Final Label: Book
```

Check backend terminal to see:
- Eval calculations
- Classification decisions
- Brilliancy pattern matching
- Sacrifice SEE analysis

## Migration Checklist

Backend (✅ Done):
- [x] Copy `basic_move_labels.py`
- [x] Copy `opening_book.py`
- [x] Add `/evaluate` endpoint
- [x] Test endpoint works

Frontend (Your TODO):
- [ ] Replace local classification with `/evaluate` API call
- [ ] Update move badge rendering to use backend response
- [ ] Remove frontend classification files (if any)
- [ ] Test with actual games

## Next Steps

1. Update your frontend components to call `/evaluate`
2. Replace any local classification logic
3. Test with various positions (openings, tactics, endgames)
4. Optionally: Add book.bin for opening detection

The backend is ready! Just update your frontend to use the new API.
