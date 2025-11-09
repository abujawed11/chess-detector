# Move Classification Fixes

## Issues Found

### 1. **Missing `searchMoves` Support**
The stockfish service wasn't supporting the `searchMoves` UCI parameter, which is critical for accurate move classification. Without it, the engine couldn't score specific moves from the root position.

**Fixed in:**
- `stockfishClient.js` - Added generic `go()` method with searchmoves support
- `stockfishService.js` - Added searchMoves parameter handling

### 2. **Incorrect Classification Thresholds**
Your custom classification function had thresholds that were way too generous compared to Chess.com standards.

**Old Thresholds:**
- Best: ≤ 15 cp
- Excellent: ≤ 50 cp
- Good: ≤ 100 cp
- Inaccuracy: ≤ 250 cp
- Mistake: ≤ 600 cp
- Blunder: > 600 cp

**New Chess.com-like Thresholds:**
- Best: ≤ 10 cp
- Excellent: 10-25 cp
- Good: 25-50 cp
- Inaccuracy: 50-100 cp
- Mistake: 100-200 cp
- Blunder: > 200 cp

### 3. **Missing Move Types**
No support for:
- **Book moves** - Opening theory moves in the first ~8 moves
- **Brilliant moves** - Only moves in position or great sacrifices

### 4. **Data Structure Inconsistency**
The stockfish service returned `score` in the lines array, but the code expected `evaluation`.

## Changes Made

### stockfishClient.js
Added generic `go()` method:
```javascript
go(options = {}) {
  let cmd = 'go';
  if (options.depth) cmd += ` depth ${options.depth}`;
  if (options.movetime) cmd += ` movetime ${options.movetime}`;
  if (options.searchmoves) cmd += ` searchmoves ${options.searchmoves}`;
  this.worker.postMessage(cmd);
}
```

### stockfishService.js
- Added `searchMoves` parameter support
- Fixed line data structure to include `evaluation` field
- Properly handles searchmoves in UCI commands

### TestClassification.jsx
- Fixed classification thresholds to match Chess.com
- Added book move detection (requires move ≤12 AND ≥28 pieces on board)
- Added brilliant move detection
- Reduced epsilon from 20 to 10 for stricter "best move" classification
- Fixed evaluation data structure handling

## How It Works Now

1. **Root Analysis**: Analyzes position with MultiPV 3 to get top 3 moves
2. **Specific Move Scoring**: Uses `searchMoves` to score the test move from the root position
3. **Best Move Scoring**: Uses `searchMoves` to score the engine's best move
4. **CP Loss Calculation**: Compares scores from root perspective
5. **Classification**: Applies Chess.com-like thresholds

## Testing

Run your test suite now and you should see:
- Much more variety in classifications (not just "best")
- Inaccuracies, mistakes, and blunders properly detected
- More accurate CP loss values
- Book moves in opening positions

## Next Steps

If you want even more Chess.com-like behavior:
1. Add actual opening book database for book move detection
2. Implement sacrifice detection for brilliant moves
3. Add "great move" classification for forced/only good moves
4. Consider position complexity in classification
