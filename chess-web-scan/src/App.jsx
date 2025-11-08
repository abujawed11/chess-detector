import { useState, useMemo, useRef, useCallback } from 'react'
import './App.css'
import { fenToArray, PIECE_TO_UNICODE } from './lib/fenBoard'
import CornerAdjuster from './CornerAdjuster'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function Board({ fen }) {
  const arr = useMemo(() => fen ? fenToArray(fen) : Array(64).fill(''), [fen])
  const cells = []
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']
  
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const idx = r*8 + f
      const dark = (r + f) % 2 === 1
      const ch = arr[idx]
      const coord = files[f] + ranks[r]
      cells.push(
        <div className={`square ${dark? 'dark':'light'}`} key={idx} title={coord}>
          {PIECE_TO_UNICODE[ch] || ''}
        </div>
      )
    }
  }
  return (
    <div style={{position: 'relative', display: 'inline-block'}}>
      <div className="board">{cells}</div>
      <div style={{display: 'flex', justifyContent: 'space-around', marginTop: 4, fontSize: 12, color: '#888', paddingLeft: 3}}>
        {files.map(f => <span key={f} style={{width: 'var(--cell)', textAlign: 'center'}}>{f}</span>)}
      </div>
    </div>
  )
}

export default function App(){
  const [file, setFile] = useState(null)
  const [imgURL, setImgURL] = useState('')
  const [corners, setCorners] = useState(null)
  const [overlayURL, setOverlayURL] = useState('')
  const [fen, setFEN] = useState('')
  const [numPieces, setNumPieces] = useState(0)
  const [flipRanks, setFlipRanks] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('upload') // 'upload', 'adjust', 'result'
  const inputRef = useRef(null)

  async function onPick(e){
    const f = e.target.files?.[0]
    if(!f) return
    setFile(f)
    setFEN('')
    setOverlayURL('')
    setCorners(null)
    const url = URL.createObjectURL(f)
    setImgURL(url)
    
    // Auto-detect board corners
    setBusy(true)
    setStage('adjust')
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('flip_ranks', 'false')
      const res = await fetch(`${API_BASE}/infer`, { method:'POST', body: fd })
      const json = await res.json()
      if(res.ok && json.board_corners) {
        setCorners(json.board_corners)
      } else {
        // Fallback: set corners to image edges
        const img = new Image()
        img.onload = () => {
          setCorners([[0,0], [img.width, 0], [img.width, img.height], [0, img.height]])
        }
        img.src = url
      }
    } catch(err) {
      console.error('Auto-detect failed:', err)
      // Fallback: set corners to image edges
      const img = new Image()
      img.onload = () => {
        setCorners([[0,0], [img.width, 0], [img.width, img.height], [0, img.height]])
      }
      img.src = url
    } finally {
      setBusy(false)
    }
  }

  async function onGenerateFEN(adjustedCorners){
    if(!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('flip_ranks', String(flipRanks))
      fd.append('corners', JSON.stringify(adjustedCorners))
      
      const res = await fetch(`${API_BASE}/infer`, { method:'POST', body: fd })
      const json = await res.json()
      if(!res.ok){ throw new Error(json?.error || 'Inference failed') }
      
      setFEN(json.fen)
      setNumPieces(json.num_pieces || 0)
      setOverlayURL(json.overlay_png_base64)
      setStage('result')
      console.log('Detection result:', json)
    } catch(err){
      alert(err.message)
    } finally{ setBusy(false) }
  }

  const handleCornersChange = useCallback((newCorners) => {
    setCorners(newCorners)
  }, [])

  function startOver(){
    setFile(null)
    setImgURL('')
    setCorners(null)
    setFEN('')
    setOverlayURL('')
    setStage('upload')
    if(inputRef.current) inputRef.current.value = ''
  }

  function copyFen(){
    if(!fen) return
    navigator.clipboard.writeText(fen)
  }

  return (
    <div style={{padding:20, maxWidth: 1400, margin: '0 auto'}}>
      <h2>Chess Image → FEN</h2>
      <p className="muted">Upload a chessboard image. Adjust the corners if needed, then generate FEN notation.</p>

      <div className="controls">
        <label className="file">
          <input type="file" accept="image/*" style={{display:'none'}} onChange={onPick} ref={inputRef} />
          {stage === 'upload' ? 'Choose image…' : 'Choose different image…'}
        </label>
        
        {stage !== 'upload' && (
          <>
            <label style={{display:'inline-flex', alignItems:'center', gap:8}}>
              <input type="checkbox" checked={flipRanks} onChange={e=>setFlipRanks(e.target.checked)} /> 
              Flip ranks (if board is upside down)
            </label>
            {stage === 'result' && (
              <button onClick={startOver} style={{marginLeft: 'auto'}}>Start Over</button>
            )}
          </>
        )}
      </div>

      {busy && (
        <div style={{padding: 20, textAlign: 'center', color: '#888'}}>
          <div className="spinner"></div>
          <p>Processing...</p>
        </div>
      )}

      {stage === 'adjust' && corners && !busy && (
        <div>
          <h3>Step 1: Adjust Board Corners</h3>
          <p className="muted">Drag the colored circles to match the 4 corners of your chessboard, then click "Generate FEN".</p>
          <CornerAdjuster 
            imageSrc={imgURL}
            initialCorners={corners}
            onCornersChange={handleCornersChange}
            onConfirm={onGenerateFEN}
          />
        </div>
      )}

      {stage === 'result' && (
        <div>
          <h3>Results</h3>
          <div className="pane">
            <div>
              <div className="overlay">
                <strong>Detected Pieces</strong>
                <div>
                  {overlayURL ? (
                    <img src={overlayURL} alt="overlay" style={{maxWidth:'100%'}}/>
                  ) : (
                    <small className="muted">No overlay available</small>
                  )}
                </div>
              </div>
            </div>
            <div>
              <strong>FEN {numPieces > 0 && <small className="muted">({numPieces} pieces detected)</small>}</strong>
              <div style={{display:'flex', gap:8, alignItems:'center', marginTop: 8}}>
                <input className="fenbox" value={fen} readOnly placeholder="FEN will appear here" />
                <button onClick={copyFen} disabled={!fen}>Copy</button>
              </div>
              <div style={{marginTop:16}}>
                <strong>Board Preview</strong>
                <Board fen={fen} />
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === 'upload' && (
        <div style={{textAlign: 'center', padding: 40, border: '2px dashed #555', borderRadius: 8, marginTop: 20}}>
          <p style={{fontSize: 18, color: '#888'}}>📷 Upload a chess image to get started</p>
        </div>
      )}

      <hr style={{margin:'24px 0'}}/>
      <small className="muted">
        <strong>How to use:</strong> Upload an image → Adjust the 4 corner points to frame your board → Click "Generate FEN" → Copy the result!
      </small>
    </div>
  )
}