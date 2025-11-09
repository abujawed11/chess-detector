import { useMemo } from 'react';

/**
 * EvaluationBar - Shows position evaluation from White's perspective
 * @param {Object} score - Engine evaluation {type: 'cp'|'mate', value: number}
 * @param {string} fen - Current position FEN (needed to determine whose turn it is)
 * @param {number} height - Bar height in pixels
 */
export default function EvaluationBar({ score, fen, height = 560 }) {
  // Normalize score to White's perspective
  const normalizedScore = useMemo(() => {
    if (!score || !fen) return { type: 'cp', value: 0 };

    // Extract whose turn it is from FEN
    const turn = fen.split(' ')[1]; // 'w' or 'b'

    // If it's Black's turn, we need to flip the score
    // because engine gives score from side-to-move perspective
    if (turn === 'b') {
      return {
        type: score.type,
        value: -score.value
      };
    }

    return score;
  }, [score, fen]);

  // Calculate percentage for white (0-100)
  const whitePercentage = useMemo(() => {
    if (!normalizedScore) return 50;

    if (normalizedScore.type === 'mate') {
      // Mate: 100% for winning side, 0% for losing side
      return normalizedScore.value > 0 ? 100 : 0;
    }

    // Convert centipawns to win percentage
    // Using Lichess formula: 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
    const cp = normalizedScore.value;
    const percentage = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
    return Math.max(0, Math.min(100, percentage));
  }, [normalizedScore]);

  const displayText = useMemo(() => {
    if (!normalizedScore) return '0.0';

    if (normalizedScore.type === 'mate') {
      const moves = Math.abs(normalizedScore.value);
      const sign = normalizedScore.value > 0 ? '+' : '-';
      return `${sign}M${moves}`;
    }

    // Show evaluation from White's perspective
    const eval_num = Math.abs(normalizedScore.value / 100).toFixed(1);

    // Limit display to reasonable range
    if (Math.abs(normalizedScore.value) > 2000) {
      return normalizedScore.value > 0 ? '+20+' : '-20+';
    }

    return normalizedScore.value > 0 ? `+${eval_num}` : `-${eval_num}`;
  }, [normalizedScore]);

  // Determine if it's a mate position for special styling
  const isMate = normalizedScore?.type === 'mate';
  const isWhiteWinning = whitePercentage > 50;

  return (
    <div style={{
      width: 40,
      height,
      background: '#333',
      borderRadius: 8,
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      border: '2px solid #1a1a1a'
    }}>
      {/* Black advantage (top) */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: `${100 - whitePercentage}%`,
        background: isMate && !isWhiteWinning
          ? 'linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)' // Purple for Black mate
          : 'linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%)', // Normal black
        transition: 'height 0.3s ease'
      }} />

      {/* White advantage (bottom) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${whitePercentage}%`,
        background: isMate && isWhiteWinning
          ? 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)' // Gold for White mate
          : 'linear-gradient(180deg, #f0f0f0 0%, #ffffff 100%)', // Normal white
        transition: 'height 0.3s ease'
      }} />

      {/* Center line indicator at 50% */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: 2,
        background: 'rgba(100, 100, 100, 0.3)',
        transform: 'translateY(-50%)'
      }} />

      {/* Evaluation text */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: isMate ? 11 : 12,
        fontWeight: 700,
        color: isMate
          ? (isWhiteWinning ? '#7c2d12' : '#ffffff')
          : (whitePercentage > 50 ? '#000' : '#fff'),
        textShadow: whitePercentage > 50
          ? '0 1px 2px rgba(255,255,255,0.5)'
          : '0 1px 2px rgba(0,0,0,0.5)',
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        userSelect: 'none',
        padding: '4px',
        background: isMate ? 'rgba(0,0,0,0.2)' : 'transparent',
        borderRadius: 4
      }}>
        {displayText}
      </div>

      {/* Win percentage indicator (optional tooltip on hover) */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 8,
          fontWeight: 600,
          color: isWhiteWinning ? '#000' : '#fff',
          opacity: 0.6,
          userSelect: 'none'
        }}
        title={`White: ${whitePercentage.toFixed(1)}%`}
      >
        {whitePercentage.toFixed(0)}%
      </div>
    </div>
  );
}
