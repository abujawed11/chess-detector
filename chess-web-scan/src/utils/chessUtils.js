// Piece images using lichess CDN
const PIECE_MAP = {
  'K': 'wK', 'Q': 'wQ', 'R': 'wR', 'B': 'wB', 'N': 'wN', 'P': 'wP',
  'k': 'bK', 'q': 'bQ', 'r': 'bR', 'b': 'bB', 'n': 'bN', 'p': 'bP',
};

export function getPieceImageUrl(piece) {
  const name = PIECE_MAP[piece];
  if (!name) return '';

  // Using lichess piece images (cburnett theme)
  const color = piece === piece.toUpperCase() ? 'w' : 'b';
  const type = piece.toUpperCase();

  return `https://lichess1.org/assets/piece/cburnett/${color}${type}.svg`;
}
