import { useMemo } from 'react';

export default function EvaluationBar({ score, height = 560 }) {
  // Calculate percentage for white
  const whitePercentage = useMemo(() => {
    if (!score) return 50;

    if (score.type === 'mate') {
      return score.value > 0 ? 100 : 0;
    }

    // Convert centipawns to percentage
    // Formula: 50 + 50 * (2 / (1 + exp(-0.004 * cp)) - 1)
    const cp = score.value;
    const percentage = 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1);
    return Math.max(0, Math.min(100, percentage));
  }, [score]);

  const displayText = useMemo(() => {
    if (!score) return '0.0';

    if (score.type === 'mate') {
      const moves = Math.abs(score.value);
      return `M${moves}`;
    }

    const eval_num = (score.value / 100).toFixed(1);
    return score.value > 0 ? `+${eval_num}` : eval_num;
  }, [score]);

  return (
    <div style={{
      width: 40,
      height,
      background: '#333',
      borderRadius: 8,
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }}>
      {/* Black advantage (top) */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: `${100 - whitePercentage}%`,
        background: 'linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%)',
        transition: 'height 0.3s ease'
      }} />

      {/* White advantage (bottom) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${whitePercentage}%`,
        background: 'linear-gradient(180deg, #f0f0f0 0%, #ffffff 100%)',
        transition: 'height 0.3s ease'
      }} />

      {/* Evaluation text */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: 12,
        fontWeight: 700,
        color: whitePercentage > 50 ? '#000' : '#fff',
        textShadow: whitePercentage > 50
          ? '0 1px 2px rgba(255,255,255,0.5)'
          : '0 1px 2px rgba(0,0,0,0.5)',
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        userSelect: 'none'
      }}>
        {displayText}
      </div>
    </div>
  );
}
