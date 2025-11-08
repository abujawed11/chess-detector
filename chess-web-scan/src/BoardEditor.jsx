import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js/dist/esm/chess.js";
import { getPieceImageUrl } from "./utils/chessUtils";
import { FILES, RANKS } from "./utils/constants";

// --- piece palette ---
const WHITE = ["K", "Q", "R", "B", "N", "P"];
const BLACK = ["k", "q", "r", "b", "n", "p"];

// ---------- helpers: fen <-> board map ----------
function buildFen({ pieces, side, castling, ep }) {
  const board = Array(64).fill(".");
  for (const [pos, piece] of Object.entries(pieces)) {
    const file = pos.charCodeAt(0) - 97;
    const rank = parseInt(pos[1], 10);
    const idx = (8 - rank) * 8 + file;
    board[idx] = piece;
  }

  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = "";
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const v = board[r*8 + c];
      if (v === ".") empty++;
      else { if (empty) { row += empty; empty = 0; } row += v; }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const legal = inferCastlingRights(board);
  const castlingChosen = sanitizeOrInferCastling(legal, castling);
  const epSq = ep && /^[a-h][36]$/.test(ep) ? ep : "-";
  return `${rows.join("/") } ${side} ${castlingChosen} ${epSq} 0 1`;
}

function parseFenToState(fen) {
  const [placement, side="w", castle="-", ep="-"] = fen.trim().split(/\s+/);
  const rows = placement.split("/");
  const pieces = {};
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) c += parseInt(ch,10);
      else {
        const file = FILES[c];
        const rank = 8 - r;
        pieces[`${file}${rank}`] = ch;
        c += 1;
      }
    }
  }
  const cs = { K:false,Q:false,k:false,q:false };
  for (const k of ["K","Q","k","q"]) if (castle.includes(k)) cs[k] = true;
  return { pieces, side, castling: cs, ep: ep === "-" ? "" : ep };
}

function inferCastlingRights(board64){
  const at = (f,r) => board64[r*8 + f];
  const rights = [];
  const wk  = at(4,7)==="K";
  const wra = at(0,7)==="R";
  const wrh = at(7,7)==="R";
  if (wk && wrh) rights.push("K");
  if (wk && wra) rights.push("Q");
  const bk  = at(4,0)==="k";
  const bra = at(0,0)==="r";
  const brh = at(7,0)==="r";
  if (bk && brh) rights.push("k");
  if (bk && bra) rights.push("q");
  return rights.length ? rights.join("") : "-";
}

function sanitizeOrInferCastling(legal, chosen){
  if (!chosen) return legal;
  const any = Object.values(chosen).some(Boolean);
  if (!any) return legal;
  if (legal === "-") return "-";
  const keep = ["K","Q","k","q"].filter(k => chosen[k] && legal.includes(k)).join("");
  return keep || "-";
}

function validateFen(fen){
  try { new Chess(fen); return {valid:true}; }
  catch(e){ return {valid:false, reason:e?.message || "Invalid FEN"}; }
}

// Validate position rules - for placement (lenient, allows building)
function validatePlacement(pieces, newSquare, newPiece) {
  // Create a temporary pieces object with the new piece
  const tempPieces = { ...pieces };
  if (newSquare && newPiece) {
    tempPieces[newSquare] = newPiece;
  }

  const errors = [];
  const pieceCounts = {
    'K': 0, 'Q': 0, 'R': 0, 'B': 0, 'N': 0, 'P': 0,
    'k': 0, 'q': 0, 'r': 0, 'b': 0, 'n': 0, 'p': 0
  };

  // Count pieces
  for (const [square, piece] of Object.entries(tempPieces)) {
    if (pieceCounts[piece] !== undefined) {
      pieceCounts[piece]++;
    }

    // Check pawns on first/last rank
    const rank = parseInt(square[1]);
    if ((piece === 'P' || piece === 'p') && (rank === 1 || rank === 8)) {
      errors.push(`Pawns cannot be placed on rank ${rank}`);
    }
  }

  // Validate piece counts (blocking rules during placement)
  if (pieceCounts['K'] > 1) errors.push('Cannot have more than 1 white king');
  if (pieceCounts['k'] > 1) errors.push('Cannot have more than 1 black king');
  if (pieceCounts['P'] > 8) errors.push('Cannot have more than 8 white pawns');
  if (pieceCounts['p'] > 8) errors.push('Cannot have more than 8 black pawns');

  // Count total pieces per color
  const whiteTotal = pieceCounts['K'] + pieceCounts['Q'] + pieceCounts['R'] +
                     pieceCounts['B'] + pieceCounts['N'] + pieceCounts['P'];
  const blackTotal = pieceCounts['k'] + pieceCounts['q'] + pieceCounts['r'] +
                     pieceCounts['b'] + pieceCounts['n'] + pieceCounts['p'];

  if (whiteTotal > 16) errors.push('White cannot have more than 16 pieces');
  if (blackTotal > 16) errors.push('Black cannot have more than 16 pieces');

  return { valid: errors.length === 0, errors };
}

// Validate complete position - for finishing (strict, requires both kings)
function validateCompletePosition(pieces) {
  const errors = [];
  const pieceCounts = {
    'K': 0, 'Q': 0, 'R': 0, 'B': 0, 'N': 0, 'P': 0,
    'k': 0, 'q': 0, 'r': 0, 'b': 0, 'n': 0, 'p': 0
  };

  // Count pieces
  for (const [square, piece] of Object.entries(pieces)) {
    if (pieceCounts[piece] !== undefined) {
      pieceCounts[piece]++;
    }

    // Check pawns on first/last rank
    const rank = parseInt(square[1]);
    if ((piece === 'P' || piece === 'p') && (rank === 1 || rank === 8)) {
      errors.push(`Pawns cannot be placed on rank ${rank}`);
    }
  }

  // Strict validation for complete position
  if (pieceCounts['K'] > 1) errors.push('Cannot have more than 1 white king');
  if (pieceCounts['k'] > 1) errors.push('Cannot have more than 1 black king');
  if (pieceCounts['K'] === 0) errors.push('White king is required');
  if (pieceCounts['k'] === 0) errors.push('Black king is required');
  if (pieceCounts['P'] > 8) errors.push('Cannot have more than 8 white pawns');
  if (pieceCounts['p'] > 8) errors.push('Cannot have more than 8 black pawns');

  // Count total pieces per color
  const whiteTotal = pieceCounts['K'] + pieceCounts['Q'] + pieceCounts['R'] +
                     pieceCounts['B'] + pieceCounts['N'] + pieceCounts['P'];
  const blackTotal = pieceCounts['k'] + pieceCounts['q'] + pieceCounts['r'] +
                     pieceCounts['b'] + pieceCounts['n'] + pieceCounts['p'];

  if (whiteTotal > 16) errors.push('White cannot have more than 16 pieces');
  if (blackTotal > 16) errors.push('Black cannot have more than 16 pieces');

  return { valid: errors.length === 0, errors };
}

export default function BoardEditor({ initialFen, onDone, onCancel, overlayImage }) {
  const startFen = initialFen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const seed = parseFenToState(startFen);

  const [pieces, setPieces] = useState(seed.pieces);
  const [side, setSide] = useState(seed.side);
  const [castling, setCastling] = useState(seed.castling);
  const [ep, setEp] = useState(seed.ep);
  const [flipped, setFlipped] = useState(false);
  const [coordinatesFlipped, setCoordinatesFlipped] = useState(false);

  const [dragPiece, setDragPiece] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOverSquare, setDragOverSquare] = useState(null);
  const [dragOverBin, setDragOverBin] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  const fen = useMemo(() => buildFen({ pieces, side, castling, ep }), [pieces, side, castling, ep]);
  const fenStatus = useMemo(() => validateFen(fen), [fen]);

  // Validate complete position for display warnings (but don't block placement)
  useEffect(() => {
    const validation = validateCompletePosition(pieces);
    setValidationErrors(validation.errors);
  }, [pieces]);

  function clearBoard(){
    setPieces({});
    setCastling({K:false,Q:false,k:false,q:false});
    setEp("");
  }

  function fillStart(){
    const s = parseFenToState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    setPieces(s.pieces); setSide("w"); setCastling(s.castling); setEp("");
  }

  function flipBoard(){ setFlipped(f => !f); }


  function placePiece(square, piece){
    // Validate before placing (lenient - allows building position piece by piece)
    const validation = validatePlacement(pieces, square, piece);

    if (!validation.valid) {
      // Show error briefly
      alert(validation.errors.join('\n'));
      return false;
    }

    setPieces(prev => ({...prev, [square]: piece}));
    return true;
  }

  function removePiece(square){
    setPieces(prev => { const n={...prev}; delete n[square]; return n; });
  }

  function movePiece(from, to){
    const piece = pieces[from];
    if (!piece) return false;

    // Create temp pieces for validation
    const tempPieces = {...pieces};
    delete tempPieces[from];

    // Validate the new position (lenient - allows building)
    const validation = validatePlacement(tempPieces, to, piece);

    if (!validation.valid) {
      alert(validation.errors.join('\n'));
      return false;
    }

    tempPieces[to] = piece;
    setPieces(tempPieces);
    return true;
  }

  // Fixed drag handlers
  function onDragStartFromSquare(e, square){
    const p = pieces[square];
    if (!p) return;

    setDragPiece(p);
    setDragFrom(square);

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ piece: p, from: square }));

    // Create better drag image
    const img = new Image();
    img.src = getPieceImageUrl(p);
    img.onload = () => {
      e.dataTransfer.setDragImage(img, 45, 45);
    };
  }

  function onDragStartFromPalette(e, piece){
    setDragPiece(piece);
    setDragFrom('_PALETTE_');

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify({ piece, from: '_PALETTE_' }));

    const img = new Image();
    img.src = getPieceImageUrl(piece);
    img.onload = () => {
      e.dataTransfer.setDragImage(img, 45, 45);
    };
  }

  function onDragOverSquare(e, square){
    e.preventDefault();
    e.dataTransfer.dropEffect = dragFrom === '_PALETTE_' ? 'copy' : 'move';
    setDragOverSquare(square);
  }

  function onDragLeaveSquare(e, square){
    if (e.currentTarget === e.target) {
      setDragOverSquare(null);
    }
  }

  function onDropSquare(e, square){
    e.preventDefault();
    setDragOverSquare(null);

    if (!dragPiece) return;

    if (dragFrom === '_PALETTE_') {
      // Place from palette
      placePiece(square, dragPiece);
    } else if (dragFrom && dragFrom !== square) {
      // Move from another square
      if (e.shiftKey || e.ctrlKey) {
        // Copy mode
        placePiece(square, dragPiece);
      } else {
        // Move mode
        movePiece(dragFrom, square);
      }
    }

    setDragPiece(null);
    setDragFrom(null);
  }

  function onDragEnd(e){
    // Clean up drag state
    setDragPiece(null);
    setDragFrom(null);
    setDragOverSquare(null);
    setDragOverBin(false);
  }

  // Trash bin handlers
  function onDragOverBin(e){
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverBin(true);
  }

  function onDragLeaveBin(e){
    setDragOverBin(false);
  }

  function onDropBin(e){
    e.preventDefault();
    setDragOverBin(false);

    // Only remove if dragging from board (not from palette)
    if (dragFrom && dragFrom !== '_PALETTE_') {
      removePiece(dragFrom);
    }

    setDragPiece(null);
    setDragFrom(null);
  }

  function onSquareClick(square, e){
    if (e.type === "contextmenu") {
      e.preventDefault();
      removePiece(square);
      return;
    }
  }

  const squaresRender = [];
  for (const rank of (flipped ? RANKS.slice().reverse() : RANKS)) {
    for (const file of (flipped ? FILES.slice().reverse() : FILES)) {
      squaresRender.push(`${file}${rank}`);
    }
  }

  const [fenInput, setFenInput] = useState("");

  function loadFen() {
    const txt = fenInput.trim();
    const chk = validateFen(txt);
    if (!chk.valid) { alert(`Invalid FEN:\n${chk.reason}`); return; }
    const st = parseFenToState(txt);
    setPieces(st.pieces); setSide(st.side); setCastling(st.castling); setEp(st.ep);
    setFenInput("");
  }

  return (
    <>
      {/* CSS for animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.9;
          }
        }
      `}</style>

      <div style={{
        padding: 20,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh'
      }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        background: 'white',
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '2px solid #f0f0f0'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Board Editor
          </h2>

          <div style={{ display: 'flex', gap: 10 }}>
            <ToolbarBtn onClick={() => onCancel?.()}>
              Cancel
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => onDone?.(fen)}
              disabled={!fenStatus.valid || validationErrors.length > 0}
              style={{
                background: (fenStatus.valid && validationErrors.length === 0)
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : '#ccc',
                color: '#fff',
                fontWeight: 600
              }}
            >
              Save & Use FEN
            </ToolbarBtn>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 24,
          padding: 16,
          background: '#f9fafb',
          borderRadius: 12
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <ToolbarBtn onClick={flipBoard}>Flip Board</ToolbarBtn>
            <ToolbarBtn onClick={fillStart}>Reset to Start</ToolbarBtn>
            <ToolbarBtn onClick={() => setCoordinatesFlipped(c => !c)}>
              Toggle Coords
            </ToolbarBtn>
            <ToolbarBtn onClick={clearBoard}>Clear Board</ToolbarBtn>
          </div>

          <div style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '8px 14px',
            background: 'white',
            borderRadius: 10,
            border: '2px solid #e5e7eb'
          }}>
            <span style={{ fontWeight: 600, color: '#6b7280' }}>Castling:</span>
            {["K","Q","k","q"].map(k => (
              <label key={k} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={!!castling[k]}
                  onChange={e => setCastling(prev=>({...prev,[k]:e.target.checked}))}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 600 }}>{k}</span>
              </label>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <ToolbarBtn onClick={() => navigator.clipboard.writeText(fen)}>
              Copy FEN
            </ToolbarBtn>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: 10,
            color: '#991b1b'
          }}>
            <strong>Position Issues:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Main Layout: Board Editor and Original Image Side by Side */}
        <div style={{
          display: 'flex',
          gap: 24,
          marginBottom: 24,
          alignItems: 'flex-start'
        }}>
          {/* Left Side: Board Editor with Palettes */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              alignItems: 'flex-start'
            }}>
              {/* White Palette */}
              <div style={{ flexShrink: 0 }}>
                <PieceStrip
                  title="White Pieces"
                  items={WHITE}
                  onDragStart={onDragStartFromPalette}
                  color="white"
                />
              </div>

              {/* Board - FIXED SIZE */}
              <div style={{
                flexShrink: 0,
                width: 480,
                height: 480
              }}>
            <div
              style={{
                border: '4px solid #8b5cf6',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 10px 40px rgba(139, 92, 246, 0.3)',
                background: '#312e81',
                padding: 12,
                width: '100%',
                height: '100%'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gridTemplateRows: 'repeat(8, 1fr)',
                  gap: 0,
                  width: '100%',
                  height: '100%',
                  background: '#312e81'
                }}
              >
                {squaresRender.map((sq) => {
                  const file = sq.charCodeAt(0) - 97;
                  const rankIdx = 8 - parseInt(sq[1],10);
                  const isLight = (file + rankIdx) % 2 === 0;
                  const bg = isLight ? '#f0d9b5' : '#b58863';
                  const piece = pieces[sq];
                  const isDragOver = dragOverSquare === sq;
                  const isDragging = dragFrom === sq;

                  return (
                    <div
                      key={sq}
                      onDragOver={(e) => onDragOverSquare(e, sq)}
                      onDragLeave={(e) => onDragLeaveSquare(e, sq)}
                      onDrop={(e) => onDropSquare(e, sq)}
                      onClick={(e) => onSquareClick(sq, e)}
                      onContextMenu={(e) => onSquareClick(sq, e)}
                      style={{
                        position: 'relative',
                        background: isDragOver
                          ? (isLight ? '#c3e88d' : '#9ccc65')
                          : bg,
                        transition: 'all 0.2s ease',
                        cursor: piece ? 'grab' : 'default',
                        opacity: isDragging ? 0.4 : 1,
                        boxShadow: isDragOver ? 'inset 0 0 0 3px #10b981' : 'none'
                      }}
                    >
                      {/* Coordinates */}
                      {(coordinatesFlipped ? sq[0] === 'h' : sq[0] === 'a') && (
                        <div style={{
                          position: 'absolute',
                          left: 4,
                          top: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          color: isLight ? '#b58863' : '#f0d9b5',
                          opacity: 0.7,
                          userSelect: 'none'
                        }}>
                          {sq[1]}
                        </div>
                      )}
                      {(coordinatesFlipped ? sq[1] === '8' : sq[1] === '1') && (
                        <div style={{
                          position: 'absolute',
                          right: 4,
                          bottom: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          color: isLight ? '#b58863' : '#f0d9b5',
                          opacity: 0.7,
                          userSelect: 'none'
                        }}>
                          {sq[0]}
                        </div>
                      )}

                      {/* Piece - Using Lichess SVG */}
                      {piece && (
                        <img
                          draggable
                          onDragStart={(e) => onDragStartFromSquare(e, sq)}
                          onDragEnd={onDragEnd}
                          src={getPieceImageUrl(piece)}
                          alt={piece}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            padding: '8%',
                            cursor: 'grab',
                            transition: 'transform 0.15s ease',
                            transform: isDragging ? 'scale(0.8)' : 'scale(1)',
                            userSelect: 'none'
                          }}
                          onMouseEnter={(e) => !isDragging && (e.currentTarget.style.transform = 'scale(1.15)')}
                          onMouseLeave={(e) => !isDragging && (e.currentTarget.style.transform = 'scale(1)')}
                        />
                      )}

                      {/* Drop indicator */}
                      {isDragOver && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'grid',
                          placeItems: 'center',
                          pointerEvents: 'none'
                        }}>
                          <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.3)',
                            border: '3px solid #10b981'
                          }}/>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

              {/* Black Palette */}
              <div style={{ flexShrink: 0 }}>
                <PieceStrip
                  title="Black Pieces"
                  items={BLACK}
                  onDragStart={onDragStartFromPalette}
                  color="black"
                />
              </div>
            </div>

            {/* Trash Bin - Always visible */}
            {dragPiece && dragFrom !== '_PALETTE_' && (
            <div
              onDragOver={onDragOverBin}
              onDragLeave={onDragLeaveBin}
              onDrop={onDropBin}
              style={{
                position: 'relative',
                padding: '20px 40px',
                background: dragOverBin
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                borderRadius: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: dragOverBin
                  ? '0 8px 24px rgba(239, 68, 68, 0.4)'
                  : '0 4px 12px rgba(0, 0, 0, 0.2)',
                border: dragOverBin ? '3px solid #fca5a5' : '3px solid transparent',
                transform: dragOverBin ? 'scale(1.1)' : 'scale(1)'
              }}
            >
              {/* Trash Bin SVG */}
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                style={{
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                }}
              >
                {/* Bin Body */}
                <rect
                  x="16"
                  y="24"
                  width="32"
                  height="32"
                  rx="2"
                  fill="white"
                  stroke={dragOverBin ? '#fca5a5' : '#d1d5db'}
                  strokeWidth="2"
                />

                {/* Bin Lines */}
                <line x1="22" y1="30" x2="22" y2="50" stroke={dragOverBin ? '#ef4444' : '#9ca3af'} strokeWidth="2" strokeLinecap="round"/>
                <line x1="32" y1="30" x2="32" y2="50" stroke={dragOverBin ? '#ef4444' : '#9ca3af'} strokeWidth="2" strokeLinecap="round"/>
                <line x1="42" y1="30" x2="42" y2="50" stroke={dragOverBin ? '#ef4444' : '#9ca3af'} strokeWidth="2" strokeLinecap="round"/>

                {/* Bin Rim */}
                <rect
                  x="12"
                  y="20"
                  width="40"
                  height="4"
                  rx="1"
                  fill="white"
                  stroke={dragOverBin ? '#fca5a5' : '#d1d5db'}
                  strokeWidth="2"
                />

                {/* Bin Lid - Animated */}
                <g
                  style={{
                    transform: dragOverBin ? 'rotate(-25deg)' : 'rotate(0deg)',
                    transformOrigin: '24px 18px',
                    transition: 'transform 0.3s ease'
                  }}
                >
                  <rect
                    x="20"
                    y="14"
                    width="24"
                    height="4"
                    rx="1"
                    fill="white"
                    stroke={dragOverBin ? '#fca5a5' : '#d1d5db'}
                    strokeWidth="2"
                  />
                  <rect
                    x="28"
                    y="10"
                    width="8"
                    height="4"
                    rx="1"
                    fill="white"
                    stroke={dragOverBin ? '#fca5a5' : '#d1d5db'}
                    strokeWidth="2"
                  />
                </g>
              </svg>

              {/* Text */}
              <div style={{
                color: 'white',
                fontWeight: 600,
                fontSize: 14,
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}>
                {dragOverBin ? 'Drop to Delete!' : 'Drag here to remove'}
              </div>
            </div>
            )}
          </div>

          {/* Right Side: Original Detected Board */}
          {overlayImage && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{
                padding: 16,
                background: '#f9fafb',
                borderRadius: 12,
                border: '2px solid #e5e7eb'
              }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#374151',
                  marginBottom: 12,
                  textAlign: 'center'
                }}>
                  Original Detected Board
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  background: 'white',
                  borderRadius: 8,
                  padding: 12
                }}>
                  <img
                    src={overlayImage}
                    alt="Original detected board"
                    style={{
                      width: '100%',
                      maxWidth: 480,
                      height: 'auto',
                      objectFit: 'contain',
                      borderRadius: 4
                    }}
                  />
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#6b7280',
                  marginTop: 8,
                  textAlign: 'center'
                }}>
                  Compare with the editor to verify piece positions
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div style={{
          display: 'grid',
          gap: 16,
          padding: 16,
          background: '#f9fafb',
          borderRadius: 12
        }}>
          {/* Turn and EP */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '10px 16px',
              background: 'white',
              borderRadius: 10,
              border: '2px solid #e5e7eb'
            }}>
              <span style={{ fontWeight: 600, color: '#6b7280' }}>Turn:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="turn"
                  checked={side==="w"}
                  onChange={()=>setSide("w")}
                  style={{ cursor: 'pointer' }}
                />
                <span>White</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="turn"
                  checked={side==="b"}
                  onChange={()=>setSide("b")}
                  style={{ cursor: 'pointer' }}
                />
                <span>Black</span>
              </label>
            </div>

            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: '10px 16px',
              background: 'white',
              borderRadius: 10,
              border: '2px solid #e5e7eb'
            }}>
              <span style={{ fontWeight: 600, color: '#6b7280' }}>En Passant:</span>
              <input
                value={ep}
                onChange={(e)=>setEp(e.target.value.trim())}
                placeholder="e.g. e3"
                style={{
                  width: 80,
                  padding: '6px 10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6
                }}
              />
            </div>
          </div>

          {/* FEN Display */}
          <div style={{
            fontFamily: 'ui-monospace, monospace',
            padding: 12,
            background: (fenStatus.valid && validationErrors.length === 0)
              ? 'rgba(16, 185, 129, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
            border: `2px solid ${(fenStatus.valid && validationErrors.length === 0) ? '#10b981' : '#ef4444'}`,
            borderRadius: 10,
            color: (fenStatus.valid && validationErrors.length === 0) ? '#065f46' : '#991b1b',
            fontSize: 13,
            wordBreak: 'break-all'
          }}>
            {fen}
          </div>

          {/* FEN Load */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={fenInput}
              onChange={(e)=>setFenInput(e.target.value)}
              placeholder="Paste FEN string to load position..."
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: 10,
                fontSize: 14
              }}
            />
            <ToolbarBtn onClick={loadFen} style={{ minWidth: 100 }}>
              Load FEN
            </ToolbarBtn>
          </div>
        </div>

        {/* Help Text */}
        <div style={{
          marginTop: 16,
          padding: 12,
          background: '#eff6ff',
          borderRadius: 8,
          fontSize: 13,
          color: '#1e40af'
        }}>
          <strong>Tips:</strong> Drag pieces from palettes to board - Drag between squares to move -
          <strong> Drag to trash bin to remove</strong> - Right-click to remove - Shift+drag to copy -
          Position rules enforced (1 king per color, max 8 pawns, etc.)
        </div>
      </div>
      </div>
    </>
  );
}

function ToolbarBtn({ children, disabled, onClick, style }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '10px 16px',
        border: '2px solid #d1d5db',
        borderRadius: 10,
        background: 'white',
        color: '#374151',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 500,
        fontSize: 14,
        transition: 'all 0.2s ease',
        boxShadow: disabled ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
        opacity: disabled ? 0.5 : 1,
        ...style
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          e.currentTarget.style.borderColor = '#8b5cf6';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          e.currentTarget.style.borderColor = '#d1d5db';
        }
      }}
    >
      {children}
    </button>
  );
}

function PieceStrip({ title, items, onDragStart, color }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: '#6b7280',
        textAlign: 'center',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {title}
      </div>
      {items.map((p) => (
        <div
          key={p}
          draggable
          onDragStart={(e) => onDragStart(e, p)}
          style={{
            width: 64,
            height: 64,
            border: '2px solid #e5e7eb',
            borderRadius: 12,
            background: 'white',
            display: 'grid',
            placeItems: 'center',
            cursor: 'grab',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(139, 92, 246, 0.3)';
            e.currentTarget.style.borderColor = '#8b5cf6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <img
            alt={p}
            src={getPieceImageUrl(p)}
            style={{
              width: 52,
              height: 52,
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          />
        </div>
      ))}
    </div>
  );
}
