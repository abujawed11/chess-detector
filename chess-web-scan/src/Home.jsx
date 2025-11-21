import { useState } from 'react';
import ThemeSelector from './components/ThemeSelector';

/**
 * Home / Landing Page
 * Beautiful landing page with all chess tools and features
 */
export default function Home({ onNavigate }) {
  const [isDragging, setIsDragging] = useState(false);

  const features = [
    {
      id: 'image-scan',
      title: 'Scan Chess Image',
      description: 'Upload a photo of any chess board and instantly get the FEN notation',
      icon: '📷',
      color: 'from-purple-500 to-purple-700',
      action: () => onNavigate('scanner')
    },
    {
      id: 'pgn-upload',
      title: 'Analyze PGN Game',
      description: 'Upload a PGN file to analyze an entire chess game with detailed move classifications',
      icon: '📄',
      color: 'from-blue-500 to-blue-700',
      action: () => onNavigate('pgn-analysis')
    },
        {
      id: 'fen-upload',
      title: 'Load FEN Position',
      description: 'Paste or upload a FEN string to load any chess position instantly',
      icon: '📝',
      color: 'from-indigo-500 to-indigo-700',
      action: () => onNavigate('fen-upload')
    },
    {
      id: 'play-computer',
      title: 'Play vs Computer',
      description: 'Challenge Stockfish 17.1 at different ELO levels - from beginner to grandmaster',
      icon: '🤖',
      color: 'from-green-500 to-green-700',
      action: () => onNavigate('play-computer')
    },
    {
      id: 'play-human',
      title: 'Play vs Human',
      description: 'Play against a friend locally with move analysis and evaluation',
      icon: '👥',
      color: 'from-amber-500 to-amber-700',
      action: () => onNavigate('analysis')
    },
    {
      id: 'position-analysis',
      title: 'Analyze Position',
      description: 'Deep position analysis with brilliant move detection and evaluation',
      icon: '🔬',
      color: 'from-teal-500 to-teal-700',
      action: () => onNavigate('analysis')
    },

    {
      id: 'test-suite',
      title: 'Test Classification',
      description: 'Test the move classification system on famous chess positions',
      icon: '🧪',
      color: 'from-rose-500 to-rose-700',
      action: () => onNavigate('test')
    }
  ];

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        // Handle image upload - navigate to scanner
        onNavigate('scanner');
      } else if (file.name.endsWith('.pgn')) {
        // Handle PGN upload - navigate to PGN analysis
        onNavigate('pgn-analysis');
      }
    }
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 7px,
              rgba(255,255,255,0.1) 7px,
              rgba(255,255,255,0.1) 8px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 7px,
              rgba(255,255,255,0.1) 7px,
              rgba(255,255,255,0.1) 8px
            )`
          }} />
        </div>

        {/* Header */}
        <div className="relative z-20 mx-auto max-w-7xl px-6 py-8">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-4xl">♟️</div>
              <h1 className="text-2xl font-bold text-white">Chess Analyzer Pro</h1>
            </div>
            <div className="flex gap-3 items-center">
              <ThemeSelector />
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <span className="mr-2">⭐</span>
                GitHub
              </a>
            </div>
          </nav>

          {/* Hero Content */}
          <div className="mt-20 text-center">
            <h2 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl">
              Your Complete
              <br />
              <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-amber-500 bg-clip-text text-transparent">
                Chess Toolkit
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-300">
              Scan boards, analyze games, play against AI, and master chess with powerful tools powered by Stockfish 17.1 and advanced AI
            </p>

            {/* Quick action buttons */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => onNavigate('scanner')}
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-4 text-lg font-bold text-white shadow-xl transition hover:scale-105 hover:shadow-2xl"
              >
                <span className="text-2xl">📷</span>
                Upload Image
                <span className="ml-2 transition group-hover:translate-x-1">→</span>
              </button>
              <button
                onClick={() => onNavigate('analysis')}
                className="flex items-center gap-2 rounded-xl border-2 border-white/30 bg-white/10 px-8 py-4 text-lg font-bold text-white backdrop-blur-sm transition hover:scale-105 hover:bg-white/20"
              >
                <span className="text-2xl">🎯</span>
                Start Analyzing
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 text-center">
          <h3 className="text-3xl font-bold text-white">Choose Your Tool</h3>
          <p className="mt-2 text-slate-400">Everything you need for chess analysis and improvement</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <button
              key={feature.id}
              onClick={feature.action}
              className="group relative overflow-hidden rounded-2xl bg-white/5 p-6 text-left backdrop-blur-sm transition hover:scale-105 hover:bg-white/10"
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}
            >
              {/* Gradient overlay on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 transition group-hover:opacity-10`} />
              
              <div className="relative">
                {/* Icon */}
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-white/10 text-4xl backdrop-blur">
                  {feature.icon}
                </div>

                {/* Content */}
                <h4 className="mb-2 text-xl font-bold text-white">{feature.title}</h4>
                <p className="text-sm leading-relaxed text-slate-400">{feature.description}</p>

                {/* Arrow */}
                <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-purple-400 transition group-hover:gap-3">
                  Get Started
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="rounded-3xl border-4 border-dashed border-purple-500 bg-white/10 p-20 text-center">
            <div className="mb-4 text-8xl">📁</div>
            <h3 className="text-3xl font-bold text-white">Drop your file here</h3>
            <p className="mt-2 text-xl text-slate-300">Chess image or PGN file</p>
          </div>
        </div>
      )}

      {/* Features highlight */}
      <div className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-12 md:grid-cols-3">
          <div className="text-center">
            <div className="mb-4 text-5xl">⚡</div>
            <h4 className="mb-2 text-xl font-bold text-white">Lightning Fast</h4>
            <p className="text-slate-400">Powered by Stockfish 17.1 with multi-threading support</p>
          </div>
          <div className="text-center">
            <div className="mb-4 text-5xl">🎯</div>
            <h4 className="mb-2 text-xl font-bold text-white">Precise Analysis</h4>
            <p className="text-slate-400">Advanced move classification with brilliant move detection</p>
          </div>
          <div className="text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h4 className="mb-2 text-xl font-bold text-white">100% Private</h4>
            <p className="text-slate-400">All analysis runs locally in your browser</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative border-t border-white/10 py-8">
        <div className="mx-auto max-w-7xl px-6 text-center text-sm text-slate-400">
          <p>Built with ♟️ Chess.js, Stockfish 17.1, and React</p>
          <p className="mt-2">© 2025 Chess Analyzer Pro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

