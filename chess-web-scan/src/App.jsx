import { useState, useMemo, useRef } from 'react'
import './App.css'
import { fenToArray, PIECE_TO_UNICODE } from './lib/fenBoard'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function Board({ fen }) {
  const arr = useMemo(() => fen ? fenToArray(fen) : Array(64).fill(''), [fen])
  const cells = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const idx = r*8 + f
      const dark = (r + f) % 2 === 1
      const ch = arr[idx]
      cells.push(
        <div className={`square ${dark? 'dark':'light'}`} key={idx}>
          {PIECE_TO_UNICODE[ch] || ''}
        </div>
      )
    }
  }
  return <div className="board">{cells}</div>
}

export default function App(){
  const [file, setFile] = useState(null)
  const [imgURL, setImgURL] = useState('')
  const [overlayURL, setOverlayURL] = useState('')
  const [fen, setFEN] = useState('')
  const [flipRanks, setFlipRanks] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  function onPick(e){
    const f = e.target.files?.[0]
    if(!f) return
    setFile(f)
    setFEN('')
    setOverlayURL('')
    setImgURL(URL.createObjectURL(f))
  }

  async function onInfer(){
    if(!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('flip_ranks', String(flipRanks))
      const res = await fetch(`${API_BASE}/infer`, { method:'POST', body: fd })
      const json = await res.json()
      if(!res.ok){ throw new Error(json?.error || 'Inference failed') }
      setFEN(json.fen)
      setOverlayURL(json.overlay_png_base64)
    } catch(err){
      alert(err.message)
    } finally{ setBusy(false) }
  }

  function copyFen(){
    if(!fen) return
    navigator.clipboard.writeText(fen)
  }

  return (
    <div style={{padding:20}}>
      <h2>Chess Image → FEN</h2>
      <p className="muted">Upload a chessboard image (photo, screenshot, or frame). The server will segment the board, warp to 1024×1024, detect pieces, and return a FEN.</p>

      <div className="controls">
        <label className="file">
          <input type="file" accept="image/*" style={{display:'none'}} onChange={onPick} ref={inputRef} />
          Choose image…
        </label>
        <label style={{display:'inline-flex', alignItems:'center', gap:8}}>
          <input type="checkbox" checked={flipRanks} onChange={e=>setFlipRanks(e.target.checked)} /> Flip ranks (if a1 ↔ h8)
        </label>
        <button onClick={onInfer} disabled={!file || busy}>{busy ? 'Processing…' : 'Generate FEN'}</button>
      </div>

      <div className="pane">
        <div>
          <div className="preview">
            <strong>Original</strong>
            <div>{imgURL ? <img src={imgURL} alt="preview" style={{maxWidth:'100%'}}/> : <small className="muted">No image selected</small>}</div>
          </div>
          <div className="overlay" style={{marginTop:12}}>
            <strong>Detections (warped)</strong>
            <div>{overlayURL ? <img src={overlayURL} alt="overlay" style={{maxWidth:'100%'}}/> : <small className="muted">Run inference to see boxes</small>}</div>
          </div>
        </div>
        <div>
          <strong>FEN</strong>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <input className="fenbox" value={fen} readOnly placeholder="FEN will appear here" />
            <button onClick={copyFen} disabled={!fen}>Copy</button>
          </div>
          <div style={{marginTop:12}}>
            <strong>Board preview</strong>
            <Board fen={fen} />
          </div>
        </div>
      </div>

      <hr style={{margin:'24px 0'}}/>
      <small className="muted">Tip: If ranks are upside down (a1 at top-left), toggle “Flip ranks”. For robust orientation we can auto-detect later using color-of-square heuristics.</small>
    </div>
  )
}