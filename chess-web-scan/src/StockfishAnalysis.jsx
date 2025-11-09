import { useState } from 'react';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { useStockfish } from './hooks/useStockfish';
import InteractiveBoard from './components/InteractiveBoard';
import { analyzeMoveClassification, getClassificationStats, calculateAverageCPLoss } from './utils/moveClassification';

/**
 * Comprehensive Stockfish Analysis Page
 * Tests Stockfish 17.1 classification logic against various positions
 */

const COMPREHENSIVE_TEST_SUITE = [
  // Opening Positions
  {
    category: 'Opening Theory',
    positions: [
      { name: 'Italian Game', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', testMove: 'g8f6', expected: 'book' },
      { name: 'Sicilian Defense', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2', testMove: 'g1f3', expected: 'book' },
      { name: 'French Defense', fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', testMove: 'd2d4', expected: 'book' },
      { name: 'Early Mistake h4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', testMove: 'h7h5', expected: 'inaccuracy' }
    ]
  },
  // Tactical Positions
  {
    category: 'Tactical Positions',
    positions: [
      { name: 'Queen Blunder', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 0 3', testMove: 'f6g4', expected: 'blunder' },
      { name: 'Fork Opportunity', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', testMove: 'f3g5', expected: 'excellent' },
      { name: 'Back Rank Mate', fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', testMove: 'e1e8', expected: 'best' },
      { name: 'Missing Mate in 1', fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', testMove: 'g1h2', expected: 'blunder' }
    ]
  },
  // Positional Play
  {
    category: 'Positional Play',
    positions: [
      { name: 'Standard Development', fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq - 0 4', testMove: 'f8e7', expected: 'best' },
      { name: 'Slow Move a3', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', testMove: 'a2a3', expected: 'inaccuracy' },
      { name: 'Premature h4', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', testMove: 'h2h4', expected: 'mistake' },
      { name: 'Solid Continuation', fen: 'r1bq1rk1/pp3pbp/2np1np1/2p1p3/2P1P3/2NPBNP1/PP3PBP/R2QK2R w KQ - 0 10', testMove: 'd1d2', expected: 'best' }
    ]
  },
  // Endgame Positions
  {
    category: 'Endgames',
    positions: [
      { name: 'Pawn Endgame - Correct', fen: '8/5pk1/6p1/8/3K4/8/5P2/8 w - - 0 1', testMove: 'f2f4', expected: 'best' },
      { name: 'Pawn Endgame - Wrong', fen: '8/5pk1/6p1/8/3K4/8/5P2/8 w - - 0 1', testMove: 'd4c5', expected: 'mistake' },
      { name: 'King Activity', fen: '8/8/4k3/8/8/3K4/8/8 w - - 0 1', testMove: 'd3e4', expected: 'best' },
      { name: 'Opposition Mistake', fen: '8/8/8/3k4/8/3K4/8/8 w - - 0 1', testMove: 'd3c3', expected: 'inaccuracy' }
    ]
  },
  // Critical Moments
  {
    category: 'Critical Moments',
    positions: [
      { name: 'Only Good Move', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5', testMove: 'b1c3', expected: 'best' },
      { name: 'Hanging Piece Miss', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', testMove: 'h7h6', expected: 'inaccuracy' },
      { name: 'Checkmate in 2 - Right', fen: 'r5rk/5Npp/8/8/8/8/PPP2PPP/R3R1K1 w - - 0 1', testMove: 'f7h6', expected: 'best' },
      { name: 'Checkmate in 2 - Miss', fen: 'r5rk/5Npp/8/8/8/8/PPP2PPP/R3R1K1 w - - 0 1', testMove: 'a2a4', expected: 'blunder' }
    ]
  }
];

export default function StockfishAnalysis() {
  const { initialized, analyze } = useStockfish();
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState({});
  const [currentResult, setCurrentResult] = useState(null);
  const [progress, setProgress] = useState('');

  const category = COMPREHENSIVE_TEST_SUITE[selectedCategory];
  const position = category.positions[currentPosition];

  const analyzePosition = async () => {
    if (!initialized) {
      alert('Stockfish engine not initialized yet!');
      return;
    }

    setAnalyzing(true);
    setProgress('Analyzing position...');

    try {
      const result = await analyzeMoveClassification(
        { analyze },
        position.fen,
        position.testMove,
        { depth: 20, epsilon: 10 }
      );

      const resultWithMeta = {
        ...result,
        expected: position.expected,
        match: result.classification === position.expected,
        positionName: position.name,
        category: category.category
      };

      setCurrentResult(resultWithMeta);

      // Store in results
      setResults(prev => ({
        ...prev,
        [`${selectedCategory}-${currentPosition}`]: resultWithMeta
      }));

    } catch (error) {
      console.error('Analysis error:', error);
      alert('Analysis failed: ' + error.message);
    } finally {
      setAnalyzing(false);
      setProgress('');
    }
  };

  const analyzeAllInCategory = async () => {
    if (!initialized) {
      alert('Stockfish engine not initialized yet!');
      return;
    }

    setAnalyzing(true);

    for (let i = 0; i < category.positions.length; i++) {
      setCurrentPosition(i);
      setProgress(`Analyzing ${i + 1}/${category.positions.length}...`);

      await new Promise(r => setTimeout(r, 100));

      const pos = category.positions[i];
      try {
        const result = await analyzeMoveClassification(
          { analyze },
          pos.fen,
          pos.testMove,
          { depth: 20, epsilon: 10 }
        );

        const resultWithMeta = {
          ...result,
          expected: pos.expected,
          match: result.classification === pos.expected,
          positionName: pos.name,
          category: category.category
        };

        setResults(prev => ({
          ...prev,
          [`${selectedCategory}-${i}`]: resultWithMeta
        }));

        setCurrentResult(resultWithMeta);

      } catch (error) {
        console.error(`Error analyzing position ${i}:`, error);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    setAnalyzing(false);
    setProgress('');
  };

  const analyzeEntireSuite = async () => {
    if (!initialized) {
      alert('Stockfish engine not initialized yet!');
      return;
    }

    setAnalyzing(true);

    let totalPositions = COMPREHENSIVE_TEST_SUITE.reduce((sum, cat) => sum + cat.positions.length, 0);
    let analyzed = 0;

    for (let catIdx = 0; catIdx < COMPREHENSIVE_TEST_SUITE.length; catIdx++) {
      setSelectedCategory(catIdx);
      const cat = COMPREHENSIVE_TEST_SUITE[catIdx];

      for (let posIdx = 0; posIdx < cat.positions.length; posIdx++) {
        setCurrentPosition(posIdx);
        analyzed++;
        setProgress(`Analyzing ${analyzed}/${totalPositions}: ${cat.category} - ${cat.positions[posIdx].name}`);

        await new Promise(r => setTimeout(r, 100));

        const pos = cat.positions[posIdx];
        try {
          const result = await analyzeMoveClassification(
            { analyze },
            pos.fen,
            pos.testMove,
            { depth: 20, epsilon: 10 }
          );

          const resultWithMeta = {
            ...result,
            expected: pos.expected,
            match: result.classification === pos.expected,
            positionName: pos.name,
            category: cat.category
          };

          setResults(prev => ({
            ...prev,
            [`${catIdx}-${posIdx}`]: resultWithMeta
          }));

          setCurrentResult(resultWithMeta);

        } catch (error) {
          console.error(`Error analyzing ${cat.category} - ${pos.name}:`, error);
        }

        await new Promise(r => setTimeout(r, 300));
      }
    }

    setAnalyzing(false);
    setProgress('');
  };

  // Calculate overall statistics
  const allResults = Object.values(results);
  const correct = allResults.filter(r => r.match).length;
  const total = allResults.length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;
  const avgCPLoss = total > 0 ? calculateAverageCPLoss(allResults).toFixed(0) : 0;
  const stats = total > 0 ? getClassificationStats(allResults) : null;

  return (
    <div style={{ padding: 20, maxWidth: 1800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 8px 0' }}>Stockfish 17.1 Classification Analysis</h2>
        <p style={{ color: '#666', margin: 0 }}>
          Comprehensive testing of Chess.com-style move classification logic
        </p>

        {/* Overall Stats */}
        {total > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginTop: 16
          }}>
            <div style={{
              padding: 16,
              background: correct === total ? '#d1fae5' : '#fef3c7',
              border: `2px solid ${correct === total ? '#10b981' : '#f59e0b'}`,
              borderRadius: 8
            }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Accuracy</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{accuracy}%</div>
              <div style={{ fontSize: 12, color: '#666' }}>{correct}/{total} correct</div>
            </div>

            <div style={{ padding: 16, background: '#f3f4f6', borderRadius: 8, border: '2px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Avg CP Loss</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{avgCPLoss}</div>
              <div style={{ fontSize: 12, color: '#666' }}>centipawns</div>
            </div>

            {stats && (
              <>
                <div style={{ padding: 16, background: '#ecfdf5', borderRadius: 8, border: '2px solid #10b981' }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Best Moves</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.best + stats.book + stats.brilliant}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Book: {stats.book}, Brilliant: {stats.brilliant}</div>
                </div>

                <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8, border: '2px solid #ef4444' }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Errors</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.blunder + stats.mistake}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Blunders: {stats.blunder}, Mistakes: {stats.mistake}</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={analyzePosition}
          disabled={!initialized || analyzing}
          style={{
            padding: '10px 20px',
            background: initialized ? '#8b5cf6' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: initialized ? 'pointer' : 'not-allowed',
            fontWeight: 600
          }}
        >
          {analyzing && !progress.includes('Analyzing') ? 'Analyzing...' : 'Analyze Current'}
        </button>

        <button
          onClick={analyzeAllInCategory}
          disabled={!initialized || analyzing}
          style={{
            padding: '10px 20px',
            background: initialized ? '#3b82f6' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: initialized ? 'pointer' : 'not-allowed',
            fontWeight: 600
          }}
        >
          Analyze Category
        </button>

        <button
          onClick={analyzeEntireSuite}
          disabled={!initialized || analyzing}
          style={{
            padding: '10px 20px',
            background: initialized ? '#10b981' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: initialized ? 'pointer' : 'not-allowed',
            fontWeight: 600
          }}
        >
          Run Full Suite
        </button>

        {progress && (
          <div style={{
            padding: '10px 16px',
            background: '#eff6ff',
            borderRadius: 6,
            border: '2px solid #3b82f6',
            color: '#1e40af',
            fontWeight: 600
          }}>
            {progress}
          </div>
        )}

        <div style={{ marginLeft: 'auto', color: '#666', fontWeight: 600 }}>
          Engine: {initialized ? '🟢 Ready' : '⏳ Loading...'}
        </div>
      </div>

      {/* Category & Position Selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(Number(e.target.value));
            setCurrentPosition(0);
          }}
          disabled={analyzing}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '2px solid #e5e7eb',
            fontWeight: 600,
            flex: 1
          }}
        >
          {COMPREHENSIVE_TEST_SUITE.map((cat, idx) => (
            <option key={idx} value={idx}>
              {cat.category} ({cat.positions.length} positions)
            </option>
          ))}
        </select>

        <select
          value={currentPosition}
          onChange={(e) => setCurrentPosition(Number(e.target.value))}
          disabled={analyzing}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '2px solid #e5e7eb',
            fontWeight: 600,
            flex: 2
          }}
        >
          {category.positions.map((pos, idx) => (
            <option key={idx} value={idx}>
              {idx + 1}. {pos.name} (expected: {pos.expected})
            </option>
          ))}
        </select>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '560px 1fr', gap: 20, marginBottom: 20 }}>
        {/* Board */}
        <div>
          <InteractiveBoard
            fen={position.fen}
            bestMove={currentResult?.bestMove}
            flipped={false}
          />
        </div>

        {/* Current Result */}
        <div>
          {currentResult ? (
            <div style={{
              padding: 16,
              background: currentResult.match ? '#d1fae5' : '#fee2e2',
              borderRadius: 12,
              border: `3px solid ${currentResult.color}`,
            }}>
              <h3 style={{ margin: '0 0 16px 0' }}>
                {currentResult.positionName}
                <span style={{
                  marginLeft: 12,
                  padding: '4px 12px',
                  background: currentResult.match ? '#10b981' : '#ef4444',
                  color: 'white',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600
                }}>
                  {currentResult.match ? '✓ CORRECT' : '✗ INCORRECT'}
                </span>
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#666' }}>Expected</div>
                  <div style={{ fontSize: 18, fontWeight: 600, textTransform: 'capitalize' }}>
                    {currentResult.expected}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#666' }}>Actual</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: currentResult.color, textTransform: 'capitalize' }}>
                    {currentResult.label}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, background: 'white', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#666' }}>CP Loss</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{currentResult.cpLoss.toFixed(0)}</div>
                </div>
                <div style={{ padding: 12, background: 'white', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#666' }}>Test Move</div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace' }}>{position.testMove}</div>
                </div>
                <div style={{ padding: 12, background: 'white', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#666' }}>Best Move</div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace' }}>{currentResult.bestMove}</div>
                </div>
              </div>

              {/* Additional Info */}
              <div style={{ fontSize: 12, color: '#666' }}>
                {currentResult.isBook && <div>📖 Opening book move</div>}
                {currentResult.isBrilliant && <div>‼️ Brilliant (forced best move)</div>}
                {currentResult.forced && <div>⚠️ Forced continuation</div>}
                {currentResult.missedMate && <div>❌ Missed forced mate</div>}
              </div>
            </div>
          ) : (
            <div style={{
              padding: 40,
              background: '#f9fafb',
              borderRadius: 12,
              border: '2px solid #e5e7eb',
              textAlign: 'center',
              color: '#666'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <div>Click "Analyze Current" to start analysis</div>
            </div>
          )}
        </div>
      </div>

      {/* Results Table */}
      {total > 0 && (
        <div>
          <h3 style={{ marginBottom: 12 }}>All Results ({total} positions analyzed)</h3>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: 'white',
            border: '1px solid #e5e7eb',
            fontSize: 14
          }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Category</th>
                <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>Position</th>
                <th style={{ padding: 10, borderBottom: '2px solid #e5e7eb' }}>Test Move</th>
                <th style={{ padding: 10, borderBottom: '2px solid #e5e7eb' }}>Best Move</th>
                <th style={{ padding: 10, borderBottom: '2px solid #e5e7eb' }}>Expected</th>
                <th style={{ padding: 10, borderBottom: '2px solid #e5e7eb' }}>Actual</th>
                <th style={{ padding: 10, borderBottom: '2px solid #e5e7eb' }}>CP Loss</th>
                <th style={{ padding: 10, textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {allResults.map((result, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 10 }}>{result.category}</td>
                  <td style={{ padding: 10 }}>{result.positionName}</td>
                  <td style={{ padding: 10, fontFamily: 'monospace', textAlign: 'center' }}>
                    {COMPREHENSIVE_TEST_SUITE.flatMap(c => c.positions).find(p => p.name === result.positionName)?.testMove}
                  </td>
                  <td style={{ padding: 10, fontFamily: 'monospace', textAlign: 'center' }}>{result.bestMove}</td>
                  <td style={{ padding: 10, textAlign: 'center', textTransform: 'capitalize' }}>
                    <span style={{ padding: '2px 8px', background: '#e5e7eb', borderRadius: 4 }}>
                      {result.expected}
                    </span>
                  </td>
                  <td style={{ padding: 10, textAlign: 'center', textTransform: 'capitalize' }}>
                    <span style={{
                      padding: '2px 8px',
                      background: result.color,
                      color: 'white',
                      borderRadius: 4,
                      fontWeight: 600
                    }}>
                      {result.classification}
                    </span>
                  </td>
                  <td style={{ padding: 10, fontFamily: 'monospace', textAlign: 'center' }}>
                    {result.cpLoss.toFixed(0)}
                  </td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      background: result.match ? '#10b981' : '#ef4444',
                      color: 'white',
                      borderRadius: 4,
                      fontWeight: 600
                    }}>
                      {result.match ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
