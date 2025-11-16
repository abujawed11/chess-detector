/**
 * MoveExplanationCard.jsx
 * Chess.com-style move explanation display component
 */

import React from 'react';

const MoveExplanationCard = ({ 
  moveNumber,
  playerName,
  playerMove,
  classification,
  explanation,
  showDetails = true 
}) => {
  if (!explanation) return null;

  const getClassificationStyle = (classification) => {
    const styles = {
      brilliant: {
        bg: 'from-emerald-500 to-cyan-500',
        icon: '💎',
        textColor: 'text-white',
        border: 'border-cyan-300'
      },
      best: {
        bg: 'from-emerald-500 to-green-600',
        icon: '✓',
        textColor: 'text-white',
        border: 'border-green-400'
      },
      excellent: {
        bg: 'from-blue-500 to-blue-600',
        icon: '👍',
        textColor: 'text-white',
        border: 'border-blue-400'
      },
      good: {
        bg: 'from-slate-500 to-slate-600',
        icon: '✓',
        textColor: 'text-white',
        border: 'border-slate-400'
      },
      book: {
        bg: 'from-amber-600 to-yellow-700',
        icon: '📖',
        textColor: 'text-white',
        border: 'border-amber-400'
      },
      inaccuracy: {
        bg: 'from-yellow-400 to-amber-500',
        icon: '?!',
        textColor: 'text-slate-900',
        border: 'border-yellow-500'
      },
      mistake: {
        bg: 'from-orange-500 to-orange-600',
        icon: '?',
        textColor: 'text-white',
        border: 'border-orange-400'
      },
      blunder: {
        bg: 'from-red-600 to-red-700',
        icon: '??',
        textColor: 'text-white',
        border: 'border-red-500'
      },
      miss: {
        bg: 'from-orange-400 to-amber-500',
        icon: '⚠️',
        textColor: 'text-white',
        border: 'border-orange-400'
      }
    };
    return styles[classification] || styles.good;
  };

  const getCategoryIcon = (category) => {
    const icons = {
      tactical: '⚔️',
      positional: '📐',
      defensive: '🛡️',
      critical: '⚡',
      opening: '📚',
      endgame: '🏁',
      general: '♟️'
    };
    return icons[category] || icons.general;
  };

  const style = getClassificationStyle(classification);

  return (
    <div className={`rounded-xl border-2 ${style.border} bg-gradient-to-br ${style.bg} p-5 shadow-lg`}>
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className={`text-sm font-semibold ${style.textColor} opacity-90`}>
            Move {moveNumber} • {playerName}
          </div>
          <div className={`text-2xl font-bold ${style.textColor}`}>
            {playerMove}
          </div>
        </div>
        <div className="text-4xl">{style.icon}</div>
      </div>

      {/* Classification Badge */}
      <div className="mb-4">
        <span className={`inline-block rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold ${style.textColor} backdrop-blur-sm`}>
          {classification.toUpperCase()}
          {explanation.cpLoss > 0 && ` • -${explanation.cpLoss} cp`}
        </span>
      </div>

      {/* Main Reason */}
      <div className={`mb-4 text-base font-semibold ${style.textColor}`}>
        {getCategoryIcon(explanation.category)} {explanation.reason}
      </div>

      {/* Detailed Analysis */}
      {showDetails && explanation.detailedAnalysis && (
        <div className={`mb-4 rounded-lg bg-white/10 p-3 text-sm ${style.textColor} backdrop-blur-sm`}>
          {explanation.detailedAnalysis}
        </div>
      )}

      {/* Better Move Suggestion */}
      {explanation.betterMove && classification !== 'best' && classification !== 'brilliant' && (
        <div className="mt-4 rounded-lg bg-white/20 p-4 backdrop-blur-sm">
          <div className={`mb-2 text-xs font-bold ${style.textColor} opacity-75`}>
            BETTER MOVE
          </div>
          <div className={`mb-2 text-xl font-bold ${style.textColor}`}>
            {explanation.betterMove}
          </div>
          {explanation.betterMoveLine && explanation.betterMoveLine.length > 1 && (
            <div className={`text-sm ${style.textColor} opacity-90`}>
              <span className="font-semibold">Best line: </span>
              {explanation.betterMoveLine.slice(0, 5).join(' → ')}
            </div>
          )}
        </div>
      )}

      {/* Tactical Motifs */}
      {showDetails && explanation.motifs && explanation.motifs.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className={`text-xs font-bold ${style.textColor} opacity-75`}>
            TACTICAL INSIGHTS
          </div>
          {explanation.motifs.map((motif, idx) => (
            <div 
              key={idx}
              className={`flex items-start gap-2 rounded-md bg-white/15 p-2 text-xs ${style.textColor}`}
            >
              <span className="text-base">
                {motif.type === 'hanging_piece' && '🎯'}
                {motif.type === 'missed_capture' && '🔍'}
                {motif.type === 'allowed_mate_threat' && '☠️'}
                {motif.type === 'missed_mate' && '👑'}
                {motif.type === 'brilliant_sacrifice' && '💎'}
                {motif.type === 'blunder_major' && '⚠️'}
              </span>
              <span className="flex-1 font-medium">{motif.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Evaluation Change */}
      {showDetails && explanation.evalBefore !== undefined && explanation.evalAfter !== undefined && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-white/10 p-3 backdrop-blur-sm">
          <div>
            <div className={`text-xs font-semibold ${style.textColor} opacity-75`}>BEFORE</div>
            <div className={`text-lg font-bold ${style.textColor}`}>
              {explanation.evalBefore?.type === 'mate' 
                ? `M${explanation.evalBefore.value}`
                : (explanation.evalBefore?.value / 100).toFixed(2)}
            </div>
          </div>
          <div className={`text-2xl ${style.textColor}`}>→</div>
          <div>
            <div className={`text-xs font-semibold ${style.textColor} opacity-75`}>AFTER</div>
            <div className={`text-lg font-bold ${style.textColor}`}>
              {explanation.evalAfter?.type === 'mate' 
                ? `M${explanation.evalAfter.value}`
                : (explanation.evalAfter?.value / 100).toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoveExplanationCard;


