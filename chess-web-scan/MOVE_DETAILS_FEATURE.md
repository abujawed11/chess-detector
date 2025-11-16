# Move Details Panel - Complete Backend Evaluation Data

## What Was Added

A comprehensive **Move Details Panel** that displays ALL properties returned from the backend `/evaluate` endpoint for each move.

## Features

### Display Sections

1. **Classification**
   - Label (Brilliant, Best, Good, Blunder, etc.)
   - Basic Label
   - Exclam Label (Brilliant/Great)

2. **Evaluation (Centipawns)**
   - Eval Before (cp)
   - Eval After (cp)
   - Δ Eval (cp) - Change in evaluation
   - CPL (loss) - Centipawn loss

3. **Move Quality**
   - MultiPV Rank (#1, #2, #3, etc.)
   - Top Gap (cp) - Gap to best move

4. **Special Attributes**
   - Is Sacrifice? (Yes/No)
   - Is Book Move? (Yes/No)
   - In Opening DB? (Yes/No)

5. **Mate Analysis**
   - Mate Before? (Yes/No)
   - Mate After? (Yes/No)
   - Best Mate-in (number of moves)
   - Played Mate-in (number of moves)
   - Missed Mate? (Yes/No)
   - Missed Mate? (Yes/No)
   - Mate Flip? (Yes/No)

6. **Raw Backend Response**
   - Expandable JSON view of complete backend response

## How to Use

1. **Play moves** in the Analysis screen
2. **Navigate through moves** using ← → buttons
3. **View details** - The panel appears below the board showing all evaluation data for the current move

## Where It Appears

The Move Details Panel appears **below the navigation buttons** in the board column, right after the Move Explanation Card (if present).

```
┌─────────────────────┐
│  Chess Board        │
└─────────────────────┘
┌─────────────────────┐
│  ← ◀ ▶ →           │  (Navigation)
└─────────────────────┘
┌─────────────────────┐
│  Move Explanation   │  (If available)
└─────────────────────┘
┌─────────────────────┐
│  📊 Move Details    │  ← NEW!
│  All backend data   │
└─────────────────────┘
```

## Visual Indicators

- **Highlighted rows**: Important values (e.g., high CPL loss, sacrifices)
- **Color coding**: 
  - Blue highlight = Most important properties
  - Red text = Errors or critical values
  - Green = Positive attributes
- **Sections**: Organized into logical groups with headers

## Backend Data Source

All data comes from: `POST /evaluate` endpoint

The endpoint analyzes:
- Position before the move
- The move itself
- Position after the move
- Comparison with engine's top moves

## Files Changed

### New Files
- `chess-web-scan/src/components/MoveDetailsPanel.jsx` - The new panel component

### Modified Files
- `chess-web-scan/src/Analysis.jsx`:
  - Import MoveDetailsPanel
  - Store fullEvaluation in move data
  - Display panel for current move
  - Preserve evaluation when navigating

## Implementation Details

### Data Flow

1. **Move is played** → `handleMove()` in Analysis.jsx
2. **Backend /evaluate called** → Returns full evaluation object
3. **Stored in move** → `move.fullEvaluation = evaluation`
4. **Panel displays** → When navigating to that move

### Data Structure

Each move stores:
```javascript
{
  ...move,  // from, to, san, etc.
  classification: 'brilliant',
  classificationLabel: 'Brilliant',
  cpLoss: 0,
  explanation: '...',
  fullEvaluation: {
    // Complete backend response
    label: 'Brilliant',
    evalBefore: 150,
    evalAfter: 350,
    evalChange: 200,
    cpl: 0,
    multipvRank: 1,
    topGap: 0,
    isSacrifice: true,
    bestMateIn: null,
    playedMateIn: null,
    isMiss: false,
    mateFlip: false,
    isBook: false,
    inOpeningDb: false,
    raw: { /* full backend JSON */ }
  }
}
```

## Example Display

```
╔═══════════════════════════════════════╗
║  📊 Move Evaluation Details           ║
║  Backend analysis from native SF      ║
╠═══════════════════════════════════════╣
║  CLASSIFICATION                       ║
║  Label:              Brilliant        ║
║  Basic Label:        Best             ║
║  Exclam Label:       Brilliant        ║
╠═══════════════════════════════════════╣
║  EVALUATION (CENTIPAWNS)              ║
║  Eval Before (cp):   +150             ║
║  Eval After (cp):    +350             ║
║  Δ Eval (cp):        +200             ║
║  CPL (loss):         0                ║
╠═══════════════════════════════════════╣
║  MOVE QUALITY                         ║
║  MultiPV Rank:       #1               ║
║  Top Gap (cp):       0                ║
╠═══════════════════════════════════════╣
║  SPECIAL ATTRIBUTES                   ║
║  Is Sacrifice?       Yes              ║
║  Is Book Move?       No               ║
║  In Opening DB?      No               ║
╠═══════════════════════════════════════╣
║  MATE ANALYSIS                        ║
║  Mate Before?        No               ║
║  Mate After?         No               ║
║  Best Mate-in:       —                ║
║  Played Mate-in:     —                ║
║  Missed Mate?        No               ║
║  Mate Flip?          No               ║
╠═══════════════════════════════════════╣
║  🔍 Raw Backend Response ▼            ║
╚═══════════════════════════════════════╝
```

## Benefits

✅ **Complete transparency** - See all backend evaluation data
✅ **Debugging** - Understand why a move was classified a certain way
✅ **Learning** - See detailed engine analysis
✅ **Raw data access** - Expandable JSON for full details

## Future Enhancements

Potential additions:
- Export move analysis as JSON
- Compare multiple moves side-by-side
- Historical analysis chart
- Filter/sort by properties
- Custom property selection

---

## Quick Test

1. Start your app
2. Go to Analysis screen
3. Play moves (e.g., 1.e4 e5 2.Nf3 Nc6 3.Bb5)
4. Navigate back through moves using ← button
5. See the detailed panel appear below the board
6. Click "Raw Backend Response" to expand JSON

**That's it! You now have complete visibility into every move's evaluation.** 📊

