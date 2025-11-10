# 🧪 Badge Testing Guide

## Quick Test (Immediate)

Your PGN Analysis page now has **two test buttons** below the board:

### Test Buttons
1. **💎 Test Badge on e4** - Shows a "Brilliant" badge (emerald/cyan)
2. **⚠️ Test Badge on d5** - Shows a "Blunder" badge (red)

### How to Test Right Now:

1. **Go to PGN Analysis page** (load any game or just the empty board)
2. **Click "💎 Test Badge on e4"**
3. **Watch the top-right corner of square e4** - you should see:
   - A circular badge with 💎 icon
   - Emerald/cyan gradient color
   - Pulsing glow effect
   - Label "Brilliant" below the circle
4. Badge will auto-hide after 5 seconds

---

## What to Look For

### Badge Appearance:
```
┌─────────────┐
│ d5    [💎] │  ← Badge appears in top-right corner
│             │
│      ♟️     │  ← Piece on square
│             │
└─────────────┘
```

### Visual Elements:
- **Circle**: 32x32px, gradient background
- **Icon**: Emoji (💎, ⚠️, ✓, etc.)
- **Glow**: Pulsing blur effect around badge
- **Label**: Text below circle (e.g., "Brilliant")
- **Animation**: Bounces in, then label slides down

---

## Console Debugging

Open browser console (F12) and watch for:

```javascript
🔍 renderMoveBadge called, moveBadge: { square: "e4", classification: "brilliant", label: "Brilliant" }
✅ Rendering badge with style: { gradient: "...", icon: "💎", ... }
```

If you see:
- `❌ Badge not rendered - missing data` → Badge prop is null/incomplete
- `❌ Badge style not found` → Classification name doesn't match

---

## Testing with Real Game Analysis

### Step 1: Load a Game
1. Go to PGN Analysis
2. Upload or paste a PGN file
3. Click **"🔍 Start Analysis"**
4. Wait for analysis to complete

### Step 2: Navigate Through Moves
1. Use arrow keys (← →) or click moves in history
2. Watch the board - badges should appear on destination squares
3. Each move will show its classification badge for 5 seconds

### Expected Behavior:
```
Move 1: e2-e4  → Badge appears on e4 (if classified)
Move 2: e7-e5  → Badge appears on e5 (if classified)
...and so on
```

---

## Badge Positions

Badges appear at the **top-right corner** of squares:

```
  a    b    c    d    e    f    g    h
8 ┌─┐  ┌─┐  ┌─┐  ┌─┐  ┌─┐  ┌─┐  ┌─┐  ┌─┐
  │ │  │💎│  │ │  │ │  │⚠│  │ │  │ │  │ │  ← Badges
7 └─┘  └─┘  └─┘  └─┘  └─┘  └─┘  └─┘  └─┘
```

---

## All Badge Types

Test different classifications by modifying the test button:

```javascript
// In PGNAnalysis.jsx, change:
classification: 'brilliant'  // 💎 Emerald/cyan
classification: 'best'       // ✓ Green
classification: 'excellent'  // 👍 Blue
classification: 'good'       // ✓ Slate gray
classification: 'inaccuracy' // ? Yellow
classification: 'mistake'    // ! Orange
classification: 'blunder'    // ⚠ Red
classification: 'book'       // 📖 Amber
```

---

## Troubleshooting

### Badge Not Showing?

**Check 1:** Console logs
```
F12 → Console tab → Look for 🔍 and ✅ messages
```

**Check 2:** Test buttons work?
- Click "💎 Test Badge on e4"
- If button works but real moves don't → analysis issue
- If button doesn't work → badge rendering issue

**Check 3:** Classification data exists?
```javascript
// In console:
console.log(analyzedMoves); // Should have classification field
```

**Check 4:** Badge prop being passed?
```jsx
<InteractiveBoard
  fen={currentPosition}
  moveBadge={moveBadge}  // ← This line present?
/>
```

### Badge Appears but Wrong Position?

- Check `flipped` prop
- Board may be flipped (white on top vs bottom)
- Badge position calculation adjusts automatically

### Badge Too Small/Large?

Adjust in `InteractiveBoard.jsx`:

```javascript
// Change badge size:
className="flex h-8 w-8 ..."  // Current: 32x32px
//              ^^  ^^
// Make bigger: h-10 w-10 (40x40px)
// Make smaller: h-6 w-6 (24x24px)
```

### Badge Disappears Too Fast?

Change timeout in `navigateToMove`:

```javascript
setTimeout(() => {
  setMoveBadge(null);
}, 5000);  // Current: 5 seconds
// Change to: 10000 (10 seconds)
// Or: 0 (never hide automatically)
```

---

## Example Console Output

### Successful badge display:
```
🎯 Showing badge: { square: "e4", classification: "brilliant", label: "Brilliant" }
🔍 renderMoveBadge called, moveBadge: { square: "e4", ... }
✅ Rendering badge with style: { gradient: "from-emerald-400 to-cyan-400", ... }
⏰ Hiding badge after timeout (after 5 seconds)
```

### Badge not showing:
```
❌ No badge - move not analyzed or no classification
🔍 renderMoveBadge called, moveBadge: null
❌ Badge not rendered - missing data
```

---

## Remove Test Buttons (Production)

Once you confirm badges work, remove the test buttons:

Delete this section from `PGNAnalysis.jsx` (lines ~1244-1276):
```jsx
{/* Test Badge Button (for debugging) */}
<div className="mb-3 flex items-center justify-center gap-2">
  <button onClick={...}>💎 Test Badge on e4</button>
  <button onClick={...}>⚠️ Test Badge on d5</button>
</div>
```

---

## Quick Fix Checklist

- [ ] Test buttons visible below board
- [ ] Clicking test button shows badge
- [ ] Console logs appear (F12)
- [ ] Badge has icon + label
- [ ] Badge glows/pulses
- [ ] Badge auto-hides after 5s
- [ ] Real moves show badges after analysis
- [ ] Navigation (← →) triggers badges

---

**If all checks pass, badges are working!** 🎉

If any fail, check console for error messages and review troubleshooting section.

