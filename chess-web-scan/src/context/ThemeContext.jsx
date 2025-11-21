import { createContext, useContext, useState, useEffect } from 'react';

// Board color themes
export const BOARD_THEMES = {
  classic: {
    name: 'Classic',
    light: '#f0d9b5',
    dark: '#b58863',
    selected: '#baca44',
    lastMoveLight: '#cdd26a',
    lastMoveDark: '#aaa23a',
    highlight: '#aaa23a',
    hover: '#cdd26a',
  },
  green: {
    name: 'Green',
    light: '#eeeed2',
    dark: '#769656',
    selected: '#baca44',
    lastMoveLight: '#f6f669',
    lastMoveDark: '#baca44',
    highlight: '#baca44',
    hover: '#f6f669',
  },
  blue: {
    name: 'Blue',
    light: '#dee3e6',
    dark: '#8ca2ad',
    selected: '#83a5c4',
    lastMoveLight: '#afc8e4',
    lastMoveDark: '#6d98ba',
    highlight: '#6d98ba',
    hover: '#afc8e4',
  },
  purple: {
    name: 'Purple',
    light: '#e8e0f0',
    dark: '#9b7bb8',
    selected: '#c4a4d8',
    lastMoveLight: '#d4c4e8',
    lastMoveDark: '#a888c8',
    highlight: '#a888c8',
    hover: '#d4c4e8',
  },
  brown: {
    name: 'Brown',
    light: '#f0d9b5',
    dark: '#946f51',
    selected: '#d4a84b',
    lastMoveLight: '#e8c878',
    lastMoveDark: '#c4983b',
    highlight: '#c4983b',
    hover: '#e8c878',
  },
  icySea: {
    name: 'Icy Sea',
    light: '#d9e4ec',
    dark: '#6a9bb8',
    selected: '#8dc4e8',
    lastMoveLight: '#b8d8f0',
    lastMoveDark: '#78b4d8',
    highlight: '#78b4d8',
    hover: '#b8d8f0',
  },
  coral: {
    name: 'Coral',
    light: '#f5e6e0',
    dark: '#d4a59a',
    selected: '#e8c8b8',
    lastMoveLight: '#f0d8c8',
    lastMoveDark: '#d8b8a8',
    highlight: '#d8b8a8',
    hover: '#f0d8c8',
  },
  dusk: {
    name: 'Dusk',
    light: '#ccb7ae',
    dark: '#706677',
    selected: '#9888a8',
    lastMoveLight: '#c4b8c8',
    lastMoveDark: '#8878a8',
    highlight: '#8878a8',
    hover: '#c4b8c8',
  },
};

// Piece set themes (from Lichess)
export const PIECE_THEMES = {
  cburnett: { name: 'Cburnett', id: 'cburnett' },
  merida: { name: 'Merida', id: 'merida' },
  alpha: { name: 'Alpha', id: 'alpha' },
  pirouetti: { name: 'Pirouetti', id: 'pirouetti' },
  chessnut: { name: 'Chessnut', id: 'chessnut' },
  chess7: { name: 'Chess7', id: 'chess7' },
  reillycraig: { name: 'Reilly Craig', id: 'reillycraig' },
  companion: { name: 'Companion', id: 'companion' },
  riohacha: { name: 'Riohacha', id: 'riohacha' },
  kosal: { name: 'Kosal', id: 'kosal' },
  leipzig: { name: 'Leipzig', id: 'leipzig' },
  fantasy: { name: 'Fantasy', id: 'fantasy' },
  spatial: { name: 'Spatial', id: 'spatial' },
  california: { name: 'California', id: 'california' },
  pixel: { name: 'Pixel', id: 'pixel' },
  maestro: { name: 'Maestro', id: 'maestro' },
  fresca: { name: 'Fresca', id: 'fresca' },
  cardinal: { name: 'Cardinal', id: 'cardinal' },
  gioco: { name: 'Gioco', id: 'gioco' },
  tatiana: { name: 'Tatiana', id: 'tatiana' },
  staunty: { name: 'Staunty', id: 'staunty' },
  governor: { name: 'Governor', id: 'governor' },
  dubrovny: { name: 'Dubrovny', id: 'dubrovny' },
  icpieces: { name: 'IC Pieces', id: 'icpieces' },
  shapes: { name: 'Shapes', id: 'shapes' },
  letter: { name: 'Letter', id: 'letter' },
};

const ThemeContext = createContext();

const STORAGE_KEY = 'chess-theme-preferences';

export function ThemeProvider({ children }) {
  const [boardTheme, setBoardTheme] = useState('classic');
  const [pieceTheme, setPieceTheme] = useState('cburnett');

  // Load theme from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { boardTheme: savedBoard, pieceTheme: savedPiece } = JSON.parse(saved);
        if (savedBoard && BOARD_THEMES[savedBoard]) {
          setBoardTheme(savedBoard);
        }
        if (savedPiece && PIECE_THEMES[savedPiece]) {
          setPieceTheme(savedPiece);
        }
      }
    } catch (e) {
      console.error('Failed to load theme preferences:', e);
    }
  }, []);

  // Save theme to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ boardTheme, pieceTheme }));
    } catch (e) {
      console.error('Failed to save theme preferences:', e);
    }
  }, [boardTheme, pieceTheme]);

  const value = {
    boardTheme,
    pieceTheme,
    setBoardTheme,
    setPieceTheme,
    boardColors: BOARD_THEMES[boardTheme],
    pieceSet: PIECE_THEMES[pieceTheme],
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Helper function to get piece image URL
export function getPieceImageUrl(piece, pieceThemeId = 'cburnett') {
  if (!piece) return null;
  const color = piece.color === 'w' ? 'w' : 'b';
  const typeMap = {
    p: 'P',
    n: 'N',
    b: 'B',
    r: 'R',
    q: 'Q',
    k: 'K',
  };
  const type = typeMap[piece.type] || piece.type.toUpperCase();
  return `https://lichess1.org/assets/piece/${pieceThemeId}/${color}${type}.svg`;
}
