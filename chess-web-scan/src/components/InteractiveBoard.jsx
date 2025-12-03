import { useState, useCallback, useEffect, useRef } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { getPieceImageUrl } from '../utils/chessUtils';
import { useTheme } from '../context/ThemeContext';
import soundManager from '../utils/soundManager';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

export default function InteractiveBoard({
  fen,
  onMove,
  highlightSquares = [],
  flipped = false,
  bestMove = null,
  hoverMove = null,
  moveBadge = null, // { square: 'e4', classification: 'brilliant', label: 'Brilliant' }
  lastMove = null, // { from: 'e2', to: 'e4' }
  tacticalMotifs = [], // Array of { type, square, icon, color }
  disabled = false, // Disable user input (for computer moves)
  externalMove = null // { from, to, animate: true } - for computer moves with animation
}) {
  const [chess] = useState(new Chess(fen));
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [hoveredSquare, setHoveredSquare] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [promotionDialog, setPromotionDialog] = useState(null); // { from, to }

  // Animation state
  const [animatingMove, setAnimatingMove] = useState(null); // { from, to, piece }
  const [capturedPiece, setCapturedPiece] = useState(null); // { square, piece } for capture animation
  const animationTimeoutRef = useRef(null);

  // Get theme colors from context
  const { boardColors, pieceSet } = useTheme();

  // Resume audio context on first user interaction
  useEffect(() => {
    soundManager.resume();
  }, []);

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

  // Get king square for a color
  const getKingSquare = useCallback((color) => {
    for (let rank = 8; rank >= 1; rank--) {
      for (const file of FILES) {
        const square = `${file}${rank}`;
        const piece = getPieceAt(square);
        if (piece && piece.type === 'k' && piece.color === color) {
          return square;
        }
      }
    }
    return null;
  }, [getPieceAt]);

  // Handle external moves (computer moves with animation)
  useEffect(() => {
    if (externalMove && externalMove.animate && externalMove.from && externalMove.to) {
      // Use piece from externalMove if provided, otherwise get from board
      const piece = externalMove.piece || getPieceAt(externalMove.from);
      const capturedPieceData = externalMove.captured ? getPieceAt(externalMove.to) : null;

      // Set up animation
      setAnimatingMove({ from: externalMove.from, to: externalMove.to, piece });
      if (capturedPieceData) {
        setCapturedPiece({ square: externalMove.to, piece: capturedPieceData });
      }

      // Clear animation and play sound after animation duration
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      animationTimeoutRef.current = setTimeout(() => {
        // Check the current FEN to determine what sound to play
        try {
          const tempGame = new Chess(externalMove.newFen || fen);
          const isCastle = externalMove.flags && (externalMove.flags.includes('k') || externalMove.flags.includes('q'));
          const isPromotion = externalMove.flags && externalMove.flags.includes('p');

          // Play sound based on move type
          if (tempGame.isCheckmate()) {
            soundManager.playCheckmate();
          } else if (tempGame.inCheck()) {
            soundManager.playCheck();
          } else if (isCastle) {
            soundManager.playCastle();
          } else if (isPromotion) {
            soundManager.playPromotion();
          } else if (externalMove.captured) {
            soundManager.playCapture();
          } else {
            soundManager.playMove();
          }
        } catch (e) {
          // Fallback to move sound
          soundManager.playMove();
        }

        // Clear animation state
        setAnimatingMove(null);
        setCapturedPiece(null);
      }, 300);
    }
  }, [externalMove, fen, getPieceAt, onMove]);

  // Animate a move and play appropriate sound
  const animateAndExecuteMove = useCallback((from, to, moveObj) => {
    const piece = getPieceAt(from);
    const capturedPieceData = getPieceAt(to);

    // Set up animation
    setAnimatingMove({ from, to, piece });
    if (capturedPieceData) {
      setCapturedPiece({ square: to, piece: capturedPieceData });
    }

    // Clear animation and execute move after animation duration
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    animationTimeoutRef.current = setTimeout(() => {
      // NOW execute the move on the chess instance
      const moveResult = chess.move(moveObj);

      if (moveResult && onMove) {
        onMove(moveResult, chess.fen());
      }

      // Play sound based on move type
      if (chess.isCheckmate()) {
        soundManager.playCheckmate();
      } else if (chess.inCheck()) {
        soundManager.playCheck();
      } else if (moveResult && (moveResult.flags.includes('k') || moveResult.flags.includes('q'))) {
        soundManager.playCastle();
      } else if (moveResult && moveResult.flags.includes('p')) {
        soundManager.playPromotion();
      } else if (capturedPieceData) {
        soundManager.playCapture();
      } else {
        soundManager.playMove();
      }

      // Clear animation state
      setAnimatingMove(null);
      setCapturedPiece(null);
    }, 300); // Animation duration
  }, [chess, onMove, getPieceAt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Check if move is a promotion
  const isPromotion = useCallback((from, to) => {
    const piece = getPieceAt(from);
    if (!piece || piece.type !== 'p') return false;

    const toRank = parseInt(to[1]);
    return (piece.color === 'w' && toRank === 8) || (piece.color === 'b' && toRank === 1);
  }, [getPieceAt]);

  // Handle promotion piece selection
  const handlePromotion = useCallback((piece) => {
    if (!promotionDialog) return;

    const { from, to } = promotionDialog;

    // Animate and execute the promotion move
    animateAndExecuteMove(from, to, { from, to, promotion: piece });

    setPromotionDialog(null);
    setSelectedSquare(null);
    setLegalMoves([]);
    setDraggedPiece(null);
    setDragFrom(null);
  }, [promotionDialog, animateAndExecuteMove]);

  // Handle square click
  const handleSquareClick = useCallback((square) => {
    if (disabled) return; // Disable interaction when computer is playing

    if (selectedSquare) {
      // Try to make move
      const moves = chess.moves({ square: selectedSquare, verbose: true });
      const move = moves.find(m => m.to === square);

      if (move) {
        // Check if it's a promotion
        if (isPromotion(selectedSquare, square)) {
          setPromotionDialog({ from: selectedSquare, to: square });
        } else {
          // Animate and execute the move
          animateAndExecuteMove(selectedSquare, square, { from: selectedSquare, to: square });
          setSelectedSquare(null);
          setLegalMoves([]);
        }
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
  }, [selectedSquare, chess, getPieceAt, isPromotion, disabled, animateAndExecuteMove]);

  // Drag handlers
  const handleDragStart = useCallback((e, square) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    const piece = getPieceAt(square);
    if (!piece || piece.color !== chess.turn()) {
      e.preventDefault();
      return;
    }

    setDraggedPiece(piece);
    setDragFrom(square);

    const img = new Image();
    img.src = getPieceImageUrl(piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase(), pieceSet.id);
    img.onload = () => {
      e.dataTransfer.setDragImage(img, 40, 40);
    };
  }, [chess, getPieceAt, pieceSet.id, disabled]);

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
      // Check if it's a promotion
      if (isPromotion(dragFrom, square)) {
        setPromotionDialog({ from: dragFrom, to: square });
      } else {
        // Animate and execute the move
        animateAndExecuteMove(dragFrom, square, { from: dragFrom, to: square });
        setDraggedPiece(null);
        setDragFrom(null);
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    } else {
      setDraggedPiece(null);
      setDragFrom(null);
    }
  }, [dragFrom, chess, isPromotion, animateAndExecuteMove]);

  const handleDragEnd = useCallback(() => {
    setDraggedPiece(null);
    setDragFrom(null);
    setHoveredSquare(null);
  }, []);

  // Convert square notation to pixel coordinates
  // Board dimensions - container is 680px with 12px padding, so grid is 656px
  const BOARD_PADDING = 12;
  const GRID_SIZE = 680 - (BOARD_PADDING * 2); // 656px

  const squareToCoords = useCallback((square) => {
    const file = square[0];
    const rank = parseInt(square[1]);

    const displayFiles = flipped ? [...FILES].reverse() : FILES;
    const displayRanks = flipped ? [...RANKS].reverse() : RANKS;

    const fileIdx = displayFiles.indexOf(file);
    const rankIdx = displayRanks.indexOf(rank);

    const squareSize = GRID_SIZE / 8; // 82px per square
    const x = fileIdx * squareSize + squareSize / 2;
    const y = rankIdx * squareSize + squareSize / 2;

    return { x, y };
  }, [flipped]);

  // Check detection
  const whiteKingSquare = getKingSquare('w');
  const blackKingSquare = getKingSquare('b');
  const whiteInCheck = chess.turn() === 'w' && chess.inCheck();
  const blackInCheck = chess.turn() === 'b' && chess.inCheck();

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
      const isLastMoveSquare = lastMove && (square === lastMove.from || square === lastMove.to);
      const hasBadge = moveBadge && moveBadge.square === square;
      const isKingInCheck = (whiteInCheck && square === whiteKingSquare) || (blackInCheck && square === blackKingSquare);
      const isAnimatingFrom = animatingMove && animatingMove.from === square;
      const isAnimatingTo = animatingMove && animatingMove.to === square;
      const isCaptureSquare = capturedPiece && capturedPiece.square === square;
      const shouldHidePiece = isAnimatingFrom || isAnimatingTo; // Hide piece during animation

      squares.push(
        <div
          key={square}
          onClick={() => handleSquareClick(square)}
          onDragOver={(e) => handleDragOver(e, square)}
          onDrop={(e) => handleDrop(e, square)}
          style={{
            position: 'relative',
            background: isKingInCheck
              ? '#ff4444' // Red background for king in check
              : isSelected
                ? boardColors.selected
                : isLastMoveSquare
                  ? (isLight ? boardColors.lastMoveLight : boardColors.lastMoveDark)
                  : isHighlighted
                    ? boardColors.highlight
                    : isHovered && dragFrom
                      ? boardColors.hover
                      : isLight
                        ? boardColors.light
                        : boardColors.dark,
            cursor: piece && piece.color === chess.turn() ? 'pointer' : 'default',
            opacity: isDragging ? 0.5 : 1,
            transition: 'background 0.2s, box-shadow 0.2s',
            border: isKingInCheck
              ? '4px solid #cc0000'
              : isLastMoveSquare
                ? '4px solid #FFA500'
                : 'none',
            boxShadow: isKingInCheck
              ? '0 0 30px rgba(255, 0, 0, 0.8), inset 0 0 30px rgba(255, 0, 0, 0.4)'
              : isLastMoveSquare
                ? '0 0 20px rgba(255, 165, 0, 0.6), inset 0 0 20px rgba(255, 165, 0, 0.3)'
                : 'none',
            boxSizing: 'border-box',
            animation: isKingInCheck ? 'checkPulse 1.5s infinite' : 'none'
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
              color: isLight ? boardColors.dark : boardColors.light,
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
              color: isLight ? boardColors.dark : boardColors.light,
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

          {/* Move Badge (Chess.com style - inside square, top-right corner) */}
          {hasBadge && moveBadge.symbol && (
            <div
              className="absolute right-1 top-1 rounded-lg px-2 py-1 text-base font-extrabold leading-none shadow-lg"
              style={{
                backgroundColor: moveBadge.color,
                color: '#fff',
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
              {moveBadge.symbol}
            </div>
          )}

          {/* Piece - hide if animating from/to this square */}
          {piece && !shouldHidePiece && (
            <img
              draggable
              onDragStart={(e) => handleDragStart(e, square)}
              onDragEnd={handleDragEnd}
              src={getPieceImageUrl(piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase(), pieceSet.id)}
              alt={piece.type}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: '8%',
                cursor: piece.color === chess.turn() ? 'grab' : 'default',
                userSelect: 'none',
                pointerEvents: piece.color === chess.turn() ? 'auto' : 'none',
                opacity: isCaptureSquare ? 0 : 1,
                transition: isCaptureSquare ? 'opacity 0.3s ease-out' : 'none'
              }}
            />
          )}
        </div>
      );
    }
  }


  // Common arrow renderer (constant geometry)
  // Common arrow renderer: constant width, solid rectangular tail + triangle head
  // const renderArrowCommon = (
  //   move,
  //   {
  //     gradientId,
  //     startColor,
  //     endColor,
  //     outlineColor,
  //     pulse = false,
  //     pulseColor = '#22c55e',
  //     zIndex = 10,
  //   }
  // ) => {
  //   if (!move || move.length < 4) return null;

  //   const from = move.substring(0, 2);
  //   const to = move.substring(2, 4);

  //   const fromCoords = squareToCoords(from);
  //   const toCoords = squareToCoords(to);

  //   const dx = toCoords.x - fromCoords.x;
  //   const dy = toCoords.y - fromCoords.y;
  //   const length = Math.sqrt(dx * dx + dy * dy);
  //   if (length === 0) return null;

  //   const dirX = dx / length;
  //   const dirY = dy / length;

  //   // Geometry based on one square -> constant look
  //   const squareSize = GRID_SIZE / 8;
  //   // const tailWidth = squareSize * 0.22;       // visual thickness of arrow
  //   // const headLength = squareSize * 0.6;
  //   // const headWidth = squareSize * 0.6;

  //   // const halfTailWidth = tailWidth / 2;

  //   // // We start the body slightly inside the from-square,
  //   // // and end it just before the head.
  //   // const startOffset = squareSize * 0.25;     // how far from from-square center
  //   // const endOffset   = headLength + squareSize * 0.15;

  //   // const bodyStartX = fromCoords.x + dirX * startOffset;
  //   // const bodyStartY = fromCoords.y + dirY * startOffset;

  //   // const bodyEndX = toCoords.x - dirX * endOffset;
  //   // const bodyEndY = toCoords.y - dirY * endOffset;

  //   const tailWidth = squareSize * 0.15;
  //   const headLength = squareSize * 0.35;
  //   const headWidth = squareSize * 0.45;

  //   const halfTailWidth = tailWidth / 2;

  //   const startOffset = squareSize * 0.25;

  //   const bodyStartX = fromCoords.x + dirX * startOffset;
  //   const bodyStartY = fromCoords.y + dirY * startOffset;

  //   // head base (where triangle starts)
  //   const headBaseX = toCoords.x - dirX * headLength;
  //   const headBaseY = toCoords.y - dirY * headLength;

  //   // tail should end exactly at head base -> no gap
  //   const bodyEndX = headBaseX;
  //   const bodyEndY = headBaseY;


  //   // Perpendicular unit vector
  //   const perpX = -dirY;
  //   const perpY = dirX;

  //   // Body rectangle corners
  //   const bodyP1X = bodyStartX + perpX * halfTailWidth;
  //   const bodyP1Y = bodyStartY + perpY * halfTailWidth;

  //   const bodyP2X = bodyEndX + perpX * halfTailWidth;
  //   const bodyP2Y = bodyEndY + perpY * halfTailWidth;

  //   const bodyP3X = bodyEndX - perpX * halfTailWidth;
  //   const bodyP3Y = bodyEndY - perpY * halfTailWidth;

  //   const bodyP4X = bodyStartX - perpX * halfTailWidth;
  //   const bodyP4Y = bodyStartY - perpY * halfTailWidth;

  //   // Arrow head
  //   const tipX = toCoords.x;
  //   const tipY = toCoords.y;

  //   // const headBaseX = tipX - dirX * headLength;
  //   // const headBaseY = tipY - dirY * headLength;

  //   const headHalfWidth = headWidth / 2;

  //   const headP1X = headBaseX + perpX * headHalfWidth;
  //   const headP1Y = headBaseY + perpY * headHalfWidth;

  //   const headP2X = headBaseX - perpX * headHalfWidth;
  //   const headP2Y = headBaseY - perpY * headHalfWidth;

  //   return (
  //     <svg
  //       style={{
  //         position: 'absolute',
  //         top: 0,
  //         left: 0,
  //         width: GRID_SIZE,
  //         height: GRID_SIZE,
  //         pointerEvents: 'none',
  //         zIndex,
  //       }}
  //     >
  //       <defs>
  //         <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
  //           <stop offset="0%" style={{ stopColor: startColor, stopOpacity: 1 }} />
  //           <stop offset="100%" style={{ stopColor: endColor, stopOpacity: 1 }} />
  //         </linearGradient>
  //       </defs>

  //       {/* Tail: long rectangle */}
  //       <polygon
  //         points={`
  //         ${bodyP1X},${bodyP1Y}
  //         ${bodyP2X},${bodyP2Y}
  //         ${bodyP3X},${bodyP3Y}
  //         ${bodyP4X},${bodyP4Y}
  //       `}
  //         fill={`url(#${gradientId})`}
  //         opacity="0.96"
  //       />

  //       {/* Head: triangle */}
  //       <polygon
  //         points={`
  //         ${tipX},${tipY}
  //         ${headP1X},${headP1Y}
  //         ${headP2X},${headP2Y}
  //       `}
  //         fill={`url(#${gradientId})`}
  //         stroke={outlineColor}
  //         strokeWidth="2"
  //         strokeLinejoin="round"
  //         opacity="0.96"
  //       />

  //       {/* Optional pulse at origin */}
  //       {pulse && (
  //         <circle
  //           cx={fromCoords.x}
  //           cy={fromCoords.y}
  //           r="14"
  //           fill="none"
  //           stroke={pulseColor}
  //           strokeWidth="3"
  //           opacity="0.7"
  //         >
  //           <animate
  //             attributeName="r"
  //             from="10"
  //             to="30"
  //             dur="1.4s"
  //             repeatCount="indefinite"
  //           />
  //           <animate
  //             attributeName="opacity"
  //             from="0.8"
  //             to="0"
  //             dur="1.4s"
  //             repeatCount="indefinite"
  //           />
  //         </circle>
  //       )}
  //     </svg>
  //   );
  // };



  // ===============================================
  //   UNIVERSAL ARROW RENDERER (CONFIGURABLE)
  // ===============================================

  const renderArrowCommon = (
    move,
    {
      gradientId,
      startColor,
      endColor,
      outlineColor,
      pulse = false,
      pulseColor = '#22c55e',
      zIndex = 10,

      // OPTIONAL orientation-based calibration
      globalShiftX = 0,   // <- absolute left/right shift (in px)
      globalShiftY = 0,   // <- absolute up/down shift (in px)
    }
  ) => {
    if (!move || move.length < 4) return null;

    const from = move.substring(0, 2);
    const to = move.substring(2, 4);

    const fromCoords = squareToCoords(from);
    const toCoords = squareToCoords(to);

    const dx = toCoords.x - fromCoords.x;
    const dy = toCoords.y - fromCoords.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return null;

    const dirX = dx / length;
    const dirY = dy / length;

    const perpX = -dirY;
    const perpY = dirX;

    // ==========================
    // 🔧 TUNABLE PARAMETERS
    // ==========================
    const squareSize = GRID_SIZE / 8;

    const tailWidth = squareSize * 0.16;  // thickness of shaft
    const headLength = squareSize * 0.35;  // head length
    const headWidth = squareSize * 0.35;  // head width

    const tipInset = squareSize * 0.18;  // pull tip back from piece
    const sideShift = 0;                  // shift perpendicular to arrow (see below)
    const startOffset = squareSize * 0.25;  // how far inside from-square we start
    // ==========================

    const halfTailWidth = tailWidth / 2;

    // Perpendicular shift (depends on arrow direction)
    const sideShiftX = perpX * sideShift;
    const sideShiftY = perpY * sideShift;

    // Total shift = perpendicular + absolute screen calibration
    const shiftX = sideShiftX + globalShiftX;
    const shiftY = sideShiftY + globalShiftY;

    // TIP (end point) – pulled back a bit
    const tipX = toCoords.x - dirX * tipInset + shiftX;
    const tipY = toCoords.y - dirY * tipInset + shiftY;

    // Base of arrow head
    const headBaseX = tipX - dirX * headLength;
    const headBaseY = tipY - dirY * headLength;

    // Tail start (inside from-square)
    const bodyStartX = fromCoords.x + dirX * startOffset + shiftX;
    const bodyStartY = fromCoords.y + dirY * startOffset + shiftY;

    // Tail end = head base
    const bodyEndX = headBaseX;
    const bodyEndY = headBaseY;

    // Tail rectangle
    const bodyP1X = bodyStartX + perpX * halfTailWidth;
    const bodyP1Y = bodyStartY + perpY * halfTailWidth;

    const bodyP2X = bodyEndX + perpX * halfTailWidth;
    const bodyP2Y = bodyEndY + perpY * halfTailWidth;

    const bodyP3X = bodyEndX - perpX * halfTailWidth;
    const bodyP3Y = bodyEndY - perpY * halfTailWidth;

    const bodyP4X = bodyStartX - perpX * halfTailWidth;
    const bodyP4Y = bodyStartY - perpY * halfTailWidth;

    // Head triangle
    const headHalfWidth = headWidth / 2;

    const headP1X = headBaseX + perpX * headHalfWidth;
    const headP1Y = headBaseY + perpY * headHalfWidth;

    const headP2X = headBaseX - perpX * headHalfWidth;
    const headP2Y = headBaseY - perpY * headHalfWidth;

    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: GRID_SIZE,
          height: GRID_SIZE,
          pointerEvents: 'none',
          zIndex,
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: startColor, stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: endColor, stopOpacity: 1 }} />
          </linearGradient>
        </defs>

        {/* Tail */}
        <polygon
          points={`
          ${bodyP1X},${bodyP1Y}
          ${bodyP2X},${bodyP2Y}
          ${bodyP3X},${bodyP3Y}
          ${bodyP4X},${bodyP4Y}
        `}
          fill={`url(#${gradientId})`}
          opacity="0.96"
        />

        {/* Head */}
        <polygon
          points={`
          ${tipX},${tipY}
          ${headP1X},${headP1Y}
          ${headP2X},${headP2Y}
        `}
          fill={`url(#${gradientId})`}
          stroke={outlineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          opacity="0.96"
        />

        {pulse && (
          <circle
            cx={fromCoords.x + globalShiftX}
            cy={fromCoords.y + globalShiftY}
            r="14"
            fill="none"
            stroke={pulseColor}
            strokeWidth="3"
            opacity="0.7"
          >
            <animate attributeName="r" from="10" to="30" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.8" to="0" dur="1.4s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
    );
  };





  // const renderArrowCommon = (
  //   move,
  //   {
  //     gradientId,
  //     startColor,
  //     endColor,
  //     outlineColor,
  //     pulse = false,
  //     pulseColor = '#22c55e',
  //     zIndex = 10,
  //   }
  // ) => {
  //   if (!move || move.length < 4) return null;

  //   // Extract squares
  //   const from = move.substring(0, 2);
  //   const to = move.substring(2, 4);

  //   const fromCoords = squareToCoords(from);
  //   const toCoords = squareToCoords(to);

  //   // Direction vectors
  //   const dx = toCoords.x - fromCoords.x;
  //   const dy = toCoords.y - fromCoords.y;
  //   const length = Math.sqrt(dx * dx + dy * dy);
  //   if (length === 0) return null;

  //   const dirX = dx / length;
  //   const dirY = dy / length;

  //   // Perpendicular vector for left/right shift
  //   const perpX = -dirY;
  //   const perpY = dirX;

  //   // ===============================================
  //   //            🔧  USER TUNABLE PARAMETERS
  //   // ===============================================

  //   const squareSize = GRID_SIZE / 8;

  //   // Arrow body thickness
  //   const tailWidth = squareSize * 0.16;   // <-- make smaller for thinner arrow

  //   // Arrow head dimensions
  //   const headLength = squareSize * 0.3;   // <-- shorten head (length)
  //   const headWidth = squareSize * 0.35;   // <-- narrow/widen head

  //   // Pull arrow tip back from the target square
  //   const tipInset = squareSize * 0.25;   // <-- increase to avoid covering piece

  //   // Move entire arrow sideways
  //   const sideShift = 7;                   // <-- +/- to shift left/right

  //   // How far inside the FROM square the arrow begins
  //   const startOffset = squareSize * 0.25;

  //   // ===============================================
  //   //               END TUNABLE PARAMETERS
  //   // ===============================================

  //   const halfTailWidth = tailWidth / 2;

  //   // Apply sideways shift
  //   const shiftX = perpX * sideShift;
  //   const shiftY = perpY * sideShift;

  //   // --- TIP (end of arrow) ---
  //   const tipX = toCoords.x - dirX * tipInset + shiftX;
  //   const tipY = toCoords.y - dirY * tipInset + shiftY;

  //   // --- BASE OF ARROW HEAD (triangle base) ---
  //   const headBaseX = tipX - dirX * headLength;
  //   const headBaseY = tipY - dirY * headLength;

  //   // --- TAIL START ---
  //   const bodyStartX = fromCoords.x + dirX * startOffset + shiftX;
  //   const bodyStartY = fromCoords.y + dirY * startOffset + shiftY;

  //   // --- TAIL END = head base ---
  //   const bodyEndX = headBaseX;
  //   const bodyEndY = headBaseY;

  //   // --- RECTANGLE CORNERS FOR TAIL ---
  //   const bodyP1X = bodyStartX + perpX * halfTailWidth;
  //   const bodyP1Y = bodyStartY + perpY * halfTailWidth;

  //   const bodyP2X = bodyEndX + perpX * halfTailWidth;
  //   const bodyP2Y = bodyEndY + perpY * halfTailWidth;

  //   const bodyP3X = bodyEndX - perpX * halfTailWidth;
  //   const bodyP3Y = bodyEndY - perpY * halfTailWidth;

  //   const bodyP4X = bodyStartX - perpX * halfTailWidth;
  //   const bodyP4Y = bodyStartY - perpY * halfTailWidth;

  //   // --- HEAD TRIANGLE ---
  //   const headHalfWidth = headWidth / 2;

  //   const headP1X = headBaseX + perpX * headHalfWidth + 0;
  //   const headP1Y = headBaseY + perpY * headHalfWidth + 0;

  //   const headP2X = headBaseX - perpX * headHalfWidth + 0;
  //   const headP2Y = headBaseY - perpY * headHalfWidth + 0;

  //   // ===============================================
  //   //                     SVG
  //   // ===============================================

  //   return (
  //     <svg
  //       style={{
  //         position: 'absolute',
  //         top: 0,
  //         left: 0,
  //         width: GRID_SIZE,
  //         height: GRID_SIZE,
  //         pointerEvents: 'none',
  //         zIndex,
  //       }}
  //     >
  //       <defs>
  //         <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
  //           <stop offset="0%" style={{ stopColor: startColor, stopOpacity: 1 }} />
  //           <stop offset="100%" style={{ stopColor: endColor, stopOpacity: 1 }} />
  //         </linearGradient>
  //       </defs>

  //       {/* Tail Rectangle */}
  //       <polygon
  //         points={`
  //         ${bodyP1X},${bodyP1Y}
  //         ${bodyP2X},${bodyP2Y}
  //         ${bodyP3X},${bodyP3Y}
  //         ${bodyP4X},${bodyP4Y}
  //       `}
  //         fill={`url(#${gradientId})`}
  //         opacity="0.96"
  //       />

  //       {/* Triangle Head */}
  //       <polygon
  //         points={`
  //         ${tipX},${tipY}
  //         ${headP1X},${headP1Y}
  //         ${headP2X},${headP2Y}
  //       `}
  //         fill={`url(#${gradientId})`}
  //         stroke={outlineColor}
  //         strokeWidth="2"
  //         strokeLinejoin="round"
  //         opacity="0.96"
  //       />

  //       {/* Optional pulse */}
  //       {pulse && (
  //         <circle
  //           cx={fromCoords.x}
  //           cy={fromCoords.y}
  //           r="14"
  //           fill="none"
  //           stroke={pulseColor}
  //           strokeWidth="3"
  //           opacity="0.7"
  //         >
  //           <animate attributeName="r" from="10" to="30" dur="1.4s" repeatCount="indefinite" />
  //           <animate attributeName="opacity" from="0.8" to="0" dur="1.4s" repeatCount="indefinite" />
  //         </circle>
  //       )}
  //     </svg>
  //   );
  // };






  const renderArrow = () => {
    if (!bestMove || bestMove.length < 4) return null;

    return renderArrowCommon(bestMove, {
      gradientId: 'bestMoveArrowGradient',
      startColor: '#15803d',
      endColor: '#16a34a',
      outlineColor: '#14532d',
      pulse: true,
      pulseColor: '#22c55e',
      zIndex: 12,
      globalShiftX: 5,
      globalShiftY: 10,
    });
  };



  const renderHoverArrow = () => {
    if (!hoverMove || hoverMove.length < 4) return null;

    return renderArrowCommon(hoverMove, {
      gradientId: 'hoverArrowGradient',
      startColor: '#6366f1',
      endColor: '#8b5cf6',
      outlineColor: '#4c1d95',

      // example calibration:
      globalShiftX: 5,
      globalShiftY: 10,
    });
  };


  // const renderHoverArrow = () => {
  //   if (!hoverMove || hoverMove.length < 4) return null;

  //   return renderArrowCommon(hoverMove, {
  //     gradientId: 'hoverArrowGradient',
  //     startColor: '#6366f1',
  //     endColor: '#8b5cf6',
  //     outlineColor: '#4c1d95',
  //     pulse: false,
  //     zIndex: 11,
  //   });
  // };

  // Parse and draw arrow for hover move (blue/purple)
  // const renderHoverArrow = () => {
  //   if (!hoverMove || hoverMove.length < 4) return null;

  //   const from = hoverMove.substring(0, 2);
  //   const to = hoverMove.substring(2, 4);

  //   const fromCoords = squareToCoords(from);
  //   const toCoords = squareToCoords(to);

  //   // Calculate arrow direction and length
  //   const dx = toCoords.x - fromCoords.x;
  //   const dy = toCoords.y - fromCoords.y;
  //   const angle = Math.atan2(dy, dx);
  //   const length = Math.sqrt(dx * dx + dy * dy);

  //   // Dynamic shortening based on arrow length
  //   const squareSize = GRID_SIZE / 8;
  //   const shortenStart = Math.min(25, length * 0.12);
  //   const shortenEnd = Math.min(20, length * 0.10);

  //   const arrowStartX = fromCoords.x + Math.cos(angle) * shortenStart;
  //   const arrowStartY = fromCoords.y + Math.sin(angle) * shortenStart;
  //   const arrowEndX = toCoords.x - Math.cos(angle) * shortenEnd;
  //   const arrowEndY = toCoords.y - Math.sin(angle) * shortenEnd;

  //   // Dynamic arrowhead size
  //   const headLength = Math.min(32, Math.max(20, length * 0.15));
  //   const headWidth = Math.min(28, Math.max(16, length * 0.13));

  //   // Calculate perpendicular vector for arrowhead width
  //   const perpAngle = angle + Math.PI / 2;
  //   const halfWidth = headWidth / 2;

  //   // Arrowhead triangle points
  //   const tipX = arrowEndX;
  //   const tipY = arrowEndY;

  //   const baseX = arrowEndX - Math.cos(angle) * headLength;
  //   const baseY = arrowEndY - Math.sin(angle) * headLength;

  //   const base1X = baseX + Math.cos(perpAngle) * halfWidth;
  //   const base1Y = baseY + Math.sin(perpAngle) * halfWidth;
  //   const base2X = baseX - Math.cos(perpAngle) * halfWidth;
  //   const base2Y = baseY - Math.sin(perpAngle) * halfWidth;

  //   // Dynamic stroke widths based on length
  //   const hoverNumSquares = length / squareSize;
  //   // const mainStrokeWidth = Math.max(12, Math.min(16, length * 0.08));
  //   const mainStrokeWidth = 15

  //   // White core should be subtle and only visible on longer arrows
  //   const whiteCoreWidth = mainStrokeWidth + Math.min(4, hoverNumSquares * 1.5);
  //   const whiteCoreOpacity = Math.min(0.25, hoverNumSquares * 0.05); // Very subtle for short arrows

  //   return (
  //     <svg
  //       style={{
  //         position: 'absolute',
  //         top: 0,
  //         left: 0,
  //         width: GRID_SIZE,
  //         height: GRID_SIZE,
  //         pointerEvents: 'none',
  //         zIndex: 9
  //       }}
  //     >
  //       <defs>
  //         {/* Solid gradient for hover arrow - more opaque */}
  //         <linearGradient id="hoverArrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
  //           <stop offset="0%" style={{ stopColor: '#6366f1', stopOpacity: 1 }} />
  //           <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
  //         </linearGradient>
  //       </defs>

  //       {/* Removed white outline - was making long arrows look washed out */}

  //       {/* Arrow shaft - solid colored body */}
  //       <line
  //         x1={arrowStartX}
  //         y1={arrowStartY}
  //         x2={baseX}
  //         y2={baseY}
  //         stroke="url(#hoverArrowGradient)"
  //         strokeWidth={mainStrokeWidth}
  //         strokeLinecap="round"
  //         opacity="0.95"
  //       />

  //       {/* Arrowhead - solid colored */}
  //       <polygon
  //         points={`${tipX},${tipY} ${base1X},${base1Y} ${base2X},${base2Y}`}
  //         fill="url(#hoverArrowGradient)"
  //         stroke="#5b21b6"
  //         strokeWidth="2"
  //         strokeLinejoin="round"
  //         opacity="0.95"
  //       />

  //       {/* Subtle center highlight for depth - only on longer arrows */}
  //       {hoverNumSquares > 3 && (
  //         <line
  //           x1={arrowStartX}
  //           y1={arrowStartY}
  //           x2={baseX}
  //           y2={baseY}
  //           stroke="#8b5cf6"
  //           strokeWidth={Math.max(2, mainStrokeWidth * 0.2)}
  //           strokeLinecap="round"
  //           opacity="0.3"
  //         />
  //       )}
  //     </svg>
  //   );
  // };


  // const renderArrow = () => {
  //   if (!bestMove || bestMove.length < 4) return null;

  //   return renderArrowCommon(bestMove, {
  //     gradientId: 'bestMoveArrowGradient',
  //     startColor: '#15803d',
  //     endColor: '#16a34a',
  //     outlineColor: '#14532d',
  //     pulse: true,
  //     pulseColor: '#22c55e',
  //     zIndex: 12,
  //   });
  // };


  // Parse and draw arrow for best move
  // const renderArrow = () => {
  //   if (!bestMove || bestMove.length < 4) return null;

  //   const from = bestMove.substring(0, 2);
  //   const to = bestMove.substring(2, 4);

  //   const fromCoords = squareToCoords(from);
  //   const toCoords = squareToCoords(to);

  //   // Calculate arrow direction and length
  //   const dx = toCoords.x - fromCoords.x;
  //   const dy = toCoords.y - fromCoords.y;
  //   const angle = Math.atan2(dy, dx);
  //   const length = Math.sqrt(dx * dx + dy * dy);

  //   // Dynamic shortening based on arrow length
  //   // Short arrows (1 square) need less shortening than long arrows
  //   const squareSize = GRID_SIZE / 8; // 82px
  //   const numSquares = length / squareSize;

  //   // Scale shortening with arrow length - more natural positioning
  //   const shortenStart = Math.min(25, length * 0.12); // Start 12% from origin
  //   const shortenEnd = Math.min(20, length * 0.10);   // End 10% from target

  //   const arrowStartX = fromCoords.x + Math.cos(angle) * shortenStart;
  //   const arrowStartY = fromCoords.y + Math.sin(angle) * shortenStart;
  //   const arrowEndX = toCoords.x - Math.cos(angle) * shortenEnd;
  //   const arrowEndY = toCoords.y - Math.sin(angle) * shortenEnd;

  //   // Dynamic arrowhead size based on length
  //   const headLength = Math.min(32, Math.max(20, length * 0.15)); // 15% of length
  //   const headWidth = Math.min(28, Math.max(16, length * 0.13));  // 13% of length

  //   // Calculate perpendicular vector for arrowhead width
  //   const perpAngle = angle + Math.PI / 2;
  //   const halfWidth = headWidth / 2;

  //   // Arrowhead triangle points
  //   const tipX = arrowEndX;
  //   const tipY = arrowEndY;

  //   const baseX = arrowEndX - Math.cos(angle) * headLength;
  //   const baseY = arrowEndY - Math.sin(angle) * headLength;

  //   const base1X = baseX + Math.cos(perpAngle) * halfWidth;
  //   const base1Y = baseY + Math.sin(perpAngle) * halfWidth;
  //   const base2X = baseX - Math.cos(perpAngle) * halfWidth;
  //   const base2Y = baseY - Math.sin(perpAngle) * halfWidth;

  //   // Dynamic stroke widths based on length
  //   const bestMoveNumSquares = length / (GRID_SIZE / 8);
  //   const mainStrokeWidth = Math.max(12, Math.min(16, length * 0.08));

  //   // White core for contrast - only on longer arrows
  //   const whiteCoreWidth = mainStrokeWidth + Math.min(4, bestMoveNumSquares * 1.5);
  //   const whiteCoreOpacity = Math.min(0.25, bestMoveNumSquares * 0.05);

  //   return (
  //     <svg
  //       style={{
  //         position: 'absolute',
  //         top: 0,
  //         left: 0,
  //         width: GRID_SIZE,
  //         height: GRID_SIZE,
  //         pointerEvents: 'none',
  //         zIndex: 10
  //       }}
  //     >
  //       <defs>
  //         {/* Solid gradient for best move arrow */}
  //         <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
  //           <stop offset="0%" style={{ stopColor: '#15803d', stopOpacity: 1 }} />
  //           <stop offset="100%" style={{ stopColor: '#16a34a', stopOpacity: 1 }} />
  //         </linearGradient>
  //       </defs>

  //       {/* Removed white outline - was making long arrows look washed out */}

  //       {/* Arrow shaft - solid colored body */}
  //       <line
  //         x1={arrowStartX}
  //         y1={arrowStartY}
  //         x2={baseX}
  //         y2={baseY}
  //         stroke="url(#arrowGradient)"
  //         strokeWidth={mainStrokeWidth}
  //         strokeLinecap="round"
  //         opacity="0.95"
  //       />

  //       {/* Arrowhead - solid colored */}
  //       <polygon
  //         points={`${tipX},${tipY} ${base1X},${base1Y} ${base2X},${base2Y}`}
  //         fill="url(#arrowGradient)"
  //         stroke="#15803d"
  //         strokeWidth="2"
  //         strokeLinejoin="round"
  //         opacity="0.95"
  //       />

  //       {/* Removed center highlight - was making arrows look washed out */}

  //       {/* Subtle highlight on arrowhead tip */}
  //       <polygon
  //         points={`${tipX},${tipY} ${(tipX + base1X) / 2},${(tipY + base1Y) / 2} ${(tipX + base2X) / 2},${(tipY + base2Y) / 2}`}
  //         fill="#86efac"
  //         opacity="0.5"
  //       />

  //       {/* Animated pulse effect */}
  //       <circle
  //         cx={fromCoords.x}
  //         cy={fromCoords.y}
  //         r="15"
  //         fill="none"
  //         stroke="#22c55e"
  //         strokeWidth="3"
  //         opacity="0.6"
  //       >
  //         <animate
  //           attributeName="r"
  //           from="10"
  //           to="30"
  //           dur="1.5s"
  //           repeatCount="indefinite"
  //         />
  //         <animate
  //           attributeName="opacity"
  //           from="0.8"
  //           to="0"
  //           dur="1.5s"
  //           repeatCount="indefinite"
  //         />
  //       </circle>
  //     </svg>
  //   );
  // };

  // Render tactical motif indicators (e.g., hanging pieces, threats)
  const renderTacticalMotifs = () => {
    if (!tacticalMotifs || tacticalMotifs.length === 0) return null;

    const displayFiles = flipped ? [...FILES].reverse() : FILES;
    const displayRanks = flipped ? [...RANKS].reverse() : RANKS;
    const squareSize = GRID_SIZE / 8; // 82px per square

    return tacticalMotifs.map((motif, idx) => {
      const file = motif.square[0];
      const rank = parseInt(motif.square[1]);
      const fileIdx = displayFiles.indexOf(file);
      const rankIdx = displayRanks.indexOf(rank);

      const x = (fileIdx + 0.5) * squareSize;
      const y = rankIdx * squareSize + 10;

      const motifIcons = {
        'hanging_piece': '🎯',
        'missed_capture': '🔍',
        'allowed_mate_threat': '☠️',
        'missed_mate': '👑',
        'brilliant_sacrifice': '💎'
      };

      const motifColors = {
        'hanging_piece': 'rgb(239, 68, 68)',
        'missed_capture': 'rgb(251, 146, 60)',
        'allowed_mate_threat': 'rgb(220, 38, 38)',
        'missed_mate': 'rgb(234, 179, 8)',
        'brilliant_sacrifice': 'rgb(16, 185, 129)'
      };

      return (
        <div
          key={idx}
          className="pointer-events-none absolute"
          style={{
            left: x,
            top: y,
            transform: 'translate(-50%, 0)',
            zIndex: 15,
            animation: 'bounceIn 0.4s ease-out'
          }}
        >
          <div
            className="rounded-full bg-white/90 p-1.5 shadow-lg backdrop-blur-sm"
            style={{
              border: `2px solid ${motifColors[motif.type] || 'rgb(100, 116, 139)'}`,
              animation: 'pulse 2s infinite'
            }}
          >
            <span className="text-lg">{motifIcons[motif.type] || motif.icon || '⚠️'}</span>
          </div>
        </div>
      );
    });
  };


  // Render animating piece
  const renderAnimatingPiece = () => {
    if (!animatingMove) return null;

    const fromCoords = squareToCoords(animatingMove.from);
    const toCoords = squareToCoords(animatingMove.to);
    const piece = animatingMove.piece;

    // Safety check - if piece is null, don't render
    if (!piece) return null;

    return (
      <div
        style={{
          position: 'absolute',
          width: GRID_SIZE / 8,
          height: GRID_SIZE / 8,
          top: BOARD_PADDING,
          left: BOARD_PADDING,
          transform: `translate(${fromCoords.x - (GRID_SIZE / 8 / 2)}px, ${fromCoords.y - (GRID_SIZE / 8 / 2)}px)`,
          animation: `moveAnimation 0.3s ease-out forwards`,
          '--from-x': `${fromCoords.x - (GRID_SIZE / 8 / 2)}px`,
          '--from-y': `${fromCoords.y - (GRID_SIZE / 8 / 2)}px`,
          '--to-x': `${toCoords.x - (GRID_SIZE / 8 / 2)}px`,
          '--to-y': `${toCoords.y - (GRID_SIZE / 8 / 2)}px`,
          pointerEvents: 'none',
          zIndex: 100
        }}
      >
        <img
          src={getPieceImageUrl(piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase(), pieceSet.id)}
          alt={piece.type}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: '8%',
            filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))'
          }}
        />
      </div>
    );
  };

  return (
    <div style={{
      width: 680,
      height: 680,
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
      {renderAnimatingPiece()}
      {renderHoverArrow()}
      {renderArrow()}
      {renderTacticalMotifs()}

      {/* Promotion Dialog */}
      {promotionDialog && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              animation: 'promotionPopIn 0.3s ease-out'
            }}
          >
            <div style={{
              textAlign: 'center',
              marginBottom: 16,
              color: 'white',
              fontSize: 18,
              fontWeight: 700
            }}>
              Choose Promotion Piece
            </div>
            <div style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center'
            }}>
              {['q', 'r', 'b', 'n'].map(piece => {
                const pieceColor = chess.turn();
                const pieceType = pieceColor === 'w' ? piece.toUpperCase() : piece.toLowerCase();
                return (
                  <button
                    key={piece}
                    onClick={() => handlePromotion(piece)}
                    style={{
                      width: 80,
                      height: 80,
                      background: 'white',
                      border: '3px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: 12,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1) translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1) translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    <img
                      src={getPieceImageUrl(pieceType, pieceSet.id)}
                      alt={piece}
                      style={{
                        width: '90%',
                        height: '90%',
                        objectFit: 'contain'
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add custom animations */}
      <style>{`
        @keyframes bounceIn {
          0% {
            opacity: 0;
            transform: scale(0.3);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes slideDown {
          0% {
            opacity: 0;
            transform: translate(-50%, -10px);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        @keyframes promotionPopIn {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(-20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes checkPulse {
          0%, 100% {
            box-shadow: 0 0 30px rgba(255, 0, 0, 0.8), inset 0 0 30px rgba(255, 0, 0, 0.4);
            border-color: #cc0000;
          }
          50% {
            box-shadow: 0 0 50px rgba(255, 0, 0, 1), inset 0 0 50px rgba(255, 0, 0, 0.6);
            border-color: #ff0000;
          }
        }

        @keyframes moveAnimation {
          0% {
            transform: translate(var(--from-x), var(--from-y));
          }
          100% {
            transform: translate(var(--to-x), var(--to-y));
          }
        }
      `}</style>
    </div>
  );
}
