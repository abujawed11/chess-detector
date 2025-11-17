import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { useStockfish } from './hooks/useStockfish';
import InteractiveBoard from './components/InteractiveBoard';
import EvaluationBar from './components/EvaluationBar';
import MoveExplanationCard from './components/MoveExplanationCard';
import MoveDetailsPanel from './components/MoveDetailsPanel';
import { evaluateMove, getMoveBadge, getMoveExplanation } from './services/evaluationService';
import { parsePGN } from './utils/pgnParser';
import { API_BASE_URL } from './config/api';

// Helper functions (outside component to prevent re-creation on every render)
const getClassificationColor = (classification) => {
  const colors = {
    brilliant: '#1baca6',
    great: '#739abc',
    book: '#a88865',
    best: '#9bc02a',
    excellent: '#96bc4b',
    good: '#96af8b',
    miss: '#ffa500',
    inaccuracy: '#f0c15c',
    mistake: '#e58f2a',
    blunder: '#fa412d',
    unknown: '#9ca3af'
  };
  return colors[classification || 'unknown'] || '#9ca3af';
};

function getBadgeSymbol(classification) {
  if (!classification) return '';
  switch (classification.toLowerCase()) {
    case 'brilliant':
      return '!!';
    case 'great':
      return '!';
    case 'best':
      return '!';
    case 'excellent':
      return '!?';
    case 'good':
      return '✓';
    case 'miss':
      return '❌';
    case 'inaccuracy':
      return '?!';
    case 'mistake':
      return '?';
    case 'blunder':
      return '??';
    case 'book':
      return '⏺';
    default:
      return '';
  }
}

export default function PGNAnalysis() {
  const [pgnText, setPgnText] = useState('');
  const [game, setGame] = useState(null);
  const [moves, setMoves] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [currentPosition, setCurrentPosition] = useState(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedMoves, setAnalyzedMoves] = useState([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [gameInfo, setGameInfo] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1500);
  const [moveBadge, setMoveBadge] = useState(null); // { square, classification, label, color, symbol }
  const [lastMove, setLastMove] = useState(null);   // { from, to }
  const [analysisDepth, setAnalysisDepth] = useState(18); // Stockfish analysis depth
  const [fenCopied, setFenCopied] = useState(false); // Copy feedback state
  const [showEngineHint, setShowEngineHint] = useState(false); // Toggle engine hints
  const [bestMove, setBestMove] = useState(null); // Best move from engine
  const [currentEval, setCurrentEval] = useState(null); // Current position evaluation

  const fileInputRef = useRef(null);
  const playIntervalRef = useRef(null);
  const listContainerRef = useRef(null);
  const badgeTimeoutRef = useRef(null);

  const { initialized, analyze } = useStockfish();

  // Cleanup engine on component unmount
  useEffect(() => {
    return () => {
      // Stop engine when component unmounts
      fetch(`${API_BASE_URL}/stop_engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {
        // Ignore errors on unmount
      });
    };
  }, []);

  // Function to stop the engine and free resources
  const stopEngine = useCallback(async () => {
    try {
      console.log('🛑 Stopping Stockfish engine...');
      const response = await fetch(`${API_BASE_URL}/stop_engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      console.log('✅ Engine stopped:', data.message);
    } catch (err) {
      console.error('❌ Failed to stop engine:', err);
    }
  }, []);

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
      setCurrentPosition(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
      setAnalyzedMoves([]);
      setLastMove(null);
      setMoveBadge(null);
      return true;
    } catch (e) {
      console.error('Error parsing PGN:', e);
      alert('Invalid PGN format. Please check your file.');
      return false;
    }
  }, []);

  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        setPgnText(text);
        parsePGNText(text);
      };
      reader.readAsText(file);
    },
    [parsePGNText]
  );

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
          const evaluation = await evaluateMove(fen, uciMove, analysisDepth, 5);
          const badge = getMoveBadge(evaluation);

          analyzed.push({
            ...move,
            classification: evaluation.label.toLowerCase(),
            classificationLabel: evaluation.label,
            color: badge.color,
            cpLoss: evaluation.cpl || 0,
            evaluation: evaluation.evalAfter,
            isBrilliant: evaluation.label === 'Brilliant',
            isBrilliantV2:
              evaluation.label === 'Brilliant' ||
              evaluation.label === 'Great',
            brilliantAnalysis: evaluation.brilliantInfo || null,
            explanation:
              evaluation.explanation ||
              getMoveExplanation?.(evaluation) ||
              null,
            playerMoveSan: move.san,
            // Store full evaluation data for MoveDetailsPanel
            fullEvaluation: evaluation
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

      // IMPORTANT: Stop the engine after analysis completes to free CPU
      console.log('✅ Analysis complete! Stopping engine to free CPU...');
      await stopEngine();
    } catch (error) {
      console.error('Analysis error:', error);
      alert(
        `Analysis failed: ${error.message}\n\nTry refreshing the page and analyzing again.`
      );
      // Stop engine even on error
      await stopEngine();
    } finally {
      setIsAnalyzing(false);
    }
  }, [game, initialized, stopEngine, analysisDepth]);

  const navigateToMove = useCallback(
    (index) => {
      if (!game) return;

      const tempGame = new Chess();
      const history = game.history({ verbose: true });

      for (let i = 0; i <= index; i++) {
        tempGame.move(history[i]);
      }

      setCurrentMoveIndex(index);
      setCurrentPosition(tempGame.fen());

      // last move highlight
      const currentMove = history[index];
      if (currentMove) {
        setLastMove({
          from: currentMove.from,
          to: currentMove.to
        });
      }

      const analyzedMove = analyzedMoves[index];
      if (analyzedMove && analyzedMove.classification) {
        if (badgeTimeoutRef.current) {
          clearTimeout(badgeTimeoutRef.current);
        }

        const classification = analyzedMove.classification;
        const label = analyzedMove.classificationLabel;
        const color = getClassificationColor(classification);
        const symbol = getBadgeSymbol(classification);

        setMoveBadge({
          square: currentMove.to,
          classification,
          label,
          color,
          symbol
        });

        badgeTimeoutRef.current = setTimeout(() => {
          setMoveBadge(null);
        }, 5000);
      } else {
        setMoveBadge(null);
      }
    },
    [game, analyzedMoves]
  );

  const goToStart = useCallback(() => {
    setCurrentMoveIndex(-1);
    setCurrentPosition(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
    setLastMove(null);
    setMoveBadge(null);
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
    if (currentMoveIndex < moves.length - 1) {
      navigateToMove(currentMoveIndex + 1);
    }
  }, [currentMoveIndex, moves.length, navigateToMove]);

  const goToEnd = useCallback(() => {
    if (moves.length > 0) {
      navigateToMove(moves.length - 1);
    }
  }, [moves.length, navigateToMove]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
    // Clear best move when starting to play
    if (!isPlaying) {
      setBestMove(null);
    }
  }, [isPlaying]);

  const stopPlaying = useCallback(() => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  const copyFEN = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentPosition);
      setFenCopied(true);
      setTimeout(() => setFenCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy FEN:', err);
      alert('Failed to copy FEN to clipboard');
    }
  }, [currentPosition]);

  // Analyze current position with engine
  const analyzeCurrentPosition = useCallback(async () => {
    if (!initialized || !showEngineHint) {
      setBestMove(null);
      return;
    }

    // Don't analyze if game is over
    try {
      const tempGame = new Chess(currentPosition);
      if (tempGame.isGameOver()) {
        setBestMove(null);
        setCurrentEval(null);
        return;
      }
    } catch (e) {
      console.error('Error checking game over:', e);
      return;
    }

    try {
      const result = await analyze(currentPosition, { depth: analysisDepth, multiPV: 1 });
      setCurrentEval(result.evaluation);
      if (showEngineHint && result.lines && result.lines[0]) {
        setBestMove(result.lines[0].pv[0]);
      } else {
        setBestMove(null);
      }
    } catch (err) {
      console.error('Engine analysis error:', err);
      setBestMove(null);
    }
  }, [initialized, showEngineHint, currentPosition, analyze, analysisDepth]);

  // Analyze position when currentPosition or showEngineHint changes
  useEffect(() => {
    if (!isPlaying && showEngineHint && initialized) {
      const timer = setTimeout(() => analyzeCurrentPosition(), 300);
      return () => clearTimeout(timer);
    } else if (!showEngineHint || isPlaying) {
      setBestMove(null);
    }
  }, [currentPosition, showEngineHint, isPlaying, initialized, analyzeCurrentPosition]);

  // autoplay
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentMoveIndex((prev) => {
          if (prev >= moves.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
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
  }, [isPlaying, playSpeed, moves.length]);

  // Navigate to move when currentMoveIndex changes during playback
  useEffect(() => {
    if (isPlaying && currentMoveIndex >= 0) {
      navigateToMove(currentMoveIndex);
    }
  }, [currentMoveIndex, isPlaying, navigateToMove]);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        stopPlaying();
        goToPrevious();
      }
      if (e.key === 'ArrowRight') {
        stopPlaying();
        goToNext();
      }
      if (e.key === 'Home') {
        stopPlaying();
        goToStart();
      }
      if (e.key === 'End') {
        stopPlaying();
        goToEnd();
      }
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToPrevious, goToNext, goToStart, goToEnd, stopPlaying, togglePlay]);

  // move rows
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
        white: w
          ? {
            index: i,
            san: w.san,
            badge: wAnalyzed?.classificationLabel,
            cpLoss: wAnalyzed?.cpLoss,
            color: wAnalyzed?.color
          }
          : undefined,
        black: b
          ? {
            index: i + 1,
            san: b.san,
            badge: bAnalyzed?.classificationLabel,
            cpLoss: bAnalyzed?.cpLoss,
            color: bAnalyzed?.color
          }
          : undefined
      });
    }
    return out;
  }, [moves, analyzedMoves]);

  // autoscroll move list
  useEffect(() => {
    if (!listContainerRef.current || currentMoveIndex < 0) return;

    const container = listContainerRef.current;
    const el = container.querySelector(`[data-move="${currentMoveIndex}"]`);
    if (!el) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const isVisible =
      elRect.top >= containerRect.top &&
      elRect.bottom <= containerRect.bottom;

    if (!isVisible) {
      const scrollTop =
        el.offsetTop -
        container.offsetTop -
        container.clientHeight / 2 +
        el.clientHeight / 2;
      container.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
  }, [currentMoveIndex]);

  // stats
  const getStats = () => {
    if (analyzedMoves.length === 0) return null;

    const base = () => ({
      brilliant: 0,
      great: 0,
      book: 0,
      best: 0,
      excellent: 0,
      good: 0,
      miss: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0
    });

    const overall = base();
    const white = base();
    const black = base();

    analyzedMoves.forEach((m, index) => {
      if (overall.hasOwnProperty(m.classification)) {
        overall[m.classification] += 1;
        if (index % 2 === 0) white[m.classification] += 1;
        else black[m.classification] += 1;
      }
    });

    const totalCpLoss = analyzedMoves.reduce(
      (s, m) => s + (m.cpLoss || 0),
      0
    );
    const avgCpLoss = (totalCpLoss / analyzedMoves.length).toFixed(1);

    let whiteCpLoss = 0;
    let whiteCount = 0;
    let blackCpLoss = 0;
    let blackCount = 0;

    analyzedMoves.forEach((m, index) => {
      if (index % 2 === 0) {
        whiteCpLoss += m.cpLoss || 0;
        whiteCount++;
      } else {
        blackCpLoss += m.cpLoss || 0;
        blackCount++;
      }
    });

    const whiteAvgCpLoss =
      whiteCount > 0 ? (whiteCpLoss / whiteCount).toFixed(1) : '0.0';
    const blackAvgCpLoss =
      blackCount > 0 ? (blackCpLoss / blackCount).toFixed(1) : '0.0';

    return {
      overall: { ...overall, avgCpLoss },
      white: { ...white, avgCpLoss: whiteAvgCpLoss },
      black: { ...black, avgCpLoss: blackAvgCpLoss }
    };
  };

  const stats = getStats();

  // ───────────── Upload View ─────────────
  if (!game) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-8">
          <h2 className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-3xl font-bold text-transparent">
            PGN Game Analysis
          </h2>
          <p className="mt-2 text-slate-700">
            Upload a PGN file or paste game notation to analyze every move with
            Chess.com-style classification
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
          {initialized ? (
            <span className="text-green-600">✓ Ready</span>
          ) : (
            <span className="text-amber-600">⏳ Initializing...</span>
          )}
        </div>
      </div>
    );
  }

  // ───────────── Analysis View ─────────────
  return (
    <div className="mx-auto max-w-[1600px] bg-gradient-to-br from-slate-50 to-blue-50 p-5">
      {/* Header */}
      <div className="mb-4 rounded-xl border border-blue-200 bg-gradient-to-r from-white to-blue-50 p-6 shadow-md">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {gameInfo?.event}
            </h2>
            <p className="text-sm text-slate-600">{gameInfo?.date}</p>
          </div>
          <button
            onClick={async () => {
              stopPlaying();
              // Stop engine to free CPU
              await stopEngine();
              setGame(null);
              setPgnText('');
              setMoves([]);
              setAnalyzedMoves([]);
              setCurrentMoveIndex(-1);
              setLastMove(null);
              setMoveBadge(null);
            }}
            className="rounded-lg bg-gradient-to-r from-slate-100 to-slate-200 px-4 py-2 font-semibold text-slate-700 transition hover:from-slate-200 hover:to-slate-300"
          >
            📁 Load New Game
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-white/80 p-4 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
              White
            </div>
            <div className="text-lg font-bold text-slate-900">
              {gameInfo?.white}
              {gameInfo?.whiteElo !== '?' && (
                <span className="ml-2 text-sm font-normal text-slate-600">
                  ({gameInfo?.whiteElo})
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-white/80 p-4 shadow-sm">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
              Black
            </div>
            <div className="text-lg font-bold text-slate-900">
              {gameInfo?.black}
              {gameInfo?.blackElo !== '?' && (
                <span className="ml-2 text-sm font-normal text-slate-600">
                  ({gameInfo?.blackElo})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xl font-bold text-slate-700">
          Result: {gameInfo?.result}
        </div>
      </div>

      {/* CTA */}
      

      {/* MAIN 3-COLUMN ANALYSIS ROW:
          [Board + controls] | [Move History] | [Move Evaluation Details + Legend]
      */}
      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        {/* Column 1: Board + controls */}
        <div className="w-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm flex flex-col items-center">
          {/* <div className="w-full max-w-[520px]"> */}
          <InteractiveBoard
            fen={currentPosition}
            onMove={() => { }}
            bestMove={bestMove}
            flipped={flipped}
            moveBadge={moveBadge}
            lastMove={lastMove}
          />
          {/* </div> */}

          {/* Controls under board */}
          <div className="mt-4 w-full max-w-[520px] space-y-3">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  goToStart();
                }}
                disabled={currentMoveIndex === -1}
                className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400"
                title="Go to Start (Home)"
              >
                ⏮
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  stopPlaying();
                  goToPrevious();
                }}
                disabled={currentMoveIndex === -1}
                className="rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400"
                title="Previous Move (←)"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  togglePlay();
                }}
                disabled={moves.length === 0}
                className="rounded-lg bg-gradient-to-br from-green-500 to-green-600 px-6 py-3 font-bold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:hover:scale-100"
                title="Play/Pause (Space)"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  stopPlaying();
                  goToNext();
                }}
                disabled={currentMoveIndex >= moves.length - 1}
                className="rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400"
                title="Next Move (→)"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  goToEnd();
                }}
                disabled={currentMoveIndex >= moves.length - 1}
                className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-3 font-bold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400"
                title="Go to End (End)"
              >
                ⏭
              </button>
              <div className="mx-2 h-10 w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent" />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setFlipped(!flipped);
                }}
                className="rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95"
                title="Flip Board"
              >
                🔄
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  copyFEN();
                }}
                disabled={isPlaying}
                className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400"
                title="Copy FEN (enabled when paused)"
              >
                {fenCopied ? '✓ Copied!' : '📋 Copy FEN'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowEngineHint(!showEngineHint);
                }}
                disabled={isPlaying}
                className={`rounded-lg px-4 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:from-slate-300 disabled:to-slate-400 ${
                  showEngineHint
                    ? 'bg-gradient-to-br from-green-500 to-green-600'
                    : 'bg-gradient-to-br from-slate-500 to-slate-600'
                }`}
                title={`${showEngineHint ? 'Hide' : 'Show'} engine hint (enabled when paused)`}
              >
                {showEngineHint ? '🔍 Hide Hint' : '💡 Show Hint'}
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 rounded-lg bg-slate-50 px-4 py-3 shadow-inner">
              <span className="text-sm font-semibold text-slate-700">
                ⚡ Speed:
              </span>
              <div className="flex gap-2">
                {[
                  { label: '0.5×', value: 3000, color: 'from-amber-400 to-amber-500' },
                  { label: '1×', value: 1500, color: 'from-emerald-400 to-emerald-500' },
                  { label: '2×', value: 750, color: 'from-cyan-400 to-cyan-500' },
                  { label: '3×', value: 500, color: 'from-violet-400 to-violet-500' }
                ].map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setPlaySpeed(s.value);
                    }}
                    className={`rounded-md px-4 py-2 text-sm font-bold shadow-sm transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95 ${playSpeed === s.value
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

            {/* Engine Evaluation Display */}
            {showEngineHint && currentEval && (
              <div className="mt-3 rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 px-4 py-2 text-center shadow-sm">
                <div className="text-xs font-semibold text-slate-600">Engine Evaluation</div>
                <div className="text-lg font-bold text-green-700">
                  {currentEval.type === 'mate'
                    ? `Mate in ${Math.abs(currentEval.value)}`
                    : currentEval.type === 'cp'
                    ? (currentEval.value / 100).toFixed(2)
                    : '0.00'}
                </div>
              </div>
            )}
          </div>

          {/* Legend: symbols for each move type */}
          <div className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">
              Move Type Legend
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {[
                'brilliant',
                'great',
                'best',
                'excellent',
                'good',
                'miss',
                'inaccuracy',
                'mistake',
                'blunder',
                'book'
              ].map((cls) => {
                const label = cls[0].toUpperCase() + cls.slice(1);
                const color = getClassificationColor(cls);
                const symbol = getBadgeSymbol(cls);

                return (
                  <div
                    key={cls}
                    className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1"
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {symbol}
                    </span>
                    <span className="text-[11px] font-medium text-slate-700">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>


        </div>


        <div className="flex flex-col gap-4">

          {/* Column 2: Move History */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
            <h3 className="mb-3 text-lg font-bold text-slate-800">
              Move History
            </h3>
            <div
              ref={listContainerRef}
              className="max-h-[650px] overflow-y-auto rounded-lg ring-1 ring-slate-200"
            >
              <div className="sticky top-0 z-10 grid grid-cols-[64px_1fr_1fr] gap-2 bg-slate-100/70 px-3 py-2 text-xs font-semibold text-slate-600">
                <div>#</div>
                <div>White</div>
                <div>Black</div>
              </div>

              {rows.map((row) => (
                <div
                  key={row.turn}
                  className="grid grid-cols-[64px_1fr_1fr] items-stretch gap-2 border-b border-slate-200/70 px-3 py-1.5"
                >
                  <div className="flex select-none items-center justify-center text-xs text-slate-500">
                    {row.turn}.
                  </div>

                  <MoveCell
                    side="w"
                    data={row.white}
                    isCurrent={row.white?.index === currentMoveIndex}
                    onClick={() =>
                      row.white && navigateToMove(row.white.index)
                    }
                    getColor={getClassificationColor}
                  />
                  <MoveCell
                    side="b"
                    data={row.black}
                    isCurrent={row.black?.index === currentMoveIndex}
                    onClick={() =>
                      row.black && navigateToMove(row.black.index)
                    }
                    getColor={getClassificationColor}
                  />
                </div>
              ))}
            </div>
          </div>


          {/* Column 3: Move Evaluation Details + Legend */}
          <div className="flex flex-col gap-4">
            {/* Detailed Move Evaluation Data */}
            {currentMoveIndex >= 0 && analyzedMoves[currentMoveIndex]?.fullEvaluation && (
              <MoveDetailsPanel
                moveData={analyzedMoves[currentMoveIndex].fullEvaluation}
                visible={true}
              />
            )}

            {/* Move Explanation Card */}
            {currentMoveIndex >= 0 &&
              analyzedMoves[currentMoveIndex] &&
              analyzedMoves[currentMoveIndex].explanation && (
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                <h3 className="mb-3 text-lg font-bold text-emerald-800">
                  Move Explanation
                </h3>
                <MoveExplanationCard
                  moveNumber={currentMoveIndex + 1}
                  playerName={
                    currentMoveIndex % 2 === 0
                      ? gameInfo?.white || 'White'
                      : gameInfo?.black || 'Black'
                  }
                  playerMove={
                    analyzedMoves[currentMoveIndex].playerMoveSan ||
                    moves[currentMoveIndex]?.san ||
                    ''
                  }
                  classification={
                    analyzedMoves[currentMoveIndex].classification
                  }
                  explanation={analyzedMoves[currentMoveIndex].explanation}
                  showDetails={true}
                />
              </div>
            )}

            {currentMoveIndex < 0 && (
              <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
                Click on a move from the move list to see detailed evaluation and explanation.
              </p>
            )}
          </div>
        </div>
      </div>


      {analyzedMoves.length === 0 && !isAnalyzing && (
        <div className="mb-4 rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 p-6 text-center shadow-md">
          <p className="mb-2 text-lg font-semibold text-slate-800">
            Ready to analyze{' '}
            <strong className="text-purple-600">{moves.length}</strong> moves
          </p>

          {/* Depth Selection */}
          <div className="mb-4 flex items-center justify-center gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Analysis Depth:
            </label>
            <select
              value={analysisDepth}
              onChange={(e) => setAnalysisDepth(Number(e.target.value))}
              className="rounded-lg border-2 border-purple-300 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm transition hover:border-purple-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
            >
              <option value={15}>15 (Fast)</option>
              <option value={18}>18 (Balanced)</option>
              <option value={20}>20 (Deep)</option>
              <option value={22}>22 (Very Deep)</option>
            </select>
          </div>

          <p className="mb-4 text-sm text-slate-700">
            ⏱️ Estimated time:{' '}
            <strong className="text-purple-600">
              {Math.round((moves.length * (analysisDepth === 15 ? 5 : analysisDepth === 18 ? 8 : analysisDepth === 20 ? 12 : 15)) / 60)}–
              {Math.round((moves.length * (analysisDepth === 15 ? 8 : analysisDepth === 18 ? 12 : analysisDepth === 20 ? 18 : 22)) / 60)} minutes
            </strong>{' '}
            (depth {analysisDepth})
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
              🔍 Analyzing game... (
              {Math.round((analysisProgress / 100) * moves.length)}/
              {moves.length} moves)
            </span>
            <span className="text-sm font-semibold text-purple-600">
              {Math.round(analysisProgress)}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
              style={{ width: `${analysisProgress}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-700">
            ⚡ This may take a few minutes. Check console (F12) for detailed
            progress.
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            📊 Using depth: <strong className="text-purple-600">{analysisDepth}</strong>
          </p>
        </div>
      )}

      {/* Stats (pushed to bottom, after main row) */}
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
                    <div
                      key={key}
                      className="rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 p-2.5 text-center shadow-sm"
                    >
                      <div className="text-xl font-bold text-slate-900">
                        {value}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-600">
                        Avg Loss
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={key}
                    className="rounded-lg p-2.5 text-center shadow-sm"
                    style={{
                      backgroundColor: getClassificationColor(key) + '30'
                    }}
                  >
                    <div
                      className="text-xl font-bold"
                      style={{ color: getClassificationColor(key) }}
                    >
                      {value}
                    </div>
                    <div className="text-[10px] font-semibold capitalize text-slate-700">
                      {key}
                    </div>
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
                    <div
                      key={key}
                      className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-500 p-2.5 text-center shadow-sm"
                    >
                      <div className="text-xl font-bold text-white">
                        {value}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-200">
                        Avg Loss
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={key}
                    className="rounded-lg p-2.5 text-center shadow-sm"
                    style={{
                      backgroundColor: getClassificationColor(key) + '50'
                    }}
                  >
                    <div className="text-xl font-bold text-white">
                      {value}
                    </div>
                    <div className="text-[10px] font-semibold capitalize text-white/90">
                      {key}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overall Stats */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-700">
              📊 Overall Game Statistics
            </h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-10">
              {Object.entries(stats.overall).map(([key, value]) => {
                if (key === 'avgCpLoss') {
                  return (
                    <div
                      key={key}
                      className="rounded-md bg-white/70 p-2 text-center shadow-sm"
                    >
                      <div className="text-lg font-bold text-slate-900">
                        {value}
                      </div>
                      <div className="text-[9px] font-semibold text-slate-600">
                        Avg Loss
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={key}
                    className="rounded-md p-2 text-center shadow-sm"
                    style={{
                      backgroundColor: getClassificationColor(key) + '20'
                    }}
                  >
                    <div
                      className="text-lg font-bold"
                      style={{ color: getClassificationColor(key) }}
                    >
                      {value}
                    </div>
                    <div className="text-[9px] font-semibold capitalize text-slate-700">
                      {key}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts footer */}
      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
        <span className="font-bold text-blue-900">⌨️ Shortcuts:</span>
        <span className="ml-2 text-blue-700">
          Space: Play/Pause | ← Prev | → Next | Home: Start | End: Last
        </span>
      </div>
    </div>
  );
}

/* ---------- Move cell ---------- */
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
        className={`truncate text-left text-[15px] font-semibold ${isCurrent ? 'text-emerald-700' : 'text-slate-800'
          }`}
        title={`Go to move ${data.san}`}
      >
        {data.san}
      </button>

      {data.badge && (
        <div className="flex items-center gap-2">
          {typeof data.cpLoss === 'number' && data.cpLoss > 0 && (
            <span
              className={`text-[11px] font-semibold ${isCurrent ? 'text-emerald-700' : 'text-slate-600'
                }`}
            >
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
