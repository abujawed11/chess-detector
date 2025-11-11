/**
 * moveExplanation.js
 * Chess.com-style move explanation system with tactical motif detection
 * Generates natural language explanations for why moves are good/bad
 */

import { Chess } from 'chess.js/dist/esm/chess.js';

/**
 * Detect if a piece is hanging (undefended or attacked by lower value piece)
 */
function detectHangingPieces(fen) {
  const chess = new Chess(fen);
  const board = chess.board();
  const hangingPieces = [];
  
  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;
      
      const square = String.fromCharCode(97 + file) + (8 - rank);
      const attackers = getAttackers(chess, square, piece.color === 'w' ? 'b' : 'w');
      const defenders = getAttackers(chess, square, piece.color);
      
      // Check if piece is hanging
      if (attackers.length > 0) {
        const minAttacker = Math.min(...attackers.map(a => pieceValues[a.type]));
        const minDefender = defenders.length > 0 ? Math.min(...defenders.map(d => pieceValues[d.type])) : Infinity;
        
        // Hanging if attacked by lower value or undefended
        if (defenders.length === 0 || minAttacker < pieceValues[piece.type]) {
          hangingPieces.push({
            square,
            piece: piece.type,
            color: piece.color,
            value: pieceValues[piece.type],
            attackers: attackers.length,
            defenders: defenders.length
          });
        }
      }
    }
  }
  
  return hangingPieces;
}

/**
 * Get all pieces attacking a square
 */
function getAttackers(chess, square, color) {
  const attackers = [];
  const moves = chess.moves({ verbose: true });
  
  // Check all possible moves for pieces of the given color
  const tempChess = new Chess(chess.fen());
  const pieces = [];
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = String.fromCharCode(97 + file) + (8 - rank);
      const piece = tempChess.get(sq);
      if (piece && piece.color === color) {
        pieces.push({ square: sq, type: piece.type });
      }
    }
  }
  
  for (const piece of pieces) {
    const pieceMoves = tempChess.moves({ square: piece.square, verbose: true });
    if (pieceMoves.some(m => m.to === square)) {
      attackers.push({ ...piece });
    }
  }
  
  return attackers;
}

/**
 * Detect available captures in the position
 */
function detectAvailableCaptures(fen) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  const captures = moves.filter(m => m.captured);
  
  return captures.map(m => ({
    from: m.from,
    to: m.to,
    piece: m.piece,
    captured: m.captured,
    notation: m.san
  }));
}

/**
 * Detect tactical forks (one piece attacking multiple pieces)
 */
function detectForks(fen) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  const forks = [];
  
  for (const move of moves) {
    const testChess = new Chess(fen);
    testChess.move(move);
    
    // Check what the moved piece attacks
    const movedPieceSquare = move.to;
    const attackedSquares = testChess.moves({ square: movedPieceSquare, verbose: true })
      .filter(m => m.captured)
      .map(m => ({ square: m.to, piece: m.captured }));
    
    if (attackedSquares.length >= 2) {
      forks.push({
        move: move.san,
        from: move.from,
        to: move.to,
        piece: move.piece,
        attacks: attackedSquares
      });
    }
  }
  
  return forks;
}

/**
 * Detect pins (piece cannot move without exposing a more valuable piece)
 */
function detectPins(fen) {
  const chess = new Chess(fen);
  const pins = [];
  const board = chess.board();
  
  // Check for each piece if removing it exposes a check or valuable piece
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.type === 'k') continue;
      
      const square = String.fromCharCode(97 + file) + (8 - rank);
      const testChess = new Chess(fen);
      
      // Temporarily remove piece
      testChess.remove(square);
      
      // Check if king is now in check or valuable piece attacked
      if (testChess.isCheck()) {
        pins.push({
          square,
          piece: piece.type,
          color: piece.color,
          type: 'absolute' // Cannot move without exposing king
        });
      }
    }
  }
  
  return pins;
}

/**
 * Detect if there's a mate threat
 */
function detectMateThreats(fen) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  
  for (const move of moves) {
    const testChess = new Chess(fen);
    testChess.move(move);
    
    if (testChess.isCheckmate()) {
      return {
        exists: true,
        move: move.san,
        from: move.from,
        to: move.to
      };
    }
  }
  
  return { exists: false };
}

/**
 * Compare two positions to detect what changed
 */
function comparePositions(fenBefore, fenAfter, movePlayed) {
  const changes = {
    newHangingPieces: [],
    removedThreats: [],
    missedCaptures: [],
    allowedMateThreats: false,
    lostMaterial: false
  };
  
  try {
    const hangingBefore = detectHangingPieces(fenBefore);
    const hangingAfter = detectHangingPieces(fenAfter);
    
    // New hanging pieces after the move
    changes.newHangingPieces = hangingAfter.filter(after => 
      !hangingBefore.some(before => before.square === after.square && before.piece === after.piece)
    );
    
    // Available captures that were not taken
    const capturesBefore = detectAvailableCaptures(fenBefore);
    const chessBefore = new Chess(fenBefore);
    const moveObj = chessBefore.moves({ verbose: true }).find(m => 
      m.from === movePlayed.substring(0, 2) && m.to === movePlayed.substring(2, 4)
    );
    
    if (!moveObj || !moveObj.captured) {
      changes.missedCaptures = capturesBefore.filter(c => c.captured !== 'p'); // Ignore pawn captures for now
    }
    
    // Check for new mate threats
    const mateAfter = detectMateThreats(fenAfter);
    changes.allowedMateThreats = mateAfter.exists;
    
  } catch (e) {
    console.warn('Error comparing positions:', e);
  }
  
  return changes;
}

/**
 * Detect tactical motifs in a position
 */
export function detectTacticalMotifs(fenBefore, fenAfter, movePlayed, evaluation) {
  const motifs = [];
  
  try {
    // Compare positions
    const changes = comparePositions(fenBefore, fenAfter, movePlayed);
    
    // Hanging pieces
    if (changes.newHangingPieces.length > 0) {
      const piece = changes.newHangingPieces[0];
      motifs.push({
        type: 'hanging_piece',
        severity: 'high',
        piece: piece.piece,
        square: piece.square,
        description: `${piece.piece.toUpperCase()} on ${piece.square} is now undefended`
      });
    }
    
    // Missed captures
    if (changes.missedCaptures.length > 0) {
      const capture = changes.missedCaptures[0];
      motifs.push({
        type: 'missed_capture',
        severity: 'medium',
        move: capture.notation,
        description: `Missed ${capture.notation} winning ${capture.captured.toUpperCase()}`
      });
    }
    
    // Allowed mate threats
    if (changes.allowedMateThreats) {
      motifs.push({
        type: 'allowed_mate_threat',
        severity: 'critical',
        description: 'Allowed opponent to threaten checkmate'
      });
    }
    
    // Detect from evaluation changes
    if (evaluation.cpLoss > 300) {
      motifs.push({
        type: 'blunder_major',
        severity: 'critical',
        cpLoss: evaluation.cpLoss,
        description: 'Major material or positional loss'
      });
    }
    
    // Missed mate
    if (evaluation.missedMate) {
      motifs.push({
        type: 'missed_mate',
        severity: 'critical',
        mateIn: evaluation.missedMate,
        description: `Missed mate in ${evaluation.missedMate}`
      });
    }
    
    // Brilliant sacrifice
    if (evaluation.isBrilliant && evaluation.cpLoss < 0) {
      motifs.push({
        type: 'brilliant_sacrifice',
        severity: 'positive',
        description: 'Brilliant sacrificial move with long-term compensation'
      });
    }
    
  } catch (e) {
    console.warn('Error detecting tactical motifs:', e);
  }
  
  return motifs;
}

/**
 * Generate natural language explanation for a move
 */
export function generateMoveExplanation(moveData) {
  const {
    classification,
    cpLoss,
    bestMove,
    bestMoveSan,
    playerMove,
    playerMoveSan,
    evalBefore,
    evalAfter,
    bestLine,
    motifs = [],
    fenBefore,
    fenAfter
  } = moveData;
  
  let reason = '';
  let category = 'general';
  let detailedAnalysis = '';
  
  // Get primary motif
  const primaryMotif = motifs.length > 0 ? motifs[0] : null;
  
  // Generate explanation based on classification
  switch (classification) {
    case 'brilliant':
      if (primaryMotif?.type === 'brilliant_sacrifice') {
        reason = 'Brilliant sacrifice! This move finds the only winning continuation despite appearing to lose material.';
        category = 'tactical';
      } else {
        reason = 'Brilliant move! This was the only move that maintains or achieves a winning advantage.';
        category = 'critical';
      }
      detailedAnalysis = `This exceptional move demonstrates deep calculation. ${bestLine ? `The key continuation is: ${bestLine.slice(0, 3).join(' ')}.` : ''}`;
      break;
      
    case 'best':
      reason = 'Best move! This maintains your advantage and keeps all options open.';
      category = 'positional';
      detailedAnalysis = 'You found the computer\'s top choice, showing excellent positional understanding.';
      break;
      
    case 'excellent':
      reason = 'Excellent move! Very close to the best option with minimal difference.';
      category = 'positional';
      detailedAnalysis = `This move is nearly as good as ${bestMoveSan || bestMove}, keeping a strong position.`;
      break;
      
    case 'good':
      reason = 'Good move! Solid and maintaining the position without significant errors.';
      category = 'positional';
      break;
      
    case 'book':
      reason = 'Book move! Following established opening theory.';
      category = 'opening';
      detailedAnalysis = 'This is a well-known theoretical move in this opening.';
      break;
      
    case 'inaccuracy':
      if (primaryMotif?.type === 'missed_capture') {
        reason = `Inaccuracy. ${primaryMotif.description}.`;
        category = 'tactical';
        detailedAnalysis = `Better was ${bestMoveSan || bestMove}, winning material or improving position.`;
      } else {
        reason = `Inaccuracy. ${bestMoveSan || bestMove} was more accurate, maintaining better control.`;
        category = 'positional';
        detailedAnalysis = `This move loses ${cpLoss} centipawns. ${bestMoveSan || bestMove} keeps the advantage.`;
      }
      break;
      
    case 'mistake':
      if (primaryMotif?.type === 'hanging_piece') {
        reason = `Mistake! ${primaryMotif.description}.`;
        category = 'tactical';
        detailedAnalysis = `You left your ${primaryMotif.piece.toUpperCase()} undefended on ${primaryMotif.square}. ${bestMoveSan || bestMove} would have kept your pieces safe.`;
      } else if (primaryMotif?.type === 'missed_capture') {
        reason = `Mistake! ${primaryMotif.description}.`;
        category = 'tactical';
        detailedAnalysis = `${bestMoveSan || bestMove} wins material immediately.`;
      } else {
        reason = `Mistake. ${bestMoveSan || bestMove} was much stronger.`;
        category = 'positional';
        detailedAnalysis = `This move loses ${cpLoss} centipawns of advantage. ${bestMoveSan || bestMove} maintains pressure.`;
      }
      break;
      
    case 'blunder':
      if (primaryMotif?.type === 'allowed_mate_threat') {
        reason = `Blunder!! ${primaryMotif.description}.`;
        category = 'tactical';
        detailedAnalysis = `This move allows checkmate threats. ${bestMoveSan || bestMove} was necessary to defend.`;
      } else if (primaryMotif?.type === 'hanging_piece') {
        reason = `Blunder!! You lost a ${primaryMotif.piece.toUpperCase()} by leaving it undefended on ${primaryMotif.square}.`;
        category = 'tactical';
        detailedAnalysis = `${bestMoveSan || bestMove} would have kept your pieces safe and maintained the position.`;
      } else if (primaryMotif?.type === 'missed_mate') {
        reason = `Blunder!! You missed mate in ${primaryMotif.mateIn}.`;
        category = 'tactical';
        detailedAnalysis = `${bestMoveSan || bestMove} forces checkmate. This was a game-ending missed opportunity.`;
      } else {
        reason = `Blunder!! This move severely damages your position.`;
        category = 'positional';
        detailedAnalysis = `You lost ${cpLoss} centipawns. ${bestMoveSan || bestMove} was critical to maintain your position.`;
      }
      break;
      
    case 'miss':
      if (primaryMotif?.type === 'missed_mate') {
        reason = `Missed opportunity! ${bestMoveSan || bestMove} forces mate in ${primaryMotif.mateIn}.`;
        category = 'tactical';
      } else {
        reason = `Missed opportunity! ${bestMoveSan || bestMove} was much stronger.`;
        category = 'tactical';
      }
      detailedAnalysis = 'You played a decent move but missed a winning tactic.';
      break;
      
    default:
      reason = `${classification}. Consider ${bestMoveSan || bestMove} instead.`;
      category = 'general';
  }
  
  return {
    reason,
    category,
    detailedAnalysis,
    betterMove: bestMoveSan || bestMove,
    betterMoveLine: bestLine,
    motifs,
    cpLoss,
    evalBefore,
    evalAfter
  };
}

/**
 * Analyze position difference and generate comprehensive explanation
 */
export async function analyzePositionWithExplanation(
  stockfishService,
  fenBefore,
  movePlayed,
  fenAfter,
  depth = 18
) {
  try {
    // Analyze position before move
    const analysisBefore = await stockfishService.analyze(fenBefore, { 
      depth, 
      multiPV: 3 
    });
    
    // Analyze position after move
    const analysisAfter = await stockfishService.analyze(fenAfter, { 
      depth, 
      multiPV: 3 
    });
    
    const bestMoveBefore = analysisBefore.lines[0]?.pv[0];
    const bestMoveSan = analysisBefore.lines[0]?.san;
    const bestLine = analysisBefore.lines[0]?.pv.slice(0, 5);
    
    // Calculate CP loss
    const evalBefore = analysisBefore.evaluation;
    const evalAfter = analysisAfter.evaluation;
    
    // Detect tactical motifs
    const motifs = detectTacticalMotifs(fenBefore, fenAfter, movePlayed, {
      cpLoss: Math.abs((evalBefore?.value || 0) - (evalAfter?.value || 0)),
      missedMate: evalBefore?.type === 'mate' ? evalBefore.value : null,
      isBrilliant: false
    });
    
    return {
      bestMove: bestMoveBefore,
      bestMoveSan,
      bestLine,
      evalBefore,
      evalAfter,
      motifs,
      analysisBefore,
      analysisAfter
    };
    
  } catch (e) {
    console.error('Error analyzing position:', e);
    return null;
  }
}

