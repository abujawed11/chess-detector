import { useState, useCallback } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { getPieceImageUrl } from '../utils/chessUtils';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export default function InteractiveBoard({ fen, onMove, highlightSquares = [], flipped = false, bestMove = null }) {
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

  // Convert square notation to pixel coordinates
  const squareToCoords = useCallback((square) => {
    const file = square[0];
    const rank = parseInt(square[1]);
    
    const displayFiles = flipped ? [...FILES].reverse() : FILES;
    const displayRanks = flipped ? [...RANKS].reverse() : RANKS;
    
    const fileIdx = displayFiles.indexOf(file);
    const rankIdx = displayRanks.indexOf(rank);
    
    const squareSize = 560 / 8; // Board is 560x560
    const x = fileIdx * squareSize + squareSize / 2;
    const y = rankIdx * squareSize + squareSize / 2;
    
    return { x, y };
  }, [flipped]);

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

  // Parse and draw arrow for best move
  const renderArrow = () => {
    if (!bestMove || bestMove.length < 4) return null;
    
    const from = bestMove.substring(0, 2);
    const to = bestMove.substring(2, 4);
    
    const fromCoords = squareToCoords(from);
    const toCoords = squareToCoords(to);
    
    // Calculate arrow direction
    const dx = toCoords.x - fromCoords.x;
    const dy = toCoords.y - fromCoords.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Shorten arrow to not overlap pieces much
    const shortenStart = 20;
    const shortenEnd = 15;
    const arrowStartX = fromCoords.x + Math.cos(angle) * shortenStart;
    const arrowStartY = fromCoords.y + Math.sin(angle) * shortenStart;
    const arrowEndX = toCoords.x - Math.cos(angle) * shortenEnd;
    const arrowEndY = toCoords.y - Math.sin(angle) * shortenEnd;
    
    // Create a smooth arrowhead triangle
    const headLength = 28;
    const headWidth = 24;
    
    // Calculate perpendicular vector for arrowhead width
    const perpAngle = angle + Math.PI / 2;
    const halfWidth = headWidth / 2;
    
    // Arrowhead triangle points
    const tipX = arrowEndX;
    const tipY = arrowEndY;
    
    const baseX = arrowEndX - Math.cos(angle) * headLength;
    const baseY = arrowEndY - Math.sin(angle) * headLength;
    
    const base1X = baseX + Math.cos(perpAngle) * halfWidth;
    const base1Y = baseY + Math.sin(perpAngle) * halfWidth;
    const base2X = baseX - Math.cos(perpAngle) * halfWidth;
    const base2Y = baseY - Math.sin(perpAngle) * halfWidth;
    
    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 560,
          height: 560,
          pointerEvents: 'none',
          zIndex: 10
        }}
      >
        <defs>
          {/* Gradient for arrow */}
          <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#15803d', stopOpacity: 0.9 }} />
            <stop offset="100%" style={{ stopColor: '#16a34a', stopOpacity: 0.95 }} />
          </linearGradient>
          
          {/* Glow filter */}
          <filter id="arrowGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Shadow filter */}
          <filter id="arrowShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="2" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.5"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Outer glow layer */}
        <line
          x1={arrowStartX}
          y1={arrowStartY}
          x2={baseX}
          y2={baseY}
          stroke="#22c55e"
          strokeWidth="20"
          strokeLinecap="round"
          opacity="0.25"
          filter="url(#arrowGlow)"
        />
        
        {/* Shadow layer */}
        <g filter="url(#arrowShadow)">
          {/* Arrow shaft */}
          <line
            x1={arrowStartX}
            y1={arrowStartY}
            x2={baseX}
            y2={baseY}
            stroke="url(#arrowGradient)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          
          {/* Arrowhead */}
          <polygon
            points={`${tipX},${tipY} ${base1X},${base1Y} ${base2X},${base2Y}`}
            fill="url(#arrowGradient)"
            stroke="#15803d"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
        
        {/* Highlight on shaft */}
        <line
          x1={arrowStartX}
          y1={arrowStartY}
          x2={baseX}
          y2={baseY}
          stroke="#4ade80"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.7"
        />
        
        {/* Highlight on arrowhead */}
        <polygon
          points={`${tipX},${tipY} ${(tipX + base1X) / 2},${(tipY + base1Y) / 2} ${(tipX + base2X) / 2},${(tipY + base2Y) / 2}`}
          fill="#4ade80"
          opacity="0.6"
        />
        
        {/* Animated pulse effect */}
        <circle
          cx={fromCoords.x}
          cy={fromCoords.y}
          r="15"
          fill="none"
          stroke="#22c55e"
          strokeWidth="3"
          opacity="0.6"
        >
          <animate
            attributeName="r"
            from="10"
            to="30"
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.8"
            to="0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    );
  };

  return (
    <div style={{
      width: 560,
      height: 560,
      border: '4px solid #8b5cf6',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 10px 40px rgba(139, 92, 246, 0.3)',
      background: '#312e81',
      padding: 12,
      position: 'relative'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        width: '100%',
        height: '100%',
        gap: 0,
        position: 'relative'
      }}>
        {squares}
      </div>
      {renderArrow()}
    </div>
  );
}
