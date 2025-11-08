# Stockfish Integration Plan

## Overview
Integrate Stockfish chess engine to provide three types of analysis:
1. **Move Classification** - Rate individual moves (Brilliant, Excellent, Good, Inaccuracy, Mistake, Blunder)
2. **Best Move Suggestion** - Show the optimal move for current position
3. **Game Analysis** - Analyze complete games with statistics

---

## Architecture Decision

### Option A: Frontend Integration (Recommended)
**Use stockfish.js (WASM) in browser**
- ✅ No backend changes needed
- ✅ Fast, runs locally
- ✅ Works offline
- ✅ Free (no API costs)
- ❌ Requires client resources

### Option B: Backend API
**Add Stockfish to Python backend**
- ✅ Server-side processing
- ✅ Consistent performance
- ❌ Requires backend modifications
- ❌ Slower (network latency)
- ❌ Server costs

**Decision: Use Option A (Frontend - stockfish.js)**

---

## Implementation Plan

### Phase 1: Setup Stockfish Engine (Foundation)

#### 1.1 Install Dependencies
```bash
npm install stockfish.js
npm install chess.js  # Already installed
```

#### 1.2 Create Stockfish Service
**File:** `src/services/stockfishService.js`
- Initialize Stockfish worker
- Send UCI commands
- Parse engine responses
- Handle evaluation scores
- Manage multiple concurrent analyses

#### 1.3 Create Chess Engine Utilities
**File:** `src/utils/engineUtils.js`
- Centipawn to evaluation conversion
- Move classification logic
- Mate distance calculation
- Win percentage calculation

---

### Phase 2: Feature 1 - Move Classification

#### 2.1 Classification Criteria (Chess.com style)

Based on centipawn loss compared to best move:

| Move Type | Centipawn Loss | Color |
|-----------|----------------|-------|
| Brilliant | -20 to +∞ (sacrifices) | Turquoise |
| Great Move | -20 to -10 | Light Blue |
| Best Move | -10 to +10 | Green |
| Excellent | +10 to +25 | Light Green |
| Good | +25 to +50 | Light Green |
| Inaccuracy | +50 to +100 | Yellow |
| Mistake | +100 to +200 | Orange |
| Blunder | +200+ | Red |
| Miss | Missed forced mate | Red |

**Special Cases:**
- **Brilliant**: Sacrifice that leads to advantage (eval drops but position improves)
- **Great Move**: Only move that maintains advantage
- **Best Move**: Engine's top choice
- **Book Move**: Opening theory move

#### 2.2 UI Components

**Component:** `MoveAnalysis.jsx`
- Show move classification badge
- Display evaluation bar
- Show centipawn difference
- Show best move alternative
- Show evaluation change graph

#### 2.3 Workflow
1. User makes move on board
2. Get position before move (FEN)
3. Analyze position with Stockfish (depth 18-20)
4. Get best move + evaluation
5. Compare user's move to best move
6. Calculate centipawn loss
7. Classify move
8. Display result

---

### Phase 3: Feature 2 - Best Move Suggestion

#### 3.1 UI Component
**Component:** `BestMoveHint.jsx`
- "Show Hint" button
- Display best move arrow on board
- Show evaluation score
- Show move notation (e.g., "Nxf7")
- Show principal variation (PV)

#### 3.2 Features
- Real-time analysis as position changes
- Multiple lines (top 3 moves)
- Depth indicator
- Toggle hint on/off
- Highlight squares involved in best move

#### 3.3 Analysis Depth Options
- Quick (Depth 10) - ~0.5s
- Normal (Depth 15) - ~2s
- Deep (Depth 20) - ~5s
- Infinite (Until stopped)

---

### Phase 4: Feature 3 - Full Game Analysis

#### 4.1 Game Storage
**State Management:**
- Store all moves in PGN format
- Track position after each move
- Store timestamps
- Store evaluations

**Structure:**
```javascript
{
  moves: [
    {
      moveNumber: 1,
      white: {
        san: 'e4',
        fen: '...',
        evaluation: 0.3,
        classification: 'book',
        timeSpent: 2000
      },
      black: {
        san: 'e5',
        fen: '...',
        evaluation: 0.2,
        classification: 'book',
        timeSpent: 1500
      }
    },
    // ... more moves
  ],
  result: '1-0',
  startTime: '2025-01-08T10:30:00Z'
}
```

#### 4.2 Analysis Process
1. Parse complete game (all moves)
2. Analyze each position (depth 18)
3. Classify each move
4. Calculate accuracy percentage
5. Identify critical moments
6. Generate insights

#### 4.3 Statistics Component
**Component:** `GameAnalysisReport.jsx`

**Statistics to Show:**
- Overall accuracy (%)
- Move classifications breakdown:
  - Brilliant moves: X
  - Great moves: X
  - Best moves: X
  - Excellent: X
  - Good: X
  - Inaccuracies: X
  - Mistakes: X
  - Blunders: X
- Average centipawn loss (ACPL)
- Critical moments (biggest swings)
- Opening accuracy
- Middle game accuracy
- Endgame accuracy
- Time management

**Visualizations:**
- Evaluation graph over time
- Accuracy by move number
- Move classification pie chart
- Critical position highlights

---

## File Structure

```
chess-web-scan/
├── src/
│   ├── components/
│   │   ├── BoardEditor.jsx (existing)
│   │   ├── MoveAnalysis.jsx (new)
│   │   ├── BestMoveHint.jsx (new)
│   │   ├── GameAnalysisReport.jsx (new)
│   │   ├── EvaluationBar.jsx (new)
│   │   └── MoveHistory.jsx (new)
│   ├── services/
│   │   ├── stockfishService.js (new)
│   │   └── gameService.js (new)
│   ├── utils/
│   │   ├── engineUtils.js (new)
│   │   ├── moveClassifier.js (new)
│   │   └── pgnUtils.js (new)
│   └── hooks/
│       ├── useStockfish.js (new)
│       └── useGameAnalysis.js (new)
```

---

## Implementation Steps (Sequential)

### Step 1: Core Engine Setup
- [ ] Install stockfish.js
- [ ] Create stockfishService.js
- [ ] Create engineUtils.js
- [ ] Test basic UCI communication
- [ ] Test position evaluation

### Step 2: Move Classification
- [ ] Create moveClassifier.js
- [ ] Implement classification logic
- [ ] Create MoveAnalysis.jsx component
- [ ] Create EvaluationBar.jsx
- [ ] Add to board editor
- [ ] Test with various positions

### Step 3: Best Move Hint
- [ ] Create BestMoveHint.jsx
- [ ] Add arrow drawing on board
- [ ] Implement multi-line analysis
- [ ] Add depth controls
- [ ] Integrate with board editor

### Step 4: Game Storage & Replay
- [ ] Create gameService.js
- [ ] Implement move history tracking
- [ ] Create MoveHistory.jsx
- [ ] Add move navigation (forward/back)
- [ ] PGN import/export

### Step 5: Full Game Analysis
- [ ] Create useGameAnalysis.js hook
- [ ] Implement batch analysis
- [ ] Create GameAnalysisReport.jsx
- [ ] Add statistics calculations
- [ ] Add visualizations (charts)
- [ ] Export analysis as PDF/image

### Step 6: Polish & Optimization
- [ ] Add loading states
- [ ] Optimize Stockfish worker usage
- [ ] Add caching for analyzed positions
- [ ] Mobile responsiveness
- [ ] Error handling
- [ ] Performance testing

---

## Technical Considerations

### Performance
- Use Web Workers for Stockfish (non-blocking)
- Cache analyzed positions
- Debounce analysis requests
- Progressive analysis (show quick results first, refine later)

### User Experience
- Show loading indicators
- Progressive disclosure (don't overwhelm)
- Keyboard shortcuts
- Tooltips for classifications
- Smooth animations

### Data Management
- LocalStorage for game history
- IndexedDB for large datasets
- Export/import functionality
- Share analysis links

---

## UI/UX Mockup Ideas

### Move Analysis Display
```
┌─────────────────────────────┐
│  Your Move: Nxf7           │
│  [BLUNDER] -3.2            │
│  Centipawn Loss: +245      │
│  ────────────────────       │
│  Best: Nc3 (0.7)           │
│  You gave away the knight  │
└─────────────────────────────┘
```

### Evaluation Bar
```
┌──────────────────────┐
│ +2.5 White advantage │
│ ████████████░░░░░░   │ ← Bar showing advantage
│ Black to move        │
└──────────────────────┘
```

### Game Analysis Summary
```
┌─────────────────────────────────┐
│ Game Analysis                   │
│ Accuracy: White 87% | Black 72% │
├─────────────────────────────────┤
│ Brilliant:      ⭐ 1  | - 0      │
│ Great:          💎 3  | 💎 1     │
│ Best:           ✓ 12 | ✓ 8      │
│ Excellent:      👍 5  | 👍 4     │
│ Good:           ✓ 3  | ✓ 6      │
│ Inaccuracy:     ⚠ 2  | ⚠ 4      │
│ Mistake:        ❌ 1  | ❌ 3     │
│ Blunder:        💥 0  | 💥 2     │
└─────────────────────────────────┘
```

---

## API Reference (Stockfish UCI)

### Key UCI Commands
```javascript
// Initialize
'uci'
'isready'

// Set position
'position startpos'
'position fen <fen_string>'
'position startpos moves e2e4 e7e5'

// Analyze
'go depth 20'
'go movetime 3000'  // 3 seconds
'go infinite'

// Get best move
'bestmove'

// Stop analysis
'stop'

// Multi-PV (multiple lines)
'setoption name MultiPV value 3'
```

### Response Parsing
```javascript
// Example response
"info depth 20 score cp 32 nodes 1234567 pv e2e4 e7e5 g1f3"
// cp 32 = +0.32 evaluation (centipawns)
// pv = principal variation (best line)
```

---

## Testing Plan

### Unit Tests
- Move classification logic
- Centipawn calculations
- FEN parsing
- PGN generation

### Integration Tests
- Stockfish communication
- Position analysis
- Game replay
- Move validation

### User Acceptance Tests
- Analyze known games (famous games)
- Compare with Chess.com analysis
- Test edge cases (checkmate, stalemate)
- Performance benchmarks

---

## Future Enhancements (Phase 2)

- Cloud analysis (stronger depth on server)
- Opening book integration
- Endgame tablebase
- Multiplayer analysis sharing
- Mobile app version
- Voice annotations
- Video export with analysis

---

## Success Metrics

- Analysis speed: < 3s per position (depth 18)
- Accuracy: 95%+ match with Chess.com classifications
- Game analysis: < 30s for 40-move game
- User satisfaction: Clear, actionable feedback

---

## Timeline Estimate

- **Step 1** (Engine Setup): 1-2 days
- **Step 2** (Move Classification): 2-3 days
- **Step 3** (Best Move): 2 days
- **Step 4** (Game Storage): 2 days
- **Step 5** (Full Analysis): 3-4 days
- **Step 6** (Polish): 2-3 days

**Total: ~2-3 weeks** (assuming full-time work)

---

## Questions to Resolve

1. Should we limit analysis depth based on device performance?
2. How many games should we store in local storage?
3. Should we add a premium tier with cloud analysis?
4. Do we need mobile-specific UI adjustments?
5. Should we support multi-language piece notation?

---

## Resources

- [Stockfish.js GitHub](https://github.com/nmrugg/stockfish.js)
- [UCI Protocol Specification](http://wbec-ridderkerk.nl/html/UCIProtocol.html)
- [Chess.js Documentation](https://github.com/jhlywa/chess.js)
- [Chess.com Move Classifications](https://support.chess.com/article/2965-how-are-moves-classified)
- [Lichess Analysis Board](https://lichess.org/analysis)

---

## Notes

- Keep Stockfish analysis asynchronous to prevent UI blocking
- Provide clear feedback during long analyses
- Allow users to cancel ongoing analysis
- Cache frequently analyzed positions
- Consider adding training mode (guess best move, then reveal)
