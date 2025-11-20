// PlayComputer.jsx - Play against Stockfish with ELO-based difficulty

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { useStockfish } from './hooks/useStockfish';
import InteractiveBoard from './components/InteractiveBoard';
import EvaluationBar from './components/EvaluationBar';
import MoveHistory from './components/MoveHistory';

// ELO to depth mapping
const DIFFICULTY_LEVELS = [
  { name: 'Beginner', elo: 800, depth: 4, description: 'Just learning the basics' },
  { name: 'Easy', elo: 1000, depth: 6, description: 'Casual player' },
  { name: 'Medium', elo: 1400, depth: 10, description: 'Club player' },
  { name: 'Hard', elo: 1800, depth: 14, description: 'Advanced player' },
  { name: 'Expert', elo: 2000, depth: 18, description: 'Tournament strength' },
  { name: 'Master', elo: 2200, depth: 20, description: 'Master level' },
  { name: 'Grandmaster', elo: 2500, depth: 22, description: 'Elite strength' },
];

export default function PlayComputer() {
  // Game setup state
  const [gameStarted, setGameStarted] = useState(false);
  const [playerColor, setPlayerColor] = useState('w'); // 'w' for white, 'b' for black
  const [difficulty, setDifficulty] = useState(DIFFICULTY_LEVELS[2]); // Default: Medium

  // Game state
  const [game] = useState(new Chess());
  const [currentFen, setCurrentFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [moves, setMoves] = useState([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [flipped, setFlipped] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [currentEval, setCurrentEval] = useState(null);
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const [gameResult, setGameResult] = useState(null); // null, 'win', 'loss', 'draw'
  const [gameResultMessage, setGameResultMessage] = useState('');

  // Create a pre-normalized evaluation for display
  // Since EvaluationBar already normalizes based on FEN, we store as-is
  // But we'll pass a custom FEN to prevent double-flipping
  // const evalForDisplay = useMemo(() => {
  //   if (!currentEval || !currentFen) return null;

  //   const turn = currentFen.split(' ')[1];

  //   // The engine returns score from side-to-move perspective
  //   // Normalize to White's perspective here
  //   if (turn === 'b') {
  //     return {
  //       type: currentEval.type,
  //       value: -currentEval.value
  //     };
  //   }
  //   return currentEval;
  // }, [currentEval, currentFen]);

  const { initialized, analyzing, analyze, error } = useStockfish();
  const computerMoveTimeoutRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (computerMoveTimeoutRef.current) {
        clearTimeout(computerMoveTimeoutRef.current);
      }
    };
  }, []);

  // Start the game
  const startGame = useCallback(() => {
    game.reset();
    setCurrentFen(game.fen());
    setMoves([]);
    setCurrentMoveIndex(-1);
    setLastMove(null);
    setCurrentEval(null);
    setGameResult(null);
    setGameResultMessage('');
    setIsComputerThinking(false);
    setGameStarted(true);
    setFlipped(playerColor === 'b');
    // Computer move will be triggered by the useEffect when it detects it's computer's turn
  }, [game, playerColor]);

  // Check if it's the computer's turn
  const isComputerTurn = useCallback(() => {
    if (!gameStarted) return false;
    const turn = currentFen.split(' ')[1];
    return turn !== playerColor;
  }, [gameStarted, currentFen, playerColor]);

  // Make computer move
  const makeComputerMove = useCallback(async () => {
    if (!initialized || !isComputerTurn()) return;

    setIsComputerThinking(true);

    try {
      // Add slight delay for better UX (feels more natural)
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

      const result = await analyze(currentFen, { depth: difficulty.depth, multiPV: 1 });

      if (result?.bestMove) {
        const bestMove = result.bestMove;

        // Parse the UCI move
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        const promotion = bestMove.length > 4 ? bestMove[4] : undefined;

        // Make the move
        const moveResult = game.move({
          from,
          to,
          promotion
        });

        if (moveResult) {
          const newFen = game.fen();
          setCurrentFen(newFen);
          setLastMove({ from, to });

          // Add to move history
          const newMove = {
            from,
            to,
            san: moveResult.san,
            piece: moveResult.piece,
            captured: moveResult.captured,
            promotion: moveResult.promotion,
            color: moveResult.color
          };
          setMoves(prev => [...prev, newMove]);
          setCurrentMoveIndex(prev => prev + 1);

          // Check for game over
          const isOver = checkGameOver(newFen);

          // Analyze the NEW position to get correct evaluation
          if (!isOver) {
            try {
              const newResult = await analyze(newFen, { depth: Math.min(difficulty.depth, 10), multiPV: 1 });
              if (newResult?.evaluation) {
                setCurrentEval(newResult.evaluation);
              }
            } catch (err) {
              console.error('Post-move analysis error:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Computer move error:', err);
    } finally {
      setIsComputerThinking(false);
    }
  }, [initialized, isComputerTurn, analyze, currentFen, difficulty.depth, game]);

  // Effect to trigger computer move when it's computer's turn
  useEffect(() => {
    if (gameStarted && initialized && isComputerTurn() && !isComputerThinking && !gameResult) {
      // Small delay before computer starts thinking
      computerMoveTimeoutRef.current = setTimeout(() => {
        makeComputerMove();
      }, 100);
    }

    return () => {
      if (computerMoveTimeoutRef.current) {
        clearTimeout(computerMoveTimeoutRef.current);
      }
    };
  }, [gameStarted, initialized, isComputerTurn, isComputerThinking, makeComputerMove, gameResult]);



  // Convert engine eval (side-to-move POV) into White's POV
  function normalizeEvalToWhite(fen, evaluation) {
    if (!evaluation) return null;

    const parts = fen.split(' ');
    const turn = parts[1]; // 'w' or 'b'

    // Clone to avoid mutating original
    const norm = { ...evaluation };

    // For cp and mate both, sign indicates who is better / who is mating
    if (turn === 'b') {
      norm.value = -norm.value;
    }
    // if turn === 'w', value is already White POV

    return norm;
  }


  // Check for game over
  const checkGameOver = useCallback((fen) => {
    try {
      const tempGame = new Chess(fen);
      if (tempGame.isGameOver()) {
        const turn = tempGame.turn();

        if (tempGame.isCheckmate()) {
          // The side to move is in checkmate, so the other side won
          const winnerColor = turn === 'w' ? 'b' : 'w';
          if (winnerColor === playerColor) {
            setGameResult('win');
            setGameResultMessage('Checkmate! You win!');
          } else {
            setGameResult('loss');
            setGameResultMessage('Checkmate! You lose.');
          }
        } else if (tempGame.isStalemate()) {
          setGameResult('draw');
          setGameResultMessage('Stalemate - Draw');
        } else if (tempGame.isThreefoldRepetition()) {
          setGameResult('draw');
          setGameResultMessage('Draw by Threefold Repetition');
        } else if (tempGame.isInsufficientMaterial()) {
          setGameResult('draw');
          setGameResultMessage('Draw by Insufficient Material');
        } else if (tempGame.isDraw()) {
          setGameResult('draw');
          setGameResultMessage('Draw by Fifty-Move Rule');
        }
        return true;
      }
    } catch (e) {
      console.error('Error checking game over:', e);
    }
    return false;
  }, [playerColor]);

  // Handle player move
  const handleMove = useCallback(async (move, newFen) => {
    if (!gameStarted || isComputerTurn() || gameResult) return;

    // Update game state
    try {
      game.load(newFen);
    } catch (e) {
      console.error('Failed to load new FEN:', e);
      return;
    }

    setCurrentFen(newFen);
    setLastMove({ from: move.from, to: move.to });

    // Add to move history
    const newMove = {
      from: move.from,
      to: move.to,
      san: move.san,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion,
      color: move.color
    };
    setMoves(prev => [...prev, newMove]);
    setCurrentMoveIndex(prev => prev + 1);

    // Check for game over
    const isOver = checkGameOver(newFen);

    // Analyze position after player's move to update evaluation
    if (!isOver && initialized) {
      try {
        const result = await analyze(newFen, { depth: Math.min(difficulty.depth, 12), multiPV: 1 });
        if (result?.evaluation) {
          setCurrentEval(result.evaluation);  // raw from engine
          console.log("Current Eval",result.evaluation)
          ;
        }
      } catch (err) {
        console.error('Quick analysis error:', err);
      }
    }
  }, [gameStarted, isComputerTurn, gameResult, game, checkGameOver, initialized, analyze, difficulty.depth]);

  // Resign game
  const resign = useCallback(() => {
    setGameResult('loss');
    setGameResultMessage('You resigned');
  }, []);

  // Offer draw (computer always declines for now)
  const offerDraw = useCallback(() => {
    alert('The computer declines your draw offer.');
  }, []);

  // New game
  const newGame = useCallback(() => {
    setGameStarted(false);
    setGameResult(null);
    setGameResultMessage('');
    game.reset();
    setCurrentFen(game.fen());
    setMoves([]);
    setCurrentMoveIndex(-1);
    setLastMove(null);
    setCurrentEval(null);
    setIsComputerThinking(false);
  }, [game]);

  // Navigate to move (for move history)
  const navigateToMove = useCallback((moveIndex) => {
    if (moveIndex === -1) {
      game.reset();
      setCurrentFen(game.fen());
      setCurrentMoveIndex(-1);
      setLastMove(null);
      return;
    }

    if (moveIndex < 0 || moveIndex >= moves.length) return;

    try {
      game.reset();
      for (let i = 0; i <= moveIndex; i++) {
        const m = moves[i];
        game.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion
        });
      }
      setCurrentFen(game.fen());
      setCurrentMoveIndex(moveIndex);
      if (moves[moveIndex]) {
        setLastMove({ from: moves[moveIndex].from, to: moves[moveIndex].to });
      }
    } catch (e) {
      console.error('Error navigating to move:', e);
    }
  }, [game, moves]);

  // Determine if player can move (their turn and not reviewing history)
  const canPlayerMove = gameStarted &&
    !isComputerTurn() &&
    !gameResult &&
    currentMoveIndex === moves.length - 1;

  const turn = currentFen.split(' ')[1];

  // Game setup screen
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="mx-auto max-w-2xl px-6">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-2">Play vs Computer</h1>
            <p className="text-slate-400">Challenge Stockfish 17.1 at your skill level</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-8 backdrop-blur-sm">
            {/* Color selection */}
            <div className="mb-8">
              <h3 className="mb-4 text-lg font-semibold text-white">Choose Your Color</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPlayerColor('w')}
                  className={`rounded-xl p-6 text-center transition ${playerColor === 'w'
                      ? 'bg-white text-slate-900 shadow-lg ring-4 ring-green-500 ring-offset-2 ring-offset-slate-900'
                      : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                >
                  <div className="text-5xl mb-2">♔</div>
                  <div className="font-bold flex items-center justify-center gap-2">
                    White
                    {playerColor === 'w' && <span className="text-green-600">✓</span>}
                  </div>
                  <div className="text-sm opacity-75">Play first</div>
                </button>
                <button
                  onClick={() => setPlayerColor('b')}
                  className={`rounded-xl p-6 text-center transition ${playerColor === 'b'
                      ? 'bg-slate-800 text-white shadow-lg ring-4 ring-green-500 ring-offset-2 ring-offset-slate-900'
                      : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                >
                  <div className="text-5xl mb-2">♚</div>
                  <div className="font-bold flex items-center justify-center gap-2">
                    Black
                    {playerColor === 'b' && <span className="text-green-400">✓</span>}
                  </div>
                  <div className="text-sm opacity-75">Computer plays first</div>
                </button>
              </div>
            </div>

            {/* Difficulty selection */}
            <div className="mb-8">
              <h3 className="mb-4 text-lg font-semibold text-white">Select Difficulty</h3>
              <div className="space-y-2">
                {DIFFICULTY_LEVELS.map((level) => (
                  <button
                    key={level.name}
                    onClick={() => setDifficulty(level)}
                    className={`w-full rounded-lg p-4 text-left transition ${difficulty.name === level.name
                        ? 'bg-green-600 text-white ring-2 ring-green-400 ring-offset-2 ring-offset-slate-900'
                        : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{level.name}</span>
                          {difficulty.name === level.name && (
                            <span className="text-green-200">✓</span>
                          )}
                        </div>
                        <div className="text-sm opacity-75">{level.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{level.elo}</div>
                        <div className="text-xs opacity-75">ELO</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Engine status */}
            <div className={`mb-6 rounded-lg p-4 ${initialized ? 'bg-green-600/20 text-green-400' : 'bg-amber-600/20 text-amber-400'
              }`}>
              <div className="flex items-center gap-2">
                {initialized ? (
                  <>
                    <span className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="font-semibold">Stockfish 17.1 Ready</span>
                  </>
                ) : (
                  <>
                    <span className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
                    <span className="font-semibold">Loading engine...</span>
                  </>
                )}
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={startGame}
              disabled={!initialized}
              className={`w-full rounded-xl py-4 text-xl font-bold transition ${initialized
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                }`}
            >
              {initialized ? 'Start Game' : 'Waiting for engine...'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game screen
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 text-slate-900">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="m-0 mb-2 text-2xl font-bold tracking-tight">
            Play vs Computer
            <span className="ml-3 rounded-lg bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
              {difficulty.name} ({difficulty.elo} ELO)
            </span>
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <span className={`rounded-lg px-3 py-1 ${turn === playerColor
                ? 'bg-green-100 text-green-700 font-bold'
                : 'bg-slate-100 text-slate-600'
              }`}>
              {turn === 'w' ? 'White' : 'Black'} to move
              {turn === playerColor && ' (You)'}
              {turn !== playerColor && ' (Computer)'}
            </span>
            {isComputerThinking && (
              <span className="flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-1.5 text-blue-700 font-semibold">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                Thinking...
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFlipped(f => !f)}
            className="rounded-lg bg-violet-600 px-4 py-2 font-bold text-white"
          >
            Flip Board
          </button>

          {!gameResult && (
            <>
              <button
                onClick={offerDraw}
                className="rounded-lg bg-amber-600 px-4 py-2 font-bold text-white"
              >
                Offer Draw
              </button>
              <button
                onClick={resign}
                className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white"
              >
                Resign
              </button>
            </>
          )}

          <button
            onClick={newGame}
            className="rounded-lg bg-slate-700 px-4 py-2 font-bold text-white"
          >
            New Game
          </button>
        </div>
      </div>

      {/* Game result banner */}
      {gameResult && (
        <div className={`mb-4 rounded-xl p-4 text-center text-lg font-bold ${gameResult === 'win'
            ? 'bg-green-100 text-green-700'
            : gameResult === 'loss'
              ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
          {gameResultMessage}
          <button
            onClick={newGame}
            className="ml-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            Play Again
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col items-center gap-5 xl:flex-row xl:items-start xl:justify-center">
        {/* Left side: Evaluation bar + Board */}
        <div className="flex items-start gap-4">
          {/* Evaluation bar */}
          <div className="w-12 shrink-0">
            {/* Pass raw eval with real FEN - EvaluationBar will normalize to White's perspective */}
            <EvaluationBar
              score={currentEval}
              fen={currentFen}
              height={680}
            />
          </div>

          {/* Board column */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <InteractiveBoard
                fen={currentFen}
                onMove={canPlayerMove ? handleMove : undefined}
                flipped={flipped}
                lastMove={lastMove}
              />
            </div>

            {/* Move navigation */}
            <div className="flex w-[680px] justify-center gap-2">
              <button
                onClick={() => navigateToMove(-1)}
                disabled={currentMoveIndex === -1}
                className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                ⏮
              </button>
              <button
                onClick={() => navigateToMove(currentMoveIndex - 1)}
                disabled={currentMoveIndex === -1}
                className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                ◀
              </button>
              <button
                onClick={() => navigateToMove(currentMoveIndex + 1)}
                disabled={currentMoveIndex === moves.length - 1}
                className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                ▶
              </button>
              <button
                onClick={() => navigateToMove(moves.length - 1)}
                disabled={currentMoveIndex === moves.length - 1}
                className="min-w-[60px] rounded-lg bg-slate-900 px-5 py-3 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                ⏭
              </button>
            </div>

            {/* Note about reviewing moves */}
            {currentMoveIndex !== moves.length - 1 && (
              <div className="w-[680px] rounded-lg bg-amber-100 px-4 py-2 text-center text-sm text-amber-700">
                Reviewing move history. Click ⏭ to return to the current position and continue playing.
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full max-w-[400px] space-y-3 xl:sticky xl:top-4 xl:w-[400px] xl:shrink-0">
          {/* Computer thinking indicator */}
          {isComputerThinking && (
            <div className="rounded-xl border-2 border-blue-400 bg-blue-50 p-4 shadow">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                <div>
                  <div className="font-bold text-blue-700">Computer is thinking...</div>
                  <div className="text-sm text-blue-600">Depth: {difficulty.depth}</div>
                </div>
              </div>
            </div>
          )}

          {/* Game info */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
            <h3 className="mb-3 font-bold text-slate-700">Game Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">You play as:</span>
                <span className="font-bold">{playerColor === 'w' ? 'White' : 'Black'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Difficulty:</span>
                <span className="font-bold">{difficulty.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Computer ELO:</span>
                <span className="font-bold">{difficulty.elo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Search depth:</span>
                <span className="font-bold">{difficulty.depth}</span>
              </div>
            </div>
          </div>

          {/* Current evaluation */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
            <h3 className="mb-2 font-bold text-slate-700">Evaluation</h3>
            {currentEval ? (
              <div className={`font-mono text-2xl font-extrabold ${currentEval.type === 'mate'
                  ? 'text-red-700'
                  : currentEval.value > 0
                    ? 'text-green-600'
                    : currentEval.value < 0
                      ? 'text-blue-900'
                      : 'text-slate-700'
                }`}>
                {currentEval.type === 'mate'
                  ? `Mate in ${Math.abs(currentEval.value)}`
                  : `${(currentEval.value / 100).toFixed(2)}`}
              </div>
            ) : (
              <div className="text-slate-500">-</div>
            )}
          </div>

          {/* Move history */}
          <div className="max-h-[400px] min-h-[200px] overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow">
            <h3 className="mb-3 font-bold text-slate-700">Move History</h3>
            <MoveHistory
              moves={moves}
              currentMoveIndex={currentMoveIndex}
              onMoveClick={navigateToMove}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
