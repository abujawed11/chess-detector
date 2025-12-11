import React from 'react';

/**
 * Calculate captured pieces from a chess position
 * @param {string} fen - FEN string of current position
 * @returns {Object} - { whiteCaptured: [], blackCaptured: [], materialAdvantage: number }
 */
const calculateCapturedPieces = (fen) => {
  if (!fen) {
    return { whiteCaptured: [], blackCaptured: [], materialAdvantage: 0 };
  }

  // Starting pieces count
  const startingPieces = {
    white: { K: 1, Q: 1, R: 2, B: 2, N: 2, P: 8 },
    black: { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 }
  };

  // Piece values for material calculation
  const pieceValues = {
    P: 1, p: 1,
    N: 3, n: 3,
    B: 3, b: 3,
    R: 5, r: 5,
    Q: 9, q: 9,
    K: 0, k: 0
  };

  // Count current pieces from FEN
  const boardPart = fen.split(' ')[0]; // Get board position part
  const currentPieces = {
    K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0,
    k: 0, q: 0, r: 0, b: 0, n: 0, p: 0
  };

  // Parse FEN board
  for (const char of boardPart) {
    if (currentPieces.hasOwnProperty(char)) {
      currentPieces[char]++;
    }
  }

  // Calculate captured pieces
  const whiteCaptured = []; // Black pieces that white captured
  const blackCaptured = []; // White pieces that black captured

  // White pieces captured by black
  ['P', 'N', 'B', 'R', 'Q'].forEach(piece => {
    const captured = startingPieces.white[piece] - currentPieces[piece];
    for (let i = 0; i < captured; i++) {
      blackCaptured.push(piece);
    }
  });

  // Black pieces captured by white
  ['p', 'n', 'b', 'r', 'q'].forEach(piece => {
    const captured = startingPieces.black[piece] - currentPieces[piece];
    for (let i = 0; i < captured; i++) {
      whiteCaptured.push(piece);
    }
  });

  // Calculate material advantage (positive = white ahead, negative = black ahead)
  let whiteMaterial = 0;
  let blackMaterial = 0;

  whiteCaptured.forEach(piece => {
    whiteMaterial += pieceValues[piece];
  });

  blackCaptured.forEach(piece => {
    blackMaterial += pieceValues[piece];
  });

  const materialAdvantage = whiteMaterial - blackMaterial;

  return { whiteCaptured, blackCaptured, materialAdvantage };
};

/**
 * Get Unicode symbol for chess piece
 */
const getPieceSymbol = (piece) => {
  const symbols = {
    // White pieces
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    // Black pieces
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
  };
  return symbols[piece] || piece;
};

/**
 * CapturedPieces Component
 * Displays captured pieces for one side with material advantage
 */
const CapturedPieces = ({ fen, side, flipBoard = false }) => {
  const { whiteCaptured, blackCaptured, materialAdvantage } = calculateCapturedPieces(fen);

  // Determine which pieces to show based on side
  const capturedPieces = side === 'white' ? whiteCaptured : blackCaptured;

  // Calculate advantage for this side
  let advantage = 0;
  if (side === 'white' && materialAdvantage > 0) {
    advantage = materialAdvantage;
  } else if (side === 'black' && materialAdvantage < 0) {
    advantage = Math.abs(materialAdvantage);
  }

  // Sort pieces by value (Queen > Rook > Bishop/Knight > Pawn)
  const pieceOrder = { q: 9, Q: 9, r: 5, R: 5, b: 3, B: 3, n: 3, N: 3, p: 1, P: 1 };
  const sortedPieces = [...capturedPieces].sort((a, b) => {
    return pieceOrder[b] - pieceOrder[a];
  });

  return (
    <div
      className="flex items-center gap-2 py-2 px-3 bg-white rounded-lg border border-gray-300 shadow-sm"
      style={{ minHeight: '40px' }}
    >
      {/* Side label */}
      <div className="text-xs font-semibold text-gray-700 uppercase min-w-[50px]">
        {side === 'white' ? 'White' : 'Black'}
      </div>

      {/* Captured pieces */}
      <div className="flex items-center gap-0.5 flex-wrap flex-1">
        {sortedPieces.length > 0 ? (
          sortedPieces.map((piece, index) => {
            // Color based on piece's actual color (lowercase = black piece, uppercase = white piece)
            const isBlackPiece = piece === piece.toLowerCase();
            return (
              <span
                key={index}
                className="text-2xl leading-none"
                style={{
                  color: isBlackPiece ? '#000000' : '#666666',
                  textShadow: isBlackPiece
                    ? '0 0 1px rgba(255,255,255,0.3)'
                    : '0 0 1px rgba(0,0,0,0.3)',
                  fontWeight: '600'
                }}
              >
                {getPieceSymbol(piece)}
              </span>
            );
          })
        ) : (
          <span className="text-xs text-gray-400 italic">No captures</span>
        )}
      </div>

      {/* Material advantage */}
      {advantage > 0 && (
        <div className="text-sm font-bold text-green-600 ml-auto">
          +{advantage}
        </div>
      )}
    </div>
  );
};

export default CapturedPieces;
