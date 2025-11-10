# PGN Game Analysis Feature

## 🎯 Overview

A complete Chess.com-style game analyzer that allows users to upload PGN files and analyze every move with detailed classifications.

## ✨ Features

### 1. **PGN Upload**
- 📁 Upload `.pgn` files directly
- 📋 Paste PGN notation from clipboard
- 🎯 Drag & drop support from Home page
- ✅ Automatic PGN validation and parsing

### 2. **Game Information Display**
- Event name and date
- Player names (White/Black)
- Player ratings (ELO)
- Game result (1-0, 0-1, 1/2-1/2, *)

### 3. **Move-by-Move Analysis**
- **Stockfish 17.1** powered analysis
- **Depth 18** search for accurate evaluations
- **Move Classifications:**
  - 💎 **Brilliant** - Sacrificial or unique best moves
  - 📖 **Book** - Opening theory moves
  - ✅ **Best** - Optimal moves (≤10 cp loss)
  - 🟢 **Excellent** - Very good moves (10-25 cp loss)
  - 🔵 **Good** - Solid moves (25-50 cp loss)
  - 🟡 **Inaccuracy** - Minor mistakes (50-100 cp loss)
  - 🟠 **Mistake** - Significant errors (100-200 cp loss)
  - 🔴 **Blunder** - Major mistakes (>200 cp loss)

### 4. **Interactive Game Replay**
- ⏮️ **Jump to Start** - Go to initial position
- ◀️ **Previous Move** - Step backward
- ▶️ **Next Move** - Step forward
- ⏭️ **Jump to End** - Go to final position
- 🔄 **Flip Board** - Switch perspective
- 🎹 **Keyboard Shortcuts:**
  - `←` Previous move
  - `→` Next move
  - `Home` Start position
  - `End` Final position

### 5. **Statistics Dashboard**
- Move classification breakdown
- Count of each move type
- Average centipawn loss
- Visual color-coded statistics

### 6. **Move History Panel**
- Complete move list with notation
- Color-coded classifications
- Centipawn loss display
- Click any move to jump to that position
- Current move highlighting

### 7. **Visual Indicators**
- Real-time analysis progress bar
- Move-by-move classification badges
- Interactive chess board
- Smooth animations and transitions

## 📖 How to Use

### Option 1: Upload PGN File
1. Click **"Analyze PGN Game"** from Home page
2. Click **"Choose PGN File"**
3. Select your `.pgn` file
4. Game loads automatically

### Option 2: Paste PGN
1. Navigate to PGN Analysis page
2. Paste your PGN notation in the text area
3. Click **"Load Game"**

### Option 3: Drag & Drop
1. From Home page, drag a `.pgn` file
2. Drop anywhere on the page
3. Automatically navigates to analysis

### Analyzing the Game
1. Once game is loaded, click **"🔍 Start Analysis"**
2. Wait for analysis to complete (progress bar shows status)
3. Navigate through moves using controls
4. View statistics and classifications

## 🎮 Sample Game

A sample game is included: `sample-game.pgn`
- Famous Fischer vs Spassky game from 1972 World Championship
- 41 moves
- Perfect for testing the analyzer

## 🔧 Technical Details

### Move Classification Logic
Uses `analyzeMoveClassification()` from `moveClassification.js`:
- Multi-PV root analysis (3 lines)
- Search moves for accurate scoring
- Brilliant move detection system
- Opening book detection
- Mate detection

### Analysis Settings
- **Depth:** 18 (configurable)
- **Epsilon:** 10cp (for "within best" threshold)
- **MultiPV:** 3 (for top move comparison)

### Performance
- Analyzes ~2-3 moves per second (depends on position complexity)
- Progress updates in real-time
- Non-blocking UI during analysis

## 🎨 UI Components

### Header Section
- Game metadata display
- Player information cards
- Result display
- "Load New Game" button

### Analysis Button
- Only shows before analysis starts
- Disabled until engine initializes
- Progress bar during analysis

### Statistics Panel
- 9 classification counters
- Average CP loss metric
- Color-coded for quick scanning

### Board Panel
- Interactive chess board
- Navigation controls (5 buttons)
- Flip board option
- Current move indicator

### Move History Panel
- Scrollable move list
- Two-column layout (White/Black)
- Click to navigate
- Classification badges
- CP loss display

## 📊 Classification Colors

```
Brilliant:     #1baca6 (Teal)
Book:          #a88865 (Brown)
Best:          #9bc02a (Green)
Excellent:     #96bc4b (Light Green)
Good:          #96af8b (Sage)
Inaccuracy:    #f0c15c (Yellow)
Mistake:       #e58f2a (Orange)
Blunder:       #fa412d (Red)
```

## 🚀 Future Enhancements

Potential improvements:
- [ ] Export annotated PGN with classifications
- [ ] Compare multiple games
- [ ] Opening database lookup
- [ ] Engine evaluation graph over time
- [ ] Best move suggestions
- [ ] Tactical puzzles from mistakes
- [ ] Game database browser
- [ ] Player statistics tracking
- [ ] Share analysis links

## 🐛 Known Limitations

1. Analysis is sequential (one move at a time)
2. Large games (100+ moves) take time to analyze
3. No server-side caching
4. Single game at a time

## 💡 Tips

1. **Faster Analysis:** Use shorter games initially
2. **Best Results:** Ensure PGN format is valid
3. **Navigation:** Use keyboard shortcuts for quick browsing
4. **Understanding:** Check statistics after analysis
5. **Learning:** Review blunders and mistakes carefully

## 🔗 Integration

The feature integrates seamlessly:
- Accessible from Home page
- Uses existing Stockfish hook
- Shares InteractiveBoard component
- Consistent UI/UX with Analysis page
- "Back to Home" navigation

## 📝 Example PGN Format

```pgn
[Event "Example Game"]
[Site "Online"]
[Date "2025.01.10"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 
6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0
```

## 🏆 Credits

Built with:
- **Chess.js** - PGN parsing and game logic
- **Stockfish 17.1** - Chess engine analysis
- **React** - UI framework
- **Tailwind CSS** - Styling
- **Move Classification System** - Custom brilliant move detection

---

**Ready to analyze your games!** 🎉

