// import { useState, useEffect, useCallback, useMemo } from 'react';
// import { Chess } from 'chess.js/dist/esm/chess.js';
// import { useStockfish } from './hooks/useStockfish';
// import InteractiveBoard from './components/InteractiveBoard';
// import EvaluationBar from './components/EvaluationBar';
// import MoveHistory from './components/MoveHistory';
// import EngineLines from './components/EngineLines';
// import {
//   evalForRoot,
//   normalizeLines,
//   classifyMove,
//   isOpeningPhase
// } from './utils/moveClassification';
// import './App.css';

// /**
//  * Analysis Component - Optimized for smooth UI during move playback
//  *
//  * Performance optimizations:
//  * - Fixed container dimensions to prevent layout shifts
//  * - GPU acceleration via transform: translateZ(0)
//  * - Smooth transitions for appearing/disappearing content
//  * - Batched state updates during move processing
//  * - Minimum heights on dynamic content containers
//  */
// export default function Analysis({ initialFen, onEditPosition }) {
//   const startFen = initialFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

//   const [game] = useState(new Chess(startFen));
//   const [currentFen, setCurrentFen] = useState(startFen);
//   const [moves, setMoves] = useState([]);
//   const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
//   const [flipped, setFlipped] = useState(false);
//   const [autoAnalyze, setAutoAnalyze] = useState(true);

//   const { initialized, analyzing, analyze, getTopMoves, error, getThreadInfo, setThreads } = useStockfish();

//   const [currentEval, setCurrentEval] = useState(null);
//   const [bestMove, setBestMove] = useState(null);
//   const [showBestMove, setShowBestMove] = useState(false); // OFF by default
//   const [hintRequested, setHintRequested] = useState(false); // For one-time hints
//   const [lastMoveClassification, setLastMoveClassification] = useState(null);
//   const [analysisDepth, setAnalysisDepth] = useState(15);
//   const [storedAnalysis, setStoredAnalysis] = useState(null); // Store analysis before move
//   const [engineLines, setEngineLines] = useState([]); // Top engine lines
//   const [isProcessingMove, setIsProcessingMove] = useState(false); // Prevent auto-analyze during move processing
//   const [hoverMove, setHoverMove] = useState(null); // Move to display when hovering over engine lines
//   const [threadInfo, setThreadInfo] = useState({ current: 1, max: 1, supportsMultiThreading: false });

//   // Get thread info when engine is initialized
//   useEffect(() => {
//     if (initialized && getThreadInfo) {
//       const info = getThreadInfo();
//       setThreadInfo(info);
//     }
//   }, [initialized, getThreadInfo]);

//   // Update game when initialFen changes
//   useEffect(() => {
//     if (initialFen && initialFen !== game.fen()) {
//       game.load(initialFen);
//       setCurrentFen(initialFen);
//       setMoves([]);
//       setCurrentMoveIndex(-1);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [initialFen]);

//   // Analyze current position
//   const analyzeCurrentPosition = useCallback(async (forceShowHint = false) => {
//     if (!initialized) return;

//     try {
//       const result = await analyze(currentFen, {
//         depth: analysisDepth,
//         multiPV: 3
//       });

//       setCurrentEval(result.evaluation);
//       setStoredAnalysis(result); // Store full analysis for move classification
//       setEngineLines(result.lines || []); // Store multi-line analysis

//       // Only set best move if hints are enabled or forced
//       if (showBestMove || forceShowHint || hintRequested) {
//         setBestMove(result.lines[0]?.pv[0]);
//       } else {
//         setBestMove(null);
//       }
//     } catch (err) {
//       console.error('Analysis error:', err);
//     }
//   }, [currentFen, initialized, analyze, analysisDepth, showBestMove, hintRequested]);

//   // Auto-analyze when position changes (but not during move processing)
//   useEffect(() => {
//     if (autoAnalyze && initialized && !isProcessingMove) {
//       const timer = setTimeout(() => {
//         analyzeCurrentPosition();
//       }, 300);
//       return () => clearTimeout(timer);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [currentFen, autoAnalyze, initialized, isProcessingMove]);

//   // Handle move made on board
//   const handleMove = useCallback(async (move, newFen) => {
//     if (!initialized) return;

//     // Prevent auto-analyze from running during move processing
//     setIsProcessingMove(true);

//     // Store FEN and analysis from BEFORE the move
//     const previousFen = currentFen;
//     const previousAnalysis = storedAnalysis;

//     // Batch state updates to prevent multiple re-renders
//     setHintRequested(false);
//     setLastMoveClassification(null); // Clear immediately to prevent flash
//     setBestMove(null); // Clear best move to prevent confusion

//     // Update game state
//     setCurrentFen(newFen);

//     // Analyze new position
//     try {
//       const result = await analyze(newFen, {
//         depth: analysisDepth,
//         multiPV: 3
//       });

//       const bestMoveForNewPosition = result.lines[0]?.pv[0];

//       // Store this analysis for the next move
//       setStoredAnalysis(result);
//       setCurrentEval(result.evaluation);
//       setEngineLines(result.lines || []); // Store multi-line analysis

//       console.log('🔍 Analysis after move:', {
//         fen: newFen,
//         linesCount: result.lines?.length,
//         lines: result.lines
//       });

//       // Classify the move if we have previous analysis
//       let classification = { classification: 'best', label: 'Best', cpLoss: 0, color: '#9bc02a' };

//       if (previousAnalysis && previousAnalysis.lines && previousAnalysis.lines.length > 0) {
//         try {
//           // Get the move that was played in UCI format
//           const movePlayed = move.from + move.to + (move.promotion || '');

//           // Create a Chess instance to determine whose turn it was
//           const tempChess = new Chess(previousFen);
//           const rootTurn = tempChess.turn();

//           // Normalize lines from previous analysis
//           const lines = normalizeLines(previousAnalysis.lines, rootTurn);
//           const bestMove = lines[0]?.pv?.[0];

//           // Check for opening phase
//           const isBook = isOpeningPhase(previousFen);

//           // Diagnostics
//           const pv2Gap = lines.length > 1 ? (lines[0].scoreForRoot - lines[1].scoreForRoot) : 0;
//           const forced = pv2Gap >= 200;

//           // Score OUR move at the root using searchmoves
//           const ourRoot = await analyze(previousFen, {
//             depth: analysisDepth,
//             multiPV: 1,
//             searchMoves: [movePlayed],
//           });
//           const ourRootScore = evalForRoot(rootTurn, rootTurn, ourRoot.evaluation);

//           // Score BEST move at the root using searchmoves
//           const bestRoot = await analyze(previousFen, {
//             depth: analysisDepth,
//             multiPV: 1,
//             searchMoves: [bestMove],
//           });
//           const bestRootScore = evalForRoot(rootTurn, rootTurn, bestRoot.evaluation);

//           // Calculate CP-loss from root perspective
//           const cpLoss = Math.max(0, bestRootScore - ourRootScore);

//           // Top-N / epsilon rules
//           const eps = 10;
//           const inTop3 = lines.slice(0, 3).some(
//             l => l.pv[0]?.toLowerCase() === movePlayed.toLowerCase()
//           );
//           const ourLine = lines.find(
//             l => l.pv[0]?.toLowerCase() === movePlayed.toLowerCase()
//           );
//           const withinEps = ourLine ? (lines[0].scoreForRoot - ourLine.scoreForRoot) <= eps : false;

//           const missedMate =
//             (lines[0]?.evaluation?.type === 'mate') &&
//             (ourRoot.evaluation?.type !== 'mate');

//           // Count pieces for brilliant detection and game phase
//           const pieceCount = (previousFen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;

//           // Brilliant move detection: ONLY move in a critical position (extremely forced)
//           const isBrilliant =
//             forced &&
//             pv2Gap >= 500 &&
//             cpLoss === 0 &&
//             !isBook &&
//             pieceCount >= 20 &&
//             pieceCount <= 30;

//           classification = classifyMove(cpLoss, {
//             inTop3,
//             withinEps,
//             forced,
//             missedMate,
//             isBook: isBook && cpLoss <= 10,
//             isBrilliant
//           });
//         } catch (classifyError) {
//           console.error('Classification error:', classifyError);
//           // Fallback to simple classification
//           classification = { classification: 'best', label: 'Best', cpLoss: 0, color: '#9bc02a' };
//         }
//       }

//       // Add move to history
//       const newMove = {
//         ...move,
//         evaluation: result.evaluation,
//         classification: classification.classification,
//         classificationLabel: classification.label,
//         cpLoss: classification.cpLoss
//       };

//       setMoves(prev => [...prev, newMove]);
//       setCurrentMoveIndex(prev => prev + 1);

//       // Only show best move if continuous hints are enabled
//       if (showBestMove) {
//         setBestMove(bestMoveForNewPosition);
//       } else {
//         setBestMove(null);
//       }

//       setLastMoveClassification(classification);

//     } catch (err) {
//       console.error('Analysis error:', err);
//     } finally {
//       // Re-enable auto-analyze after move processing is complete
//       setIsProcessingMove(false);
//     }
//   }, [initialized, currentFen, storedAnalysis, analyze, analysisDepth, showBestMove]);

//   // Navigate to a specific move
//   const navigateToMove = useCallback((moveIndex) => {
//     // Reset game to start
//     game.reset();
//     game.load(startFen);

//     // Replay moves up to index
//     const movesToReplay = moves.slice(0, moveIndex + 1);
//     movesToReplay.forEach(m => {
//       game.move({ from: m.from, to: m.to, promotion: m.promotion });
//     });

//     setCurrentFen(game.fen());
//     setCurrentMoveIndex(moveIndex);
//     setCurrentEval(moveIndex >= 0 ? moves[moveIndex].evaluation : null);
//   }, [game, moves, startFen]);

//   // Reset to start
//   const resetToStart = useCallback(() => {
//     game.reset();
//     game.load(startFen);
//     setCurrentFen(startFen);
//     setMoves([]);
//     setCurrentMoveIndex(-1);
//     setCurrentEval(null);
//     setBestMove(null);
//     setLastMoveClassification(null);
//     setHintRequested(false);
//     setStoredAnalysis(null);
//   }, [game, startFen]);

//   // Request one-time hint
//   const requestHint = useCallback(async () => {
//     setHintRequested(true);
//     await analyzeCurrentPosition(true);
//   }, [analyzeCurrentPosition]);

//   // Handle thread count change
//   const handleThreadChange = useCallback(async (newThreads) => {
//     if (setThreads) {
//       const success = await setThreads(newThreads);
//       if (success && getThreadInfo) {
//         const info = getThreadInfo();
//         setThreadInfo(info);
//       }
//     }
//   }, [setThreads, getThreadInfo]);

//   return (
//     <div style={{
//       padding: 20,
//       maxWidth: 1600,
//       margin: '0 auto',
//       // Optimize rendering performance
//       backfaceVisibility: 'hidden',
//       transform: 'translateZ(0)', // Force GPU acceleration
//       WebkitFontSmoothing: 'antialiased'
//     }}>
//       {/* Header */}
//       <div style={{
//         display: 'flex',
//         justifyContent: 'space-between',
//         alignItems: 'center',
//         marginBottom: 20
//       }}>
//         <div>
//           <h2 style={{ margin: 0 }}>Position Analysis</h2>
//           <div style={{
//             marginTop: 8,
//             padding: '6px 12px',
//             background: initialized ? '#d1fae5' : '#fef3c7',
//             borderRadius: 6,
//             border: `2px solid ${initialized ? '#10b981' : '#f59e0b'}`,
//             display: 'inline-flex', // Changed to inline-flex
//             alignItems: 'center',
//             gap: 8,
//             fontSize: 14,
//             minWidth: 420, // Fixed minimum width to prevent layout shift
//             transition: 'background 0.2s ease, border-color 0.2s ease' // Smooth color transitions
//           }}>
//             <strong style={{ minWidth: 90 }}>Engine:</strong>
//             <span style={{ minWidth: 120 }}>
//               {initialized ? '✓ Ready' : '⏳ Initializing...'}
//             </span>
//             {analyzing && <span style={{ color: '#666' }}>(Analyzing...)</span>}
//             {initialized && threadInfo && (
//               <span style={{ fontSize: 12, opacity: 0.8, whiteSpace: 'nowrap' }}>
//                 | {threadInfo.current} thread{threadInfo.current > 1 ? 's' : ''}
//                 {!threadInfo.supportsMultiThreading && ' (single-threaded)'}
//               </span>
//             )}
//           </div>
//         </div>

//         {/* Controls */}
//         <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
//           <label style={{
//             display: 'flex',
//             alignItems: 'center',
//             gap: 8,
//             cursor: 'pointer',
//             padding: '6px 12px',
//             background: autoAnalyze ? '#d1fae5' : '#f3f4f6',
//             borderRadius: 6,
//             border: `2px solid ${autoAnalyze ? '#10b981' : '#e5e7eb'}`
//           }}>
//             <input
//               type="checkbox"
//               checked={autoAnalyze}
//               onChange={(e) => setAutoAnalyze(e.target.checked)}
//             />
//             <span style={{ fontWeight: 600 }}>Auto-analyze Moves</span>
//           </label>

//           <label style={{
//             display: 'flex',
//             alignItems: 'center',
//             gap: 8,
//             cursor: 'pointer',
//             padding: '6px 12px',
//             background: showBestMove ? '#dbeafe' : '#f3f4f6',
//             borderRadius: 6,
//             border: `2px solid ${showBestMove ? '#3b82f6' : '#e5e7eb'}`
//           }}>
//             <input
//               type="checkbox"
//               checked={showBestMove}
//               onChange={(e) => setShowBestMove(e.target.checked)}
//             />
//             <span style={{ fontWeight: 600 }}>Show Best Move</span>
//           </label>

//           <button
//             onClick={requestHint}
//             disabled={!initialized || analyzing || hintRequested}
//             style={{
//               padding: '8px 16px',
//               background: hintRequested ? '#10b981' : initialized ? '#f59e0b' : '#9ca3af',
//               color: 'white',
//               border: 'none',
//               borderRadius: 6,
//               cursor: initialized && !analyzing ? 'pointer' : 'not-allowed',
//               fontWeight: 600
//             }}
//           >
//             {hintRequested ? '✓ Hint Shown' : '💡 Get Hint'}
//           </button>

//           <select
//             value={analysisDepth}
//             onChange={(e) => setAnalysisDepth(Number(e.target.value))}
//             style={{
//               padding: '8px 12px',
//               borderRadius: 6,
//               border: '2px solid #e5e7eb',
//               fontWeight: 600
//             }}
//           >
//             <option value={10}>Depth 10 (Fast)</option>
//             <option value={15}>Depth 15 (Normal)</option>
//             <option value={20}>Depth 20 (Deep)</option>
//           </select>

//           <div style={{
//             display: 'flex',
//             alignItems: 'center',
//             gap: 8,
//             padding: '6px 12px',
//             background: threadInfo.supportsMultiThreading ? '#dbeafe' : '#f3f4f6',
//             borderRadius: 6,
//             border: `2px solid ${threadInfo.supportsMultiThreading ? '#3b82f6' : '#e5e7eb'}`
//           }}>
//             <span style={{ fontWeight: 600, fontSize: 14 }}>🧵 Threads:</span>
//             <select
//               value={threadInfo.current}
//               onChange={(e) => handleThreadChange(Number(e.target.value))}
//               disabled={!initialized || !threadInfo.supportsMultiThreading}
//               style={{
//                 padding: '4px 8px',
//                 borderRadius: 4,
//                 border: '1px solid #e5e7eb',
//                 fontWeight: 600,
//                 cursor: !initialized || !threadInfo.supportsMultiThreading ? 'not-allowed' : 'pointer',
//                 opacity: !initialized || !threadInfo.supportsMultiThreading ? 0.5 : 1
//               }}
//               title={!threadInfo.supportsMultiThreading ? 'Multi-threading not supported (requires COOP/COEP headers and SharedArrayBuffer)' : `Using ${threadInfo.current} of ${threadInfo.max} available threads`}
//             >
//               {Array.from({ length: threadInfo.max }, (_, i) => i + 1).map(n => (
//                 <option key={n} value={n}>{n}</option>
//               ))}
//             </select>
//             <span style={{ fontSize: 12, color: '#6b7280' }}>/ {threadInfo.max}</span>
//           </div>

//           <button
//             onClick={() => setFlipped(f => !f)}
//             style={{
//               padding: '8px 16px',
//               background: '#8b5cf6',
//               color: 'white',
//               border: 'none',
//               borderRadius: 6,
//               cursor: 'pointer',
//               fontWeight: 600
//             }}
//           >
//             ↻ Flip Board
//           </button>

//           <button
//             onClick={resetToStart}
//             style={{
//               padding: '8px 16px',
//               background: '#ef4444',
//               color: 'white',
//               border: 'none',
//               borderRadius: 6,
//               cursor: 'pointer',
//               fontWeight: 600
//             }}
//           >
//             ⟲ Reset
//           </button>

//           {onEditPosition && (
//             <button
//               onClick={() => onEditPosition(currentFen)}
//               style={{
//                 padding: '8px 16px',
//                 background: '#8b5cf6',
//                 color: 'white',
//                 border: 'none',
//                 borderRadius: 6,
//                 cursor: 'pointer',
//                 fontWeight: 600
//               }}
//             >
//               ✏️ Edit Position
//             </button>
//           )}
//         </div>
//       </div>

//       {/* Main Layout */}
//       <div style={{
//         display: 'grid',
//         gridTemplateColumns: '40px 560px 400px', // FIXED columns - no 1fr
//         gap: 20,
//         alignItems: 'start', // Prevent vertical shifting
//         // Performance optimizations
//         willChange: 'transform',
//         backfaceVisibility: 'hidden',
//         transform: 'translateZ(0)',
//         contain: 'layout' // Isolate layout recalculations
//       }}>
//         {/* Evaluation Bar */}
//         <EvaluationBar score={currentEval} fen={currentFen} height={560} />

//         {/* Chess Board and Navigation */}
//         <div style={{
//           display: 'flex',
//           flexDirection: 'column',
//           gap: 16,
//           minHeight: 620 // Fixed height to prevent layout shift
//         }}>
//           <div style={{
//             width: 560,
//             height: 560,
//             flexShrink: 0 // Prevent board from shrinking
//           }}>
//             <InteractiveBoard
//               fen={currentFen}
//               onMove={handleMove}
//               flipped={flipped}
//               bestMove={bestMove}
//               hoverMove={hoverMove}
//             />
//           </div>

//           {/* Move Navigation Buttons */}
//           <div style={{
//             display: 'flex',
//             gap: 8,
//             justifyContent: 'center'
//           }}>
//             <button
//               onClick={() => navigateToMove(-1)}
//               disabled={currentMoveIndex === -1}
//               style={{
//                 padding: '12px 20px',
//                 background: currentMoveIndex === -1 ? '#4b5563' : '#374151',
//                 color: currentMoveIndex === -1 ? '#6b7280' : 'white',
//                 border: 'none',
//                 borderRadius: 8,
//                 cursor: currentMoveIndex === -1 ? 'not-allowed' : 'pointer',
//                 fontSize: 18,
//                 fontWeight: 600,
//                 minWidth: 60,
//                 opacity: currentMoveIndex === -1 ? 0.5 : 1,
//                 transition: 'all 0.2s'
//               }}
//               title="First move"
//             >
//               ⏮
//             </button>

//             <button
//               onClick={() => navigateToMove(currentMoveIndex - 1)}
//               disabled={currentMoveIndex === -1}
//               style={{
//                 padding: '12px 20px',
//                 background: currentMoveIndex === -1 ? '#4b5563' : '#374151',
//                 color: currentMoveIndex === -1 ? '#6b7280' : 'white',
//                 border: 'none',
//                 borderRadius: 8,
//                 cursor: currentMoveIndex === -1 ? 'not-allowed' : 'pointer',
//                 fontSize: 18,
//                 fontWeight: 600,
//                 minWidth: 60,
//                 opacity: currentMoveIndex === -1 ? 0.5 : 1,
//                 transition: 'all 0.2s'
//               }}
//               title="Previous move"
//             >
//               ◀
//             </button>

//             <button
//               onClick={() => navigateToMove(currentMoveIndex + 1)}
//               disabled={currentMoveIndex === moves.length - 1}
//               style={{
//                 padding: '12px 20px',
//                 background: currentMoveIndex === moves.length - 1 ? '#4b5563' : '#374151',
//                 color: currentMoveIndex === moves.length - 1 ? '#6b7280' : 'white',
//                 border: 'none',
//                 borderRadius: 8,
//                 cursor: currentMoveIndex === moves.length - 1 ? 'not-allowed' : 'pointer',
//                 fontSize: 18,
//                 fontWeight: 600,
//                 minWidth: 60,
//                 opacity: currentMoveIndex === moves.length - 1 ? 0.5 : 1,
//                 transition: 'all 0.2s'
//               }}
//               title="Next move"
//             >
//               ▶
//             </button>

//             <button
//               onClick={() => navigateToMove(moves.length - 1)}
//               disabled={currentMoveIndex === moves.length - 1}
//               style={{
//                 padding: '12px 20px',
//                 background: currentMoveIndex === moves.length - 1 ? '#4b5563' : '#374151',
//                 color: currentMoveIndex === moves.length - 1 ? '#6b7280' : 'white',
//                 border: 'none',
//                 borderRadius: 8,
//                 cursor: currentMoveIndex === moves.length - 1 ? 'not-allowed' : 'pointer',
//                 fontSize: 18,
//                 fontWeight: 600,
//                 minWidth: 60,
//                 opacity: currentMoveIndex === moves.length - 1 ? 0.5 : 1,
//                 transition: 'all 0.2s'
//               }}
//               title="Last move"
//             >
//               ⏭
//             </button>
//           </div>
//         </div>

//         {/* Right Panel - Fixed width and stable layout */}
//         <div style={{
//           display: 'flex',
//           flexDirection: 'column',
//           gap: 16,
//           width: 400, // Fixed width instead of min/max
//           alignSelf: 'start', // Prevent panel from stretching
//           flexShrink: 0 // Never shrink
//         }}>
//           {/* Last Move Classification - FIXED height container */}
//           <div style={{
//             height: 100, // Fixed height always
//             transition: 'all 0.2s ease',
//             overflow: 'hidden',
//             display: 'flex',
//             alignItems: 'center'
//           }}>
//             {lastMoveClassification && (
//               <div style={{
//                 width: '100%',
//                 padding: 16,
//                 background: '#fff',
//                 borderRadius: 12,
//                 border: `3px solid ${lastMoveClassification.color}`,
//                 boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
//                 transition: 'all 0.2s ease'
//               }}>
//                 <div style={{
//                   fontSize: 18,
//                   fontWeight: 700,
//                   color: lastMoveClassification.color,
//                   marginBottom: 8
//                 }}>
//                   {lastMoveClassification.label}
//                 </div>
//                 <div style={{ fontSize: 14, color: '#6b7280' }}>
//                   Centipawn loss: {lastMoveClassification.cpLoss.toFixed(0)}
//                 </div>
//               </div>
//             )}
//           </div>

//           {/* Best Move - FIXED height container */}
//           <div style={{
//             height: 140, // Fixed height always
//             transition: 'all 0.2s ease',
//             overflow: 'hidden',
//             display: 'flex',
//             alignItems: 'center'
//           }}>
//             {bestMove && (
//               <div style={{
//                 width: '100%',
//                 padding: 16,
//                 background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
//                 borderRadius: 12,
//                 border: '3px solid #22c55e',
//                 boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
//                 transition: 'all 0.2s ease'
//               }}>
//               <div style={{ 
//                 fontSize: 14, 
//                 fontWeight: 600, 
//                 marginBottom: 8,
//                 display: 'flex',
//                 alignItems: 'center',
//                 gap: 8
//               }}>
//                 <span>🎯 Best Move:</span>
//                 <span style={{
//                   fontSize: 11,
//                   padding: '2px 8px',
//                   background: '#22c55e',
//                   borderRadius: 4,
//                   color: '#fff',
//                   fontWeight: 700
//                 }}>
//                   See arrow on board ➜
//                 </span>
//               </div>
//               <div style={{
//                 fontSize: 24,
//                 fontFamily: 'monospace',
//                 fontWeight: 700,
//                 color: '#15803d'
//               }}>
//                 {bestMove}
//               </div>
//               <div style={{
//                 fontSize: 12,
//                 color: '#166534',
//                 marginTop: 4,
//                 fontStyle: 'italic',
//                 fontWeight: 600
//               }}>
//                 ✨ Green arrow with pulsing animation
//               </div>
//               </div>
//             )}
//           </div>

//           {/* Current Evaluation - FIXED height container */}
//           <div style={{
//             height: 100, // Fixed height always
//             transition: 'all 0.2s ease',
//             overflow: 'hidden',
//             display: 'flex',
//             alignItems: 'center'
//           }}>
//             {currentEval && (
//               <div style={{
//                 width: '100%',
//                 padding: 16,
//                 background: '#f9fafb',
//                 borderRadius: 12,
//                 border: '2px solid #e5e7eb',
//                 transition: 'all 0.2s ease'
//               }}>
//               <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
//                 Evaluation:
//               </div>
//               <div style={{
//                 fontSize: 18,
//                 fontFamily: 'monospace',
//                 fontWeight: 600,
//                 color: currentEval.type === 'mate'
//                   ? '#dc2626'
//                   : currentEval.value > 0
//                   ? '#10b981'
//                   : currentEval.value < 0
//                   ? '#374151'
//                   : '#6b7280'
//               }}>
//                 {currentEval.type === 'mate'
//                   ? `Mate in ${Math.abs(currentEval.value)}`
//                   : `${(currentEval.value / 100).toFixed(2)}`
//                 }
//               </div>
//               </div>
//             )}
//           </div>

//           {/* Engine Lines - FIXED height container */}
//           <div style={{
//             height: 280, // Fixed height always
//             transition: 'all 0.2s ease',
//             overflow: 'auto' // Allow scrolling if content exceeds
//           }}>
//             {engineLines.length > 0 && (
//               <EngineLines
//                 lines={engineLines}
//                 depth={analysisDepth}
//                 turn={currentFen.split(' ')[1]}
//                 onLineClick={(line) => {
//                   console.log('Selected line:', line);
//                 }}
//                 onLineHover={(move) => {
//                   setHoverMove(move);
//                 }}
//               />
//             )}
//           </div>

//           {/* Move History */}
//           <MoveHistory
//             moves={moves}
//             currentMoveIndex={currentMoveIndex}
//             onMoveClick={navigateToMove}
//           />
//         </div>
//       </div>

//       {/* Instructions */}
//       <div style={{
//         marginTop: 20,
//         padding: 16,
//         background: '#eff6ff',
//         borderRadius: 8,
//         fontSize: 14,
//         color: '#1e40af'
//       }}>
//         <strong>💡 How to use:</strong>
//         <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
//           <li><strong>Auto-analyze Moves</strong> (ON by default) - Classifies each move you play (Brilliant, Blunder, etc.)</li>
//           <li><strong>Show Best Move</strong> (OFF by default) - Toggle to see a <span style={{background: '#22c55e', padding: '2px 6px', borderRadius: 3, fontWeight: 700, color: 'white'}}>green arrow ➜</span> showing the engine's best move continuously</li>
//           <li><strong>Get Hint</strong> - Click to see a <span style={{background: '#22c55e', padding: '2px 6px', borderRadius: 3, fontWeight: 700, color: 'white'}}>green arrow ➜</span> for just ONE move (disappears after you play)</li>
//           <li>Click or drag pieces to make moves on the board</li>
//           <li>Click on moves in the history to navigate back/forward</li>
//           <li>The evaluation bar shows who has the advantage</li>
//           <li><strong>Animated pulse</strong> at the starting square helps you find the move instantly!</li>
//         </ul>
//       </div>
//     </div>
//   );
// }



// Analysis.jsx (Tailwind version)

import { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { useStockfish } from './hooks/useStockfish';
import InteractiveBoard from './components/InteractiveBoard';
import EvaluationBar from './components/EvaluationBar';
import MoveHistory from './components/MoveHistory';
import EngineLines from './components/EngineLines';
import {
  evalForRoot,
  normalizeLines,
  classifyMove,
  isOpeningPhase
} from './utils/moveClassification';

export default function Analysis({ initialFen, onEditPosition }) {
  const startFen = initialFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const [game] = useState(new Chess(startFen));
  const [currentFen, setCurrentFen] = useState(startFen);
  const [moves, setMoves] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [flipped, setFlipped] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const { initialized, analyzing, analyze, error, getThreadInfo, setThreads } = useStockfish();

  const [currentEval, setCurrentEval] = useState(null);
  const [bestMove, setBestMove] = useState(null);
  const [showBestMove, setShowBestMove] = useState(false);
  const [hintRequested, setHintRequested] = useState(false);

  const [lastMoveClassification, setLastMoveClassification] = useState(null);
  const [analysisDepth, setAnalysisDepth] = useState(15);
  const [storedAnalysis, setStoredAnalysis] = useState(null);
  const [engineLines, setEngineLines] = useState([]);
  const [isProcessingMove, setIsProcessingMove] = useState(false);
  const [hoverMove, setHoverMove] = useState(null);
  const [threadInfo, setThreadInfo] = useState({ current: 1, max: 1, supportsMultiThreading: false });

  useEffect(() => {
    if (initialized && getThreadInfo) {
      const info = getThreadInfo();
      setThreadInfo(info);
    }
  }, [initialized, getThreadInfo]);

  useEffect(() => {
    if (initialFen && initialFen !== game.fen()) {
      game.load(initialFen);
      setCurrentFen(initialFen);
      setMoves([]);
      setCurrentMoveIndex(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFen]);

  const analyzeCurrentPosition = useCallback(async (forceShowHint = false) => {
    if (!initialized) return;
    try {
      const result = await analyze(currentFen, { depth: analysisDepth, multiPV: 3 });
      setCurrentEval(result.evaluation);
      setStoredAnalysis(result);
      setEngineLines(result.lines || []);
      if (showBestMove || forceShowHint || hintRequested) {
        setBestMove(result.lines[0]?.pv[0]);
      } else {
        setBestMove(null);
      }
    } catch (err) {
      console.error('Analysis error:', err);
    }
  }, [currentFen, initialized, analyze, analysisDepth, showBestMove, hintRequested]);

  useEffect(() => {
    if (autoAnalyze && initialized && !isProcessingMove) {
      const t = setTimeout(() => analyzeCurrentPosition(), 220);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen, autoAnalyze, initialized, isProcessingMove]);

  const handleMove = useCallback(async (move, newFen) => {
    if (!initialized) return;
    setIsProcessingMove(true);

    const previousFen = currentFen;
    const previousAnalysis = storedAnalysis;

    setHintRequested(false);
    setLastMoveClassification(null);
    setBestMove(null);
    setCurrentFen(newFen);

    try {
      const result = await analyze(newFen, { depth: analysisDepth, multiPV: 3 });
      const bestMoveForNewPosition = result.lines[0]?.pv[0];

      setStoredAnalysis(result);
      setCurrentEval(result.evaluation);
      setEngineLines(result.lines || []);

      let classification = { classification: 'best', label: 'Best', cpLoss: 0, color: '#16a34a' };

      if (previousAnalysis?.lines?.length) {
        try {
          const movePlayed = move.from + move.to + (move.promotion || '');
          const tempChess = new Chess(previousFen);
          const rootTurn = tempChess.turn();
          const lines = normalizeLines(previousAnalysis.lines, rootTurn);
          const best = lines[0]?.pv?.[0];

          const isBook = isOpeningPhase(previousFen);
          const pv2Gap = lines.length > 1 ? (lines[0].scoreForRoot - lines[1].scoreForRoot) : 0;
          const forced = pv2Gap >= 200;

          const ourRoot = await analyze(previousFen, { depth: analysisDepth, multiPV: 1, searchMoves: [movePlayed] });
          const bestRoot = await analyze(previousFen, { depth: analysisDepth, multiPV: 1, searchMoves: [best] });

          const ourRootScore = evalForRoot(rootTurn, rootTurn, ourRoot.evaluation);
          const bestRootScore = evalForRoot(rootTurn, rootTurn, bestRoot.evaluation);
          const cpLoss = Math.max(0, bestRootScore - ourRootScore);

          const eps = 10;
          const inTop3 = lines.slice(0, 3).some(l => l.pv[0]?.toLowerCase() === movePlayed.toLowerCase());
          const ourLine = lines.find(l => l.pv[0]?.toLowerCase() === movePlayed.toLowerCase());
          const withinEps = ourLine ? (lines[0].scoreForRoot - ourLine.scoreForRoot) <= eps : false;
          const missedMate = (lines[0]?.evaluation?.type === 'mate') && (ourRoot.evaluation?.type !== 'mate');

          const pieceCount = (previousFen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;
          const isBrilliant = forced && pv2Gap >= 500 && cpLoss === 0 && !isBook && pieceCount >= 20 && pieceCount <= 30;

          classification = classifyMove(cpLoss, {
            inTop3, withinEps, forced, missedMate, isBook: isBook && cpLoss <= 10, isBrilliant
          });
        } catch (e) {
          console.error('Classification error:', e);
        }
      }

      const newMove = {
        ...move,
        evaluation: result.evaluation,
        classification: classification.classification,
        classificationLabel: classification.label,
        cpLoss: classification.cpLoss
      };
      setMoves(prev => [...prev, newMove]);
      setCurrentMoveIndex(prev => prev + 1);

      // Set the classification to display in the UI
      setLastMoveClassification(classification);

      if (showBestMove) setBestMove(bestMoveForNewPosition);
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsProcessingMove(false);
    }
  }, [initialized, currentFen, storedAnalysis, analyze, analysisDepth, showBestMove]);

  const navigateToMove = useCallback((moveIndex) => {
    game.reset();
    game.load(startFen);
    const movesToReplay = moves.slice(0, moveIndex + 1);
    movesToReplay.forEach(m => game.move({ from: m.from, to: m.to, promotion: m.promotion }));
    setCurrentFen(game.fen());
    setCurrentMoveIndex(moveIndex);
    setCurrentEval(moveIndex >= 0 ? moves[moveIndex].evaluation : null);
  }, [game, moves, startFen]);

  const resetToStart = useCallback(() => {
    game.reset();
    game.load(startFen);
    setCurrentFen(startFen);
    setMoves([]);
    setCurrentMoveIndex(-1);
    setCurrentEval(null);
    setBestMove(null);
    setLastMoveClassification(null);
    setHintRequested(false);
    setStoredAnalysis(null);
  }, [game, startFen]);

  const requestHint = useCallback(async () => {
    setHintRequested(true);
    await analyzeCurrentPosition(true);
  }, [analyzeCurrentPosition]);

  const handleThreadChange = useCallback(async (newThreads) => {
    if (!setThreads) return;
    const ok = await setThreads(newThreads);
    if (ok && getThreadInfo) setThreadInfo(getThreadInfo());
  }, [setThreads, getThreadInfo]);

  const turn = currentFen.split(' ')[1];

  return (
    <div className="mx-auto max-w-[1600px] p-5 text-slate-900">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="m-0 mb-2 text-2xl font-bold tracking-tight">Position Analysis</h2>
          <div className={`inline-flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm
            ${initialized ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <strong className="font-semibold">Engine:</strong>
            {initialized ? 'Ready' : 'Initializing…'}
            {analyzing && <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-green-500" />}
            {initialized && (
              <span className="ml-2 text-xs text-slate-600">
                | {threadInfo.current} thread{threadInfo.current > 1 ? 's' : ''}
                {!threadInfo.supportsMultiThreading && ' (single-threaded)'}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-1.5
            ${autoAnalyze ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
              className="hidden"
            />
            <span className="font-semibold">Auto-analyze</span>
          </label>

          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-1.5
            ${showBestMove ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <input
              type="checkbox"
              checked={showBestMove}
              onChange={(e) => setShowBestMove(e.target.checked)}
              className="hidden"
            />
            <span className="font-semibold">Show Best Move</span>
          </label>

          <button
            onClick={requestHint}
            disabled={!initialized || analyzing || hintRequested}
            className={`rounded-lg px-4 py-2 font-bold text-white transition
              ${hintRequested ? 'bg-green-600' : initialized ? 'bg-amber-600' : 'bg-slate-400 cursor-not-allowed'}`}
          >
            {hintRequested ? '✓ Hint Shown' : '💡 Get Hint'}
          </button>

          <select
            value={analysisDepth}
            onChange={(e) => setAnalysisDepth(Number(e.target.value))}
            className="rounded-lg border-2 border-slate-200 bg-white px-3 py-2 font-semibold"
          >
            <option value={10}>Depth 10 (Fast)</option>
            <option value={15}>Depth 15 (Normal)</option>
            <option value={20}>Depth 20 (Deep)</option>
          </select>

          <div className={`flex items-center gap-2 rounded-lg border-2 px-3 py-1.5
            ${threadInfo.supportsMultiThreading ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <span className="font-semibold">🧵</span>
            <select
              value={threadInfo.current}
              onChange={(e) => handleThreadChange(Number(e.target.value))}
              disabled={!initialized || !threadInfo.supportsMultiThreading}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              title={!threadInfo.supportsMultiThreading
                ? 'Requires COOP/COEP + SharedArrayBuffer'
                : `Using ${threadInfo.current} of ${threadInfo.max}`}
            >
              {Array.from({ length: threadInfo.max }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-xs text-slate-600">/ {threadInfo.max}</span>
          </div>

          <button
            onClick={() => setFlipped(f => !f)}
            className="rounded-lg bg-violet-600 px-4 py-2 font-bold text-white"
          >
            ↻ Flip
          </button>

          <button
            onClick={resetToStart}
            className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white"
          >
            ⟲ Reset
          </button>

          {onEditPosition && (
            <button
              onClick={() => onEditPosition(currentFen)}
              className="rounded-lg bg-violet-600 px-4 py-2 font-bold text-white"
            >
              ✏️ Edit
            </button>
          )}
        </div>
      </div>

      {/* Main layout: flex with fixed widths = no shifting */}
      <div className="flex items-start gap-5">
        {/* Evaluation bar (fixed width) */}
        <div className="w-10">
          <EvaluationBar score={currentEval} fen={currentFen} height={560} />
        </div>

        {/* Board column */}
        <div className="flex min-h-[620px] flex-col gap-3">
          <div className="relative h-[560px] w-[560px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <InteractiveBoard
              fen={currentFen}
              onMove={handleMove}
              flipped={flipped}
              bestMove={bestMove}
              hoverMove={hoverMove}
            />
            {!initialized && (
              <div className="absolute inset-0 bg-slate-100">
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-3 h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-green-600" />
                    <div className="text-sm font-semibold text-slate-600">Loading engine...</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Move navigation */}
          <div className="flex justify-center gap-2">
            <button
              onClick={() => navigateToMove(-1)}
              disabled={currentMoveIndex === -1}
              className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              title="First move"
            >
              ⏮
            </button>
            <button
              onClick={() => navigateToMove(currentMoveIndex - 1)}
              disabled={currentMoveIndex === -1}
              className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              title="Previous"
            >
              ◀
            </button>
            <button
              onClick={() => navigateToMove(currentMoveIndex + 1)}
              disabled={currentMoveIndex === moves.length - 1}
              className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              title="Next"
            >
              ▶
            </button>
            <button
              onClick={() => navigateToMove(moves.length - 1)}
              disabled={currentMoveIndex === moves.length - 1}
              className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              title="Last"
            >
              ⏭
            </button>
          </div>
        </div>

        {/* Right panel (sticky) */}
        <div className="sticky top-4 w-[420px] flex-shrink-0 space-y-3">
          {/* Classification - only show when there's a classification */}
          {lastMoveClassification && (
            <div className="flex min-h-[112px] items-center rounded-xl border border-slate-200 bg-white p-4 shadow transition-all duration-200">
              <div
                className="w-full rounded-xl border-4 bg-white p-3"
                style={{ borderColor: lastMoveClassification.color }}
              >
                <div
                  className="mb-1 text-lg font-extrabold"
                  style={{ color: lastMoveClassification.color }}
                >
                  {lastMoveClassification.label}
                </div>
                <div className="text-sm text-slate-600">
                  Centipawn loss: {lastMoveClassification.cpLoss.toFixed(0)}
                </div>
              </div>
            </div>
          )}

          {/* Best move - only show when available */}
          {bestMove && (
            <div className="flex min-h-[112px] items-center rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-4 shadow transition-all duration-200">
              <div className="w-full">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <span>🎯 Best Move</span>
                  <span className="rounded-md bg-green-600 px-2 py-0.5 text-xs font-extrabold text-white">
                    See arrow on board ➜
                  </span>
                </div>
                <div className="font-mono text-2xl font-extrabold text-green-700">
                  {bestMove}
                </div>
                <div className="mt-0.5 text-xs font-semibold italic text-green-800">
                  Green arrow with subtle pulse
                </div>
              </div>
            </div>
          )}

          {/* Current eval - always visible */}
          <div className="flex min-h-[100px] items-center rounded-xl border border-slate-200 bg-white p-4 shadow transition-all duration-200">
            {!currentEval ? (
              <div className="w-full space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-300" />
                <div className="h-6 w-32 animate-pulse rounded bg-slate-300" />
              </div>
            ) : (
              <div className="w-full">
                <div className="mb-1 text-sm font-bold text-slate-700">Evaluation</div>
                <div className={`
                  font-mono text-lg font-extrabold
                  ${currentEval.type === 'mate'
                    ? 'text-red-700'
                    : currentEval.value > 0
                      ? 'text-green-600'
                      : currentEval.value < 0
                        ? 'text-blue-900'
                        : 'text-slate-700'}
                `}>
                  {currentEval.type === 'mate'
                    ? `Mate in ${Math.abs(currentEval.value)}`
                    : `${(currentEval.value / 100).toFixed(2)}`}
                </div>
              </div>
            )}
          </div>

          {/* Engine lines */}
          <div className="h-[280px] overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow">
            {engineLines.length === 0 ? (
              <div className="space-y-3">
                <div className="h-16 w-full animate-pulse rounded bg-slate-300" />
                <div className="h-16 w-full animate-pulse rounded bg-slate-300" />
                <div className="h-16 w-full animate-pulse rounded bg-slate-300" />
              </div>
            ) : (
              <EngineLines
                lines={engineLines}
                depth={analysisDepth}
                turn={turn}
                onLineClick={() => {}}
                onLineHover={setHoverMove}
              />
            )}
          </div>

          {/* Move history */}
          <div className="max-h-[260px] overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow">
            <MoveHistory
              moves={moves}
              currentMoveIndex={currentMoveIndex}
              onMoveClick={navigateToMove}
            />
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow">
        <strong>💡 How to use:</strong>
        <ul className="ml-5 mt-2 list-disc space-y-1">
          <li><strong>Auto-analyze</strong> classifies moves as you play.</li>
          <li><strong>Show Best Move</strong> draws a green arrow for the engine’s choice.</li>
          <li><strong>Get Hint</strong> shows a one-time arrow for the current position.</li>
          <li>Click history to jump; the evaluation bar shows the advantage.</li>
        </ul>
      </div>
    </div>
  );
}

