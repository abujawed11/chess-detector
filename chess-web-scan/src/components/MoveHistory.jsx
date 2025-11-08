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

  return (
    <div style={{
      background: '#f9fafb',
      borderRadius: 12,
      border: '2px solid #e5e7eb',
      padding: 16,
      maxHeight: 400,
      overflowY: 'auto'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>Move History</h3>

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
  const symbol = getClassificationSymbol(classification);

  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 8px',
        border: isActive ? '2px solid #8b5cf6' : '2px solid transparent',
        borderRadius: 6,
        background: isActive ? '#ede9fe' : '#f9fafb',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: isActive ? 600 : 400,
        textAlign: 'left',
        transition: 'all 0.2s',
        color: getClassificationColor(classification)
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = '#f3f4f6';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = '#f9fafb';
        }
      }}
    >
      {move.san} {symbol}
    </button>
  );
}

function getClassificationColor(classification) {
  const colors = {
    brilliant: '#1baca6',
    great: '#5c8bb0',
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
