import { useState } from 'react';

/**
 * EngineLines - Displays multiple engine analysis lines (MultiPV)
 * Similar to Chess.com's analysis panel
 */
export default function EngineLines({ lines, depth, turn, onLineClick }) {
  const [expandedLine, setExpandedLine] = useState(null);

  console.log('📊 EngineLines received:', { lines, depth, turn, linesCount: lines?.length });

  if (!lines || lines.length === 0) {
    return (
      <div style={{
        padding: 16,
        background: '#f9fafb',
        borderRadius: 12,
        border: '2px solid #e5e7eb',
        textAlign: 'center',
        color: '#9ca3af'
      }}>
        No analysis available yet
      </div>
    );
  }

  return (
    <div style={{
      background: '#1f2937',
      borderRadius: 12,
      border: '2px solid #374151',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: '#111827',
        borderBottom: '1px solid #374151',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Engine Analysis
        </span>
        {depth && (
          <span style={{
            fontSize: 11,
            color: '#6b7280',
            fontFamily: 'monospace'
          }}>
            depth={depth}
          </span>
        )}
      </div>

      {/* Lines */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {lines.map((line, index) => (
          <EngineLine
            key={index}
            line={line}
            lineNumber={index + 1}
            turn={turn}
            isExpanded={expandedLine === index}
            onClick={() => {
              setExpandedLine(expandedLine === index ? null : index);
              onLineClick?.(line);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EngineLine({ line, lineNumber, turn, isExpanded, onClick }) {
  const evaluation = line.evaluation || line.score || { type: 'cp', value: 0 };
  const pv = line.pv || [];

  // Format evaluation
  const formatEval = (eval_obj, fromWhite = true) => {
    if (!eval_obj) return '0.00';

    if (eval_obj.type === 'mate') {
      const moves = Math.abs(eval_obj.value);
      const sign = eval_obj.value > 0 ? '+' : '-';
      return `${sign}M${moves}`;
    }

    // Normalize to White's perspective
    let value = eval_obj.value;
    if (turn === 'b' && !fromWhite) {
      value = -value;
    }

    const sign = value > 0 ? '+' : '';
    return `${sign}${(value / 100).toFixed(2)}`;
  };

  // Get color based on evaluation
  const getEvalColor = (eval_obj) => {
    if (!eval_obj) return '#9ca3af';

    let value = eval_obj.value;
    if (eval_obj.type === 'mate') {
      return value > 0 ? '#10b981' : '#ef4444';
    }

    if (turn === 'b') {
      value = -value;
    }

    if (value > 100) return '#10b981';  // Green for White advantage
    if (value < -100) return '#ef4444'; // Red for Black advantage
    return '#9ca3af';  // Gray for equal
  };

  // Convert UCI moves to SAN-like display (simplified)
  const formatMove = (uciMove) => {
    if (!uciMove) return '';
    // For now, just show UCI. You can integrate chess.js for proper SAN conversion
    return uciMove;
  };

  const evalText = formatEval(evaluation);
  const evalColor = getEvalColor(evaluation);
  const movesToShow = isExpanded ? pv : pv.slice(0, 5);

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid #374151',
        cursor: 'pointer',
        transition: 'all 0.2s',
        background: isExpanded ? '#374151' : 'transparent'
      }}
      onMouseEnter={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.background = '#2d3748';
        }
      }}
      onMouseLeave={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {/* Line header with evaluation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6
      }}>
        {/* Line number */}
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#6b7280',
          minWidth: 16
        }}>
          {lineNumber}.
        </span>

        {/* Evaluation */}
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: evalColor,
          fontFamily: 'monospace',
          minWidth: 60
        }}>
          {evalText}
        </span>

        {/* Depth badge */}
        {line.depth && (
          <span style={{
            fontSize: 9,
            padding: '2px 6px',
            background: '#4b5563',
            color: '#d1d5db',
            borderRadius: 4,
            fontWeight: 600
          }}>
            d{line.depth}
          </span>
        )}
      </div>

      {/* Move sequence */}
      <div style={{
        fontSize: 13,
        color: '#d1d5db',
        fontFamily: 'monospace',
        lineHeight: 1.6,
        paddingLeft: 24
      }}>
        {movesToShow.map((move, idx) => {
          const moveNumber = Math.floor(idx / 2) + 1;
          const isWhiteMove = idx % 2 === 0;

          return (
            <span key={idx} style={{ marginRight: 6 }}>
              {isWhiteMove && (
                <span style={{ color: '#6b7280', marginRight: 4 }}>
                  {moveNumber}.
                </span>
              )}
              <span style={{
                color: isWhiteMove ? '#f3f4f6' : '#d1d5db',
                fontWeight: isWhiteMove ? 600 : 400
              }}>
                {formatMove(move)}
              </span>
            </span>
          );
        })}

        {pv.length > 5 && !isExpanded && (
          <span style={{
            color: '#6b7280',
            fontSize: 11,
            fontStyle: 'italic'
          }}>
            ... +{pv.length - 5} more
          </span>
        )}
      </div>

      {/* Additional info when expanded */}
      {isExpanded && line.nodes && (
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid #4b5563',
          fontSize: 10,
          color: '#6b7280',
          display: 'flex',
          gap: 12
        }}>
          <span>Nodes: {(line.nodes / 1000).toFixed(0)}k</span>
          {line.nps && <span>NPS: {(line.nps / 1000).toFixed(0)}k</span>}
          {line.time && <span>Time: {(line.time / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  );
}
