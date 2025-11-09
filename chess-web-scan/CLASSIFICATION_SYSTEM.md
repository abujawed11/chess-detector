# Chess Move Classification System

## Overview

This project now includes a comprehensive move classification system based on Chess.com standards, powered by Stockfish 17.1.

## File Structure

### Core Classification Module
**`src/utils/moveClassification.js`**
- Centralized classification logic
- Reusable functions for move analysis
- Chess.com-style thresholds and categories

### Analysis Pages

1. **`src/TestClassification.jsx`** - Simple Test Suite
   - Quick testing of specific positions
   - 10 curated test positions
   - Simple pass/fail results

2. **`src/StockfishAnalysis.jsx`** - Comprehensive Analysis (NEW!)
   - 20+ test positions across 5 categories
   - Category-based organization
   - Detailed statistics and breakdowns
   - Run individual positions, categories, or full suite

## Features

### Move Classification Categories

The system classifies moves into these categories:

1. **Book** (📖) - Opening theory moves
   - Requires: Move ≤12 AND ≥28 pieces on board
   - CP Loss: 0

2. **Brilliant** (‼️) - Outstanding moves
   - Only move in position OR great sacrifices
   - Forced continuation with CP loss ≤10

3. **Best** (✓) - Best moves
   - CP Loss: ≤10
   - OR in top 3 moves within 10cp of best

4. **Excellent** - Very strong moves
   - CP Loss: 10-25

5. **Good** - Solid moves
   - CP Loss: 25-50

6. **Inaccuracy** (?!) - Minor errors
   - CP Loss: 50-100

7. **Mistake** (?) - Significant errors
   - CP Loss: 100-200

8. **Blunder** (??) - Major mistakes
   - CP Loss: >200
   - Also: Missed forced mate

## How It Works

### Analysis Process

1. **Root Analysis** (MultiPV 3)
   - Analyze position to find top 3 moves
   - Get engine's best move and evaluation

2. **Move Scoring** (searchmoves)
   - Score the player's move from root position
   - Score the engine's best move from root position
   - Uses UCI `searchmoves` for fair comparison

3. **CP Loss Calculation**
   - Compare evaluations from ROOT perspective
   - Calculate centipawn loss = bestEval - moveEval

4. **Classification**
   - Apply Chess.com-style thresholds
   - Check for special cases (book, brilliant, missed mate)

### Key Improvements

1. **Accurate searchmoves Support**
   - Scores moves from the SAME position
   - No more comparing different positions
   - Fair CP loss calculation

2. **Book Move Detection**
   - Checks both move number AND material count
   - Prevents endgames from being marked as "book"

3. **Proper Thresholds**
   - Chess.com-like classification ranges
   - Not too generous, not too strict

## Usage

### Simple Test Suite

```javascript
import TestClassification from './TestClassification';

// Use in your app
<TestClassification />
```

Features:
- 10 curated positions
- Quick test run
- Simple results table

### Comprehensive Analysis

```javascript
import StockfishAnalysis from './StockfishAnalysis';

// Use in your app
<StockfishAnalysis />
```

Features:
- 20+ positions in 5 categories
- Analyze single positions
- Analyze by category
- Run full test suite
- Detailed statistics

### Using Classification Functions

```javascript
import {
  analyzeMoveClassification,
  classifyMove,
  isOpeningPhase,
  evalForRoot,
  normalizeLines
} from './utils/moveClassification';

// Analyze a specific move
const result = await analyzeMoveClassification(
  stockfishInstance,
  fen,
  'e2e4',
  { depth: 20, epsilon: 10 }
);

console.log(result.classification); // 'best', 'excellent', etc.
console.log(result.cpLoss);        // Centipawn loss
console.log(result.bestMove);      // Engine's best move
```

## Test Suite Categories

### 1. Opening Theory (4 positions)
- Italian Game
- Sicilian Defense
- French Defense
- Early mistakes

### 2. Tactical Positions (4 positions)
- Queen blunders
- Fork opportunities
- Back rank mates
- Missed mates

### 3. Positional Play (4 positions)
- Standard development
- Slow moves
- Premature attacks
- Solid continuations

### 4. Endgames (4 positions)
- Pawn endgames
- King activity
- Opposition errors

### 5. Critical Moments (4 positions)
- Only good moves
- Hanging pieces
- Checkmate patterns
- Missed tactics

## Navigation

The app includes navigation buttons:

- **Scanner** - Main chess position scanner
- **Analysis** - Position analysis with Stockfish
- **🧪 Test Suite** - Simple 10-position test
- **⚡ SF Analysis** - Comprehensive 20+ position analysis

## Statistics Tracked

1. **Overall Accuracy** - Percentage of correct classifications
2. **Average CP Loss** - Average centipawn loss across all moves
3. **Best Moves** - Total book + brilliant + best moves
4. **Errors** - Total mistakes + blunders
5. **Per-Category Results** - Breakdown by position type

## API Reference

### `analyzeMoveClassification(stockfish, fen, move, options)`

Analyzes a move and returns classification.

**Parameters:**
- `stockfish` - Stockfish instance with `analyze` method
- `fen` - Position FEN string
- `move` - Move in UCI format (e.g., 'e2e4')
- `options` - { depth: 20, epsilon: 10 }

**Returns:**
```javascript
{
  classification: 'best',
  label: 'Best',
  color: '#9bc02a',
  cpLoss: 5,
  bestMove: 'e2e4',
  lines: [...],
  forced: false,
  missedMate: false,
  isBook: true,
  isBrilliant: false,
  engineEval: 25,
  moveEval: 20
}
```

### `classifyMove(cpLoss, options)`

Classifies a move based on CP loss.

**Parameters:**
- `cpLoss` - Centipawn loss (number)
- `options` - { inTop3, withinEps, forced, missedMate, isBook, isBrilliant }

### `isOpeningPhase(fen)`

Determines if position is in opening phase.

**Returns:** `true` if move ≤12 and ≥28 pieces on board

### `evalForRoot(rootTurn, nodeTurn, evaluation)`

Normalizes evaluation to root perspective.

### `normalizeLines(lines, rootTurn)`

Sorts MultiPV lines by score from root perspective.

## Examples

### Example 1: Analyze a Single Move

```javascript
const result = await analyzeMoveClassification(
  stockfish,
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  'e7e5',
  { depth: 20 }
);

console.log(`Move e7e5 is ${result.classification}`);
// Output: "Move e7e5 is best"
```

### Example 2: Check if Opening

```javascript
const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const isOpening = isOpeningPhase(fen);
console.log(isOpening); // true
```

## Testing

To test the classification system:

1. **Navigate to Test Suite** - Quick 10-position test
2. **Navigate to SF Analysis** - Comprehensive test suite
3. **Run All Tests** - Tests all positions automatically
4. **Review Results** - Check accuracy and CP loss metrics

## Future Enhancements

Potential improvements:
1. Add actual opening book database
2. Implement sacrifice detection for brilliant moves
3. Add "great move" classification for forced moves
4. Consider position complexity in classification
5. Support for game analysis (full PGN)
6. Compare with Lichess classification

## Credits

- Classification logic based on Chess.com standards
- Powered by Stockfish 17.1
- Uses chess.js for move validation
