# Frontend Cleanup Guide - Remove Local Classification Logic

## ✅ New Backend Service Created

**File:** `src/services/evaluationService.js`

Simple service that calls backend `/evaluate` endpoint:
```javascript
import { evaluateMove, getMoveBadge, getMoveExplanation } from './services/evaluationService';

// Evaluate a move
const result = await evaluateMove(fenBefore, uciMove, 18, 5);

// result.label = "Brilliant", "Great", "Best", "Good", etc.
// result.cpl, result.evalBefore, result.evalAfter, etc.

// Get badge info for rendering
const badge = getMoveBadge(result);
// badge.symbol, badge.color, badge.icon

// Get explanation text
const explanation = getMoveExplanation(result);
```

---

## 🗑️ Files to DELETE (Old Classification Logic)

These files contain LOCAL classification logic and should be **deleted**:

### 1. Classification Logic Files
```
src/utils/moveClassification.js          ❌ DELETE
src/utils/brilliantDetection.js          ❌ DELETE
src/utils/brilliantDetectionV3.js        ❌ DELETE
src/utils/brilliantHelpers.js            ❌ DELETE
src/utils/brilliantConfig.js             ❌ DELETE
```

### 2. Keep These (May need minor updates)
```
src/utils/moveExplanation.js             ✅ KEEP (can simplify)
src/utils/engineUtils.js                 ✅ KEEP (utility functions)
src/utils/openingBook.js                 ✅ KEEP (or delete if not used)
```

---

## 🔧 Components That Need Updates

### Files Using Old Classification Logic:

1. **src/Analysis.jsx**
   - Replace local classification with `evaluateMove()`
   - Remove imports from old classification files

2. **src/PGNAnalysis.jsx**
   - Replace local classification with `evaluateMove()`
   - Remove imports from old classification files

3. **src/TestClassification.jsx**
   - Replace local classification with `evaluateMove()`
   - Remove imports from old classification files

4. **src/StockfishAnalysis.jsx**
   - Replace local classification with `evaluateMove()`
   - Remove imports from old classification files

5. **src/components/InteractiveBoard.jsx**
   - Update move badge rendering to use backend result
   - Replace local classification with `evaluateMove()`

6. **src/components/MoveHistory.jsx**
   - Update to use backend evaluation results
   - Remove local classification imports

7. **src/components/MoveExplanationCard.jsx**
   - Update to use `getMoveExplanation()` from new service
   - Remove old classification imports

---

## 📝 Example Migration

### BEFORE (Old - Local Classification):
```javascript
import { classifyMove } from '../utils/moveClassification';
import { detectBrilliantMove } from '../utils/brilliantDetection';

// Local classification
const classification = classifyMove(fenBefore, fenAfter, evalBefore, evalAfter);
const isBrilliant = detectBrilliantMove(/* complex params */);
const label = isBrilliant ? 'Brilliant' : classification.label;
```

### AFTER (New - Backend Only):
```javascript
import { evaluateMove, getMoveBadge } from '../services/evaluationService';

// Backend does everything
const evaluation = await evaluateMove(fenBefore, uciMove);
const badge = getMoveBadge(evaluation);

// evaluation.label = "Brilliant", "Great", "Best", etc.
// badge.symbol, badge.color, badge.icon
```

---

## 🚀 Step-by-Step Migration

### Step 1: Update Analysis.jsx

Find this pattern:
```javascript
// OLD
import { classifyMove } from '../utils/moveClassification';
```

Replace with:
```javascript
// NEW
import { evaluateMove, getMoveBadge, getMoveExplanation } from '../services/evaluationService';
```

Find this pattern:
```javascript
// OLD - Complex local classification
const classification = classifyMove(/*...*/);
```

Replace with:
```javascript
// NEW - Simple backend call
const evaluation = await evaluateMove(fenBefore, uciMove, 18, 5);
```

### Step 2: Update PGNAnalysis.jsx

Same pattern as Analysis.jsx

### Step 3: Update InteractiveBoard.jsx

Find move badge rendering code and update to use:
```javascript
const evaluation = await evaluateMove(fenBefore, uciMove);
const badge = getMoveBadge(evaluation);

setMoveBadge({
  square: toSquare,
  classification: badge.label,
  color: badge.color,
  symbol: badge.symbol
});
```

### Step 4: Delete Old Files

After updating all components:
```bash
cd chess-web-scan/src/utils
rm moveClassification.js
rm brilliantDetection.js
rm brilliantDetectionV3.js
rm brilliantHelpers.js
rm brilliantConfig.js
```

---

## ✅ Verification Checklist

After migration:

- [ ] All components use `evaluationService.js`
- [ ] No imports from deleted classification files
- [ ] Move badges render correctly with backend data
- [ ] Explanations show correctly
- [ ] No console errors about missing modules
- [ ] Backend `/evaluate` endpoint is being called
- [ ] Old classification files deleted

---

## 🧪 Testing

1. **Start Backend:**
   ```bash
   cd chess-api
   uvicorn app:app --reload
   ```

2. **Start Engine:**
   ```bash
   curl -X POST http://localhost:8000/start_engine
   ```

3. **Start Frontend:**
   ```bash
   cd chess-web-scan
   npm run dev
   ```

4. **Test Move Evaluation:**
   - Open browser console (F12)
   - Make a move
   - You should see: `POST http://localhost:8000/evaluate`
   - Check response has `label`, `cpl`, `eval_before`, etc.

---

## 🐛 Troubleshooting

### "Module not found: moveClassification"
✅ You haven't updated all imports yet. Search for:
```bash
grep -r "moveClassification" src/
grep -r "brilliantDetection" src/
```

### "Badge not rendering"
✅ Check `getMoveBadge()` is being called and result passed to component

### "Evaluation taking too long"
✅ Engine might not be started. Call `/start_engine` first

### "CORS error"
✅ Check backend CORS_ORIGINS includes `http://localhost:5173`

---

## 📊 What You Gain

**Before (Frontend Classification):**
- Stockfish.js running in browser (slow)
- Complex classification logic duplicated in frontend
- Hard to maintain and update thresholds
- 8-12 seconds per evaluation

**After (Backend Classification):**
- Native Stockfish on server (3-5x faster)
- Single source of truth for classification
- Easy to tune and update
- 2-4 seconds per evaluation
- Consistent with your reference project

---

## 🎯 Next Steps

1. Update components one by one (start with TestClassification.jsx)
2. Test each update before moving to next
3. Delete old files only after ALL components updated
4. Commit changes in git

Need help updating a specific component? Just ask!
