# Component Update Example

## How to Update Your Components to Use Backend Classification

Here's a real example showing how to update a component that currently uses local classification.

---

## Example: Updating a Move Analysis Component

### BEFORE (Old Way - Using Frontend Classification):

```javascript
import React, { useState } from 'react';
import { Chess } from 'chess.js';
import { useStockfish } from './hooks/useStockfish';
import { classifyMove } from './utils/moveClassification';
import { detectBrilliantMove } from './utils/brilliantDetection';

function MoveAnalyzer() {
  const [moves, setMoves] = useState([]);
  const { analyze } = useStockfish();

  const analyzePosition = async (fen, move) => {
    // Get engine evaluation
    const result = await analyze(fen, { depth: 18, multiPV: 3 });

    // Create board to play move
    const game = new Chess(fen);
    game.move(move);
    const fenAfter = game.fen();

    // Get evaluation after move
    const resultAfter = await analyze(fenAfter, { depth: 18, multiPV: 1 });

    // LOCAL CLASSIFICATION (OLD - REMOVE THIS)
    const classification = classifyMove(
      fen,
      fenAfter,
      result.evaluation,
      resultAfter.evaluation
    );

    const isBrilliant = detectBrilliantMove(
      result.evaluation,
      resultAfter.evaluation,
      result.lines,
      move,
      // ... lots of complex parameters
    );

    const label = isBrilliant ? 'Brilliant' : classification.label;

    return { label, cpl: classification.cpl };
  };

  // ... rest of component
}
```

---

### AFTER (New Way - Using Backend):

```javascript
import React, { useState } from 'react';
import { evaluateMove, getMoveBadge } from './services/evaluationService';

function MoveAnalyzer() {
  const [moves, setMoves] = useState([]);

  const analyzePosition = async (fen, move) => {
    // BACKEND DOES EVERYTHING - ONE SIMPLE CALL
    const evaluation = await evaluateMove(fen, move, 18, 5);

    // That's it! Backend returns:
    // - label: "Brilliant", "Great", "Best", "Good", "Inaccuracy", etc.
    // - cpl: centipawn loss
    // - evalBefore, evalAfter, evalChange
    // - isSacrifice, isBook, isMiss
    // - and everything else

    const badge = getMoveBadge(evaluation);

    return {
      label: evaluation.label,
      cpl: evaluation.cpl,
      badge: badge
    };
  };

  // ... rest of component
}
```

---

## What Changed?

| Before | After |
|--------|-------|
| Import 5+ classification files | Import 1 service file |
| Call Stockfish twice (before & after) | Call backend once |
| Complex local classification logic | Simple API call |
| ~50 lines of classification code | ~3 lines |
| 8-12 seconds (browser WASM) | 2-4 seconds (native) |

---

## Full Component Example with Move Badges

```javascript
import React, { useState } from 'react';
import { Chess } from 'chess.js';
import { evaluateMove, getMoveBadge, getMoveExplanation } from './services/evaluationService';

function GameAnalyzer({ pgn }) {
  const [analysis, setAnalysis] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);

  const analyzePGN = async () => {
    setAnalyzing(true);
    const game = new Chess();
    game.loadPgn(pgn);

    const moves = game.history({ verbose: true });
    const results = [];

    // Reset to start
    game.reset();

    for (const move of moves) {
      const fenBefore = game.fen();
      const uciMove = move.from + move.to + (move.promotion || '');

      try {
        // Single backend call does everything
        const evaluation = await evaluateMove(fenBefore, uciMove, 18, 5);
        const badge = getMoveBadge(evaluation);
        const explanation = getMoveExplanation(evaluation);

        results.push({
          move: move.san,
          evaluation,
          badge,
          explanation
        });

        // Play the move
        game.move(move);

      } catch (error) {
        console.error(`Failed to evaluate move ${move.san}:`, error);
        results.push({
          move: move.san,
          evaluation: null,
          badge: null,
          explanation: 'Evaluation failed'
        });
      }
    }

    setAnalysis(results);
    setAnalyzing(false);
  };

  return (
    <div>
      <button onClick={analyzePGN} disabled={analyzing}>
        {analyzing ? 'Analyzing...' : 'Analyze Game'}
      </button>

      {analysis.map((item, i) => (
        <div key={i} className="move-analysis">
          <span className="move-number">{Math.floor(i/2) + 1}.</span>
          <span className="move-san">{item.move}</span>

          {item.badge && (
            <span
              className="move-badge"
              style={{ backgroundColor: item.badge.color }}
            >
              {item.badge.icon} {item.badge.label} {item.badge.symbol}
            </span>
          )}

          {item.evaluation && (
            <div className="move-details">
              <span>Eval: {item.evaluation.evalAfter}</span>
              {item.evaluation.cpl > 0 && (
                <span>CPL: {item.evaluation.cpl}</span>
              )}
              <p className="explanation">{item.explanation}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default GameAnalyzer;
```

---

## Badge Rendering Example

```javascript
function MoveBadge({ evaluation }) {
  if (!evaluation) return null;

  const badge = getMoveBadge(evaluation);

  const badgeStyle = {
    backgroundColor: badge.color,
    color: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold'
  };

  return (
    <span style={badgeStyle}>
      {badge.icon} {badge.label} {badge.symbol}
    </span>
  );
}
```

---

## InteractiveBoard Update Example

If you have `moveBadge` state in InteractiveBoard.jsx:

```javascript
// OLD
import { classifyMove } from '../utils/moveClassification';

// NEW
import { evaluateMove, getMoveBadge } from '../services/evaluationService';

// When a move is played:
const handleMovePlayed = async (from, to) => {
  const uciMove = from + to;
  const fenBefore = game.fen(); // current FEN before move

  // Get evaluation from backend
  const evaluation = await evaluateMove(fenBefore, uciMove);
  const badge = getMoveBadge(evaluation);

  // Set badge for rendering
  setMoveBadge({
    square: to,
    classification: badge.label,
    color: badge.color,
    symbol: badge.symbol,
    label: badge.label
  });

  // Play the move
  game.move({ from, to });
};
```

---

## Error Handling

Always handle backend errors:

```javascript
try {
  const evaluation = await evaluateMove(fen, move);
  const badge = getMoveBadge(evaluation);
  // ... use evaluation
} catch (error) {
  console.error('Evaluation failed:', error);

  // Fallback: show move without classification
  setMoveBadge({
    square: toSquare,
    classification: 'Unknown',
    color: '#999',
    symbol: '',
    label: 'Not evaluated'
  });
}
```

---

## Tips

1. **Start Engine First**: Call `/start_engine` when app loads
   ```javascript
   useEffect(() => {
     fetch('http://localhost:8000/start_engine', { method: 'POST' });
   }, []);
   ```

2. **Cache Results**: Store evaluations to avoid re-evaluating same position
   ```javascript
   const [evalCache, setEvalCache] = useState({});

   const key = `${fen}_${move}`;
   if (evalCache[key]) {
     return evalCache[key];
   }

   const evaluation = await evaluateMove(fen, move);
   setEvalCache({ ...evalCache, [key]: evaluation });
   ```

3. **Loading States**: Show user when evaluation is happening
   ```javascript
   const [evaluating, setEvaluating] = useState(false);

   setEvaluating(true);
   const evaluation = await evaluateMove(fen, move);
   setEvaluating(false);
   ```

4. **Batch Evaluation**: For PGN analysis, show progress
   ```javascript
   for (let i = 0; i < moves.length; i++) {
     setProgress((i / moves.length) * 100);
     const evaluation = await evaluateMove(/*...*/);
     // ...
   }
   ```

---

## Testing Your Updates

1. **Console Logs**: Check for backend requests
   ```
   POST http://localhost:8000/evaluate 200 OK (2.3s)
   ```

2. **Response Data**: Verify structure
   ```javascript
   console.log('Evaluation:', evaluation);
   // Should have: label, cpl, evalBefore, evalAfter, etc.
   ```

3. **Badge Rendering**: Check badge appears
   ```javascript
   console.log('Badge:', badge);
   // Should have: label, symbol, color, icon
   ```

---

Now you're ready to update your components! Start with one component, test it, then move to the next.
