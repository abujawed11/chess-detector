# 💎 Move Classification Badge System

## Overview

A Chess.com-style visual feedback system that displays floating classification badges directly on the chessboard when moves are played.

## Features

✨ **8 Classification Types** with unique styling:
- 💎 **Brilliant** - Emerald/cyan gradient with glow
- ✓ **Best** - Green gradient  
- 👍 **Excellent** - Blue gradient
- ✓ **Good** - Slate gradient
- ? **Inaccuracy** - Yellow/amber gradient
- ! **Mistake** - Orange gradient
- ⚠ **Blunder** - Red gradient with strong glow
- 📖 **Book** - Amber/yellow gradient

🎬 **Smooth Animations**:
- Fade in + scale (0.4s)
- Display time (1.5s)
- Fade out (0.5s)
- Total duration: ~2 seconds

🎨 **Visual Effects**:
- Gradient backgrounds
- Glow effects with blur
- Box shadows
- White ring accent
- Icon + label display

⚡ **Performance**:
- No full board re-renders
- Efficient timeout management
- Automatic cleanup

---

## Implementation

### 1. InteractiveBoard Component

The board now accepts a `moveBadge` prop:

```jsx
<InteractiveBoard
  fen={currentPosition}
  onMove={handleMove}
  flipped={flipped}
  moveBadge={moveBadge} // New prop!
/>
```

**moveBadge format:**
```javascript
{
  square: 'e4',              // Destination square
  classification: 'brilliant', // Classification type
  label: 'Brilliant'          // Display label
}
```

Set to `null` to hide the badge.

---

### 2. PGNAnalysis Integration (Already Done!)

The badge system is fully integrated in `PGNAnalysis.jsx`:

```javascript
// State for badge
const [moveBadge, setMoveBadge] = useState(null);
const badgeTimeoutRef = useRef(null);

// Show badge when navigating to a move
const navigateToMove = useCallback((index) => {
  // ... navigation logic ...

  // Show badge for analyzed moves
  const analyzedMove = analyzedMoves[index];
  if (analyzedMove && analyzedMove.classification) {
    // Clear previous timeout
    if (badgeTimeoutRef.current) {
      clearTimeout(badgeTimeoutRef.current);
    }

    // Show badge
    setMoveBadge({
      square: history[index].to,
      classification: analyzedMove.classification,
      label: analyzedMove.classificationLabel
    });

    // Auto-hide after 2 seconds
    badgeTimeoutRef.current = setTimeout(() => {
      setMoveBadge(null);
    }, 2000);
  }
}, [game, analyzedMoves]);
```

---

## Usage in Other Components

### Analysis.jsx

Add badge support to your Analysis component:

```jsx
// 1. Add state
const [moveBadge, setMoveBadge] = useState(null);
const badgeTimeoutRef = useRef(null);

// 2. Show badge after a move
const handleMove = useCallback(async (move, newFen) => {
  // ... your move logic ...

  // After classification
  if (classification) {
    if (badgeTimeoutRef.current) {
      clearTimeout(badgeTimeoutRef.current);
    }

    setMoveBadge({
      square: move.to,
      classification: classification.classification,
      label: classification.label
    });

    badgeTimeoutRef.current = setTimeout(() => {
      setMoveBadge(null);
    }, 2000);
  }
}, []);

// 3. Pass to board
<InteractiveBoard
  fen={currentFen}
  onMove={handleMove}
  bestMove={bestMove}
  moveBadge={moveBadge}
/>

// 4. Cleanup on unmount
useEffect(() => {
  return () => {
    if (badgeTimeoutRef.current) {
      clearTimeout(badgeTimeoutRef.current);
    }
  };
}, []);
```

---

## Customization

### Adjust Display Duration

Change the timeout in `navigateToMove`:

```javascript
// Default: 2000ms (2 seconds)
badgeTimeoutRef.current = setTimeout(() => {
  setMoveBadge(null);
}, 3000); // Now 3 seconds
```

### Modify Badge Styles

Edit `BADGE_STYLES` in `InteractiveBoard.jsx`:

```javascript
const BADGE_STYLES = {
  brilliant: {
    gradient: 'from-emerald-400 to-cyan-400',
    shadow: 'shadow-[0_0_25px_rgba(16,185,129,0.6)]',
    icon: '💎',
    glow: 'rgba(16, 185, 129, 0.4)'
  },
  // ... customize colors, icons, shadows, glows
};
```

### Animation Timing

Edit the animation classes in `renderMoveBadge`:

```javascript
className="... animate-[fadeInScale_0.4s_ease-out,fadeOut_0.5s_ease-in_1.5s_forwards]"
//                            ^^^^ fade in    ^^^^ fade out  ^^^^ delay
```

---

## Badge Style Reference

| Classification | Icon | Gradient | Glow Color |
|---------------|------|----------|------------|
| Brilliant | 💎 | Emerald → Cyan | Green |
| Best | ✓ | Emerald → Green | Green |
| Excellent | 👍 | Blue → Dark Blue | Blue |
| Good | ✓ | Slate → Dark Slate | Gray |
| Inaccuracy | ? | Yellow → Amber | Yellow |
| Mistake | ! | Orange → Dark Orange | Orange |
| Blunder | ⚠ | Red → Dark Red | Red |
| Book | 📖 | Amber → Yellow | Amber |

---

## Technical Details

### Position Calculation

The badge positions itself using the existing `squareToCoords` function:

```javascript
const coords = squareToCoords(moveBadge.square);

// Returns: { x: pixels, y: pixels }
// Based on board size (560x560) and square notation
```

### Animation Stack

1. **Fade in + Scale** (0-0.4s)
   - Opacity: 0 → 1
   - Scale: 0.5 → 1
   
2. **Hold** (0.4-1.9s)
   - Full opacity
   - Normal scale

3. **Fade out** (1.9-2.4s)
   - Opacity: 1 → 0

### Z-Index Layers

```
z-20: Move Badge (highest)
z-10: Best Move Arrow
z-9:  Hover Arrow
z-0:  Board Squares
```

---

## Examples

### Show Brilliant Move Badge

```javascript
setMoveBadge({
  square: 'e4',
  classification: 'brilliant',
  label: 'Brilliant'
});
```

### Show Blunder Badge

```javascript
setMoveBadge({
  square: 'd5',
  classification: 'blunder',
  label: 'Blunder'
});
```

### Hide Badge Manually

```javascript
setMoveBadge(null);
```

---

## Best Practices

1. **Always clear previous timeout** before setting new badge
2. **Clean up on unmount** to prevent memory leaks
3. **Use `null` to hide** rather than empty object
4. **Match classification keys** exactly (lowercase)
5. **Keep display time reasonable** (1.5-3 seconds)

---

## Troubleshooting

### Badge Not Showing

✓ Check `moveBadge` is not null  
✓ Verify `classification` matches BADGE_STYLES keys  
✓ Ensure `square` is valid notation (e.g., 'e4')  
✓ Check board has position: relative  

### Badge Stuck on Screen

✓ Verify timeout is being set  
✓ Check for proper cleanup in goToStart  
✓ Ensure no errors in console blocking execution  

### Animation Issues

✓ Confirm Tailwind is processing arbitrary values  
✓ Check keyframe animations are injected  
✓ Verify no CSS conflicts with z-index  

---

## Future Enhancements

Potential improvements:

- [ ] Configurable display duration
- [ ] Custom badge positions (offset from square)
- [ ] Sound effects on badge display
- [ ] Multiple simultaneous badges
- [ ] Badge click interactions
- [ ] Animated particle effects
- [ ] Accessibility announcements

---

## Credits

- Design inspired by Chess.com's move feedback system
- Built with React + Tailwind CSS
- Uses Tailwind arbitrary values for custom shadows/glows
- Smooth CSS animations with keyframes

---

**Enjoy your enhanced chess analysis experience!** 🎉♟️

