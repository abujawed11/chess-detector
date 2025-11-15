// import { useState, useCallback, useRef, useEffect } from 'react';
// import { Chess } from 'chess.js/dist/esm/chess.js';
// import { useStockfish } from './hooks/useStockfish';
// import InteractiveBoard from './components/InteractiveBoard';
// import EvaluationBar from './components/EvaluationBar';
// // REMOVED: Old classification imports (now using backend)
// import { evaluateMove, getMoveBadge, getMoveExplanation } from './services/evaluationService';
// import { parsePGN } from './utils/pgnParser';

// /**
//  * PGN Analysis Component
//  * Upload and analyze complete chess games with move-by-move classification
//  */
// export default function PGNAnalysis() {
//   const [pgnText, setPgnText] = useState('');
//   const [game, setGame] = useState(null);
//   const [moves, setMoves] = useState([]);
//   const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
//   const [currentPosition, setCurrentPosition] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
//   const [isAnalyzing, setIsAnalyzing] = useState(false);
//   const [analyzedMoves, setAnalyzedMoves] = useState([]);
//   const [analysisProgress, setAnalysisProgress] = useState(0);
//   const [flipped, setFlipped] = useState(false);
//   const [gameInfo, setGameInfo] = useState(null);
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [playSpeed, setPlaySpeed] = useState(1500); // milliseconds between moves
//   const fileInputRef = useRef(null);
//   const playIntervalRef = useRef(null);

//   const { initialized, analyze } = useStockfish();

//   // Parse PGN and extract game info
//   const parsePGNText = useCallback((pgn) => {
//     try {
//       const parsedData = parsePGN(pgn);

//       if (!parsedData) {
//         alert('Invalid PGN format. Please check your file.');
//         return false;
//       }

//       const { headers, moves, chess } = parsedData;

//       setGameInfo({
//         white: headers.White || 'Unknown',
//         black: headers.Black || 'Unknown',
//         event: headers.Event || 'Unknown Event',
//         date: headers.Date || 'Unknown Date',
//         result: headers.Result || '*',
//         whiteElo: headers.WhiteElo || '?',
//         blackElo: headers.BlackElo || '?'
//       });

//       setGame(chess);
//       setMoves(moves);
//       setCurrentMoveIndex(-1);
//       setCurrentPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
//       setAnalyzedMoves([]);
//       return true;
//     } catch (error) {
//       console.error('Error parsing PGN:', error);
//       alert('Invalid PGN format. Please check your file.');
//       return false;
//     }
//   }, []);

//   // Handle file upload
//   const handleFileUpload = useCallback((e) => {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     const reader = new FileReader();
//     reader.onload = (event) => {
//       const text = event.target.result;
//       setPgnText(text);
//       parsePGNText(text);
//     };
//     reader.readAsText(file);
//   }, [parsePGNText]);

//   // Handle paste PGN
//   const handlePastePGN = useCallback(() => {
//     if (pgnText.trim()) {
//       parsePGNText(pgnText);
//     }
//   }, [pgnText, parsePGNText]);

//   // Analyze all moves
//   const analyzeGame = useCallback(async () => {
//     if (!game || !initialized) return;

//     setIsAnalyzing(true);
//     setAnalysisProgress(0);
//     const analyzed = [];

//     try {
//       // Create fresh game for analysis
//       const analysisGame = new Chess();
//       const history = game.history({ verbose: true });

//       console.log(`🔍 Starting batch analysis of ${history.length} moves...`);
//       console.log(`⚡ Using depth 12 for faster analysis (avg ~5-10s per move)`);
//       console.log(`⏱️ Estimated time: ${Math.round(history.length * 8 / 60)} minutes`);

//       for (let i = 0; i < history.length; i++) {
//         const move = history[i];
//         const fen = analysisGame.fen();
//         const uciMove = move.from + move.to + (move.promotion || '');

//         console.log(`📊 Analyzing move ${i + 1}/${history.length}: ${move.san}`);

//         try {
//           // Use lower depth for batch analysis to prevent timeouts
//           // depth 12 is much faster (~5-10s per move) vs depth 18 (~30-40s per move)
//           const classification = await analyzeMoveClassification(
//             { analyze },
//             fen,
//             uciMove,
//             {
//               depth: 12,  // Reduced from 18 to prevent timeouts
//               epsilon: 10,
//               skipBrilliant: false  // Set to true to speed up further
//             }
//           );

//           analyzed.push({
//             ...move,
//             classification: classification.classification,
//             classificationLabel: classification.label,
//             color: classification.color,
//             cpLoss: classification.cpLoss,
//             evaluation: classification.engineEval,
//             isBrilliant: classification.isBrilliant,
//             isBrilliantV2: classification.isBrilliantV2,
//             brilliantAnalysis: classification.brilliantAnalysis
//           });

//           console.log(`✅ Move ${i + 1} classified as: ${classification.label} (CP loss: ${classification.cpLoss})`);
//         } catch (moveError) {
//           console.error(`❌ Failed to analyze move ${i + 1}:`, moveError);
//           // Add the move without analysis
//           analyzed.push({
//             ...move,
//             classification: 'unknown',
//             classificationLabel: 'Unknown',
//             color: '#9ca3af',
//             cpLoss: 0,
//             evaluation: null
//           });
//         }

//         // Apply the move for next iteration
//         analysisGame.move(move);

//         // Update progress
//         setAnalysisProgress(((i + 1) / history.length) * 100);
//       }

//       setAnalyzedMoves(analyzed);
//       console.log(`🎉 Analysis complete! Analyzed ${analyzed.length} moves.`);
//     } catch (error) {
//       console.error('Analysis error:', error);
//       alert(`Analysis failed: ${error.message}\n\nTry refreshing the page and analyzing again.`);
//     } finally {
//       setIsAnalyzing(false);
//     }
//   }, [game, initialized, analyze]);

//   // Navigate to specific move
//   const navigateToMove = useCallback((index) => {
//     if (!game) return;

//     const tempGame = new Chess();
//     const history = game.history({ verbose: true });

//     // Replay moves up to index
//     for (let i = 0; i <= index; i++) {
//       tempGame.move(history[i]);
//     }

//     setCurrentMoveIndex(index);
//     setCurrentPosition(tempGame.fen());
//   }, [game]);

//   // Navigation controls
//   const goToStart = useCallback(() => {
//     setCurrentMoveIndex(-1);
//     setCurrentPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
//   }, []);

//   const goToPrevious = useCallback(() => {
//     if (currentMoveIndex >= 0) {
//       if (currentMoveIndex === 0) {
//         goToStart();
//       } else {
//         navigateToMove(currentMoveIndex - 1);
//       }
//     }
//   }, [currentMoveIndex, navigateToMove, goToStart]);

//   const goToNext = useCallback(() => {
//     if (currentMoveIndex < moves.length - 1) {
//       navigateToMove(currentMoveIndex + 1);
//     }
//   }, [currentMoveIndex, moves.length, navigateToMove]);

//   const goToEnd = useCallback(() => {
//     if (moves.length > 0) {
//       navigateToMove(moves.length - 1);
//     }
//   }, [moves.length, navigateToMove]);

//   // Auto-play functionality
//   const togglePlay = useCallback(() => {
//     setIsPlaying(prev => !prev);
//   }, []);

//   const stopPlaying = useCallback(() => {
//     setIsPlaying(false);
//     if (playIntervalRef.current) {
//       clearInterval(playIntervalRef.current);
//       playIntervalRef.current = null;
//     }
//   }, []);

//   // Auto-play effect
//   useEffect(() => {
//     if (isPlaying) {
//       playIntervalRef.current = setInterval(() => {
//         setCurrentMoveIndex(prev => {
//           if (prev >= moves.length - 1) {
//             setIsPlaying(false);
//             return prev;
//           }
//           const nextIndex = prev + 1;
//           navigateToMove(nextIndex);
//           return nextIndex;
//         });
//       }, playSpeed);
//     } else {
//       if (playIntervalRef.current) {
//         clearInterval(playIntervalRef.current);
//         playIntervalRef.current = null;
//       }
//     }

//     return () => {
//       if (playIntervalRef.current) {
//         clearInterval(playIntervalRef.current);
//       }
//     };
//   }, [isPlaying, playSpeed, moves.length, navigateToMove]);

//   // Keyboard shortcuts
//   useEffect(() => {
//     const handleKeyPress = (e) => {
//       if (e.key === 'ArrowLeft') {
//         stopPlaying();
//         goToPrevious();
//       }
//       if (e.key === 'ArrowRight') {
//         stopPlaying();
//         goToNext();
//       }
//       if (e.key === 'Home') {
//         stopPlaying();
//         goToStart();
//       }
//       if (e.key === 'End') {
//         stopPlaying();
//         goToEnd();
//       }
//       if (e.key === ' ') {
//         e.preventDefault();
//         togglePlay();
//       }
//     };

//     window.addEventListener('keydown', handleKeyPress);
//     return () => window.removeEventListener('keydown', handleKeyPress);
//   }, [goToPrevious, goToNext, goToStart, goToEnd, stopPlaying, togglePlay]);

//   // Get classification color
//   const getClassificationColor = (classification) => {
//     const colors = {
//       brilliant: '#1baca6',
//       book: '#a88865',
//       best: '#9bc02a',
//       excellent: '#96bc4b',
//       good: '#96af8b',
//       inaccuracy: '#f0c15c',
//       mistake: '#e58f2a',
//       blunder: '#fa412d'
//     };
//     return colors[classification] || '#9ca3af';
//   };

//   // Calculate statistics
//   const getStats = () => {
//     if (analyzedMoves.length === 0) return null;

//     const stats = {
//       brilliant: 0,
//       book: 0,
//       best: 0,
//       excellent: 0,
//       good: 0,
//       inaccuracy: 0,
//       mistake: 0,
//       blunder: 0
//     };

//     analyzedMoves.forEach(move => {
//       if (stats.hasOwnProperty(move.classification)) {
//         stats[move.classification]++;
//       }
//     });

//     const totalCpLoss = analyzedMoves.reduce((sum, m) => sum + (m.cpLoss || 0), 0);
//     const avgCpLoss = (totalCpLoss / analyzedMoves.length).toFixed(1);

//     return { ...stats, avgCpLoss };
//   };

//   const stats = getStats();

//   // Upload view
//   if (!game) {
//     return (
//       <div className="mx-auto max-w-4xl p-6">
//         <div className="mb-8">
//           <h2 className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-3xl font-bold text-transparent">
//             PGN Game Analysis
//           </h2>
//           <p className="mt-2 text-slate-700">
//             Upload a PGN file or paste game notation to analyze every move with Chess.com-style classification
//           </p>
//         </div>

//         {/* Upload Section */}
//         <div className="rounded-xl border-2 border-dashed border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-12 text-center shadow-sm">
//           <div className="mb-6 text-6xl">📄</div>
          
//           <button
//             onClick={() => fileInputRef.current?.click()}
//             className="mb-4 rounded-lg bg-purple-600 px-8 py-3 text-lg font-semibold text-white transition hover:bg-purple-700"
//           >
//             Choose PGN File
//           </button>
          
//           <input
//             ref={fileInputRef}
//             type="file"
//             accept=".pgn"
//             onChange={handleFileUpload}
//             className="hidden"
//           />

//           <p className="text-sm text-slate-500">or paste PGN below</p>
//         </div>

//         {/* Paste Section */}
//         <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
//           <label className="mb-2 block text-sm font-semibold text-slate-700">
//             Paste PGN Notation
//           </label>
//           <textarea
//             value={pgnText}
//             onChange={(e) => setPgnText(e.target.value)}
//             placeholder='[Event "World Championship"]
// [White "Player 1"]
// [Black "Player 2"]

// 1. e4 e5 2. Nf3 Nc6 3. Bb5...'
//             className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
//             rows={10}
//           />
          
//           <button
//             onClick={handlePastePGN}
//             disabled={!pgnText.trim()}
//             className="mt-4 rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
//           >
//             Load Game
//           </button>
//         </div>

//         {/* Engine Status */}
//         <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
//           <div className="flex items-center gap-2 text-sm">
//             <strong>Engine Status:</strong>
//             {initialized ? (
//               <span className="text-green-600">✓ Ready</span>
//             ) : (
//               <span className="text-amber-600">⏳ Initializing...</span>
//             )}
//           </div>
//         </div>
//       </div>
//     );
//   }

//   // Analysis view
//   return (
//     <div className="mx-auto max-w-[1600px] bg-gradient-to-br from-slate-50 to-blue-50 p-5">
//       {/* Header with game info */}
//       <div className="mb-4 rounded-xl border border-blue-200 bg-gradient-to-r from-white to-blue-50 p-6 shadow-md">
//         <div className="mb-4 flex items-start justify-between">
//           <div>
//             <h2 className="text-2xl font-bold text-slate-900">{gameInfo?.event}</h2>
//             <p className="text-sm text-slate-600">{gameInfo?.date}</p>
//           </div>
//           <button
//             onClick={() => {
//               stopPlaying();
//               setGame(null);
//               setPgnText('');
//               setMoves([]);
//               setAnalyzedMoves([]);
//               setCurrentMoveIndex(-1);
//             }}
//             className="rounded-lg bg-gradient-to-r from-slate-100 to-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:from-slate-200 hover:to-slate-300"
//           >
//             📁 Load New Game
//           </button>
//         </div>

//         <div className="grid grid-cols-2 gap-4">
//           <div className="rounded-lg bg-white/80 p-4 shadow-sm">
//             <div className="mb-1 text-xs font-semibold uppercase text-slate-500">White</div>
//             <div className="text-lg font-bold text-slate-900">
//               {gameInfo?.white}
//               {gameInfo?.whiteElo !== '?' && (
//                 <span className="ml-2 text-sm font-normal text-slate-600">
//                   ({gameInfo?.whiteElo})
//                 </span>
//               )}
//             </div>
//           </div>
//           <div className="rounded-lg bg-white/80 p-4 shadow-sm">
//             <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Black</div>
//             <div className="text-lg font-bold text-slate-900">
//               {gameInfo?.black}
//               {gameInfo?.blackElo !== '?' && (
//                 <span className="ml-2 text-sm font-normal text-slate-600">
//                   ({gameInfo?.blackElo})
//                 </span>
//               )}
//             </div>
//           </div>
//         </div>

//         <div className="mt-4 text-center text-xl font-bold text-slate-700">
//           Result: {gameInfo?.result}
//         </div>
//       </div>

//       {/* Analysis Button */}
//       {analyzedMoves.length === 0 && !isAnalyzing && (
//         <div className="mb-4 rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-6 text-center shadow-md">
//           <p className="mb-2 text-lg font-semibold text-slate-800">
//             Ready to analyze <strong className="text-purple-600">{moves.length}</strong> moves
//           </p>
//           <p className="mb-4 text-sm text-slate-700">
//             ⏱️ Estimated time: <strong className="text-purple-600">{Math.round(moves.length * 8 / 60)}-{Math.round(moves.length * 12 / 60)} minutes</strong> (using depth 12 for speed)
//           </p>
//           <button
//             onClick={analyzeGame}
//             disabled={!initialized}
//             className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-3 text-lg font-bold text-white shadow-lg transition hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400"
//           >
//             {initialized ? '🔍 Start Analysis' : '⏳ Waiting for Engine...'}
//           </button>
//           <p className="mt-3 text-xs font-medium text-slate-600">
//             💡 Tip: Keep this tab active for best performance
//           </p>
//         </div>
//       )}

//       {/* Analysis Progress */}
//       {isAnalyzing && (
//         <div className="mb-4 rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-6 shadow-md">
//           <div className="mb-2 flex items-center justify-between">
//             <span className="font-bold text-slate-800">
//               🔍 Analyzing game... ({Math.round(analysisProgress / 100 * moves.length)}/{moves.length} moves)
//             </span>
//             <span className="text-sm font-semibold text-purple-600">{Math.round(analysisProgress)}%</span>
//           </div>
//           <div className="h-3 overflow-hidden rounded-full bg-white shadow-inner">
//             <div
//               className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
//               style={{ width: `${analysisProgress}%` }}
//             />
//           </div>
//           <p className="mt-2 text-xs font-medium text-slate-700">
//             ⚡ This may take a few minutes. Check console (F12) for detailed progress.
//           </p>
//         </div>
//       )}

//       {/* Statistics */}
//       {stats && (
//         <div className="mb-4 rounded-xl border border-blue-200 bg-gradient-to-r from-white to-blue-50 p-6 shadow-md">
//           <h3 className="mb-4 text-lg font-bold text-slate-900">📊 Game Statistics</h3>
//           <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-9">
//             {Object.entries(stats).map(([key, value]) => {
//               if (key === 'avgCpLoss') {
//                 return (
//                   <div key={key} className="rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 p-3 text-center shadow-sm">
//                     <div className="text-2xl font-bold text-slate-900">{value}</div>
//                     <div className="text-xs font-semibold text-slate-600">Avg Loss</div>
//                   </div>
//                 );
//               }
//               return (
//                 <div
//                   key={key}
//                   className="rounded-lg p-3 text-center shadow-sm"
//                   style={{ backgroundColor: getClassificationColor(key) + '30' }}
//                 >
//                   <div className="text-2xl font-bold" style={{ color: getClassificationColor(key) }}>
//                     {value}
//                   </div>
//                   <div className="text-xs font-semibold capitalize text-slate-700">{key}</div>
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       )}

//       {/* Main Board and Analysis */}
//       <div className="grid gap-5 lg:grid-cols-[1fr_450px]">
//         {/* Left: Board */}
//         <div>
//           <div className="mb-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm">
//             <div className="relative">
//               <InteractiveBoard
//                 fen={currentPosition}
//                 onMove={() => {}}
//                 bestMove={null}
//                 flipped={flipped}
//               />

//               {/* Move Classification Overlay */}
//               {currentMoveIndex >= 0 && analyzedMoves[currentMoveIndex] && (
//                 <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
//                   <div className="flex items-center gap-3">
//                     <span className="text-2xl font-bold text-slate-700">
//                       {moves[currentMoveIndex]?.san}
//                     </span>
//                     <div
//                       className="rounded-md px-3 py-1.5 text-sm font-bold text-white shadow-md"
//                       style={{ backgroundColor: analyzedMoves[currentMoveIndex].color }}
//                     >
//                       {analyzedMoves[currentMoveIndex].classificationLabel}
//                     </div>
//                   </div>
//                   {analyzedMoves[currentMoveIndex].cpLoss > 0 && (
//                     <span className="text-sm font-semibold text-slate-600">
//                       -{analyzedMoves[currentMoveIndex].cpLoss} cp
//                     </span>
//                   )}
//                 </div>
//               )}
//             </div>

//             {/* Board Controls */}
//             <div className="mt-6 space-y-3">
//               {/* Playback Controls */}
//               <div className="flex items-center justify-center gap-2">
//                 <button
//                   onClick={goToStart}
//                   disabled={currentMoveIndex === -1}
//                   className="rounded-lg bg-slate-100 p-3 font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
//                   title="Start (Home)"
//                 >
//                   ⏮
//                 </button>
//                 <button
//                   onClick={() => { stopPlaying(); goToPrevious(); }}
//                   disabled={currentMoveIndex === -1}
//                   className="rounded-lg bg-slate-100 p-3 font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
//                   title="Previous (←)"
//                 >
//                   ◀
//                 </button>
//                 <button
//                   onClick={togglePlay}
//                   disabled={moves.length === 0}
//                   className="rounded-lg bg-green-500 px-5 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-slate-300"
//                   title="Play/Pause (Space)"
//                 >
//                   {isPlaying ? '⏸' : '▶'}
//                 </button>
//                 <button
//                   onClick={() => { stopPlaying(); goToNext(); }}
//                   disabled={currentMoveIndex >= moves.length - 1}
//                   className="rounded-lg bg-slate-100 p-3 font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
//                   title="Next (→)"
//                 >
//                   ▶
//                 </button>
//                 <button
//                   onClick={goToEnd}
//                   disabled={currentMoveIndex >= moves.length - 1}
//                   className="rounded-lg bg-slate-100 p-3 font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
//                   title="End (End)"
//                 >
//                   ⏭
//                 </button>
//                 <div className="ml-2 h-8 w-px bg-slate-300" />
//                 <button
//                   onClick={() => setFlipped(!flipped)}
//                   className="rounded-lg bg-slate-100 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-200"
//                 >
//                   🔄 Flip
//                 </button>
//               </div>

//               {/* Speed Control */}
//               <div className="flex items-center justify-center gap-3">
//                 <span className="text-xs font-medium text-slate-600">Speed:</span>
//                 {[
//                   { label: '0.5x', value: 3000 },
//                   { label: '1x', value: 1500 },
//                   { label: '2x', value: 750 },
//                   { label: '3x', value: 500 }
//                 ].map(speed => (
//                   <button
//                     key={speed.value}
//                     onClick={() => setPlaySpeed(speed.value)}
//                     className={`rounded px-3 py-1 text-xs font-semibold transition ${
//                       playSpeed === speed.value
//                         ? 'bg-blue-500 text-white'
//                         : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
//                     }`}
//                   >
//                     {speed.label}
//                   </button>
//                 ))}
//               </div>

//               <div className="text-center text-sm font-medium text-slate-600">
//                 Move {currentMoveIndex + 1} of {moves.length}
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Right: Move List */}
//         <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
//           <h3 className="mb-4 text-lg font-bold text-slate-800">Move History</h3>

//           <div className="max-h-[650px] space-y-1 overflow-y-auto pr-2">
//             {moves.map((move, index) => {
//               const isWhite = index % 2 === 0;
//               const moveNumber = Math.floor(index / 2) + 1;
//               const analyzed = analyzedMoves[index];
//               const isCurrent = index === currentMoveIndex;

//               return (
//                 <div key={index}>
//                   {isWhite && (
//                     <div className="mt-3 mb-1 flex items-center gap-2">
//                       <div className="flex h-6 w-10 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-700">
//                         {moveNumber}
//                       </div>
//                       <div className="h-px flex-1 bg-slate-200" />
//                     </div>
//                   )}

//                   <button
//                     onClick={() => { stopPlaying(); navigateToMove(index); }}
//                     className={`
//                       w-full rounded-lg px-3 py-2.5 text-left transition
//                       ${isCurrent
//                         ? 'bg-blue-500 text-white shadow-md ring-2 ring-blue-300'
//                         : analyzed
//                           ? 'bg-white hover:bg-slate-100 border border-slate-200'
//                           : 'bg-slate-50 hover:bg-slate-100'
//                       }
//                     `}
//                   >
//                     <div className="flex items-center justify-between gap-2">
//                       <div className="flex items-center gap-2">
//                         <span className={`text-xs font-medium ${isCurrent ? 'text-blue-100' : 'text-slate-500'}`}>
//                           {isWhite ? 'White' : 'Black'}
//                         </span>
//                         <span className={`text-base font-bold ${isCurrent ? 'text-white' : 'text-slate-900'}`}>
//                           {move.san}
//                         </span>
//                       </div>
//                       {analyzed && (
//                         <div className="flex items-center gap-2">
//                           {analyzed.cpLoss > 0 && (
//                             <span className={`text-xs font-semibold ${isCurrent ? 'text-blue-100' : 'text-slate-600'}`}>
//                               -{analyzed.cpLoss}
//                             </span>
//                           )}
//                           <span
//                             className="rounded-md px-2 py-1 text-xs font-bold text-white shadow-sm"
//                             style={{ backgroundColor: isCurrent ? 'rgba(255,255,255,0.3)' : analyzed.color }}
//                           >
//                             {analyzed.classificationLabel}
//                           </span>
//                         </div>
//                       )}
//                     </div>
//                   </button>
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       </div>

//       {/* Keyboard shortcuts help */}
//       <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
//         <span className="font-bold text-blue-900">⌨️ Keyboard Shortcuts:</span>
//         <span className="ml-2 text-blue-700">
//           Space: Play/Pause | ← Previous | → Next | Home: Start | End: Last Move
//         </span>
//       </div>
//     </div>
//   );
// }





//--------------------------------------











import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { useStockfish } from './hooks/useStockfish';
import InteractiveBoard from './components/InteractiveBoard';
import EvaluationBar from './components/EvaluationBar';
import MoveExplanationCard from './components/MoveExplanationCard';
// REMOVED: Old classification imports (now using backend)
import { evaluateMove, getMoveBadge, getMoveExplanation } from './services/evaluationService';
import { parsePGN } from './utils/pgnParser';

/**
 * PGN Analysis Component (updated)
 * - No board overlay
 * - Move classification badge shown in the move history (like chess.com)
 */
export default function PGNAnalysis() {
  const [pgnText, setPgnText] = useState('');
  const [game, setGame] = useState(null);
  const [moves, setMoves] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [currentPosition, setCurrentPosition] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedMoves, setAnalyzedMoves] = useState([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [gameInfo, setGameInfo] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1500); // ms between moves
  const [moveBadge, setMoveBadge] = useState(null); // Badge overlay state
  const [lastMove, setLastMove] = useState(null); // { from: 'e2', to: 'e4' }

  const fileInputRef = useRef(null);
  const playIntervalRef = useRef(null);
  const listContainerRef = useRef(null);
  const badgeTimeoutRef = useRef(null);

  const { initialized, analyze } = useStockfish();

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getClassificationColor = (classification) => {
    const colors = {
      brilliant: '#1baca6',
      book: '#a88865',
      best: '#9bc02a',
      excellent: '#96bc4b',
      good: '#96af8b',
      miss: '#ffa500', // Orange - missed opportunity
      inaccuracy: '#f0c15c',
      mistake: '#e58f2a',
      blunder: '#fa412d',
      unknown: '#9ca3af'
    };
    return colors[classification || 'unknown'] || '#9ca3af';
  };

  const parsePGNText = useCallback((pgn) => {
    try {
      const parsedData = parsePGN(pgn);
      if (!parsedData) {
        alert('Invalid PGN format. Please check your file.');
        return false;
      }
      const { headers, moves, chess } = parsedData;

      setGameInfo({
        white: headers.White || 'Unknown',
        black: headers.Black || 'Unknown',
        event: headers.Event || 'Unknown Event',
        date: headers.Date || 'Unknown Date',
        result: headers.Result || '*',
        whiteElo: headers.WhiteElo || '?',
        blackElo: headers.BlackElo || '?'
      });

      setGame(chess);
      setMoves(moves);
      setCurrentMoveIndex(-1);
      setCurrentPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      setAnalyzedMoves([]);
      return true;
    } catch (e) {
      console.error('Error parsing PGN:', e);
      alert('Invalid PGN format. Please check your file.');
      return false;
    }
  }, []);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      setPgnText(text);
      parsePGNText(text);
    };
    reader.readAsText(file);
  }, [parsePGNText]);

  const handlePastePGN = useCallback(() => {
    if (pgnText.trim()) parsePGNText(pgnText);
  }, [pgnText, parsePGNText]);

  const analyzeGame = useCallback(async () => {
    if (!game || !initialized) return;
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    const analyzed = [];

    try {
      const analysisGame = new Chess();
      const history = game.history({ verbose: true });

      for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const fen = analysisGame.fen();
        const uciMove = move.from + move.to + (move.promotion || '');

        try {
          // Use backend evaluation service
          const evaluation = await evaluateMove(fen, uciMove, 12, 5);
          const badge = getMoveBadge(evaluation);

          analyzed.push({
            ...move,
            classification: evaluation.label.toLowerCase(),
            classificationLabel: evaluation.label,
            color: badge.color,
            cpLoss: evaluation.cpl || 0,
            evaluation: evaluation.evalAfter,
            isBrilliant: evaluation.label === 'Brilliant',
            isBrilliantV2: evaluation.label === 'Brilliant' || evaluation.label === 'Great',
            brilliantAnalysis: evaluation.brilliantInfo || null
          });
        } catch (err) {
          console.error(`❌ Failed to analyze move ${i + 1}`, err);
          analyzed.push({
            ...move,
            classification: 'unknown',
            classificationLabel: 'Unknown',
            color: '#9ca3af',
            cpLoss: 0,
            evaluation: null
          });
        }

        analysisGame.move(move);
        setAnalysisProgress(((i + 1) / history.length) * 100);
      }

      setAnalyzedMoves(analyzed);
    } catch (error) {
      console.error('Analysis error:', error);
      alert(`Analysis failed: ${error.message}\n\nTry refreshing the page and analyzing again.`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [game, initialized, analyze]);

  const navigateToMove = useCallback((index) => {
    if (!game) return;
    const tempGame = new Chess();
    const history = game.history({ verbose: true });
    for (let i = 0; i <= index; i++) tempGame.move(history[i]);
    setCurrentMoveIndex(index);
    setCurrentPosition(tempGame.fen());

    // Set last move squares for highlighting
    const currentMove = history[index];
    if (currentMove) {
      setLastMove({
        from: currentMove.from,
        to: currentMove.to
      });
    }

    // Show move badge if this move has been analyzed
    const analyzedMove = analyzedMoves[index];
    if (analyzedMove && analyzedMove.classification) {
      // Clear any existing timeout
      if (badgeTimeoutRef.current) {
        clearTimeout(badgeTimeoutRef.current);
      }

      const badgeData = {
        square: history[index].to,
        classification: analyzedMove.classification,
        label: analyzedMove.classificationLabel
      };

      console.log('🎯 Showing badge:', badgeData);

      // Show badge on the destination square
      setMoveBadge(badgeData);

      // Keep badge visible for 5 seconds (longer duration)
      badgeTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Hiding badge after timeout');
        setMoveBadge(null);
      }, 5000);
    } else {
      console.log('❌ No badge - move not analyzed or no classification');
      setMoveBadge(null);
    }
  }, [game, analyzedMoves]);

  const goToStart = useCallback(() => {
    setCurrentMoveIndex(-1);
    setCurrentPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    setLastMove(null); // Clear move highlighting
    setMoveBadge(null); // Clear badge when going to start
    if (badgeTimeoutRef.current) {
      clearTimeout(badgeTimeoutRef.current);
    }
  }, []);
  const goToPrevious = useCallback(() => {
    if (currentMoveIndex >= 0) {
      if (currentMoveIndex === 0) goToStart();
      else navigateToMove(currentMoveIndex - 1);
    }
  }, [currentMoveIndex, navigateToMove, goToStart]);
  const goToNext = useCallback(() => {
    if (currentMoveIndex < moves.length - 1) navigateToMove(currentMoveIndex + 1);
  }, [currentMoveIndex, moves.length, navigateToMove]);
  const goToEnd = useCallback(() => {
    if (moves.length > 0) navigateToMove(moves.length - 1);
  }, [moves.length, navigateToMove]);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);
  const stopPlaying = useCallback(() => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentMoveIndex(prev => {
          if (prev >= moves.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          navigateToMove(next);
          return next;
        });
      }, playSpeed);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, playSpeed, moves.length, navigateToMove]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { stopPlaying(); goToPrevious(); }
      if (e.key === 'ArrowRight') { stopPlaying(); goToNext(); }
      if (e.key === 'Home') { stopPlaying(); goToStart(); }
      if (e.key === 'End') { stopPlaying(); goToEnd(); }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToPrevious, goToNext, goToStart, goToEnd, stopPlaying, togglePlay]);

  // Group moves into rows: # | White | Black
  const rows = useMemo(() => {
    const out = [];

    for (let i = 0; i < moves.length; i += 2) {
      const turn = Math.floor(i / 2) + 1;
      const w = moves[i];
      const wAnalyzed = analyzedMoves[i];
      const b = moves[i + 1];
      const bAnalyzed = analyzedMoves[i + 1];

      out.push({
        turn,
        white: w ? {
          index: i,
          san: w.san,
          badge: wAnalyzed?.classificationLabel,
          cpLoss: wAnalyzed?.cpLoss,
          color: wAnalyzed?.color
        } : undefined,
        black: b ? {
          index: i + 1,
          san: b.san,
          badge: bAnalyzed?.classificationLabel,
          cpLoss: bAnalyzed?.cpLoss,
          color: bAnalyzed?.color
        } : undefined
      });
    }
    return out;
  }, [moves, analyzedMoves]);

  // Auto-scroll current move into view (only within container, don't scroll page)
  useEffect(() => {
    if (!listContainerRef.current || currentMoveIndex < 0) return;

    const container = listContainerRef.current;
    const el = container.querySelector(`[data-move="${currentMoveIndex}"]`);

    if (!el) return;

    // Get positions
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    // Check if element is already visible
    const isVisible =
      elRect.top >= containerRect.top &&
      elRect.bottom <= containerRect.bottom;

    // Only scroll if element is not fully visible
    if (!isVisible) {
      const scrollTop = el.offsetTop - container.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
      container.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      });
    }
  }, [currentMoveIndex]);

  const getStats = () => {
    if (analyzedMoves.length === 0) return null;

    // Overall stats
    const overall = {
      brilliant: 0, book: 0, best: 0, excellent: 0, good: 0, miss: 0,
      inaccuracy: 0, mistake: 0, blunder: 0
    };

    // White stats (even indices: 0, 2, 4, ...)
    const white = {
      brilliant: 0, book: 0, best: 0, excellent: 0, good: 0, miss: 0,
      inaccuracy: 0, mistake: 0, blunder: 0
    };

    // Black stats (odd indices: 1, 3, 5, ...)
    const black = {
      brilliant: 0, book: 0, best: 0, excellent: 0, good: 0, miss: 0,
      inaccuracy: 0, mistake: 0, blunder: 0
    };

    analyzedMoves.forEach((m, index) => {
      if (overall.hasOwnProperty(m.classification)) {
        overall[m.classification] = overall[m.classification] + 1;

        if (index % 2 === 0) {
          // White move
          white[m.classification] = white[m.classification] + 1;
        } else {
          // Black move
          black[m.classification] = black[m.classification] + 1;
        }
      }
    });

    // Calculate average CP loss
    const totalCpLoss = analyzedMoves.reduce((s, m) => s + (m.cpLoss || 0), 0);
    const avgCpLoss = (totalCpLoss / analyzedMoves.length).toFixed(1);

    // Calculate average CP loss for each player
    let whiteCpLoss = 0;
    let whiteCount = 0;
    let blackCpLoss = 0;
    let blackCount = 0;

    analyzedMoves.forEach((m, index) => {
      if (index % 2 === 0) {
        whiteCpLoss += (m.cpLoss || 0);
        whiteCount++;
      } else {
        blackCpLoss += (m.cpLoss || 0);
        blackCount++;
      }
    });

    const whiteAvgCpLoss = whiteCount > 0 ? (whiteCpLoss / whiteCount).toFixed(1) : '0.0';
    const blackAvgCpLoss = blackCount > 0 ? (blackCpLoss / blackCount).toFixed(1) : '0.0';

    return {
      overall: { ...overall, avgCpLoss },
      white: { ...white, avgCpLoss: whiteAvgCpLoss },
      black: { ...black, avgCpLoss: blackAvgCpLoss }
    };
  };
  const stats = getStats();

  // ── Upload view ────────────────────────────────────────────────────────────
  if (!game) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-8">
          <h2 className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-3xl font-bold text-transparent">
            PGN Game Analysis
          </h2>
          <p className="mt-2 text-slate-700">
            Upload a PGN file or paste game notation to analyze every move with Chess.com-style classification
          </p>
        </div>

        <div className="rounded-xl border-2 border-dashed border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-12 text-center shadow-sm">
          <div className="mb-6 text-6xl">📄</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mb-4 rounded-lg bg-purple-600 px-8 py-3 text-lg font-semibold text-white transition hover:bg-purple-700"
          >
            Choose PGN File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pgn"
            onChange={handleFileUpload}
            className="hidden"
          />
          <p className="text-sm text-slate-500">or paste PGN below</p>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Paste PGN Notation
          </label>
          <textarea
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
            rows={10}
            placeholder='[Event "World Championship"] ...'
          />
          <button
            onClick={handlePastePGN}
            disabled={!pgnText.trim()}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Load Game
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <strong>Engine Status:</strong>{' '}
          {initialized ? <span className="text-green-600">✓ Ready</span> : <span className="text-amber-600">⏳ Initializing...</span>}
        </div>
      </div>
    );
  }

  // ── Analysis view ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1600px] bg-gradient-to-br from-slate-50 to-blue-50 p-5">
      {/* Header */}
      <div className="mb-4 rounded-xl border border-blue-200 bg-gradient-to-r from-white to-blue-50 p-6 shadow-md">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{gameInfo?.event}</h2>
            <p className="text-sm text-slate-600">{gameInfo?.date}</p>
          </div>
          <button
            onClick={() => {
              stopPlaying();
              setGame(null);
              setPgnText('');
              setMoves([]);
              setAnalyzedMoves([]);
              setCurrentMoveIndex(-1);
            }}
            className="rounded-lg bg-gradient-to-r from-slate-100 to-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:from-slate-200 hover:to-slate-300"
          >
            📁 Load New Game
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-white/80 p-4 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">White</div>
            <div className="text-lg font-bold text-slate-900">
              {gameInfo?.white}
              {gameInfo?.whiteElo !== '?' && <span className="ml-2 text-sm font-normal text-slate-600">({gameInfo?.whiteElo})</span>}
            </div>
          </div>
          <div className="rounded-lg bg-white/80 p-4 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Black</div>
            <div className="text-lg font-bold text-slate-900">
              {gameInfo?.black}
              {gameInfo?.blackElo !== '?' && <span className="ml-2 text-sm font-normal text-slate-600">({gameInfo?.blackElo})</span>}
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xl font-bold text-slate-700">
          Result: {gameInfo?.result}
        </div>
      </div>

      {/* Analyze CTA */}
      {analyzedMoves.length === 0 && !isAnalyzing && (
        <div className="mb-4 rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-6 text-center shadow-md">
          <p className="mb-2 text-lg font-semibold text-slate-800">
            Ready to analyze <strong className="text-purple-600">{moves.length}</strong> moves
          </p>
          <p className="mb-4 text-sm text-slate-700">
            ⏱️ Estimated time: <strong className="text-purple-600">{Math.round(moves.length * 8 / 60)}–{Math.round(moves.length * 12 / 60)} minutes</strong> (depth 12)
          </p>
          <button
            onClick={analyzeGame}
            disabled={!initialized}
            className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-3 text-lg font-bold text-white shadow-lg transition hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400"
          >
            {initialized ? '🔍 Start Analysis' : '⏳ Waiting for Engine...'}
          </button>
          <p className="mt-3 text-xs font-medium text-slate-600">
            💡 Tip: Keep this tab active for best performance
          </p>
        </div>
      )}

      {/* Progress */}
      {isAnalyzing && (
        <div className="mb-4 rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-6 shadow-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold text-slate-800">
              🔍 Analyzing game... ({Math.round(analysisProgress / 100 * moves.length)}/{moves.length} moves)
            </span>
            <span className="text-sm font-semibold text-purple-600">{Math.round(analysisProgress)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white shadow-inner">
            <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300" style={{ width: `${analysisProgress}%` }} />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-700">⚡ This may take a few minutes. Check console (F12) for detailed progress.</p>
        </div>
      )}

      {/* Stats - Player-specific */}
      {stats && (
        <div className="mb-4 space-y-4">
          {/* White Stats */}
          <div className="rounded-xl border-2 border-slate-300 bg-gradient-to-r from-white to-slate-50 p-5 shadow-md">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                ⬜ {gameInfo?.white || 'White'} Statistics
              </h3>
              {gameInfo?.whiteElo !== '?' && (
                <span className="text-sm font-semibold text-slate-600">
                  ELO: {gameInfo?.whiteElo}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 lg:grid-cols-10">
              {Object.entries(stats.white).map(([key, value]) => {
                if (key === 'avgCpLoss') {
                  return (
                    <div key={key} className="rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 p-2.5 text-center shadow-sm">
                      <div className="text-xl font-bold text-slate-900">{value}</div>
                      <div className="text-[10px] font-semibold text-slate-600">Avg Loss</div>
                    </div>
                  );
                }
                return (
                  <div key={key} className="rounded-lg p-2.5 text-center shadow-sm" style={{ backgroundColor: getClassificationColor(key) + '30' }}>
                    <div className="text-xl font-bold" style={{ color: getClassificationColor(key) }}>{value}</div>
                    <div className="text-[10px] font-semibold capitalize text-slate-700">{key}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Black Stats */}
          <div className="rounded-xl border-2 border-slate-700 bg-gradient-to-r from-slate-800 to-slate-700 p-5 shadow-md">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                ⬛ {gameInfo?.black || 'Black'} Statistics
              </h3>
              {gameInfo?.blackElo !== '?' && (
                <span className="text-sm font-semibold text-slate-300">
                  ELO: {gameInfo?.blackElo}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 lg:grid-cols-10">
              {Object.entries(stats.black).map(([key, value]) => {
                if (key === 'avgCpLoss') {
                  return (
                    <div key={key} className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-500 p-2.5 text-center shadow-sm">
                      <div className="text-xl font-bold text-white">{value}</div>
                      <div className="text-[10px] font-semibold text-slate-200">Avg Loss</div>
                    </div>
                  );
                }
                return (
                  <div key={key} className="rounded-lg p-2.5 text-center shadow-sm" style={{ backgroundColor: getClassificationColor(key) + '50' }}>
                    <div className="text-xl font-bold text-white">{value}</div>
                    <div className="text-[10px] font-semibold capitalize text-white/90">{key}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overall Stats (compact) */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-700">📊 Overall Game Statistics</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-10">
              {Object.entries(stats.overall).map(([key, value]) => {
                if (key === 'avgCpLoss') {
                  return (
                    <div key={key} className="rounded-md bg-white/70 p-2 text-center shadow-sm">
                      <div className="text-lg font-bold text-slate-900">{value}</div>
                      <div className="text-[9px] font-semibold text-slate-600">Avg Loss</div>
                    </div>
                  );
                }
                return (
                  <div key={key} className="rounded-md p-2 text-center shadow-sm" style={{ backgroundColor: getClassificationColor(key) + '20' }}>
                    <div className="text-lg font-bold" style={{ color: getClassificationColor(key) }}>{value}</div>
                    <div className="text-[9px] font-semibold capitalize text-slate-700">{key}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-[1fr_500px]">
        {/* Board (overlay removed) */}
        <div>
          <div className="mb-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm">
            <InteractiveBoard 
              fen={currentPosition} 
              onMove={() => {}} 
              bestMove={null} 
              flipped={flipped}
              moveBadge={moveBadge}
              lastMove={lastMove}
            />

            {/* Controls */}
            <div className="mt-6 space-y-4">
              {/* Main Navigation */}
              <div className="flex items-center justify-center gap-3">
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); goToStart(); }} 
                  disabled={currentMoveIndex === -1}
                  className="group relative rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400" 
                  title="Go to Start (Home)"
                >
                  <span className="text-xl">⏮</span>
                </button>
                
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); stopPlaying(); goToPrevious(); }} 
                  disabled={currentMoveIndex === -1}
                  className="group relative rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400" 
                  title="Previous Move (←)"
                >
                  <span className="text-xl">◀</span>
                </button>
                
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); togglePlay(); }} 
                  disabled={moves.length === 0}
                  className="group relative rounded-lg bg-gradient-to-br from-green-500 to-green-600 px-6 py-3 font-bold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:hover:scale-100" 
                  title="Play/Pause (Space)"
                >
                  <span className="text-2xl">{isPlaying ? '⏸' : '▶'}</span>
                </button>
                
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); stopPlaying(); goToNext(); }} 
                  disabled={currentMoveIndex >= moves.length - 1}
                  className="group relative rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400" 
                  title="Next Move (→)"
                >
                  <span className="text-xl">▶</span>
                </button>
                
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); goToEnd(); }} 
                  disabled={currentMoveIndex >= moves.length - 1}
                  className="group relative rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400" 
                  title="Go to End (End)"
                >
                  <span className="text-xl">⏭</span>
                </button>
                
                <div className="mx-2 h-10 w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent" />
                
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); setFlipped(!flipped); }}
                  className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95"
                  title="Flip Board"
                >
                  <span className="text-lg">🔄</span>
                </button>
              </div>

              {/* Speed Controls */}
              <div className="flex items-center justify-center gap-3 rounded-lg bg-slate-50 px-4 py-3 shadow-inner">
                <span className="text-sm font-semibold text-slate-700">⚡ Speed:</span>
                <div className="flex gap-2">
                  {[
                    { label: '0.5×', value: 3000, color: 'from-amber-400 to-amber-500' },
                    { label: '1×', value: 1500, color: 'from-emerald-400 to-emerald-500' },
                    { label: '2×', value: 750, color: 'from-cyan-400 to-cyan-500' },
                    { label: '3×', value: 500, color: 'from-violet-400 to-violet-500' }
                  ].map(s => (
                    <button 
                      key={s.value} 
                      type="button"
                      onClick={(e) => { e.preventDefault(); setPlaySpeed(s.value); }}
                      className={`rounded-md px-4 py-2 text-sm font-bold shadow-sm transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95 ${
                        playSpeed === s.value 
                          ? `bg-gradient-to-br ${s.color} text-white ring-2 ring-offset-2 ring-blue-300` 
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-center text-sm font-medium text-slate-600">
                Move {currentMoveIndex + 1} of {moves.length}
              </div>
            </div>
          </div>

          {/* Move Explanation Card (Chess.com Premium Analysis Style) */}
          {currentMoveIndex >= 0 && analyzedMoves[currentMoveIndex] && analyzedMoves[currentMoveIndex].explanation && (
            <div className="mt-4">
              <MoveExplanationCard
                moveNumber={currentMoveIndex + 1}
                playerName={currentMoveIndex % 2 === 0 ? (gameInfo?.white || 'White') : (gameInfo?.black || 'Black')}
                playerMove={analyzedMoves[currentMoveIndex].playerMoveSan || moves[currentMoveIndex]?.san || ''}
                classification={analyzedMoves[currentMoveIndex].classification}
                explanation={analyzedMoves[currentMoveIndex].explanation}
                showDetails={true}
              />
            </div>
          )}
        </div>

        {/* Move History (chess.com style) */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-bold text-slate-800">Move History</h3>

          <div ref={listContainerRef} className="max-h-[650px] overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {/* Header */}
            <div className="grid grid-cols-[64px_1fr_1fr] gap-2 bg-slate-100/70 px-3 py-2 text-xs font-semibold text-slate-600 sticky top-0 z-10">
              <div>#</div><div>White</div><div>Black</div>
            </div>

            {rows.map((row) => (
              <div key={row.turn} className="grid grid-cols-[64px_1fr_1fr] items-stretch gap-2 border-b border-slate-200/70 px-3 py-1.5">
                <div className="flex select-none items-center justify-center text-xs text-slate-500">{row.turn}.</div>

                {/* White cell */}
                <MoveCell
                  side="w"
                  data={row.white}
                  isCurrent={row.white?.index === currentMoveIndex}
                  onClick={() => row.white && navigateToMove(row.white.index)}
                  getColor={getClassificationColor}
                />

                {/* Black cell */}
                <MoveCell
                  side="b"
                  data={row.black}
                  isCurrent={row.black?.index === currentMoveIndex}
                  onClick={() => row.black && navigateToMove(row.black.index)}
                  getColor={getClassificationColor}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
        <span className="font-bold text-blue-900">⌨️ Shortcuts:</span>
        <span className="ml-2 text-blue-700">Space: Play/Pause | ← Prev | → Next | Home: Start | End: Last</span>
      </div>
    </div>
  );
}

/* ---------- Move cell (badge inside history, no board overlay) ---------- */
function MoveCell({ side, data, isCurrent, onClick, getColor }) {
  if (!data) return <div />;

  const badgeBg = data.color || getColor('unknown');

  return (
    <div
      data-move={data.index}
      className={[
        'group flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 transition',
        isCurrent
          ? 'border-emerald-400/40 bg-emerald-50'
          : 'border-transparent bg-white hover:border-slate-300 hover:bg-slate-50'
      ].join(' ')}
    >
      <button
        onClick={onClick}
        className={`truncate text-left text-[15px] font-semibold ${isCurrent ? 'text-emerald-700' : 'text-slate-800'}`}
        title={`Go to move ${data.san}`}
      >
        {data.san}
      </button>

      {data.badge && (
        <div className="flex items-center gap-2">
          {typeof data.cpLoss === 'number' && data.cpLoss > 0 && (
            <span className={`text-[11px] font-semibold ${isCurrent ? 'text-emerald-700' : 'text-slate-600'}`}>
              -{data.cpLoss}
            </span>
          )}
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow-sm"
            style={{ backgroundColor: badgeBg }}
            title={data.badge}
          >
            {data.badge}
          </span>
        </div>
      )}
    </div>
  );
}
