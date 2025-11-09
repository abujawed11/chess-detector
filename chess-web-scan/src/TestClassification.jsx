// import { useState, useEffect } from 'react';
// import { Chess } from 'chess.js/dist/esm/chess.js';
// import { useStockfish } from './hooks/useStockfish';
// import InteractiveBoard from './components/InteractiveBoard';
// import { classifyMove, scoreToCentipawns } from './utils/engineUtils';

// // Famous chess positions with known evaluations
// const TEST_POSITIONS = [
//   {
//     name: "Brilliant Sacrifice - Immortal Game",
//     fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
//     testMove: "f1c4", // Bc4 (Italian Game setup)
//     bestMove: "f1c4",
//     expectedClass: "best",
//     description: "Standard Italian Game development"
//   },
//   {
//     name: "Obvious Best Move - Simple Capture",
//     fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
//     testMove: "g1f3", // Nf3 in UCI
//     bestMove: "g1f3",
//     expectedClass: "best",
//     description: "Standard opening move"
//   },
//   {
//     name: "Inaccuracy - Slow Move",
//     fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
//     testMove: "a2a3", // a3 in UCI (slow move)
//     bestMove: "b1c3", // Nc3
//     expectedClass: "inaccuracy",
//     description: "a3 is slow, wastes tempo"
//   },
//   {
//     name: "Typical Blunder - Queen Hangs",
//     fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 0 3",
//     testMove: "f6g4", // Ng4 in UCI
//     bestMove: "b8c6", // Nc6
//     expectedClass: "blunder",
//     description: "Ng4 allows Qxg4"
//   },
//   {
//     name: "Forced King Move",
//     fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 3",
//     testMove: "f6e4", // Nxe4 (captures pawn)
//     bestMove: "f6e4",
//     expectedClass: "best",
//     description: "Simple recapture"
//   },
//   {
//     name: "Back Rank Mate Available",
//     fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
//     testMove: "e1e8", // Re8# in UCI
//     bestMove: "e1e8",
//     expectedClass: "best",
//     description: "Simple back rank mate"
//   },
//   {
//     name: "Missing Mate - Moving King",
//     fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
//     testMove: "g1h2", // Kh2 in UCI notation (avoiding the mate)
//     bestMove: "e1e8", // Re8#
//     expectedClass: "miss",
//     description: "Missing forced checkmate Re8#"
//   },
//   {
//     name: "Excellent Move - Fork",
//     fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
//     testMove: "f3g5", // Ng5 in UCI
//     bestMove: "b1c3", // Nc3 or d3
//     expectedClass: "excellent",
//     description: "Ng5 attacks f7, very strong"
//   },
//   {
//     name: "Quiet Positional Move",
//     fen: "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq - 0 4",
//     testMove: "f8e7", // Be7 in UCI
//     bestMove: "f8e7",
//     expectedClass: "best",
//     description: "Standard development"
//   },
//   {
//     name: "Complex Middlegame",
//     fen: "r1bq1rk1/pp3pbp/2np1np1/2p1p3/2P1P3/2NPBNP1/PP3PBP/R2QK2R w KQ - 0 10",
//     testMove: "d1d2", // Qd2 in UCI
//     bestMove: "d1d2",
//     expectedClass: "best",
//     description: "Solid continuation"
//   },
//   {
//     name: "Endgame - Pawn Push",
//     fen: "8/5pk1/6p1/8/3K4/8/5P2/8 w - - 0 1",
//     testMove: "f2f4", // f4 in UCI
//     bestMove: "f2f4",
//     expectedClass: "best",
//     description: "Advancing passed pawn"
//   },
//   {
//     name: "Mistake - Bad Development",
//     fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
//     testMove: "h2h4", // h4 in UCI (weakening move)
//     bestMove: "b1c3", // Nc3
//     expectedClass: "mistake",
//     description: "h4 weakens king safety significantly"
//   }
// ];

// export default function TestClassification() {
//   const [currentTest, setCurrentTest] = useState(0);
//   const [results, setResults] = useState([]);
//   const [analyzing, setAnalyzing] = useState(false);
//   const [testMove, setTestMove] = useState(null);
//   const [bestMoveResult, setBestMoveResult] = useState(null);
//   const [classification, setClassification] = useState(null);
//   const [analysisStatus, setAnalysisStatus] = useState('');

//   const { initialized, analyze } = useStockfish();

//   const position = TEST_POSITIONS[currentTest];

//   useEffect(() => {
//     // Reset when changing position
//     setTestMove(null);
//     setBestMoveResult(null);
//     setClassification(null);
//   }, [currentTest]);

//   // helper: convert {type, value} from the analyzed node's side-to-move
//   // into a signed centipawn score from the ROOT side-to-move perspective.
//   function evalForRoot(rootTurn, nodeTurn, evaluation) {
//     if (!evaluation) return 0;

//     // Map mate to a very large cp with sign
//     if (evaluation.type === 'mate') {
//       // Mate in N is "winning" for side-to-move if N > 0.
//       // Use a big value that dwarfs any cp score (e.g., 100000 - ply)
//       const signFromNode = evaluation.value > 0 ? 1 : -1; // mate for side-to-move if positive
//       const cpFromNode = signFromNode * 100000;
//       // Flip if node turn != root turn
//       return (nodeTurn === rootTurn) ? cpFromNode : -cpFromNode;
//     }

//     // Centipawn score from node's side to move
//     const cpFromNode = evaluation.value ?? 0;

//     return (nodeTurn === rootTurn) ? cpFromNode : -cpFromNode;
//   }

//   const runTest = async () => {
//   if (!initialized) { alert('Engine not initialized yet!'); return; }
//   setAnalyzing(true);

//   try {
//     const pos = TEST_POSITIONS[currentTest];
//     const rootChess = new Chess(pos.fen);
//     const rootTurn = rootChess.turn(); // 'w' or 'b'

//     // ---- 1) Root analysis
//     setAnalysisStatus('Analyzing initial position...');
//     const rootAnalysis = await analyze(pos.fen, { depth: 20, multiPV: 3 });

//     // Ensure lines are sorted best-first by score from ROOT perspective
//     const scoredLines = (rootAnalysis.lines || []).map((ln) => {
//       const nodeTurn = rootTurn; // analysis is at root, side-to-move = rootTurn
//       const cpForRoot = evalForRoot(rootTurn, nodeTurn, ln.evaluation || rootAnalysis.evaluation);
//       return { ...ln, __scoreForRoot: cpForRoot };
//     }).sort((a, b) => b.__scoreForRoot - a.__scoreForRoot);

//     const engineBestMove = scoredLines[0]?.pv?.[0];
//     const rootEval = evalForRoot(rootTurn, rootTurn, rootAnalysis.evaluation);

//     setBestMoveResult({
//       move: engineBestMove,
//       eval: rootAnalysis.evaluation,
//       lines: scoredLines
//     });

//     // If there's a test move, analyze it
//     if (pos.testMove) {
//       // ---- 2) After OUR move
//       const ourChess = new Chess(pos.fen);
//       const from = pos.testMove.slice(0, 2);
//       const to = pos.testMove.slice(2, 4);
//       const promotion = pos.testMove.length > 4 ? pos.testMove.slice(4) : undefined;
//       const moved = ourChess.move({ from, to, promotion });
//       if (!moved) {
//         alert(`Invalid test move: ${pos.testMove}`);
//         setAnalyzing(false);
//         return;
//       }

//       setAnalysisStatus(`Analyzing test move ${pos.testMove}...`);
//       const ourAnalysis = await analyze(ourChess.fen(), { depth: 20, multiPV: 1 });

//       // ourAnalysis is at the node where it's opponent to move now
//       const ourAfterEval = evalForRoot(rootTurn, ourChess.turn(), ourAnalysis.evaluation);

//       // ---- 3) After BEST move
//       let bestAfterEval = ourAfterEval;
//       if (engineBestMove) {
//         const bestChess = new Chess(pos.fen);
//         const bf = engineBestMove.slice(0, 2);
//         const bt = engineBestMove.slice(2, 4);
//         const bp = engineBestMove.length > 4 ? engineBestMove.slice(4) : undefined;
//         bestChess.move({ from: bf, to: bt, promotion: bp });

//         setAnalysisStatus(`Analyzing best move ${engineBestMove}...`);
//         const bestAnalysis = await analyze(bestChess.fen(), { depth: 20, multiPV: 1 });

//         bestAfterEval = evalForRoot(rootTurn, bestChess.turn(), bestAnalysis.evaluation);
//       }

//       // ---- 4) CP-loss and classification inputs (all from ROOT perspective)
//       const cpLoss = Math.max(0, bestAfterEval - ourAfterEval);

//       const result = classifyMove(
//         /* evalBefore */ rootEval,
//         /* evalAfter  */ ourAfterEval,
//         /* bestAfter  */ bestAfterEval,
//         {
//           isBestMove: pos.testMove?.toLowerCase() === engineBestMove?.toLowerCase(),
//           missedMate:
//             (scoredLines[0]?.evaluation?.type === 'mate') &&
//             (ourAnalysis.evaluation?.type !== 'mate')
//         }
//       );

//       setClassification(result);

//       const testResult = {
//         position: pos.name,
//         expected: pos.expectedClass,
//         actual: result.classification,
//         cpLoss,                            // already absolute & normalized
//         match: result.classification === pos.expectedClass,
//         testMove: pos.testMove,
//         bestMove: engineBestMove
//       };

//       setResults(prev => {
//         const next = [...prev];
//         next[currentTest] = testResult;
//         return next;
//       });
//     } else {
//       // No explicit testMove: treat engineBestMove as the move (cpLoss = 0)
//       setTestMove(engineBestMove);
//       setClassification({ classification: 'best', label: 'Best Move', color: '#9bc02a', cpLoss: 0 });

//       const testResult = {
//         position: pos.name,
//         expected: pos.expectedClass,
//         actual: 'best',
//         cpLoss: 0,
//         match: pos.expectedClass === 'best',
//         testMove: engineBestMove,
//         bestMove: engineBestMove
//       };

//       setResults(prev => {
//         const next = [...prev];
//         next[currentTest] = testResult;
//         return next;
//       });
//     }
//   } catch (e) {
//     console.error(e);
//     alert('Analysis failed: ' + e.message);
//   } finally {
//     setAnalyzing(false);
//     setAnalysisStatus('');
//   }
// };



//   // const runTest = async () => {
//   //   if (!initialized) {
//   //     alert('Engine not initialized yet!');
//   //     return;
//   //   }

//   //   setAnalyzing(true);
//   //   const pos = TEST_POSITIONS[currentTest];

//   //   try {
//   //     console.log('🧪 Testing:', pos.name);
//   //     console.log('📋 Position FEN:', pos.fen);

//   //     // Analyze the position
//   //     setAnalysisStatus('Analyzing initial position...');
//   //     console.log('⚙️ Analyzing initial position...');
//   //     const analysis = await analyze(pos.fen, { depth: 20, multiPV: 3 });

//   //     // Get best move evaluation
//   //     const bestMoveEval = analysis.evaluation;
//   //     const engineBestMove = analysis.lines[0]?.pv[0];

//   //     console.log('✅ Engine best move:', engineBestMove);
//   //     console.log('📊 Initial eval:', bestMoveEval);

//   //     setBestMoveResult({
//   //       move: engineBestMove,
//   //       eval: bestMoveEval,
//   //       lines: analysis.lines
//   //     });

//   //     // If there's a test move, analyze it
//   //     if (pos.testMove) {
//   //       const chess = new Chess(pos.fen);
//   //       const sideToMove = chess.turn(); // Save who's moving before the move

//   //       // Parse UCI move (e.g., "e2e4" or "e7e8q" for promotion)
//   //       const from = pos.testMove.substring(0, 2);
//   //       const to = pos.testMove.substring(2, 4);
//   //       const promotion = pos.testMove.length > 4 ? pos.testMove.substring(4) : undefined;

//   //       const move = chess.move({ from, to, promotion });

//   //       if (!move) {
//   //         console.error('Invalid test move:', pos.testMove, 'from FEN:', pos.fen);
//   //         alert(`Invalid test move: ${pos.testMove}`);
//   //         setAnalyzing(false);
//   //         return;
//   //       }

//   //       const newFen = chess.fen();
//   //       setAnalysisStatus(`Analyzing test move ${pos.testMove}...`);
//   //       console.log('⚙️ Analyzing test move:', pos.testMove);
//   //       const afterAnalysis = await analyze(newFen, { depth: 20, multiPV: 1 });

//   //       // Calculate classification correctly
//   //       // evalBefore: what we had before the move (from player's perspective)
//   //       const evalBefore = scoreToCentipawns(bestMoveEval, sideToMove);

//   //       // evalAfter: what we have after our move (need to flip since it's opponent's turn now)
//   //       const evalAfter = -scoreToCentipawns(afterAnalysis.evaluation, chess.turn());

//   //       // bestMoveEval: what we would have if we played the best move
//   //       // We need to calculate this by playing the best move instead
//   //       const testChess = new Chess(pos.fen);
//   //       const bestFrom = engineBestMove.substring(0, 2);
//   //       const bestTo = engineBestMove.substring(2, 4);
//   //       const bestPromotion = engineBestMove.length > 4 ? engineBestMove.substring(4) : undefined;
//   //       testChess.move({ from: bestFrom, to: bestTo, promotion: bestPromotion });
//   //       setAnalysisStatus(`Analyzing best move ${engineBestMove}...`);
//   //       console.log('⚙️ Analyzing best move path...');
//   //       const bestMoveAfterAnalysis = await analyze(testChess.fen(), { depth: 20, multiPV: 1 });
//   //       const bestMoveEvalAfter = -scoreToCentipawns(bestMoveAfterAnalysis.evaluation, testChess.turn());

//   //       // CP Loss = what best move gives - what our move gives
//   //       const cpLoss = bestMoveEvalAfter - evalAfter;

//   //       console.log('📈 Eval after test move:', evalAfter);
//   //       console.log('📈 Eval after best move:', bestMoveEvalAfter);
//   //       console.log('💯 Centipawn loss:', cpLoss);

//   //       const result = classifyMove(evalBefore, evalAfter, bestMoveEvalAfter, {
//   //         isBestMove: pos.testMove.toLowerCase() === engineBestMove.toLowerCase(),
//   //         missedMate: bestMoveEval?.type === 'mate' && afterAnalysis.evaluation?.type !== 'mate'
//   //       });

//   //       setClassification(result);

//   //       // Store result with actual CP loss
//   //       const testResult = {
//   //         position: pos.name,
//   //         expected: pos.expectedClass,
//   //         actual: result.classification,
//   //         cpLoss: Math.abs(cpLoss), // Use actual calculated CP loss
//   //         match: result.classification === pos.expectedClass,
//   //         testMove: pos.testMove,
//   //         bestMove: engineBestMove
//   //       };

//   //       setResults(prev => {
//   //         const newResults = [...prev];
//   //         newResults[currentTest] = testResult;
//   //         return newResults;
//   //       });
//   //     } else {
//   //       // Just show best move (no test move specified)
//   //       setTestMove(engineBestMove);
//   //       // If there's no specific move to test, assume it's the best move
//   //       const result = {
//   //         classification: 'best',
//   //         label: 'Best Move',
//   //         color: '#9bc02a',
//   //         cpLoss: 0
//   //       };
//   //       setClassification(result);

//   //       // Store result
//   //       const testResult = {
//   //         position: pos.name,
//   //         expected: pos.expectedClass,
//   //         actual: 'best',
//   //         cpLoss: 0,
//   //         match: pos.expectedClass === 'best',
//   //         testMove: engineBestMove,
//   //         bestMove: engineBestMove
//   //       };

//   //       setResults(prev => {
//   //         const newResults = [...prev];
//   //         newResults[currentTest] = testResult;
//   //         return newResults;
//   //       });
//   //     }
//   //   } catch (error) {
//   //     console.error('Analysis error:', error);
//   //     alert('Analysis failed: ' + error.message);
//   //   }

//   //   setAnalyzing(false);
//   //   setAnalysisStatus('');
//   // };

//   const runAllTests = async () => {
//     for (let i = 0; i < TEST_POSITIONS.length; i++) {
//       setCurrentTest(i);
//       await new Promise(resolve => setTimeout(resolve, 100));
//       await runTest();
//       await new Promise(resolve => setTimeout(resolve, 500));
//     }
//   };

//   const correctCount = results.filter(r => r && r.match).length;
//   const totalTested = results.filter(r => r).length;
//   const accuracy = totalTested > 0 ? ((correctCount / totalTested) * 100).toFixed(1) : 0;

//   return (
//     <div style={{ padding: 20, maxWidth: 1600, margin: '0 auto' }}>
//       {/* Header */}
//       <div style={{ marginBottom: 20 }}>
//         <h2>Move Classification Test Suite</h2>
//         <p style={{ color: '#666' }}>
//           Test move classification accuracy against known chess positions
//         </p>

//         {/* Overall Results */}
//         {totalTested > 0 && (
//           <div style={{
//             padding: 16,
//             background: correctCount === totalTested ? '#d1fae5' : '#fef3c7',
//             border: `3px solid ${correctCount === totalTested ? '#10b981' : '#f59e0b'}`,
//             borderRadius: 8,
//             marginTop: 12
//           }}>
//             <strong>Test Results: {correctCount}/{totalTested} correct ({accuracy}% accuracy)</strong>
//           </div>
//         )}
//       </div>

//       {/* Controls */}
//       <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
//         <button
//           onClick={runTest}
//           disabled={!initialized || analyzing}
//           style={{
//             padding: '10px 20px',
//             background: initialized ? '#8b5cf6' : '#9ca3af',
//             color: 'white',
//             border: 'none',
//             borderRadius: 6,
//             cursor: initialized ? 'pointer' : 'not-allowed',
//             fontWeight: 600
//           }}
//         >
//           {analyzing ? (analysisStatus || 'Analyzing...') : 'Run Current Test'}
//         </button>

//         <button
//           onClick={runAllTests}
//           disabled={!initialized || analyzing}
//           style={{
//             padding: '10px 20px',
//             background: initialized ? '#10b981' : '#9ca3af',
//             color: 'white',
//             border: 'none',
//             borderRadius: 6,
//             cursor: initialized ? 'pointer' : 'not-allowed',
//             fontWeight: 600
//           }}
//         >
//           Run All Tests
//         </button>

//         <select
//           value={currentTest}
//           onChange={(e) => setCurrentTest(Number(e.target.value))}
//           style={{
//             padding: '10px',
//             borderRadius: 6,
//             border: '2px solid #e5e7eb',
//             fontWeight: 600
//           }}
//         >
//           {TEST_POSITIONS.map((pos, idx) => (
//             <option key={idx} value={idx}>
//               {idx + 1}. {pos.name}
//             </option>
//           ))}
//         </select>

//         <span style={{ alignSelf: 'center', color: '#666', marginLeft: 'auto' }}>
//           Engine: {initialized ? '✓ Ready' : '⏳ Loading...'}
//         </span>
//       </div>

//       {/* Main Content */}
//       <div style={{ display: 'grid', gridTemplateColumns: '560px 1fr', gap: 20 }}>
//         {/* Board */}
//         <div>
//           <InteractiveBoard
//             fen={position.fen}
//             onMove={() => { }}
//             flipped={false}
//             bestMove={bestMoveResult?.move}
//           />
//         </div>

//         {/* Info Panel */}
//         <div>
//           {/* Position Info */}
//           <div style={{
//             padding: 16,
//             background: '#f9fafb',
//             borderRadius: 12,
//             border: '2px solid #e5e7eb',
//             marginBottom: 16
//           }}>
//             <h3 style={{ margin: '0 0 12px 0' }}>{position.name}</h3>
//             <p style={{ margin: '0 0 8px 0', color: '#666' }}>{position.description}</p>
//             <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>
//               FEN: {position.fen}
//             </div>
//           </div>

//           {/* Expected Results */}
//           <div style={{
//             padding: 16,
//             background: '#eff6ff',
//             borderRadius: 12,
//             border: '2px solid #3b82f6',
//             marginBottom: 16
//           }}>
//             <h4 style={{ margin: '0 0 12px 0' }}>Expected</h4>
//             {position.testMove && (
//               <div style={{ marginBottom: 8 }}>
//                 <strong>Test Move:</strong> {position.testMove}
//               </div>
//             )}
//             <div style={{ marginBottom: 8 }}>
//               <strong>Best Move:</strong> {position.bestMove}
//             </div>
//             <div>
//               <strong>Expected Classification:</strong>{' '}
//               <span style={{
//                 padding: '4px 8px',
//                 background: '#3b82f6',
//                 color: 'white',
//                 borderRadius: 4,
//                 fontWeight: 600
//               }}>
//                 {position.expectedClass}
//               </span>
//             </div>
//           </div>

//           {/* Analysis Results */}
//           {bestMoveResult && (
//             <div style={{
//               padding: 16,
//               background: '#f0fdf4',
//               borderRadius: 12,
//               border: '2px solid #10b981',
//               marginBottom: 16
//             }}>
//               <h4 style={{ margin: '0 0 12px 0' }}>Engine Analysis</h4>
//               <div style={{ marginBottom: 8 }}>
//                 <strong>Best Move:</strong> {bestMoveResult.move}
//               </div>
//               <div style={{ marginBottom: 8 }}>
//                 <strong>Evaluation:</strong>{' '}
//                 {bestMoveResult.eval?.type === 'mate'
//                   ? `Mate in ${bestMoveResult.eval.value}`
//                   : `${(bestMoveResult.eval?.value / 100).toFixed(2)}`
//                 }
//               </div>
//               {bestMoveResult.lines && (
//                 <div>
//                   <strong>Top Lines:</strong>
//                   {bestMoveResult.lines.slice(0, 3).map((line, idx) => (
//                     <div key={idx} style={{
//                       fontFamily: 'monospace',
//                       fontSize: 12,
//                       marginTop: 4,
//                       padding: 4,
//                       background: 'white',
//                       borderRadius: 4
//                     }}>
//                       {idx + 1}. {line.pv.slice(0, 3).join(' ')} ({(line.cp / 100).toFixed(2)})
//                     </div>
//                   ))}
//                 </div>
//               )}
//             </div>
//           )}

//           {/* Classification Result */}
//           {classification && (
//             <div style={{
//               padding: 16,
//               background: results[currentTest]?.match ? '#d1fae5' : '#fee2e2',
//               borderRadius: 12,
//               border: `3px solid ${classification.color}`,
//               marginBottom: 16
//             }}>
//               <h4 style={{ margin: '0 0 12px 0' }}>Classification Result</h4>
//               <div style={{
//                 fontSize: 24,
//                 fontWeight: 700,
//                 color: classification.color,
//                 marginBottom: 8
//               }}>
//                 {classification.label}
//               </div>
//               <div style={{ marginBottom: 4 }}>
//                 <strong>Centipawn Loss:</strong> {classification.cpLoss.toFixed(0)}
//               </div>
//               {results[currentTest] && (
//                 <div style={{
//                   marginTop: 12,
//                   padding: 8,
//                   background: results[currentTest].match ? '#10b981' : '#ef4444',
//                   color: 'white',
//                   borderRadius: 4,
//                   fontWeight: 600
//                 }}>
//                   {results[currentTest].match ? '✓ CORRECT' : '✗ INCORRECT'}
//                   {!results[currentTest].match && (
//                     <div style={{ fontSize: 12, marginTop: 4 }}>
//                       Expected: {position.expectedClass}
//                     </div>
//                   )}
//                 </div>
//               )}
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Results Table */}
//       {results.length > 0 && (
//         <div style={{ marginTop: 30 }}>
//           <h3>Test Results Summary</h3>
//           <table style={{
//             width: '100%',
//             borderCollapse: 'collapse',
//             background: 'white',
//             border: '1px solid #e5e7eb'
//           }}>
//             <thead>
//               <tr style={{ background: '#f9fafb' }}>
//                 <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Position</th>
//                 <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Test Move</th>
//                 <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Best Move</th>
//                 <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Expected</th>
//                 <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Actual</th>
//                 <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>CP Loss</th>
//                 <th style={{ padding: 12, textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Result</th>
//               </tr>
//             </thead>
//             <tbody>
//               {results.map((result, idx) => result && (
//                 <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
//                   <td style={{ padding: 12 }}>{result.position}</td>
//                   <td style={{ padding: 12, fontFamily: 'monospace' }}>{result.testMove || '-'}</td>
//                   <td style={{ padding: 12, fontFamily: 'monospace' }}>{result.bestMove}</td>
//                   <td style={{ padding: 12 }}>
//                     <span style={{
//                       padding: '2px 6px',
//                       background: '#e5e7eb',
//                       borderRadius: 4,
//                       fontSize: 12
//                     }}>
//                       {result.expected}
//                     </span>
//                   </td>
//                   <td style={{ padding: 12 }}>
//                     <span style={{
//                       padding: '2px 6px',
//                       background: result.match ? '#d1fae5' : '#fee2e2',
//                       color: result.match ? '#065f46' : '#991b1b',
//                       borderRadius: 4,
//                       fontSize: 12,
//                       fontWeight: 600
//                     }}>
//                       {result.actual}
//                     </span>
//                   </td>
//                   <td style={{ padding: 12, fontFamily: 'monospace' }}>{result.cpLoss.toFixed(0)}</td>
//                   <td style={{ padding: 12, textAlign: 'center' }}>
//                     <span style={{
//                       padding: '4px 8px',
//                       background: result.match ? '#10b981' : '#ef4444',
//                       color: 'white',
//                       borderRadius: 4,
//                       fontWeight: 600,
//                       fontSize: 12
//                     }}>
//                       {result.match ? '✓' : '✗'}
//                     </span>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       )}
//     </div>
//   );
// }



import { useState, useEffect } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { useStockfish } from './hooks/useStockfish';
import InteractiveBoard from './components/InteractiveBoard';
import { evalForRoot, normalizeLines, classifyMove, isOpeningPhase } from './utils/moveClassification';

/* ---------- Test positions (same spirit as yours) ---------- */
const TEST_POSITIONS = [
  { name: "Obvious Best Move - Simple Capture", fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", testMove: "g1f3", expected: "best" },
  { name: "Inaccuracy - Slow Move", fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", testMove: "a2a3", expected: "inaccuracy" },
  { name: "Typical Blunder - Queen Hangs", fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 0 3", testMove: "f6g4", expected: "blunder" },
  { name: "Forced King Move", fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 3", testMove: "f6e4", expected: "best" },
  { name: "Back Rank Mate Available", fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", testMove: "e1e8", expected: "best" },
  { name: "Excellent Move - Fork", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", testMove: "f3g5", expected: "excellent" },
  { name: "Quiet Positional Move", fen: "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq - 0 4", testMove: "f8e7", expected: "best" },
  { name: "Complex Middlegame", fen: "r1bq1rk1/pp3pbp/2np1np1/2p1p3/2P1P3/2NPBNP1/PP3PBP/R2QK2R w KQ - 0 10", testMove: "d1d2", expected: "best" },
  { name: "Endgame - Pawn Push", fen: "8/5pk1/6p1/8/3K4/8/5P2/8 w - - 0 1", testMove: "f2f4", expected: "best" },
  { name: "Mistake - Bad Development", fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", testMove: "h2h4", expected: "mistake" },
];

export default function TestClassification() {
  const { initialized, analyze } = useStockfish();

  const [currentTest, setCurrentTest] = useState(0);
  const [results, setResults] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [rootBest, setRootBest] = useState(null);

  const position = TEST_POSITIONS[currentTest];

  useEffect(() => {
    setAnalysisStatus('');
    setRootBest(null);
  }, [currentTest]);

  const runTest = async () => {
    if (!initialized) {
      alert('Engine not initialized yet!');
      return;
    }

    setAnalyzing(true);
    try {
      const depth = 20; // bump to 22 for endgames if you want
      const rootChess = new Chess(position.fen);
      const rootTurn = rootChess.turn();

      // Check if this is an opening position (book move detection)
      const isBook = isOpeningPhase(position.fen);

      // 1) Root MultiPV (no pushes)
      setAnalysisStatus('Analyzing root...');
      const root = await analyze(position.fen, { depth, multiPV: 3 });
      const lines = normalizeLines(root.lines, rootTurn);
      const bestMove = lines[0]?.pv?.[0];
      setRootBest(bestMove);

      // diagnostics
      const pv2Gap = lines.length > 1 ? (lines[0].scoreForRoot - lines[1].scoreForRoot) : 0;
      const forced = pv2Gap >= 200;

      // 2) Score OUR move at the root using searchmoves
      setAnalysisStatus(`Scoring ${position.testMove} from root...`);
      const ourRoot = await analyze(position.fen, {
        depth,
        multiPV: 1,
        searchMoves: [position.testMove],
      });
      const ourRootScore = evalForRoot(rootTurn, rootTurn, ourRoot.evaluation);

      // 3) Score BEST move at the root using searchmoves
      setAnalysisStatus(`Scoring ${bestMove} from root...`);
      const bestRoot = await analyze(position.fen, {
        depth,
        multiPV: 1,
        searchMoves: [bestMove],
      });
      const bestRootScore = evalForRoot(rootTurn, rootTurn, bestRoot.evaluation);

      // 4) Final CP-loss from root perspective
      const cpLoss = Math.max(0, bestRootScore - ourRootScore);

      // Top-N / epsilon rules (tightened epsilon to 10)
      const eps = 10;
      const inTop3 = lines.slice(0, 3).some(
        l => l.pv[0]?.toLowerCase() === position.testMove.toLowerCase()
      );
      const ourLine = lines.find(
        l => l.pv[0]?.toLowerCase() === position.testMove.toLowerCase()
      );
      const withinEps = ourLine ? (lines[0].scoreForRoot - ourLine.scoreForRoot) <= eps : false;

      const missedMate =
        (lines[0]?.evaluation?.type === 'mate') &&
        (ourRoot.evaluation?.type !== 'mate');

      // Count pieces for brilliant detection and game phase
      const pieceCount = (position.fen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;

      // Brilliant move detection: ONLY move in a critical position (extremely forced)
      // Requires: very large gap to 2nd move (500+), best move, and not opening/endgame
      const isBrilliant =
        forced &&
        pv2Gap >= 500 &&
        cpLoss === 0 &&
        !isBook &&
        pieceCount >= 20 &&
        pieceCount <= 30;

      const result = classifyMove(cpLoss, {
        inTop3,
        withinEps,
        forced,
        missedMate,
        isBook: isBook && cpLoss <= 10, // Only mark as book if good move
        isBrilliant
      });

      setResults(prev => {
        const copy = [...prev];
        copy[currentTest] = {
          position: position.name,
          testMove: position.testMove,
          bestMove,
          expected: position.expected,
          actual: result.classification,
          cpLoss,
          match:
            position.expected === result.classification ||
            (position.expected === 'excellent' && result.classification === 'best') ||
            (position.expected === 'best' && result.classification === 'excellent'),
        };
        return copy;
      });
    } catch (e) {
      console.error(e);
      alert(e.message);
    } finally {
      setAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const runAllTests = async () => {
    for (let i = 0; i < TEST_POSITIONS.length; i++) {
      setCurrentTest(i);
      // small delay helps UI & worker flush
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 120));
      // eslint-disable-next-line no-await-in-loop
      await runTest();
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 250));
    }
  };

  const correct = results.filter(r => r?.match).length;
  const total = results.filter(Boolean).length;
  const acc = total ? ((correct / total) * 100).toFixed(1) : 0;

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: '0 auto' }}>
      <h2>Move Classification Test Suite</h2>
      <p style={{ color: '#666' }}>
        Evaluating Stockfish classification accuracy across known chess positions
      </p>

      {total > 0 && (
        <div
          style={{
            padding: 16,
            background: correct === total ? '#d1fae5' : '#fef3c7',
            border: `2px solid ${correct === total ? '#10b981' : '#f59e0b'}`,
            borderRadius: 8,
            margin: '10px 0',
          }}
        >
          ✅ Correct: {correct}/{total} ({acc}%)
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, margin: '12px 0' }}>
        <button
          onClick={runTest}
          disabled={!initialized || analyzing}
          style={{ padding: '8px 16px', background: '#8b5cf6', color: 'white', border: 0, borderRadius: 6 }}
        >
          {analyzing ? (analysisStatus || 'Analyzing...') : 'Run Current'}
        </button>
        <button
          onClick={runAllTests}
          disabled={!initialized || analyzing}
          style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 0, borderRadius: 6 }}
        >
          Run All
        </button>

        <select
          value={currentTest}
          onChange={e => setCurrentTest(+e.target.value)}
          style={{ padding: 8, borderRadius: 6 }}
        >
          {TEST_POSITIONS.map((p, i) => (
            <option key={i} value={i}>
              {i + 1}. {p.name}
            </option>
          ))}
        </select>

        <span style={{ marginLeft: 'auto' }}>
          Engine: {initialized ? '🟢 Ready' : '⏳ Loading...'}
        </span>
      </div>

      {/* Board + minimal info */}
      <div style={{ display: 'grid', gridTemplateColumns: '560px 1fr', gap: 20 }}>
        <div>
          <InteractiveBoard fen={position.fen} bestMove={rootBest} />
        </div>

        {/* Summary table (same as yours, compact) */}
        <div>
          <h3>Results</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', border: '1px solid #e5e7eb' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: 10, textAlign: 'left' }}>Position</th>
                <th style={{ padding: 10 }}>Test Move</th>
                <th style={{ padding: 10 }}>Best Move</th>
                <th style={{ padding: 10 }}>Expected</th>
                <th style={{ padding: 10 }}>Actual</th>
                <th style={{ padding: 10 }}>CP Loss</th>
                <th style={{ padding: 10 }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {TEST_POSITIONS.map((p, idx) => {
                const r = results[idx];
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: 10, textAlign: 'left' }}>{p.name}</td>
                    <td style={{ padding: 10, fontFamily: 'monospace' }}>{r?.testMove || p.testMove}</td>
                    <td style={{ padding: 10, fontFamily: 'monospace' }}>{r?.bestMove || '-'}</td>
                    <td style={{ padding: 10 }}>{p.expected}</td>
                    <td style={{ padding: 10 }}>{r?.actual || '-'}</td>
                    <td style={{ padding: 10 }}>{r ? r.cpLoss.toFixed(0) : '-'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      {r ? (r.match ? '✅' : '❌') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
