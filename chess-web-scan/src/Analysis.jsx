
// Analysis.jsx (Tailwind version)

import { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { useStockfish } from './hooks/useStockfish';
import InteractiveBoard from './components/InteractiveBoard';
import EvaluationBar from './components/EvaluationBar';
import MoveHistory from './components/MoveHistory';
import EngineLines from './components/EngineLines';
import MoveExplanationCard from './components/MoveExplanationCard';
import MoveDetailsPanel from './components/MoveDetailsPanel';
// REMOVED: Old classification imports (now using backend)
// Backend handles all classification via /evaluate endpoint
import { evaluateMove, getMoveBadge, getMoveExplanation } from './services/evaluationService';

// Helper function to get classification color
function getClassificationColor(classification) {
  const colors = {
    brilliant: '#1baca6',
    book: '#a88865',
    best: '#9bc02a',
    excellent: '#96bc4b',
    good: '#96af8b',
    miss: '#ffa500', // Orange - missed opportunity (Ø)
    inaccuracy: '#f0c15c',
    mistake: '#e58f2a',
    blunder: '#fa412d'
  };
  return colors[classification] || '#9bc02a';
}

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
  const [lastMove, setLastMove] = useState(null); // { from: 'e2', to: 'e4' }
  const [analysisDepth, setAnalysisDepth] = useState(18); // Reduced from 22 for better performance
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
    
    // Don't analyze if game is over - check using currentFen
    try {
      const tempGame = new Chess(currentFen);
      if (tempGame.isGameOver()) {
        console.log('🏁 Game Over detected:', {
          checkmate: tempGame.isCheckmate(),
          stalemate: tempGame.isStalemate(),
          draw: tempGame.isDraw()
        });
        // Set terminal evaluation for game over states
        if (tempGame.isCheckmate()) {
          const winner = tempGame.turn() === 'w' ? 'b' : 'w';
          setCurrentEval({ type: 'mate', value: 0 });
        } else {
          setCurrentEval({ type: 'cp', value: 0 });
        }
        setEngineLines([]);
        setBestMove(null);
        return;
      }
    } catch (e) {
      console.error('Error checking game over:', e);
    }
    
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
    // Check if game is over before analyzing - use currentFen
    let gameOver = false;
    try {
      const tempGame = new Chess(currentFen);
      gameOver = tempGame.isGameOver();
    } catch (e) {
      // Invalid FEN, don't analyze
      gameOver = true;
    }
    
    if (autoAnalyze && initialized && !isProcessingMove && !gameOver) {
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

    // IMPORTANT: Update the shared game instance to stay in sync
    try {
      game.load(newFen);
    } catch (e) {
      console.error('Failed to load new FEN into game instance:', e);
      setIsProcessingMove(false);
      return;
    }

    setCurrentFen(newFen);

    // Track last move for highlighting
    setLastMove({ from: move.from, to: move.to });

    // Check if the new position is game over
    let isGameOverPosition = false;
    try {
      const checkGame = new Chess(newFen);
      isGameOverPosition = checkGame.isGameOver();
    } catch (e) {
      console.error('Error checking game over in handleMove:', e);
    }

    try {
      let classification = { classification: 'best', label: 'Best', cpLoss: 0, color: '#16a34a', isBrilliantV2: false };
      let explanation = null;
      let bestMoveForNewPosition = null;
      let evaluationAfterMove = null;
      let result = null;

      // OPTIMIZATION: Run move classification AND position analysis in PARALLEL!
      // This cuts total time roughly in HALF
      if (!isGameOverPosition) {
        const promises = [];
        
        // Promise 1: Analyze new position for engine lines (always needed)
        promises.push(
          analyze(newFen, { depth: analysisDepth, multiPV: 3 })
            .then(res => { result = res; })
            .catch(err => console.error('Analysis error:', err))
        );
        
        // Promise 2: Classify the move (only if we have previous analysis)
        if (previousAnalysis?.lines?.length) {
          const movePlayed = move.from + move.to + (move.promotion || '');
          
          promises.push(
            evaluateMove(previousFen, movePlayed, analysisDepth, 5)
              .then(evaluation => {
                console.log('✅ Backend evaluation result:', evaluation);
                
                const badge = getMoveBadge(evaluation);
                explanation = getMoveExplanation(evaluation);
                
                classification = {
                  classification: evaluation.label.toLowerCase(),
                  label: evaluation.label,
                  cpLoss: evaluation.cpl || 0,
                  color: badge.color,
                  isBrilliantV2: evaluation.label === 'Brilliant' || evaluation.label === 'Great',
                  brilliantAnalysis: evaluation.brilliantInfo || null,
                  fullEvaluation: evaluation
                };
                
                // Use evaluation from backend
                evaluationAfterMove = evaluation.raw?.eval_after_struct || { 
                  type: 'cp', 
                  value: evaluation.evalAfter || 0 
                };
                
                console.log('📊 Classification applied:', classification);
              })
              .catch(e => {
                console.error('❌ Backend evaluation error:', e);
                classification = {
                  classification: 'good',
                  label: 'Good',
                  cpLoss: 0,
                  color: '#96af8b',
                  isBrilliantV2: false
                };
                explanation = 'Move classification unavailable - backend error';
              })
          );
        }
        
        // Wait for BOTH to complete (runs in parallel!)
        console.log('⚡ Running analysis and classification in parallel...');
        await Promise.all(promises);
        console.log('✅ Both operations complete!');
        
        // Set results
        if (result) {
          bestMoveForNewPosition = result.lines[0]?.pv[0];
          setStoredAnalysis(result);
          setCurrentEval(evaluationAfterMove || result.evaluation);
          setEngineLines(result.lines || []);
        }
      } else {
        // Game over - set terminal evaluation
        console.log('🏁 Game ended with this move');
        const checkGame = new Chess(newFen);
        if (checkGame.isCheckmate()) {
          setCurrentEval({ type: 'mate', value: 0 });
        } else {
          setCurrentEval({ type: 'cp', value: 0 });
        }
        setEngineLines([]);
        setStoredAnalysis(null);
      }

      const newMove = {
        ...move,
        evaluation: result?.evaluation || null,
        classification: classification.classification,
        classificationLabel: classification.label,
        cpLoss: classification.cpLoss,
        isBrilliantV2: classification.isBrilliantV2,
        brilliantAnalysis: classification.brilliantAnalysis,
        explanation: explanation,
        // Store full backend evaluation data
        fullEvaluation: classification.fullEvaluation || null
      };

      // Debug logging
      console.log('📝 Storing move:', {
        from: newMove.from,
        to: newMove.to,
        san: newMove.san,
        promotion: newMove.promotion,
        piece: newMove.piece,
        captured: newMove.captured,
        moveIndex: moves.length,
        currentMoveIndex
      });

      // IMPORTANT: When adding a new move, clear all moves after current position
      // This handles the case where user goes back and plays a different variation
      setMoves(prev => {
        const movesUpToCurrent = prev.slice(0, currentMoveIndex + 1);
        return [...movesUpToCurrent, newMove];
      });
      setCurrentMoveIndex(prev => prev + 1);

      // Set the classification to display in the UI
      setLastMoveClassification(classification);

      if (showBestMove && !isGameOverPosition) setBestMove(bestMoveForNewPosition);
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsProcessingMove(false);
    }
  }, [initialized, currentFen, storedAnalysis, analyze, analysisDepth, showBestMove]);

  const navigateToMove = useCallback((moveIndex) => {
    // Handle going to start position (moveIndex === -1)
    if (moveIndex === -1) {
      game.reset();
      game.load(startFen);
      setCurrentFen(startFen);
      setCurrentMoveIndex(-1);
      setCurrentEval(null);
      setLastMoveClassification(null);
      setLastMove(null);
      return;
    }

    // Validate moveIndex
    if (moveIndex < -1 || moveIndex >= moves.length) {
      console.warn('Invalid move index:', moveIndex);
      return;
    }

    try {
      // Create a fresh Chess instance to avoid race conditions
      const tempGame = new Chess(startFen);
      const movesToReplay = moves.slice(0, moveIndex + 1);

      // Replay all moves up to the target index
      let successfulMoves = 0;
      console.log(`🔄 Replaying ${movesToReplay.length} moves to reach index ${moveIndex}`);

      for (let i = 0; i < movesToReplay.length; i++) {
        const m = movesToReplay[i];

        // Validate move object has required properties
        if (!m || !m.from || !m.to) {
          console.error(`❌ Invalid move object at index ${i}:`, m);
          break;
        }

        console.log(`  ${i + 1}. Replaying: ${m.san || '?'} (${m.from}→${m.to}${m.promotion ? '=' + m.promotion : ''})`);

        try {
          const result = tempGame.move({
            from: m.from,
            to: m.to,
            promotion: m.promotion || undefined
          });

          if (!result) {
            console.error(`❌ Move rejected by chess.js at index ${i}:`);
            console.error('   Move:', { from: m.from, to: m.to, san: m.san, promotion: m.promotion });
            console.error('   Current FEN:', tempGame.fen());
            console.error('   Legal moves:', tempGame.moves({ verbose: true }).map(lm => `${lm.from}→${lm.to}`));
            break;
          }
          successfulMoves++;
        } catch (moveError) {
          console.error(`❌ Exception replaying move at index ${i}:`, moveError);
          console.error('   Move:', m);
          console.error('   Current FEN:', tempGame.fen());
          break;
        }
      }

      console.log(`✅ Successfully replayed ${successfulMoves} of ${movesToReplay.length} moves`);

      // Update to the position we successfully reached
      const finalFen = tempGame.fen();
      const finalIndex = successfulMoves - 1;

      game.load(finalFen);
      setCurrentFen(finalFen);
      setCurrentMoveIndex(finalIndex);
      setCurrentEval(finalIndex >= 0 && moves[finalIndex] ? moves[finalIndex].evaluation : null);

      // Update classification display to match the current move
      if (finalIndex >= 0 && moves[finalIndex]) {
        const currentMove = moves[finalIndex];
        setLastMoveClassification({
          classification: currentMove.classification,
          label: currentMove.classificationLabel,
          cpLoss: currentMove.cpLoss,
          color: getClassificationColor(currentMove.classification),
          isBrilliantV2: currentMove.isBrilliantV2,
          brilliantAnalysis: currentMove.brilliantAnalysis,
          fullEvaluation: currentMove.fullEvaluation // Preserve full evaluation data
        });
        // Set last move for highlighting
        setLastMove({ from: currentMove.from, to: currentMove.to });
      } else {
        setLastMoveClassification(null);
        setLastMove(null);
      }
    } catch (error) {
      console.error('Error navigating to move:', error);
      console.error('Failed at moveIndex:', moveIndex);
      console.error('Moves array length:', moves.length);
      // DON'T reset the board - just log the error and stay where we are
      // User can manually reset if needed
      alert('Navigation error occurred. Check console for details. Board state preserved.');
    }
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

  // Check for game over states using current FEN to ensure sync
  const checkGameOver = () => {
    try {
      const tempGame = new Chess(currentFen);
      return {
        isGameOver: tempGame.isGameOver(),
        isCheckmate: tempGame.isCheckmate(),
        isStalemate: tempGame.isStalemate(),
        isThreefoldRepetition: tempGame.isThreefoldRepetition(),
        isInsufficientMaterial: tempGame.isInsufficientMaterial(),
        isDraw: tempGame.isDraw(),
        turn: tempGame.turn()
      };
    } catch (e) {
      return {
        isGameOver: false,
        isCheckmate: false,
        isStalemate: false,
        isThreefoldRepetition: false,
        isInsufficientMaterial: false,
        isDraw: false,
        turn: 'w'
      };
    }
  };

  const gameOverState = checkGameOver();
  const isGameOver = gameOverState.isGameOver;
  const gameStatus = gameOverState.isCheckmate
    ? `Checkmate! ${gameOverState.turn === 'w' ? 'Black' : 'White'} wins`
    : gameOverState.isStalemate
    ? 'Stalemate - Draw'
    : gameOverState.isThreefoldRepetition
    ? 'Draw by Threefold Repetition'
    : gameOverState.isInsufficientMaterial
    ? 'Draw by Insufficient Material'
    : gameOverState.isDraw
    ? 'Draw by Fifty-Move Rule'
    : null;

  return (
    <div className="mx-auto max-w-[1900px] px-4 py-5 text-slate-900">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
            disabled={!initialized || analyzing || hintRequested || isGameOver}
            className={`rounded-lg px-4 py-2 font-bold text-white transition
              ${hintRequested ? 'bg-green-600' : (initialized && !isGameOver) ? 'bg-amber-600' : 'bg-slate-400 cursor-not-allowed'}`}
          >
            {hintRequested ? '✓ Hint Shown' : '💡 Get Hint'}
          </button>

          <select
            value={analysisDepth}
            onChange={(e) => setAnalysisDepth(Number(e.target.value))}
            className="rounded-lg border-2 border-slate-200 bg-white px-3 py-2 font-semibold"
          >
            <option value={12}>Depth 12 (⚡ Fastest ~0.5s)</option>
            <option value={15}>Depth 15 (🚀 Fast ~1s)</option>
            <option value={18}>Depth 18 (⚖️ Balanced ~2s)</option>
            <option value={20}>Depth 20 (🎯 Deep ~4s)</option>
            <option value={22}>Depth 22 (🧠 Expert ~8s)</option>
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

      {/* Main layout: flex with optimized spacing */}
      <div className="flex flex-col items-center gap-5 xl:flex-row xl:items-start xl:justify-center">
        {/* Left side: Evaluation bar + Board */}
        <div className="flex items-start gap-4">
          {/* Evaluation bar */}
          <div className="w-12 flex-shrink-0">
            <EvaluationBar score={currentEval} fen={currentFen} height={680} />
          </div>

          {/* Board column */}
          <div className="flex flex-col gap-3">
            <div className="relative flex items-center justify-center">
            <InteractiveBoard
              fen={currentFen}
              onMove={handleMove}
              flipped={flipped}
              bestMove={bestMove}
              hoverMove={hoverMove}
              lastMove={lastMove}
            />
            {!initialized && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/95 rounded-xl">
                <div className="text-center">
                  <div className="mb-3 h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-green-600 mx-auto" />
                  <div className="text-sm font-semibold text-slate-600">Loading engine...</div>
                </div>
              </div>
            )}
          </div>

          {/* Move navigation */}
          <div className="flex w-[680px] justify-center gap-2">
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

          {/* Move Explanation Card - appears below navigation */}
          {currentMoveIndex >= 0 && moves[currentMoveIndex]?.explanation && (
            <div className="w-[680px]">
              <MoveExplanationCard
                moveNumber={currentMoveIndex + 1}
                playerName={currentMoveIndex % 2 === 0 ? 'White' : 'Black'}
                playerMove={moves[currentMoveIndex].san}
                classification={moves[currentMoveIndex].classification}
                explanation={moves[currentMoveIndex].explanation}
                showDetails={true}
              />
            </div>
          )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full max-w-[460px] space-y-3 xl:sticky xl:top-4 xl:w-[460px] xl:flex-shrink-0">
          {/* Move Details Panel - shows all backend evaluation data */}
          {currentMoveIndex >= 0 && moves[currentMoveIndex]?.fullEvaluation && (
            <MoveDetailsPanel 
              moveData={moves[currentMoveIndex].fullEvaluation}
              visible={true}
            />
          )}
          {/* Classification - show loading while processing or actual classification */}
          {(isProcessingMove || lastMoveClassification) && (
            <div className="flex min-h-[90px] items-center rounded-xl border border-slate-200 bg-white p-3 shadow transition-all duration-200">
              {isProcessingMove ? (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    Analyzing move type...
                  </div>
                  <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
                </div>
              ) : (
                <div
                  className="w-full rounded-lg border-4 bg-white p-2.5"
                  style={{ borderColor: lastMoveClassification.color }}
                >
                  <div
                    className="mb-0.5 text-lg font-extrabold"
                    style={{ color: lastMoveClassification.color }}
                  >
                    {lastMoveClassification.label}
                  </div>
                  <div className="text-xs text-slate-600">
                    Centipawn loss: {lastMoveClassification.cpLoss.toFixed(0)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Brilliant Move Details - show when move is brilliant V2 */}
          {lastMoveClassification?.isBrilliantV2 && lastMoveClassification?.brilliantAnalysis && (
            <div className="rounded-xl border-2 border-cyan-400 bg-gradient-to-br from-cyan-50 to-teal-50 p-4 shadow-lg">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">💎</span>
                <div className="text-lg font-extrabold text-cyan-600">
                  Brilliant Move Detected
                </div>
                <div className="ml-auto rounded-full bg-cyan-600 px-3 py-1 text-xs font-bold text-white">
                  {(lastMoveClassification.brilliantAnalysis.confidence * 100).toFixed(0)}% confidence
                </div>
              </div>

              {/* Gates Status */}
              <div className="mb-2 space-y-1">
                <div className="text-xs font-semibold text-slate-600">Gates Passed:</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(lastMoveClassification.brilliantAnalysis.gates).map(([gate, passed]) => (
                    <div
                      key={gate}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        passed
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-red-100 text-red-700 border border-red-300'
                      }`}
                    >
                      {passed ? '✓' : '✗'} {gate}
                    </div>
                  ))}
                </div>
              </div>

              {/* Reasons */}
              <div className="mt-2 space-y-1">
                <div className="text-xs font-semibold text-slate-600">Analysis:</div>
                <div className="max-h-32 overflow-y-auto rounded bg-white p-2 text-xs font-mono text-slate-700">
                  {lastMoveClassification.brilliantAnalysis.reasons.map((reason, idx) => (
                    <div
                      key={idx}
                      className={`${
                        reason.includes('✓') || reason.includes('CONFIRMED')
                          ? 'text-green-700 font-bold'
                          : reason.includes('FAILED')
                          ? 'text-red-700'
                          : reason.includes('WEAK')
                          ? 'text-orange-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional stats */}
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-white p-2">
                  <div className="font-semibold text-slate-600">Game Phase</div>
                  <div className="font-bold text-slate-800">{lastMoveClassification.brilliantAnalysis.gamePhase}</div>
                </div>
                <div className="rounded bg-white p-2">
                  <div className="font-semibold text-slate-600">Material Lost</div>
                  <div className="font-bold text-slate-800">
                    {lastMoveClassification.brilliantAnalysis.sacrificeResult?.materialLost || 0}cp
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Best move - only show when available */}
          {bestMove && (
            <div className="flex min-h-[90px] items-center rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-3 shadow transition-all duration-200">
              <div className="w-full">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
                  <span>🎯 Best Move</span>
                  <span className="rounded-md bg-green-600 px-2 py-0.5 text-xs font-extrabold text-white">
                    See arrow ➜
                  </span>
                </div>
                <div className="font-mono text-xl font-extrabold text-green-700">
                  {bestMove}
                </div>
                <div className="mt-0.5 text-xs font-medium italic text-green-800">
                  Green arrow on board
                </div>
              </div>
            </div>
          )}

          {/* Current eval - always visible */}
          <div className="flex min-h-[80px] items-center rounded-xl border border-slate-200 bg-white p-3 shadow transition-all duration-200">
            {isGameOver ? (
              <div className="w-full">
                <div className="mb-1 text-xs font-bold text-slate-700">Game Status</div>
                <div className={`
                  text-base font-extrabold
                  ${gameOverState.isCheckmate ? 'text-red-700' : 'text-amber-600'}
                `}>
                  {gameOverState.isCheckmate && '♔ '}
                  {gameStatus}
                </div>
              </div>
            ) : !currentEval ? (
              <div className="w-full space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-300" />
                <div className="h-5 w-28 animate-pulse rounded bg-slate-300" />
              </div>
            ) : (
              <div className="w-full">
                <div className="mb-1 text-xs font-bold text-slate-700">Evaluation</div>
                <div className={`
                  font-mono text-base font-extrabold
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
          <div className="rounded-xl border border-slate-200 bg-white shadow overflow-hidden">
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2">
              <div className="text-sm font-bold text-slate-700">🎯 Engine Analysis</div>
            </div>
            <div className="max-h-[300px] min-h-[200px] overflow-auto p-4">
            {isGameOver ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className={`mb-2 text-5xl ${gameOverState.isCheckmate ? 'text-red-700' : 'text-amber-600'}`}>
                    {gameOverState.isCheckmate 
                      ? '♔' 
                      : gameOverState.isStalemate 
                      ? '½–½' 
                      : gameOverState.isThreefoldRepetition
                      ? '🔁'
                      : gameOverState.isInsufficientMaterial
                      ? '⚖️'
                      : '½–½'}
                  </div>
                  <div className={`text-xl font-bold ${gameOverState.isCheckmate ? 'text-red-700' : 'text-amber-600'}`}>
                    {gameStatus}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    No further analysis needed
                  </div>
                </div>
              </div>
            ) : engineLines.length === 0 ? (
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
          </div>

          {/* Move history */}
          <div className="max-h-[300px] min-h-[200px] overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow">
            <MoveHistory
              moves={moves}
              currentMoveIndex={currentMoveIndex}
              onMoveClick={navigateToMove}
            />
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow">
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

