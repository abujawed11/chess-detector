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
import './App.css';

export default function Analysis({ initialFen }) {
  const startFen = initialFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const [game] = useState(new Chess(startFen));
  const [currentFen, setCurrentFen] = useState(startFen);
  const [moves, setMoves] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [flipped, setFlipped] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const { initialized, analyzing, analyze, getTopMoves, error } = useStockfish();

  const [currentEval, setCurrentEval] = useState(null);
  const [bestMove, setBestMove] = useState(null);
  const [showBestMove, setShowBestMove] = useState(false); // OFF by default
  const [hintRequested, setHintRequested] = useState(false); // For one-time hints
  const [lastMoveClassification, setLastMoveClassification] = useState(null);
  const [analysisDepth, setAnalysisDepth] = useState(15);
  const [storedAnalysis, setStoredAnalysis] = useState(null); // Store analysis before move
  const [engineLines, setEngineLines] = useState([]); // Top engine lines
  const [isProcessingMove, setIsProcessingMove] = useState(false); // Prevent auto-analyze during move processing

  // Update game when initialFen changes
  useEffect(() => {
    if (initialFen && initialFen !== game.fen()) {
      game.load(initialFen);
      setCurrentFen(initialFen);
      setMoves([]);
      setCurrentMoveIndex(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFen]);

  // Analyze current position
  const analyzeCurrentPosition = useCallback(async (forceShowHint = false) => {
    if (!initialized) return;

    try {
      const result = await analyze(currentFen, {
        depth: analysisDepth,
        multiPV: 3
      });

      setCurrentEval(result.evaluation);
      setStoredAnalysis(result); // Store full analysis for move classification
      setEngineLines(result.lines || []); // Store multi-line analysis

      // Only set best move if hints are enabled or forced
      if (showBestMove || forceShowHint || hintRequested) {
        setBestMove(result.lines[0]?.pv[0]);
      } else {
        setBestMove(null);
      }
    } catch (err) {
      console.error('Analysis error:', err);
    }
  }, [currentFen, initialized, analyze, analysisDepth, showBestMove, hintRequested]);

  // Auto-analyze when position changes (but not during move processing)
  useEffect(() => {
    if (autoAnalyze && initialized && !isProcessingMove) {
      const timer = setTimeout(() => {
        analyzeCurrentPosition();
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen, autoAnalyze, initialized, isProcessingMove]);

  // Handle move made on board
  const handleMove = useCallback(async (move, newFen) => {
    if (!initialized) return;

    // Prevent auto-analyze from running during move processing
    setIsProcessingMove(true);

    // Store FEN and analysis from BEFORE the move
    const previousFen = currentFen;
    const previousAnalysis = storedAnalysis;

    // Clear one-time hint after move is played
    setHintRequested(false);

    // Update game state
    setCurrentFen(newFen);

    // Analyze new position
    try {
      const result = await analyze(newFen, {
        depth: analysisDepth,
        multiPV: 3
      });

      const bestMoveForNewPosition = result.lines[0]?.pv[0];

      // Store this analysis for the next move
      setStoredAnalysis(result);
      setCurrentEval(result.evaluation);
      setEngineLines(result.lines || []); // Store multi-line analysis

      console.log('🔍 Analysis after move:', {
        fen: newFen,
        linesCount: result.lines?.length,
        lines: result.lines
      });

      // Classify the move if we have previous analysis
      let classification = { classification: 'best', label: 'Best', cpLoss: 0, color: '#9bc02a' };

      if (previousAnalysis && previousAnalysis.lines && previousAnalysis.lines.length > 0) {
        try {
          // Get the move that was played in UCI format
          const movePlayed = move.from + move.to + (move.promotion || '');

          // Create a Chess instance to determine whose turn it was
          const tempChess = new Chess(previousFen);
          const rootTurn = tempChess.turn();

          // Normalize lines from previous analysis
          const lines = normalizeLines(previousAnalysis.lines, rootTurn);
          const bestMove = lines[0]?.pv?.[0];

          // Check for opening phase
          const isBook = isOpeningPhase(previousFen);

          // Diagnostics
          const pv2Gap = lines.length > 1 ? (lines[0].scoreForRoot - lines[1].scoreForRoot) : 0;
          const forced = pv2Gap >= 200;

          // Score OUR move at the root using searchmoves
          const ourRoot = await analyze(previousFen, {
            depth: analysisDepth,
            multiPV: 1,
            searchMoves: [movePlayed],
          });
          const ourRootScore = evalForRoot(rootTurn, rootTurn, ourRoot.evaluation);

          // Score BEST move at the root using searchmoves
          const bestRoot = await analyze(previousFen, {
            depth: analysisDepth,
            multiPV: 1,
            searchMoves: [bestMove],
          });
          const bestRootScore = evalForRoot(rootTurn, rootTurn, bestRoot.evaluation);

          // Calculate CP-loss from root perspective
          const cpLoss = Math.max(0, bestRootScore - ourRootScore);

          // Top-N / epsilon rules
          const eps = 10;
          const inTop3 = lines.slice(0, 3).some(
            l => l.pv[0]?.toLowerCase() === movePlayed.toLowerCase()
          );
          const ourLine = lines.find(
            l => l.pv[0]?.toLowerCase() === movePlayed.toLowerCase()
          );
          const withinEps = ourLine ? (lines[0].scoreForRoot - ourLine.scoreForRoot) <= eps : false;

          const missedMate =
            (lines[0]?.evaluation?.type === 'mate') &&
            (ourRoot.evaluation?.type !== 'mate');

          // Count pieces for brilliant detection and game phase
          const pieceCount = (previousFen.split(' ')[0].match(/[pnbrqkPNBRQK]/g) || []).length;

          // Brilliant move detection: ONLY move in a critical position (extremely forced)
          const isBrilliant =
            forced &&
            pv2Gap >= 500 &&
            cpLoss === 0 &&
            !isBook &&
            pieceCount >= 20 &&
            pieceCount <= 30;

          classification = classifyMove(cpLoss, {
            inTop3,
            withinEps,
            forced,
            missedMate,
            isBook: isBook && cpLoss <= 10,
            isBrilliant
          });
        } catch (classifyError) {
          console.error('Classification error:', classifyError);
          // Fallback to simple classification
          classification = { classification: 'best', label: 'Best', cpLoss: 0, color: '#9bc02a' };
        }
      }

      // Add move to history
      const newMove = {
        ...move,
        evaluation: result.evaluation,
        classification: classification.classification,
        classificationLabel: classification.label,
        cpLoss: classification.cpLoss
      };

      setMoves(prev => [...prev, newMove]);
      setCurrentMoveIndex(prev => prev + 1);

      // Only show best move if continuous hints are enabled
      if (showBestMove) {
        setBestMove(bestMoveForNewPosition);
      } else {
        setBestMove(null);
      }

      setLastMoveClassification(classification);

    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      // Re-enable auto-analyze after move processing is complete
      setIsProcessingMove(false);
    }
  }, [initialized, currentFen, storedAnalysis, analyze, analysisDepth, showBestMove]);

  // Navigate to a specific move
  const navigateToMove = useCallback((moveIndex) => {
    // Reset game to start
    game.reset();
    game.load(startFen);

    // Replay moves up to index
    const movesToReplay = moves.slice(0, moveIndex + 1);
    movesToReplay.forEach(m => {
      game.move({ from: m.from, to: m.to, promotion: m.promotion });
    });

    setCurrentFen(game.fen());
    setCurrentMoveIndex(moveIndex);
    setCurrentEval(moveIndex >= 0 ? moves[moveIndex].evaluation : null);
  }, [game, moves, startFen]);

  // Reset to start
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

  // Request one-time hint
  const requestHint = useCallback(async () => {
    setHintRequested(true);
    await analyzeCurrentPosition(true);
  }, [analyzeCurrentPosition]);

  return (
    <div style={{ padding: 20, maxWidth: 1600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <div>
          <h2 style={{ margin: 0 }}>Position Analysis</h2>
          <div style={{
            marginTop: 8,
            padding: '6px 12px',
            background: initialized ? '#d1fae5' : '#fef3c7',
            borderRadius: 6,
            border: `2px solid ${initialized ? '#10b981' : '#f59e0b'}`,
            display: 'inline-block',
            fontSize: 14
          }}>
            <strong>Engine:</strong> {initialized ? '✓ Ready' : '⏳ Initializing...'}
            {analyzing && ' (Analyzing...)'}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: '6px 12px',
            background: autoAnalyze ? '#d1fae5' : '#f3f4f6',
            borderRadius: 6,
            border: `2px solid ${autoAnalyze ? '#10b981' : '#e5e7eb'}`
          }}>
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
            />
            <span style={{ fontWeight: 600 }}>Auto-analyze Moves</span>
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: '6px 12px',
            background: showBestMove ? '#dbeafe' : '#f3f4f6',
            borderRadius: 6,
            border: `2px solid ${showBestMove ? '#3b82f6' : '#e5e7eb'}`
          }}>
            <input
              type="checkbox"
              checked={showBestMove}
              onChange={(e) => setShowBestMove(e.target.checked)}
            />
            <span style={{ fontWeight: 600 }}>Show Best Move</span>
          </label>

          <button
            onClick={requestHint}
            disabled={!initialized || analyzing || hintRequested}
            style={{
              padding: '8px 16px',
              background: hintRequested ? '#10b981' : initialized ? '#f59e0b' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: initialized && !analyzing ? 'pointer' : 'not-allowed',
              fontWeight: 600
            }}
          >
            {hintRequested ? '✓ Hint Shown' : '💡 Get Hint'}
          </button>

          <select
            value={analysisDepth}
            onChange={(e) => setAnalysisDepth(Number(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '2px solid #e5e7eb',
              fontWeight: 600
            }}
          >
            <option value={10}>Depth 10 (Fast)</option>
            <option value={15}>Depth 15 (Normal)</option>
            <option value={20}>Depth 20 (Deep)</option>
          </select>

          <button
            onClick={() => setFlipped(f => !f)}
            style={{
              padding: '8px 16px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            ↻ Flip Board
          </button>

          <button
            onClick={resetToStart}
            style={{
              padding: '8px 16px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            ⟲ Reset
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 560px 1fr',
        gap: 20
      }}>
        {/* Evaluation Bar */}
        <EvaluationBar score={currentEval} fen={currentFen} height={560} />

        {/* Chess Board */}
        <InteractiveBoard
          fen={currentFen}
          onMove={handleMove}
          flipped={flipped}
          bestMove={bestMove}
        />

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Last Move Classification */}
          {lastMoveClassification && (
            <div style={{
              padding: 16,
              background: '#fff',
              borderRadius: 12,
              border: `3px solid ${lastMoveClassification.color}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: lastMoveClassification.color,
                marginBottom: 8
              }}>
                {lastMoveClassification.label}
              </div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>
                Centipawn loss: {lastMoveClassification.cpLoss.toFixed(0)}
              </div>
            </div>
          )}

          {/* Best Move */}
          {bestMove && (
            <div style={{
              padding: 16,
              background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
              borderRadius: 12,
              border: '3px solid #22c55e',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)'
            }}>
              <div style={{ 
                fontSize: 14, 
                fontWeight: 600, 
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span>🎯 Best Move:</span>
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  background: '#22c55e',
                  borderRadius: 4,
                  color: '#fff',
                  fontWeight: 700
                }}>
                  See arrow on board ➜
                </span>
              </div>
              <div style={{
                fontSize: 24,
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#15803d'
              }}>
                {bestMove}
              </div>
              <div style={{
                fontSize: 12,
                color: '#166534',
                marginTop: 4,
                fontStyle: 'italic',
                fontWeight: 600
              }}>
                ✨ Green arrow with pulsing animation
              </div>
            </div>
          )}

          {/* Current Evaluation */}
          {currentEval && (
            <div style={{
              padding: 16,
              background: '#f9fafb',
              borderRadius: 12,
              border: '2px solid #e5e7eb'
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Evaluation:
              </div>
              <div style={{
                fontSize: 18,
                fontFamily: 'monospace',
                fontWeight: 600,
                color: currentEval.type === 'mate'
                  ? '#dc2626'
                  : currentEval.value > 0
                  ? '#10b981'
                  : currentEval.value < 0
                  ? '#374151'
                  : '#6b7280'
              }}>
                {currentEval.type === 'mate'
                  ? `Mate in ${Math.abs(currentEval.value)}`
                  : `${(currentEval.value / 100).toFixed(2)}`
                }
              </div>
            </div>
          )}

          {/* Engine Lines - Multi-line analysis like Chess.com */}
          {engineLines.length > 0 && (
            <EngineLines
              lines={engineLines}
              depth={analysisDepth}
              turn={currentFen.split(' ')[1]}
              onLineClick={(line) => {
                console.log('Selected line:', line);
              }}
            />
          )}

          {/* Move History */}
          <MoveHistory
            moves={moves}
            currentMoveIndex={currentMoveIndex}
            onMoveClick={navigateToMove}
          />
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        marginTop: 20,
        padding: 16,
        background: '#eff6ff',
        borderRadius: 8,
        fontSize: 14,
        color: '#1e40af'
      }}>
        <strong>💡 How to use:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li><strong>Auto-analyze Moves</strong> (ON by default) - Classifies each move you play (Brilliant, Blunder, etc.)</li>
          <li><strong>Show Best Move</strong> (OFF by default) - Toggle to see a <span style={{background: '#22c55e', padding: '2px 6px', borderRadius: 3, fontWeight: 700, color: 'white'}}>green arrow ➜</span> showing the engine's best move continuously</li>
          <li><strong>Get Hint</strong> - Click to see a <span style={{background: '#22c55e', padding: '2px 6px', borderRadius: 3, fontWeight: 700, color: 'white'}}>green arrow ➜</span> for just ONE move (disappears after you play)</li>
          <li>Click or drag pieces to make moves on the board</li>
          <li>Click on moves in the history to navigate back/forward</li>
          <li>The evaluation bar shows who has the advantage</li>
          <li><strong>Animated pulse</strong> at the starting square helps you find the move instantly!</li>
        </ul>
      </div>
    </div>
  );
}
