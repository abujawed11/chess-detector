import { useState } from "react";
import { Chess } from "chess.js/dist/esm/chess.js";

// Validation function with proper opponent king check
function validateFen(fen) {
  try {
    const chess = new Chess(fen);

    // Check if the opponent's king (side that just moved) is in check
    // If it's White's turn, check if Black's king is in check (illegal!)
    // If it's Black's turn, check if White's king is in check (illegal!)

    const currentTurn = chess.turn(); // 'w' or 'b'
    const opponentColor = currentTurn === 'w' ? 'b' : 'w';

    // Temporarily switch turns to check if opponent king is in check
    const fenParts = fen.split(' ');
    fenParts[1] = opponentColor;
    const testFen = fenParts.join(' ');

    try {
      const testChess = new Chess(testFen);
      if (testChess.inCheck()) {
        return {
          valid: false,
          reason: `Position is illegal: ${opponentColor === 'w' ? 'White' : 'Black'}'s king is in check, but it's ${currentTurn === 'w' ? 'White' : 'Black'}'s turn to move. This means ${opponentColor === 'w' ? 'White' : 'Black'} would have moved and left their king in check, which is not allowed.`
        };
      }
    } catch (e) {
      // If we can't create test position, just continue with basic validation
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, reason: e?.message || "Invalid FEN" };
  }
}

// Smart validation: try both sides to find a legal position
function validateAndFixSide(fen) {
  // First try the FEN as-is
  const result = validateFen(fen);
  if (result.valid) {
    return { valid: true, fen, sideChanged: false };
  }

  // If invalid, try flipping the side to move
  const parts = fen.split(' ');
  if (parts.length >= 2) {
    const originalSide = parts[1];
    const flippedSide = originalSide === 'w' ? 'b' : 'w';
    parts[1] = flippedSide;
    const flippedFen = parts.join(' ');

    const flippedResult = validateFen(flippedFen);
    if (flippedResult.valid) {
      return {
        valid: true,
        fen: flippedFen,
        sideChanged: true,
        correctedSide: flippedSide,
        reason: `Position is illegal with ${originalSide === 'w' ? 'White' : 'Black'} to move (opponent's king is in check). Auto-corrected to ${flippedSide === 'w' ? 'White' : 'Black'} to move.`
      };
    }
  }

  // Both failed, return original error
  return { valid: false, fen, sideChanged: false, reason: result.reason };
}

export default function FENUpload({ onBack, onLoadPosition }) {
  const [fenInput, setFenInput] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const [validatedFen, setValidatedFen] = useState(null);

  // Sample FEN positions
  const sampleFens = [
    {
      name: "Starting Position",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    },
    {
      name: "Sicilian Defense",
      fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2"
    },
    {
      name: "Scholar's Mate",
      fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"
    },
    {
      name: "Endgame Position",
      fen: "8/5k2/3p4/1p1Pp2p/pP2Pp1P/P4P1K/8/8 b - - 99 50"
    }
  ];

  function handleValidate() {
    const txt = fenInput.trim();

    if (!txt) {
      setValidationResult({
        valid: false,
        reason: "Please enter a FEN string"
      });
      setValidatedFen(null);
      return;
    }

    // Perform comprehensive validation
    const result = validateAndFixSide(txt);
    setValidationResult(result);

    if (result.valid) {
      setValidatedFen(result.fen);
    } else {
      setValidatedFen(null);
    }
  }

  function handleLoadToEditor() {
    if (validatedFen) {
      onLoadPosition(validatedFen);
    }
  }

  function handleLoadSample(fen) {
    setFenInput(fen);
    setValidationResult(null);
    setValidatedFen(null);
  }

  return (
    <div style={{
      padding: 20,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh'
    }}>
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        background: 'white',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
          paddingBottom: 20,
          borderBottom: '2px solid #f0f0f0'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Load FEN Position
          </h2>
          <button
            onClick={onBack}
            style={{
              padding: '12px 24px',
              border: '2px solid #d1d5db',
              borderRadius: 10,
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              e.currentTarget.style.borderColor = '#8b5cf6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            Back to Home
          </button>
        </div>

        {/* Description */}
        <div style={{
          padding: 16,
          background: '#eff6ff',
          borderRadius: 12,
          marginBottom: 24,
          border: '2px solid #93c5fd'
        }}>
          <div style={{
            fontSize: 15,
            color: '#1e40af',
            lineHeight: 1.6
          }}>
            <strong>What is FEN?</strong> Forsyth-Edwards Notation (FEN) is a standard notation for describing chess positions.
            <br />
            <strong>Format:</strong> <code style={{ background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: 4 }}>
              [position] [turn] [castling] [en-passant] [halfmove] [fullmove]
            </code>
          </div>
        </div>

        {/* FEN Input */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 10
          }}>
            Enter FEN String:
          </label>
          <textarea
            value={fenInput}
            onChange={(e) => {
              setFenInput(e.target.value);
              setValidationResult(null);
              setValidatedFen(null);
            }}
            placeholder="e.g., rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            style={{
              width: '100%',
              minHeight: 120,
              padding: 14,
              border: '2px solid #e5e7eb',
              borderRadius: 10,
              fontSize: 14,
              fontFamily: 'ui-monospace, monospace',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Validate Button */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={handleValidate}
            style={{
              width: '100%',
              padding: '14px 24px',
              border: 'none',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 16,
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
            }}
          >
            Validate FEN
          </button>
        </div>

        {/* Validation Result */}
        {validationResult && (
          <div style={{
            marginBottom: 24,
            padding: 16,
            background: validationResult.valid
              ? (validationResult.sideChanged ? '#fef3c7' : '#d1fae5')
              : '#fee2e2',
            border: `2px solid ${validationResult.valid
              ? (validationResult.sideChanged ? '#f59e0b' : '#10b981')
              : '#ef4444'}`,
            borderRadius: 10
          }}>
            {validationResult.valid ? (
              <>
                {validationResult.sideChanged ? (
                  <>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#92400e',
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <span>⚠️</span> FEN Auto-Corrected
                    </div>
                    <div style={{
                      fontSize: 14,
                      color: '#92400e',
                      marginBottom: 12
                    }}>
                      {validationResult.reason}
                    </div>
                  </>
                ) : (
                  <div style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#065f46',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span>✓</span> Valid FEN Position
                  </div>
                )}

                {/* Show corrected FEN */}
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'rgba(255, 255, 255, 0.7)',
                  borderRadius: 8,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 13,
                  color: '#1f2937',
                  wordBreak: 'break-all'
                }}>
                  <strong>FEN:</strong> {validatedFen}
                </div>

                {/* Load to Editor Button */}
                <button
                  onClick={handleLoadToEditor}
                  style={{
                    marginTop: 16,
                    width: '100%',
                    padding: '14px 24px',
                    border: 'none',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 16,
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                  }}
                >
                  Load Position in Board Editor
                </button>
              </>
            ) : (
              <>
                <div style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#991b1b',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span>✗</span> Invalid FEN
                </div>
                <div style={{
                  fontSize: 14,
                  color: '#991b1b',
                  lineHeight: 1.6
                }}>
                  <strong>Error:</strong> {validationResult.reason}
                </div>

                {/* Common errors help */}
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'rgba(255, 255, 255, 0.7)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#7f1d1d'
                }}>
                  <strong>Common issues:</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                    <li>Invalid side to move (king is in check on opponent's turn)</li>
                    <li>Missing or extra pieces (each side needs exactly 1 king)</li>
                    <li>Pawns on first or last rank</li>
                    <li>Invalid castling rights</li>
                    <li>Incorrect FEN format (must have 6 parts separated by spaces)</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        )}

        {/* Sample Positions */}
        <div style={{
          padding: 20,
          background: '#f9fafb',
          borderRadius: 12,
          border: '2px solid #e5e7eb'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: 18,
            fontWeight: 700,
            color: '#374151'
          }}>
            Sample Positions
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12
          }}>
            {sampleFens.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => handleLoadSample(sample.fen)}
                style={{
                  padding: 12,
                  border: '2px solid #d1d5db',
                  borderRadius: 8,
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: 14,
                  transition: 'all 0.2s ease',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#8b5cf6';
                  e.currentTarget.style.background = '#f5f3ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.background = 'white';
                }}
              >
                {sample.name}
              </button>
            ))}
          </div>
        </div>

        {/* Help Section */}
        <div style={{
          marginTop: 24,
          padding: 16,
          background: '#fef3c7',
          borderRadius: 12,
          border: '2px solid #fbbf24'
        }}>
          <div style={{
            fontSize: 14,
            color: '#92400e',
            lineHeight: 1.6
          }}>
            <strong>💡 Tip:</strong> If you have a FEN with an invalid side to move (e.g., White to move but Black's king is in check),
            the validator will automatically correct it for you!
          </div>
        </div>
      </div>
    </div>
  );
}
