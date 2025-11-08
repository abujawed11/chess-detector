import { useState, useCallback } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { getPieceImageUrl } from '../utils/chessUtils';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export default function InteractiveBoard({ fen, onMove, highlightSquares = [], flipped = false }) {
  const [chess] = useState(new Chess(fen));
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [hoveredSquare, setHoveredSquare] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);

  // Update chess position when FEN changes
  if (chess.fen() !== fen) {
    chess.load(fen);
  }

  const board = chess.board();

  // Get piece at square
  const getPieceAt = useCallback((square) => {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]);
    const row = 8 - rank;
    return board[row][file];
  }, [board]);

  // Handle square click
  const handleSquareClick = useCallback((square) => {
    if (selectedSquare) {
      // Try to make move
      const moves = chess.moves({ square: selectedSquare, verbose: true });
      const move = moves.find(m => m.to === square);

      if (move) {
        const moveResult = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
        if (moveResult && onMove) {
          onMove(moveResult, chess.fen());
        }
        setSelectedSquare(null);
        setLegalMoves([]);
      } else {
        // Click on another piece of same color
        const piece = getPieceAt(square);
        if (piece && piece.color === chess.turn()) {
          setSelectedSquare(square);
          const moves = chess.moves({ square, verbose: true });
          setLegalMoves(moves.map(m => m.to));
        } else {
          setSelectedSquare(null);
          setLegalMoves([]);
        }
      }
    } else {
      // Select piece
      const piece = getPieceAt(square);
      if (piece && piece.color === chess.turn()) {
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
        setLegalMoves(moves.map(m => m.to));
      }
    }
  }, [selectedSquare, chess, onMove, getPieceAt]);

  // Drag handlers
  const handleDragStart = useCallback((e, square) => {
    const piece = getPieceAt(square);
    if (!piece || piece.color !== chess.turn()) {
      e.preventDefault();
      return;
    }

    setDraggedPiece(piece);
    setDragFrom(square);

    const img = new Image();
    img.src = getPieceImageUrl(piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase());
    img.onload = () => {
      e.dataTransfer.setDragImage(img, 40, 40);
    };
  }, [chess, getPieceAt]);

  const handleDragOver = useCallback((e, square) => {
    e.preventDefault();
    setHoveredSquare(square);
  }, []);

  const handleDrop = useCallback((e, square) => {
    e.preventDefault();
    setHoveredSquare(null);

    if (!dragFrom) return;

    // Check if move is legal
    const moves = chess.moves({ square: dragFrom, verbose: true });
    const move = moves.find(m => m.to === square);

    if (move) {
      const moveResult = chess.move({ from: dragFrom, to: square, promotion: 'q' });
      if (moveResult && onMove) {
        onMove(moveResult, chess.fen());
      }
    }

    setDraggedPiece(null);
    setDragFrom(null);
    setSelectedSquare(null);
    setLegalMoves([]);
  }, [dragFrom, chess, onMove]);

  const handleDragEnd = useCallback(() => {
    setDraggedPiece(null);
    setDragFrom(null);
    setHoveredSquare(null);
  }, []);

  // Render squares
  const squares = [];
  const displayRanks = flipped ? [...RANKS].reverse() : RANKS;
  const displayFiles = flipped ? [...FILES].reverse() : FILES;

  for (const rank of displayRanks) {
    for (const file of displayFiles) {
      const square = `${file}${rank}`;
      const fileIdx = file.charCodeAt(0) - 97;
      const isLight = (fileIdx + rank) % 2 === 0;
      const piece = getPieceAt(square);
      const isSelected = selectedSquare === square;
      const isLegalMove = legalMoves.includes(square);
      const isHovered = hoveredSquare === square;
      const isHighlighted = highlightSquares.includes(square);
      const isDragging = dragFrom === square;

      squares.push(
        <div
          key={square}
          onClick={() => handleSquareClick(square)}
          onDragOver={(e) => handleDragOver(e, square)}
          onDrop={(e) => handleDrop(e, square)}
          style={{
            position: 'relative',
            background: isSelected
              ? '#baca44'
              : isHighlighted
              ? '#aaa23a'
              : isHovered && dragFrom
              ? '#cdd26a'
              : isLight
              ? '#f0d9b5'
              : '#b58863',
            cursor: piece && piece.color === chess.turn() ? 'pointer' : 'default',
            opacity: isDragging ? 0.5 : 1,
            transition: 'background 0.2s'
          }}
        >
          {/* Coordinates */}
          {file === (flipped ? 'h' : 'a') && (
            <div style={{
              position: 'absolute',
              left: 4,
              top: 4,
              fontSize: 10,
              fontWeight: 700,
              color: isLight ? '#b58863' : '#f0d9b5',
              userSelect: 'none'
            }}>
              {rank}
            </div>
          )}
          {rank === (flipped ? 8 : 1) && (
            <div style={{
              position: 'absolute',
              right: 4,
              bottom: 4,
              fontSize: 10,
              fontWeight: 700,
              color: isLight ? '#b58863' : '#f0d9b5',
              userSelect: 'none'
            }}>
              {file}
            </div>
          )}

          {/* Legal move indicator */}
          {isLegalMove && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{
                width: piece ? '80%' : '25%',
                height: piece ? '80%' : '25%',
                borderRadius: '50%',
                background: piece ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.2)',
                border: piece ? '3px solid rgba(0,0,0,0.3)' : 'none'
              }} />
            </div>
          )}

          {/* Piece */}
          {piece && (
            <img
              draggable
              onDragStart={(e) => handleDragStart(e, square)}
              onDragEnd={handleDragEnd}
              src={getPieceImageUrl(piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase())}
              alt={piece.type}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: '8%',
                cursor: piece.color === chess.turn() ? 'grab' : 'default',
                userSelect: 'none',
                pointerEvents: piece.color === chess.turn() ? 'auto' : 'none'
              }}
            />
          )}
        </div>
      );
    }
  }

  return (
    <div style={{
      width: 560,
      height: 560,
      border: '4px solid #8b5cf6',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 10px 40px rgba(139, 92, 246, 0.3)',
      background: '#312e81',
      padding: 12
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        width: '100%',
        height: '100%',
        gap: 0
      }}>
        {squares}
      </div>
    </div>
  );
}
