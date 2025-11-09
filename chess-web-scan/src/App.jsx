import { useState, useRef, useCallback } from 'react'
import './App.css'
import ChessBoard from './ChessBoard'
import CornerAdjuster from './CornerAdjuster'
import BoardEditor from './BoardEditor'
import Analysis from './Analysis'
import TestClassification from './TestClassification'
import StockfishAnalysis from './StockfishAnalysis'
import EngineTest from './EngineTest'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function App(){
  const [currentPage, setCurrentPage] = useState('scanner') // 'scanner', 'analysis', or 'test'
  const [analysisFen, setAnalysisFen] = useState('') // FEN to analyze
  const [file, setFile] = useState(null)
  const [imgURL, setImgURL] = useState('')
  const [corners, setCorners] = useState(null)
  const [overlayURL, setOverlayURL] = useState('')
  const [fen, setFEN] = useState('')
  const [numPieces, setNumPieces] = useState(0)
  const [flipRanks, setFlipRanks] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('upload') // 'upload', 'adjust', 'result'
  const [showEditor, setShowEditor] = useState(false)
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

  function handleEditBoard(){
    setShowEditor(true)
  }

  function handleEditorDone(newFen){
    setFEN(newFen)
    setShowEditor(false)
  }

  function handleEditorCancel(){
    setShowEditor(false)
  }

  function handleEditorAnalyze(fenToAnalyze){
    setAnalysisFen(fenToAnalyze)
    setShowEditor(false)
    setCurrentPage('analysis')
  }

  // Show board editor if active
  if (showEditor) {
    return (
      <BoardEditor
        initialFen={fen}
        onDone={handleEditorDone}
        onCancel={handleEditorCancel}
        onAnalyze={handleEditorAnalyze}
        overlayImage={overlayURL}
      />
    )
  }

  // Show Analysis page
  if (currentPage === 'analysis') {
    return (
      <>
        <nav style={{
          padding: '12px 20px',
          background: '#1f2937',
          display: 'flex',
          gap: 16,
          marginBottom: 0
        }}>
          <button
            onClick={() => setCurrentPage('scanner')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Scanner
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Position Analysis</span>
        </nav>
        <Analysis initialFen={analysisFen} />
      </>
    );
  }

  // Show Test page
  if (currentPage === 'test') {
    return (
      <>
        <nav style={{
          padding: '12px 20px',
          background: '#1f2937',
          display: 'flex',
          gap: 16,
          marginBottom: 0
        }}>
          <button
            onClick={() => setCurrentPage('scanner')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Scanner
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Classification Test Suite</span>
        </nav>
        <TestClassification />
      </>
    );
  }

  // Show Stockfish Analysis page
  if (currentPage === 'stockfish-analysis') {
    return (
      <>
        <nav style={{
          padding: '12px 20px',
          background: '#1f2937',
          display: 'flex',
          gap: 16,
          marginBottom: 0
        }}>
          <button
            onClick={() => setCurrentPage('scanner')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Scanner
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Stockfish 17.1 Analysis</span>
        </nav>
        <StockfishAnalysis />
      </>
    );
  }

  // Show Engine Test page
  if (currentPage === 'engine-test') {
    return (
      <>
        <nav style={{
          padding: '12px 20px',
          background: '#1f2937',
          display: 'flex',
          gap: 16,
          marginBottom: 0
        }}>
          <button
            onClick={() => setCurrentPage('scanner')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Scanner
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Engine Thread Test</span>
        </nav>
        <EngineTest />
      </>
    );
  }

  return (
    <>
      {/* Navigation */}
      <nav style={{
        padding: '12px 20px',
        background: '#1f2937',
        display: 'flex',
        gap: 16,
        marginBottom: 0
      }}>
        <h3 style={{ color: 'white', margin: 0 }}>Chess Detector</h3>
         <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
           <button
             onClick={() => setCurrentPage('scanner')}
             style={{
               padding: '8px 16px',
               background: currentPage === 'scanner' ? '#8b5cf6' : 'transparent',
               color: 'white',
               border: '2px solid #8b5cf6',
               borderRadius: 6,
               cursor: 'pointer'
             }}
           >
             Scanner
           </button>
           <button
             onClick={() => setCurrentPage('analysis')}
             style={{
               padding: '8px 16px',
               background: currentPage === 'analysis' ? '#8b5cf6' : 'transparent',
               color: 'white',
               border: '2px solid #8b5cf6',
               borderRadius: 6,
               cursor: 'pointer'
             }}
           >
             Analysis
           </button>
           <button
             onClick={() => setCurrentPage('test')}
             style={{
               padding: '8px 16px',
               background: currentPage === 'test' ? '#f59e0b' : 'transparent',
               color: 'white',
               border: '2px solid #f59e0b',
               borderRadius: 6,
               cursor: 'pointer'
             }}
           >
             🧪 Test Suite
           </button>
           <button
             onClick={() => setCurrentPage('stockfish-analysis')}
             style={{
               padding: '8px 16px',
               background: currentPage === 'stockfish-analysis' ? '#10b981' : 'transparent',
               color: 'white',
               border: '2px solid #10b981',
               borderRadius: 6,
               cursor: 'pointer'
             }}
           >
             ⚡ SF Analysis
           </button>
           <button
             onClick={() => setCurrentPage('engine-test')}
             style={{
               padding: '8px 16px',
               background: currentPage === 'engine-test' ? '#ef4444' : 'transparent',
               color: 'white',
               border: '2px solid #ef4444',
               borderRadius: 6,
               cursor: 'pointer'
             }}
           >
             🚀 Engine Test
           </button>
         </div>
      </nav>

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
            <label style={{display:'inline-flex', alignItems:'center', gap:8}} title="Check this if white pieces are at the TOP of your image">
              <input type="checkbox" checked={flipRanks} onChange={e=>setFlipRanks(e.target.checked)} /> 
              White pieces at top (flip board)
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
          <div style={{marginBottom: 12, padding: 10, background: '#2a2a2a', borderRadius: 4, border: '1px solid #444'}}>
            <small style={{color: '#aaa'}}>
              Board orientation: <strong>{flipRanks ? 'White at top (flipped)' : 'White at bottom (normal)'}</strong>
            </small>
            <button 
              onClick={() => onGenerateFEN(corners)} 
              style={{marginLeft: 12, padding: '4px 8px', fontSize: 12}}
            >
              🔄 Regenerate
            </button>
          </div>
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
                <small className="muted" style={{display: 'block', marginTop: 8}}>
                  Yellow labels show rank (1-8) and file (a-h) coordinates
                </small>
              </div>
            </div>
            <div>
              <strong>FEN {numPieces > 0 && <small className="muted">({numPieces} pieces detected)</small>}</strong>
              <div style={{display:'flex', gap:8, alignItems:'center', marginTop: 8}}>
                <input className="fenbox" value={fen} readOnly placeholder="FEN will appear here" />
                <button onClick={copyFen} disabled={!fen}>Copy</button>
                <button onClick={handleEditBoard} disabled={!fen}>Edit Board</button>
              </div>
              <div style={{marginTop:16}}>
                <strong>Board Preview</strong>
                <ChessBoard fen={fen} />
                <small className="muted" style={{display: 'block', marginTop: 8}}>
                  If pieces appear inverted, toggle "White pieces at top" and click Regenerate
                </small>
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
    </>
  )
}