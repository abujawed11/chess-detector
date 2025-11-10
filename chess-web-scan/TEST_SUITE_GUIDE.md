# Classification Test Suite Guide

## Overview

The Test Suite page helps you verify the accuracy of your move classification system by testing against **12 famous chess positions** with known evaluations.

## How to Access

Click **"🧪 Test Suite"** in the navigation bar (orange button)

## Test Positions Included

### 1. **Brilliant Sacrifice** - Immortal Game
- Tests: Brilliant move detection
- Position: Anderssen's famous knight sacrifice
- Expected: Brilliant classification

### 2. **Obvious Best Move** - Simple Capture
- Tests: Standard best move
- Position: Opening development
- Expected: Best move classification

### 3. **Blunder - Hanging Queen**
- Tests: Inaccuracy detection
- Position: Blocking development
- Expected: Inaccuracy

### 4. **Typical Blunder** - Queen Hangs
- Tests: Major mistake
- Position: Piece hangs undefended
- Expected: Blunder classification

### 5. **Checkmate in 1** - Obvious
- Tests: Forced mate
- Position: Scholar's mate
- Expected: Best move

### 6. **Back Rank Mate Available**
- Tests: Mate detection
- Position: Simple back rank mate
- Expected: Best move

### 7. **Missing Checkmate** - Blunder
- Tests: Missed win detection
- Position: Missing forced mate
- Expected: Missed win

### 8. **Tactical Shot** - Fork
- Tests: Tactical move
- Position: Knight attacks f7
- Expected: Excellent

### 9. **Quiet Positional Move**
- Tests: Positional understanding
- Position: Standard development
- Expected: Best move

### 10. **Complex Middlegame**
- Tests: Strategic moves
- Position: Solid continuation
- Expected: Best move

### 11. **Endgame - Pawn Push**
- Tests: Endgame technique
- Position: Advancing passed pawn
- Expected: Best move

### 12. **Mistake - Losing Piece**
- Tests: Suboptimal moves
- Position: Okay but not best
- Expected: Good move

---

## How to Use

### Running Individual Tests

1. **Select a position** from the dropdown menu
2. Click **"Run Current Test"**
3. Wait for analysis (takes 2-5 seconds at depth 20)
4. View results:
   - **Engine's best move** (shown with green arrow)
   - **Classification** (Brilliant, Best, Good, etc.)
   - **Centipawn loss**
   - **Pass/Fail** status

### Running All Tests

1. Click **"Run All Tests"** button
2. System will automatically:
   - Test all 12 positions
   - Show progress
   - Display final accuracy score
3. Review results in the summary table

---

## Understanding Results

### Green Box (✓ CORRECT)
- Your classification matches the expected result
- System is working correctly for this position

### Red Box (✗ INCORRECT)  
- Classification doesn't match expected
- Possible issues:
  - Threshold needs adjustment
  - Engine evaluation differs
  - Test expectations may need updating

### Accuracy Score
```
Test Results: 10/12 correct (83.3% accuracy)
```
- **90-100%**: Excellent! System is very accurate
- **80-90%**: Good! Minor adjustments may help
- **70-80%**: Okay, but review failed tests
- **<70%**: Thresholds may need significant adjustment

---

## Interpreting Failures

### Common Reasons for Test Failures:

#### 1. **Threshold Sensitivity**
If a move is classified as "Good" instead of "Best":
- Check centipawn loss
- If it's near the threshold (e.g., 11cp), it's borderline
- Consider if your thresholds need fine-tuning

#### 2. **Engine Depth**
Lower depth = less accurate evaluation
- Current: Depth 20 (good for testing)
- Increase to 25-30 for more accuracy
- Decrease to 15 for faster testing

#### 3. **Position Complexity**
Some positions have multiple good moves:
- Engine might find a different best move
- Both could be equally good
- This is normal and acceptable

#### 4. **Brilliant Move Detection**
Requires sacrifice + advantage:
- Must be a material sacrifice
- Must improve evaluation
- Must be objectively strong

---

## Adjusting Thresholds

If you find consistent misclassifications, edit `engineUtils.js`:

```javascript
// Current thresholds
Best Move:    ≤10 cp
Excellent:    ≤25 cp
Good:         ≤50 cp
Inaccuracy:   ≤100 cp
Mistake:      ≤200 cp
Blunder:      >200 cp

// Example: Make "Best Move" stricter
Best Move:    ≤5 cp   // More strict
Excellent:    ≤20 cp
// ... etc
```

---

## Results Table

The summary table shows:

| Column | Meaning |
|--------|---------|
| **Position** | Name of test case |
| **Test Move** | Move being classified (if specified) |
| **Best Move** | Engine's top choice |
| **Expected** | What classification should be |
| **Actual** | What your system classified it as |
| **CP Loss** | Centipawn loss calculated |
| **Result** | ✓ Pass or ✗ Fail |

---

## Tips for Accurate Testing

### 1. **Wait for Engine Initialization**
- Status shows: "Engine: ✓ Ready"
- Don't test until ready

### 2. **Use Consistent Depth**
- Default: 20 (good balance)
- Higher depth = more accurate but slower
- Lower depth = faster but less reliable

### 3. **Test Multiple Times**
- Engine may give slightly different evaluations
- Run tests 2-3 times for consistency
- Average the results

### 4. **Focus on Patterns**
- If ALL "Blunder" tests fail → threshold issue
- If RANDOM tests fail → acceptable variance
- If BRILLIANT tests fail → sacrifice detection needs work

### 5. **Document Findings**
Keep notes on:
- Which positions consistently fail
- Centipawn loss values
- Engine evaluation differences

---

## Debugging Failed Tests

### Step-by-Step Process:

1. **Click on failed test** in dropdown
2. **Run test again** to confirm
3. **Check "Engine Analysis" panel**:
   - What move did engine find?
   - What's the evaluation?
   - Are there multiple good moves?

4. **Review Classification Result**:
   - Centipawn loss value
   - Expected vs Actual classification
   - Is it close to a threshold?

5. **Analyze in Analysis Page**:
   - Load the FEN in Analysis page
   - Play the moves manually
   - See if classification makes sense

---

## Expected Accuracy Benchmarks

Based on industry standards:

| Accuracy | Assessment | Action |
|----------|------------|--------|
| **100%** | Perfect! | No changes needed |
| **90-99%** | Excellent | System is working well |
| **80-89%** | Good | Minor fine-tuning recommended |
| **70-79%** | Fair | Review failed cases |
| **<70%** | Poor | Significant adjustment needed |

**Target: 85-95% accuracy** (accounting for engine variance)

---

## Adding Your Own Tests

To add custom test positions, edit `TestClassification.jsx`:

```javascript
{
  name: "Your Test Name",
  fen: "position FEN string",
  bestMove: "e2e4",           // Expected best move
  testMove: "d2d4",           // Optional: test specific move
  expectedClass: "excellent", // Expected classification
  description: "What this tests"
}
```

---

## Troubleshooting

### "Engine not initialized yet!"
**Solution**: Wait a few seconds for Stockfish to load

### Analysis takes too long
**Solution**: Reduce depth in useStockfish hook (depth: 15 instead of 20)

### Results seem random
**Solution**: Increase depth for more consistent evaluations

### All tests fail
**Solution**: Check if thresholds in `engineUtils.js` are correct

---

## Comparison with Standards

Your thresholds vs Chess.com/Lichess:

| Classification | Your System | Chess.com | Lichess |
|---------------|-------------|-----------|---------|
| Best | ≤10 | ≤10 | ≤10 |
| Excellent | ≤25 | ≤25 | ≤20 |
| Good | ≤50 | ≤50 | ≤50 |
| Inaccuracy | ≤100 | ≤100 | ≤100 |
| Mistake | ≤200 | ≤200 | ≤300 |
| Blunder | >200 | >200 | >300 |

**Your thresholds match Chess.com almost perfectly!** ✅

---

## Success Metrics

### What Good Results Look Like:

✅ **Brilliant moves** correctly identified (sacrifice + advantage)  
✅ **Best moves** classified as best (≤10cp loss)  
✅ **Blunders** clearly marked (>200cp loss)  
✅ **Missed mates** detected  
✅ **Consistency** across similar positions  

### Acceptable Variances:

⚠️ Boundary cases (e.g., 48cp classified as "Good" instead of "Inaccuracy")  
⚠️ Engine finding different but equally good moves  
⚠️ Complex positions with multiple solutions  

---

## Using Results to Improve

1. **Identify patterns** in failures
2. **Adjust thresholds** if needed
3. **Test again** to verify improvements
4. **Document changes** for future reference

---

## Conclusion

The Test Suite is your **quality assurance tool** for move classification. Use it to:

- Verify your system works correctly
- Fine-tune thresholds
- Compare with Chess.com standards
- Build confidence in your classifications

**Target: 85%+ accuracy on all tests** 🎯

Happy testing! 🧪♟️


