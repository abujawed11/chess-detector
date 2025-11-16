/**
 * MoveDetailsPanel - Displays detailed backend evaluation data for a move
 * Shows all properties returned from /evaluate endpoint
 */

export default function MoveDetailsPanel({ moveData, visible = true }) {
  if (!visible || !moveData) return null;

  const {
    evalBefore,
    evalAfter,
    evalChange,
    cpl,
    multipvRank,
    topGap,
    isSacrifice,
    bestMateIn,
    playedMateIn,
    isMiss,
    mateFlip,
    label,
    basicLabel,
    exclamLabel,
    isBook,
    inOpeningDb,
    raw // Full backend response
  } = moveData;

  const DetailRow = ({ label, value, highlight = false }) => (
    <div className={`flex justify-between py-1.5 px-3 border-b border-slate-100 ${
      highlight ? 'bg-blue-50 font-semibold' : 'hover:bg-slate-50'
    }`}>
      <span className="text-slate-600 text-sm">{label}:</span>
      <span className={`text-sm font-mono ${
        highlight ? 'text-blue-700 font-bold' : 'text-slate-900'
      }`}>
        {value !== null && value !== undefined ? value.toString() : '-'}
      </span>
    </div>
  );

  // Compact Card Component
  const CompactCard = ({ title, icon, children, highlight = false }) => (
    <div className={`rounded-lg border-2 p-3 ${
      highlight ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );

  const CompactRow = ({ label, value, highlight = false }) => (
    <div className="flex justify-between">
      <span className="text-xs text-slate-600">{label}:</span>
      <span className={`text-xs font-mono font-bold ${
        highlight ? 'text-blue-700' : 'text-slate-900'
      }`}>
        {value !== null && value !== undefined ? value.toString() : '-'}
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2">
        <div className="flex items-center gap-2 text-white">
          <span>📊</span>
          <span className="text-sm font-bold">Move Evaluation Details</span>
        </div>
      </div>

      {/* 3 Cards Side by Side */}
      <div className="grid grid-cols-3 gap-2">
        {/* Card 1: Classification */}
        <CompactCard title="Classification" icon="🏷️" highlight={label === 'Brilliant'}>
          <CompactRow label="Label" value={label} highlight={true} />
          {basicLabel && <CompactRow label="Basic" value={basicLabel} />}
          {multipvRank && <CompactRow label="Rank" value={`#${multipvRank}`} highlight={multipvRank === 1} />}
        </CompactCard>

        {/* Card 2: Evaluation */}
        <CompactCard title="Evaluation" icon="📈">
          <CompactRow 
            label="Before" 
            value={evalBefore !== undefined ? (evalBefore > 0 ? `+${evalBefore}` : evalBefore) : '-'} 
          />
          <CompactRow 
            label="After" 
            value={evalAfter !== undefined ? (evalAfter > 0 ? `+${evalAfter}` : evalAfter) : '-'} 
          />
          <CompactRow 
            label="CPL" 
            value={cpl !== undefined && cpl !== null ? Math.abs(cpl).toFixed(0) : '-'} 
            highlight={cpl > 100}
          />
        </CompactCard>

        {/* Card 3: Special */}
        <CompactCard title="Special" icon="⭐" highlight={isSacrifice}>
          <CompactRow label="Sacrifice" value={isSacrifice ? 'Yes' : 'No'} highlight={isSacrifice} />
          <CompactRow label="Book" value={isBook ? 'Yes' : 'No'} />
          <CompactRow label="Miss" value={isMiss ? 'Yes' : 'No'} highlight={isMiss} />
        </CompactCard>
      </div>

      {/* Mate Info (if relevant) */}
      {(bestMateIn !== null || playedMateIn !== null || mateFlip) && (
        <div className="rounded-lg border-2 border-red-200 bg-red-50 p-2">
          <div className="mb-1 text-xs font-bold text-red-700">♔ MATE ANALYSIS</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <CompactRow label="Best Mate" value={bestMateIn || '—'} />
            <CompactRow label="Played Mate" value={playedMateIn || '—'} />
            <CompactRow label="Mate Flip" value={mateFlip ? 'YES' : 'No'} highlight={mateFlip} />
          </div>
        </div>
      )}

      {/* Raw Data (collapsed) */}
      {raw && (
        <details className="rounded-lg border border-slate-300 bg-slate-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
            🔍 Raw Backend Response
          </summary>
          <div className="p-2">
            <pre className="max-h-40 overflow-auto text-[10px] font-mono text-slate-800">
              {JSON.stringify(raw, null, 2)}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

