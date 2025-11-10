
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
  analyzeMoveClassification
} from './utils/moveClassification';

// Helper function to get classification color
function getClassificationColor(classification) {
  const colors = {
    brilliant: '#1baca6',
    book: '#a88865',
    best: '#9bc02a',
    excellent: '#96bc4b',
    good: '#96af8b',
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
    setCurrentFen(newFen);

    // Check if the new position is game over
    let isGameOverPosition = false;
    try {
      const checkGame = new Chess(newFen);
      isGameOverPosition = checkGame.isGameOver();
    } catch (e) {
      console.error('Error checking game over in handleMove:', e);
    }

    try {
      let result, bestMoveForNewPosition;
      
      // Only analyze if game is not over
      if (!isGameOverPosition) {
        result = await analyze(newFen, { depth: analysisDepth, multiPV: 3 });
        bestMoveForNewPosition = result.lines[0]?.pv[0];
        setStoredAnalysis(result);
        setCurrentEval(result.evaluation);
        setEngineLines(result.lines || []);
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

      let classification = { classification: 'best', label: 'Best', cpLoss: 0, color: '#16a34a' };

      if (previousAnalysis?.lines?.length) {
        try {
          const movePlayed = move.from + move.to + (move.promotion || '');

          // Use the comprehensive classification system with brilliant detection
          classification = await analyzeMoveClassification(
            { analyze }, // Pass stockfish service with analyze method
            previousFen,
            movePlayed,
            { depth: analysisDepth, epsilon: 10 }
          );
        } catch (e) {
          console.error('Classification error:', e);
        }
      }

      const newMove = {
        ...move,
        evaluation: result.evaluation,
        classification: classification.classification,
        classificationLabel: classification.label,
        cpLoss: classification.cpLoss,
        isBrilliantV2: classification.isBrilliantV2,
        brilliantAnalysis: classification.brilliantAnalysis
      };
      setMoves(prev => [...prev, newMove]);
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
    try {
      // Create a fresh Chess instance to avoid race conditions
      const tempGame = new Chess(startFen);
      const movesToReplay = moves.slice(0, moveIndex + 1);

      // Replay all moves up to the target index
      for (let i = 0; i < movesToReplay.length; i++) {
        const m = movesToReplay[i];
        const result = tempGame.move({ from: m.from, to: m.to, promotion: m.promotion });

        if (!result) {
          console.error('Failed to replay move:', m, 'at index', i);
          console.error('Current FEN:', tempGame.fen());
          // Stop replaying if we hit an invalid move
          break;
        }
      }

      // Update the shared game object and state
      game.load(tempGame.fen());
      setCurrentFen(tempGame.fen());
      setCurrentMoveIndex(moveIndex);
      setCurrentEval(moveIndex >= 0 ? moves[moveIndex].evaluation : null);

      // Update classification display to match the current move
      if (moveIndex >= 0 && moves[moveIndex]) {
        const currentMove = moves[moveIndex];
        setLastMoveClassification({
          classification: currentMove.classification,
          label: currentMove.classificationLabel,
          cpLoss: currentMove.cpLoss,
          color: getClassificationColor(currentMove.classification),
          isBrilliantV2: currentMove.isBrilliantV2,
          brilliantAnalysis: currentMove.brilliantAnalysis
        });
      } else {
        setLastMoveClassification(null);
      }
    } catch (error) {
      console.error('Error navigating to move:', error);
      // Fallback: reset to start position
      game.reset();
      game.load(startFen);
      setCurrentFen(startFen);
      setCurrentMoveIndex(-1);
      setLastMoveClassification(null);
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
          {/* Classification - show loading while processing or actual classification */}
          {(isProcessingMove || lastMoveClassification) && (
            <div className="flex min-h-[112px] items-center rounded-xl border border-slate-200 bg-white p-4 shadow transition-all duration-200">
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
            {isGameOver ? (
              <div className="w-full">
                <div className="mb-1 text-sm font-bold text-slate-700">Game Status</div>
                <div className={`
                  text-lg font-extrabold
                  ${gameOverState.isCheckmate ? 'text-red-700' : 'text-amber-600'}
                `}>
                  {gameOverState.isCheckmate && '♔ '}
                  {gameStatus}
                </div>
              </div>
            ) : !currentEval ? (
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

