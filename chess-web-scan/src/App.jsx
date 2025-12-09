import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'
import ChessBoard from './ChessBoard'
import CornerAdjuster from './CornerAdjuster'
import BoardEditor from './BoardEditor'
import Analysis from './Analysis'
import TestClassification from './TestClassification'
import StockfishAnalysis from './StockfishAnalysis'
import EngineTest from './EngineTest'
import Home from './Home'
import PGNAnalysis from './PGNAnalysis'
import FENUpload from './FENUpload'
import PlayComputer from './PlayComputer'
import Signup from './Signup'
import Login from './Login'
import ThemeSelector from './components/ThemeSelector'
import { API_BASE_URL } from './config/api'

// Helper to get page from URL hash
function getPageFromHash() {
  const hash = window.location.hash.slice(1); // Remove '#'
  const validPages = ['home', 'scanner', 'analysis', 'test', 'stockfish-analysis', 'engine-test', 'pgn-analysis', 'fen-upload', 'play-computer', 'signup', 'login'];
  return validPages.includes(hash) ? hash : 'home';
}

export default function App(){
  const [currentPage, setCurrentPageState] = useState(getPageFromHash()) // Read from URL hash
  const [analysisFen, setAnalysisFen] = useState('') // FEN to analyze
  const [autoStartPlayComputer, setAutoStartPlayComputer] = useState(false) // Auto-start Play Computer mode
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
  const [user, setUser] = useState(null) // Current logged-in user
  const [authToken, setAuthToken] = useState(null) // JWT token
  const inputRef = useRef(null)

  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setAuthToken(token);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleSignupSuccess = (userData, token) => {
    setUser(userData);
    setAuthToken(token);
  };

  const handleLoginSuccess = (userData, token) => {
    setUser(userData);
    setAuthToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setUser(null);
    setAuthToken(null);
    setCurrentPage('home');
  };

  // Custom setCurrentPage that also updates URL hash
  const setCurrentPage = useCallback((page) => {
    setCurrentPageState(page);
    window.location.hash = page;
  }, []);

  // Listen for browser back/forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPageState(getPageFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  async function onPick(e){
    const f = e.target.files?.[0]
    if(!f) return
    setFile(f)
    setFEN('')
    setOverlayURL('')
    setCorners(null)
    const url = URL.createObjectURL(f)
    setImgURL(url)

    // Auto-detect board corners (fast, no overlay needed)
    setBusy(true)
    setStage('adjust')
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('flip_ranks', 'false')
      // Don't request overlay for initial corner detection - much faster!
      const res = await fetch(`${API_BASE_URL}/infer`, {
        method:'POST',
        body: fd
      })
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

  async function onPasteFromClipboard(){
    try {
      const clipboardItems = await navigator.clipboard.read()
      let imageBlob = null

      for (const item of clipboardItems) {
        // Check if clipboard contains an image
        const imageTypes = item.types.filter(type => type.startsWith('image/'))
        if (imageTypes.length > 0) {
          imageBlob = await item.getType(imageTypes[0])
          break
        }
      }

      if (!imageBlob) {
        alert('No image found in clipboard. Please copy an image first.')
        return
      }

      // Convert blob to File object
      const file = new File([imageBlob], 'clipboard-image.png', { type: imageBlob.type })

      // Process the file same as file upload
      setFile(file)
      setFEN('')
      setOverlayURL('')
      setCorners(null)
      const url = URL.createObjectURL(file)
      setImgURL(url)

      // Auto-detect board corners
      setBusy(true)
      setStage('adjust')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('flip_ranks', 'false')
        const res = await fetch(`${API_BASE_URL}/infer`, {
          method:'POST',
          body: fd
        })
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
    } catch(err) {
      console.error('Clipboard read failed:', err)
      alert('Failed to read from clipboard. Make sure you have copied an image and granted clipboard permissions.')
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
      fd.append('include_overlay', '1')  // ✅ Request overlay for preview in board editor (1 = True)

      console.log('🚀 Requesting FEN with include_overlay=true')
      const res = await fetch(`${API_BASE_URL}/infer`, {
        method:'POST',
        body: fd
      })
      const json = await res.json()
      console.log('📦 Response received:', {
        hasFen: !!json.fen,
        hasOverlay: !!json.overlay_png_base64,
        hasDebug: !!json.debug_png_base64,
        overlayLength: json.overlay_png_base64?.length
      })

      if(!res.ok){ throw new Error(json?.error || 'Inference failed') }

      setFEN(json.fen)
      setNumPieces(json.num_pieces || 0)
      setOverlayURL(json.overlay_png_base64)
      setStage('result')
      console.log('Detection result:', json)

      // ✅ DIRECTLY open Board Editor (skip result page)
      setShowEditor(true)
    } catch(err){
      console.error('❌ Error:', err)
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
    setAutoStartPlayComputer(false) // Regular analysis mode
    setShowEditor(false)
    setCurrentPage('analysis')
  }

  function handleEditorPlayComputer(fenToPlay){
    setAnalysisFen(fenToPlay)
    setAutoStartPlayComputer(true) // Auto-start Play Computer mode
    setShowEditor(false)
    setCurrentPage('analysis')
  }

  function handleOpenEditor(fenToEdit){
    setFEN(fenToEdit || analysisFen)
    setShowEditor(true)
    setCurrentPage('scanner')
  }

  function handleLoadFenPosition(fenString){
    setFEN(fenString)
    setOverlayURL('') // No overlay for manually loaded FEN
    setShowEditor(true)
    setCurrentPage('scanner')
  }

  // Helper function to validate FEN
  const isValidFEN = (fenString) => {
    if (!fenString || typeof fenString !== 'string') return false;
    const trimmed = fenString.trim();
    if (!trimmed) return false;
    // Valid FEN must have exactly 6 space-delimited fields
    const fields = trimmed.split(' ');
    return fields.length === 6 && fields[0].length > 0;
  };

  // Floating Quick Nav Component
  const FloatingQuickNav = () => {
    // Only show on scanner, editor, or analysis pages
    const showQuickNav = currentPage === 'scanner' || showEditor || currentPage === 'analysis';
    if (!showQuickNav) return null;

    const hasValidFen = isValidFEN(fen);

    return (
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        background: 'rgba(31, 41, 55, 0.95)',
        padding: 12,
        borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        border: '2px solid #4b5563'
      }}>
        <div style={{ fontSize: 11, fontWeight: 'bold', color: '#9ca3af', marginBottom: 4, textAlign: 'center' }}>
          QUICK NAV
        </div>
        <button
          onClick={() => {
            setShowEditor(false);
            setCurrentPage('scanner');
          }}
          style={{
            padding: '10px 16px',
            background: (currentPage === 'scanner' && !showEditor) ? '#8b5cf6' : '#374151',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 13,
            transition: 'all 0.2s',
            minWidth: 100
          }}
        >
          📷 Scanner
        </button>
        <button
          onClick={() => {
            if (hasValidFen) {
              setShowEditor(true);
              setCurrentPage('scanner');
            } else {
              alert('Please scan an image first to use the editor');
            }
          }}
          disabled={!hasValidFen}
          style={{
            padding: '10px 16px',
            background: showEditor ? '#8b5cf6' : '#374151',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: hasValidFen ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            fontSize: 13,
            opacity: hasValidFen ? 1 : 0.5,
            transition: 'all 0.2s',
            minWidth: 100
          }}
        >
          ✏️ Editor
        </button>
        <button
          onClick={() => {
            if (hasValidFen) {
              setAnalysisFen(fen);
              setShowEditor(false);
              setCurrentPage('analysis');
            } else {
              alert('Please scan an image first to analyze');
            }
          }}
          disabled={!hasValidFen}
          style={{
            padding: '10px 16px',
            background: (currentPage === 'analysis' && !showEditor) ? '#8b5cf6' : '#374151',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: hasValidFen ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            fontSize: 13,
            opacity: hasValidFen ? 1 : 0.5,
            transition: 'all 0.2s',
            minWidth: 100
          }}
        >
          🔍 Analysis
        </button>
      </div>
    );
  };

  // Show Signup page
  if (currentPage === 'signup') {
    return <Signup onNavigate={setCurrentPage} onSignupSuccess={handleSignupSuccess} />;
  }

  // Show Login page
  if (currentPage === 'login') {
    return <Login onNavigate={setCurrentPage} onLoginSuccess={handleLoginSuccess} />;
  }

  // Show Home page
  if (currentPage === 'home') {
    return <Home onNavigate={setCurrentPage} user={user} onLogout={handleLogout} />;
  }

  // Show board editor if active
  if (showEditor) {
    return (
      <>
        <BoardEditor
          initialFen={fen}
          onDone={handleEditorDone}
          onCancel={handleEditorCancel}
          onAnalyze={handleEditorAnalyze}
          onPlayComputer={handleEditorPlayComputer}
          overlayImage={overlayURL}
        />
        <FloatingQuickNav />
      </>
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
          marginBottom: 0,
          alignItems: 'center'
        }}>
          <button
            onClick={() => {
              setAutoStartPlayComputer(false); // Reset flag when leaving
              setCurrentPage('home');
            }}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Position Analysis</span>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeSelector />
          </div>
        </nav>
        <Analysis initialFen={analysisFen} autoStartPlayComputer={autoStartPlayComputer} onEditPosition={handleOpenEditor} />
        <FloatingQuickNav />
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
          marginBottom: 0,
          alignItems: 'center'
        }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Classification Test Suite</span>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeSelector />
          </div>
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
          marginBottom: 0,
          alignItems: 'center'
        }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Stockfish 17.1 Analysis</span>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeSelector />
          </div>
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
          marginBottom: 0,
          alignItems: 'center'
        }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Engine Thread Test</span>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeSelector />
          </div>
        </nav>
        <EngineTest />
      </>
    );
  }

  // Show PGN Analysis page
  if (currentPage === 'pgn-analysis') {
    return (
      <>
        <nav style={{
          padding: '12px 20px',
          background: '#1f2937',
          display: 'flex',
          gap: 16,
          marginBottom: 0,
          alignItems: 'center'
        }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>PGN Game Analysis</span>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeSelector />
          </div>
        </nav>
        <PGNAnalysis />
      </>
    );
  }

  // Show FEN Upload page
  if (currentPage === 'fen-upload') {
    return (
      <FENUpload
        onBack={() => setCurrentPage('home')}
        onLoadPosition={handleLoadFenPosition}
      />
    );
  }

  // Show Play Computer page
  if (currentPage === 'play-computer') {
    return (
      <>
        <nav style={{
          padding: '12px 20px',
          background: '#1f2937',
          display: 'flex',
          gap: 16,
          marginBottom: 0,
          alignItems: 'center'
        }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
          <span style={{ color: '#9ca3af', alignSelf: 'center' }}>Play vs Computer</span>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeSelector />
          </div>
        </nav>
        <PlayComputer />
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
        marginBottom: 0,
        alignItems: 'center'
      }}>
        <button
          onClick={() => setCurrentPage('home')}
          style={{
            padding: '8px 16px',
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          ← Back to Home
        </button>
        <h3 style={{ color: 'white', margin: 0 }}>Chess Image Scanner</h3>
         <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
           <ThemeSelector />
           {/* <button
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
           </button> */}
           {/* <button
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
           </button> */}
           {/* <button
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
           </button> */}
           {/* <button
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
           </button> */}
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

        <button onClick={onPasteFromClipboard} disabled={busy}>
          Paste from Clipboard
        </button>

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
          <p className="muted">Drag the colored circles to match the 4 corners of your chessboard, then click "Generate FEN" to open the Board Editor.</p>
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
        <strong>How to use:</strong> Upload an image → Adjust the 4 corner points to frame your board → Click "Generate FEN" → Edit in Board Editor!
      </small>
      </div>
      <FloatingQuickNav />
    </>
  )
}