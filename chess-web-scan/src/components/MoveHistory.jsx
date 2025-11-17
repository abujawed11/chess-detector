import { getClassificationSymbol } from '../utils/engineUtils';

export default function MoveHistory({ moves, currentMoveIndex, onMoveClick }) {
  // Group moves by move number (white + black = 1 move)
  const moveGroups = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = moves[i];
    const blackMove = moves[i + 1];

    moveGroups.push({
      number: moveNumber,
      white: whiteMove,
      black: blackMove
    });
  }

  // Calculate statistics
  const stats = moves.reduce((acc, move) => {
    const classification = move.classification || 'best';
    acc[classification] = (acc[classification] || 0) + 1;
    return acc;
  }, {});

  const hasSpecialMoves = stats.brilliant || stats.book || stats.blunder || stats.mistake;

  return (
    <div style={{
      background: '#f9fafb',
      borderRadius: 12,
      border: '2px solid #e5e7eb',
      padding: 16,
      maxHeight: 400,
      overflowY: 'auto'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
      }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Move History</h3>

        {/* Mini legend for special moves */}
        {hasSpecialMoves && (
          <div style={{
            fontSize: 10,
            color: '#6b7280',
            display: 'flex',
            gap: 6
          }}>
            {stats.brilliant > 0 && <span title="Brilliant moves">‼ {stats.brilliant}</span>}
            {stats.book > 0 && <span title="Book moves">📖 {stats.book}</span>}
            {stats.mistake > 0 && <span title="Mistakes">? {stats.mistake}</span>}
            {stats.blunder > 0 && <span title="Blunders">?? {stats.blunder}</span>}
          </div>
        )}
      </div>

      {moves.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: 20,
          color: '#9ca3af'
        }}>
          No moves played yet
        </div>
      )}

      <div>
        {moveGroups.map((group) => (
          <div
            key={group.number}
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 1fr',
              gap: 8,
              marginBottom: 4,
              padding: '4px 8px',
              borderRadius: 6,
              background: '#fff'
            }}
          >
            {/* Move number */}
            <div style={{
              fontWeight: 600,
              color: '#6b7280',
              fontSize: 14
            }}>
              {group.number}.
            </div>

            {/* White's move */}
            {group.white && (
              <MoveButton
                move={group.white}
                isActive={currentMoveIndex === (group.number - 1) * 2}
                onClick={() => onMoveClick((group.number - 1) * 2)}
              />
            )}

            {/* Black's move */}
            {group.black && (
              <MoveButton
                move={group.black}
                isActive={currentMoveIndex === (group.number - 1) * 2 + 1}
                onClick={() => onMoveClick((group.number - 1) * 2 + 1)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveButton({ move, isActive, onClick }) {
  const classification = move.classification || 'best';
  const classificationLabel = move.classificationLabel || 'Best';
  const cpLoss = move.cpLoss ?? 0;
  const color = getClassificationColor(classification);

  // Build tooltip text
  const tooltipText = `${classificationLabel} (${cpLoss.toFixed(0)} cp loss)`;

  return (
    <button
      onClick={onClick}
      title={tooltipText}
      style={{
        padding: '6px 8px',
        border: isActive ? '2px solid #10b981' : '2px solid transparent',
        borderRadius: 6,
        background: isActive ? '#d1fae5' : '#ffffff',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: isActive ? 600 : 500,
        textAlign: 'left',
        transition: 'all 0.2s',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = '#f3f4f6';
          e.currentTarget.style.border = '2px solid #e5e7eb';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = '#ffffff';
          e.currentTarget.style.border = '2px solid transparent';
        }
      }}
    >
      <span style={{
        flex: 1,
        color: isActive ? '#065f46' : '#1f2937',
        fontWeight: isActive ? 600 : 500
      }}>
        {move.san}
      </span>

      {/* Badge section: CP loss + Classification badge */}
      <span style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        {/* CP loss indicator */}
        {cpLoss > 0 && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: isActive ? '#065f46' : '#64748b'
          }}>
            -{cpLoss.toFixed(0)}
          </span>
        )}

        {/* Classification badge */}
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          background: color,
          color: '#fff',
          borderRadius: 4,
          fontWeight: 700,
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
        }}>
          {classificationLabel}
        </span>
      </span>
    </button>
  );
}

function getClassificationColor(classification) {
  const colors = {
    brilliant: '#1baca6',
    great: '#739abc',
    book: '#a88865',
    best: '#374151',
    excellent: '#374151',
    good: '#374151',
    inaccuracy: '#f59e0b',
    mistake: '#e58f2a',
    blunder: '#dc2626',
    miss: '#dc2626'
  };
  return colors[classification] || '#374151';
}
