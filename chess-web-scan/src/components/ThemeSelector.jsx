import { useState } from 'react';
import { useTheme, BOARD_THEMES, PIECE_THEMES } from '../context/ThemeContext';
import { getPieceImageUrl } from '../utils/chessUtils';

export default function ThemeSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { boardTheme, pieceTheme, setBoardTheme, setPieceTheme, boardColors, pieceSet } = useTheme();

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 16px',
          background: '#8b5cf6',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          fontWeight: 500
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        Theme
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9999
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#1f2937',
              borderRadius: 12,
              padding: 24,
              zIndex: 10000,
              width: '90%',
              maxWidth: 600,
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20
            }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: 20 }}>Board & Piece Themes</h2>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: 24,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {/* Board Theme Section */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#9ca3af', margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase' }}>
                Board Colors
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                gap: 8
              }}>
                {Object.entries(BOARD_THEMES).map(([key, theme]) => (
                  <button
                    key={key}
                    onClick={() => setBoardTheme(key)}
                    style={{
                      padding: 8,
                      background: boardTheme === key ? '#374151' : '#111827',
                      border: boardTheme === key ? '2px solid #8b5cf6' : '2px solid transparent',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {/* Mini board preview */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 4,
                      overflow: 'hidden',
                      marginBottom: 6
                    }}>
                      {Array.from({ length: 16 }).map((_, i) => {
                        const row = Math.floor(i / 4);
                        const col = i % 4;
                        const isLight = (row + col) % 2 === 0;
                        return (
                          <div
                            key={i}
                            style={{
                              background: isLight ? theme.light : theme.dark
                            }}
                          />
                        );
                      })}
                    </div>
                    <span style={{
                      color: boardTheme === key ? '#fff' : '#9ca3af',
                      fontSize: 11,
                      fontWeight: 500
                    }}>
                      {theme.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Piece Theme Section */}
            <div>
              <h3 style={{ color: '#9ca3af', margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase' }}>
                Piece Set
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                gap: 8
              }}>
                {Object.entries(PIECE_THEMES).map(([key, theme]) => (
                  <button
                    key={key}
                    onClick={() => setPieceTheme(key)}
                    style={{
                      padding: 8,
                      background: pieceTheme === key ? '#374151' : '#111827',
                      border: pieceTheme === key ? '2px solid #8b5cf6' : '2px solid transparent',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    {/* Piece preview */}
                    <div style={{
                      display: 'flex',
                      gap: 2,
                      marginBottom: 4
                    }}>
                      <img
                        src={getPieceImageUrl('N', theme.id)}
                        alt="Knight"
                        style={{ width: 24, height: 24 }}
                      />
                      <img
                        src={getPieceImageUrl('q', theme.id)}
                        alt="Queen"
                        style={{ width: 24, height: 24 }}
                      />
                    </div>
                    <span style={{
                      color: pieceTheme === key ? '#fff' : '#9ca3af',
                      fontSize: 10,
                      fontWeight: 500,
                      textAlign: 'center',
                      lineHeight: 1.2
                    }}>
                      {theme.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview Section */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #374151' }}>
              <h3 style={{ color: '#9ca3af', margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase' }}>
                Preview
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                width: '100%',
                maxWidth: 320,
                aspectRatio: '1',
                borderRadius: 8,
                overflow: 'hidden',
                margin: '0 auto'
              }}>
                {Array.from({ length: 64 }).map((_, i) => {
                  const row = Math.floor(i / 8);
                  const col = i % 8;
                  const isLight = (row + col) % 2 === 0;

                  // Add some pieces for preview
                  let piece = null;
                  if (row === 0) {
                    const pieces = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
                    piece = pieces[col].toLowerCase();
                  } else if (row === 1) {
                    piece = 'p';
                  } else if (row === 6) {
                    piece = 'P';
                  } else if (row === 7) {
                    const pieces = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
                    piece = pieces[col];
                  }

                  return (
                    <div
                      key={i}
                      style={{
                        background: isLight ? boardColors.light : boardColors.dark,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {piece && (
                        <img
                          src={getPieceImageUrl(piece, pieceSet.id)}
                          alt={piece}
                          style={{
                            width: '85%',
                            height: '85%',
                            objectFit: 'contain'
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
