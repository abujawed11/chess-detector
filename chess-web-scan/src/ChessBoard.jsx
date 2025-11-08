import { useMemo } from 'react'
import './ChessBoard.css'

// Mapping FEN characters to piece names
const PIECE_NAMES = {
  'K': 'wK', 'Q': 'wQ', 'R': 'wR', 'B': 'wB', 'N': 'wN', 'P': 'wP',
  'k': 'bK', 'q': 'bQ', 'r': 'bR', 'b': 'bB', 'n': 'bN', 'p': 'bP',
}

function fenToArray(fen) {
  const [placement] = fen.split(' ')
  const rows = placement.split('/')
  const out = []
  for (const row of rows) {
    for (const ch of row) {
      if (/\d/.test(ch)) {
        out.push(...Array(parseInt(ch, 10)).fill(''))
      } else {
        out.push(ch)
      }
    }
  }
  return out
}

export default function ChessBoard({ fen }) {
  const arr = useMemo(() => fen ? fenToArray(fen) : Array(64).fill(''), [fen])
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']
  
  const cells = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const idx = r * 8 + f
      const dark = (r + f) % 2 === 1
      const piece = arr[idx]
      const coord = files[f] + ranks[r]
      
      cells.push(
        <div 
          className={`chess-square ${dark ? 'dark' : 'light'}`} 
          key={idx} 
          title={coord}
        >
          {piece && (
            <div className={`chess-piece ${PIECE_NAMES[piece]}`}></div>
          )}
        </div>
      )
    }
  }
  
  return (
    <div className="chess-board-wrapper">
      <div className="chess-board">
        {cells}
      </div>
      <div className="chess-coords">
        {files.map(f => (
          <span key={f} className="chess-file-label">{f}</span>
        ))}
      </div>
    </div>
  )
}

