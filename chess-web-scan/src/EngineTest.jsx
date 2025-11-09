import { useState, useEffect } from 'react';
import { getStockfish } from './services/stockfishService';

/**
 * Engine Thread Test Page
 * Tests and displays Stockfish threading capabilities
 */
export default function EngineTest() {
  const [engineInfo, setEngineInfo] = useState({
    sharedArrayBufferAvailable: false,
    maxThreads: 0,
    currentThreads: 1,
    hashSize: 16,
    engineReady: false
  });
  const [testResults, setTestResults] = useState([]);
  const [testing, setTesting] = useState(false);
  const [selectedThreads, setSelectedThreads] = useState(4);
  const [selectedHash, setSelectedHash] = useState(256);

  useEffect(() => {
    checkEnvironment();
  }, []);

  const checkEnvironment = () => {
    // Check SharedArrayBuffer support
    const sharedArrayBufferAvailable = typeof SharedArrayBuffer !== 'undefined';

    // Get max CPU threads
    const maxThreads = navigator.hardwareConcurrency || 4;

    setEngineInfo(prev => ({
      ...prev,
      sharedArrayBufferAvailable,
      maxThreads
    }));

    console.log('🔍 Environment Check:');
    console.log('  SharedArrayBuffer:', sharedArrayBufferAvailable ? '✅ Available' : '❌ Not Available');
    console.log('  CPU Cores:', maxThreads);
  };

  const initializeEngine = async (threads, hash) => {
    try {
      const stockfish = getStockfish();
      await stockfish.init();

      // Set thread count
      stockfish.engine.setOption('Threads', String(threads));

      // Set hash size
      stockfish.engine.setOption('Hash', String(hash));

      // Set analysis mode
      stockfish.engine.setOption('UCI_AnalyseMode', 'true');

      setEngineInfo(prev => ({
        ...prev,
        currentThreads: threads,
        hashSize: hash,
        engineReady: true
      }));

      console.log(`✅ Engine initialized with ${threads} threads and ${hash}MB hash`);

      return stockfish;
    } catch (error) {
      console.error('Failed to initialize engine:', error);
      throw error;
    }
  };

  const runPerformanceTest = async () => {
    setTesting(true);
    setTestResults([]);

    try {
      const testPositions = [
        {
          name: 'Starting Position',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        },
        {
          name: 'Complex Middlegame',
          fen: 'r1bqk2r/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 8'
        },
        {
          name: 'Tactical Position',
          fen: 'r2q1rk1/ppp2ppp/2n1bn2/2bpp3/4P3/2PP1N2/PPB2PPP/RNBQ1RK1 w - - 0 9'
        }
      ];

      for (const position of testPositions) {
        console.log(`\n📊 Testing: ${position.name}`);

        const result = {
          position: position.name,
          threads: selectedThreads,
          hash: selectedHash,
          depth: 18,
          time: 0,
          nodes: 0,
          nps: 0
        };

        const stockfish = await initializeEngine(selectedThreads, selectedHash);
        stockfish.setPosition(position.fen);

        const startTime = performance.now();

        const analysisResult = await stockfish.analyzePosition({
          depth: 18,
          multiPV: 1
        });

        const endTime = performance.now();
        result.time = (endTime - startTime) / 1000; // seconds

        // Get nodes and nps from the analysis
        if (analysisResult.lines && analysisResult.lines[0]) {
          result.nodes = analysisResult.lines[0].nodes || 0;
          result.nps = analysisResult.lines[0].nps || 0;
        }

        console.log(`  ⏱️  Time: ${result.time.toFixed(2)}s`);
        console.log(`  🔢 Nodes: ${(result.nodes / 1000000).toFixed(1)}M`);
        console.log(`  ⚡ NPS: ${(result.nps / 1000000).toFixed(1)}M nodes/sec`);

        setTestResults(prev => [...prev, result]);
      }

      console.log('\n✅ Performance test completed!');
    } catch (error) {
      console.error('Performance test failed:', error);
    } finally {
      setTesting(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 20 }}>🚀 Stockfish Engine Thread Test</h1>

      {/* Environment Info */}
      <div style={{
        padding: 20,
        background: '#f9fafb',
        borderRadius: 12,
        border: '2px solid #e5e7eb',
        marginBottom: 20
      }}>
        <h2 style={{ marginTop: 0 }}>Environment Status</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <strong>SharedArrayBuffer:</strong>
            <div style={{
              display: 'inline-block',
              marginLeft: 8,
              padding: '4px 12px',
              background: engineInfo.sharedArrayBufferAvailable ? '#d1fae5' : '#fee2e2',
              color: engineInfo.sharedArrayBufferAvailable ? '#065f46' : '#991b1b',
              borderRadius: 6,
              fontWeight: 600
            }}>
              {engineInfo.sharedArrayBufferAvailable ? '✅ Available' : '❌ Not Available'}
            </div>
          </div>

          <div>
            <strong>CPU Cores:</strong> {engineInfo.maxThreads}
          </div>

          <div>
            <strong>Engine Status:</strong>
            <div style={{
              display: 'inline-block',
              marginLeft: 8,
              padding: '4px 12px',
              background: engineInfo.engineReady ? '#d1fae5' : '#fef3c7',
              color: engineInfo.engineReady ? '#065f46' : '#92400e',
              borderRadius: 6,
              fontWeight: 600
            }}>
              {engineInfo.engineReady ? '✅ Ready' : '⏳ Not Initialized'}
            </div>
          </div>

          <div>
            <strong>Current Threads:</strong> {engineInfo.currentThreads}
          </div>

          <div>
            <strong>Hash Size:</strong> {engineInfo.hashSize} MB
          </div>
        </div>

        {!engineInfo.sharedArrayBufferAvailable && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: 8,
            color: '#991b1b'
          }}>
            ⚠️ <strong>Warning:</strong> SharedArrayBuffer is not available. Multi-threading will NOT work.
            <br />
            Check if your server is sending the correct CORS headers:
            <ul style={{ marginTop: 8 }}>
              <li>Cross-Origin-Embedder-Policy: require-corp</li>
              <li>Cross-Origin-Opener-Policy: same-origin</li>
            </ul>
          </div>
        )}
      </div>

      {/* Test Configuration */}
      <div style={{
        padding: 20,
        background: '#eff6ff',
        borderRadius: 12,
        border: '2px solid #3b82f6',
        marginBottom: 20
      }}>
        <h2 style={{ marginTop: 0 }}>Performance Test Configuration</h2>

        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Threads: {selectedThreads}
            </label>
            <input
              type="range"
              min="1"
              max={engineInfo.maxThreads}
              value={selectedThreads}
              onChange={(e) => setSelectedThreads(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              1 to {engineInfo.maxThreads} threads
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Hash: {selectedHash} MB
            </label>
            <select
              value={selectedHash}
              onChange={(e) => setSelectedHash(Number(e.target.value))}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 6,
                border: '2px solid #e5e7eb'
              }}
            >
              <option value={16}>16 MB</option>
              <option value={64}>64 MB</option>
              <option value={128}>128 MB</option>
              <option value={256}>256 MB</option>
              <option value={512}>512 MB</option>
              <option value={1024}>1024 MB (1 GB)</option>
            </select>
          </div>
        </div>

        <button
          onClick={runPerformanceTest}
          disabled={testing || !engineInfo.sharedArrayBufferAvailable}
          style={{
            padding: '12px 24px',
            background: testing ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: testing ? 'not-allowed' : 'pointer'
          }}
        >
          {testing ? '⏳ Testing...' : '🚀 Run Performance Test'}
        </button>

        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
          Test analyzes 3 positions at depth 18. Takes ~30-60 seconds.
        </div>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div style={{
          padding: 20,
          background: '#f9fafb',
          borderRadius: 12,
          border: '2px solid #e5e7eb'
        }}>
          <h2 style={{ marginTop: 0 }}>📊 Test Results</h2>

          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 14
          }}>
            <thead>
              <tr style={{ background: '#e5e7eb' }}>
                <th style={{ padding: 12, textAlign: 'left' }}>Position</th>
                <th style={{ padding: 12, textAlign: 'center' }}>Threads</th>
                <th style={{ padding: 12, textAlign: 'center' }}>Hash</th>
                <th style={{ padding: 12, textAlign: 'center' }}>Depth</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Time</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Nodes</th>
                <th style={{ padding: 12, textAlign: 'right' }}>NPS</th>
              </tr>
            </thead>
            <tbody>
              {testResults.map((result, index) => (
                <tr
                  key={index}
                  style={{
                    background: index % 2 === 0 ? 'white' : '#f9fafb',
                    borderBottom: '1px solid #e5e7eb'
                  }}
                >
                  <td style={{ padding: 12 }}>{result.position}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>{result.threads}</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>{result.hash} MB</td>
                  <td style={{ padding: 12, textAlign: 'center' }}>{result.depth}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                    {result.time.toFixed(2)}s
                  </td>
                  <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatNumber(result.nodes)}
                  </td>
                  <td style={{ padding: 12, textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatNumber(result.nps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{
            marginTop: 20,
            padding: 16,
            background: '#dbeafe',
            borderRadius: 8,
            fontSize: 14
          }}>
            <strong>💡 Interpretation:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
              <li><strong>NPS (Nodes Per Second):</strong> Higher is better. Shows raw search speed.</li>
              <li><strong>Multi-threading working:</strong> If NPS increases significantly with more threads, multi-threading is working!</li>
              <li><strong>Expected NPS:</strong> 1-2M NPS per thread on modern hardware</li>
              <li><strong>Efficiency:</strong> 4 threads should give ~3-3.5x speedup (not perfect 4x due to overhead)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{
        marginTop: 20,
        padding: 16,
        background: '#fef3c7',
        borderRadius: 8,
        fontSize: 14
      }}>
        <strong>📝 How to Use:</strong>
        <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>Check that SharedArrayBuffer shows "✅ Available"</li>
          <li>Select number of threads (1 to {engineInfo.maxThreads})</li>
          <li>Select hash size (larger = better for deep searches)</li>
          <li>Click "Run Performance Test"</li>
          <li>Compare NPS (nodes per second) between different thread counts</li>
          <li>If NPS scales with threads, multi-threading is working!</li>
        </ol>
      </div>
    </div>
  );
}
