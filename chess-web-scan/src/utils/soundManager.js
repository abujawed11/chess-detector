// soundManager.js - Chess sound effects using Web Audio API

class SoundManager {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
    this.volume = 0.3;

    // Initialize on user interaction to avoid autoplay restrictions
    this.initAudioContext();
  }

  initAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported', e);
        this.enabled = false;
      }
    }
  }

  // Generic tone generator
  playTone(frequency, duration, type = 'sine') {
    if (!this.enabled || !this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      console.warn('Error playing tone:', e);
    }
  }

  // Play multiple tones for richer sounds
  playChord(frequencies, duration, type = 'sine') {
    frequencies.forEach(freq => this.playTone(freq, duration, type));
  }

  // Move sound - subtle click
  playMove() {
    this.playTone(440, 0.08, 'sine');
  }

  // Capture sound - more aggressive
  playCapture() {
    const now = this.audioContext?.currentTime || 0;
    this.playTone(330, 0.12, 'square');
    setTimeout(() => this.playTone(220, 0.08, 'square'), 40);
  }

  // Check sound - warning tone
  playCheck() {
    this.playChord([587.33, 739.99], 0.15, 'triangle'); // D5 + F#5
    setTimeout(() => this.playChord([587.33, 739.99], 0.12, 'triangle'), 150);
  }

  // Checkmate sound - triumphant sequence
  playCheckmate() {
    const notes = [
      { freq: 523.25, time: 0, duration: 0.2 },      // C5
      { freq: 659.25, time: 200, duration: 0.2 },    // E5
      { freq: 783.99, time: 400, duration: 0.3 },    // G5
      { freq: 1046.50, time: 600, duration: 0.4 }    // C6
    ];

    notes.forEach(note => {
      setTimeout(() => this.playTone(note.freq, note.duration, 'triangle'), note.time);
    });
  }

  // Castle sound - special move
  playCastle() {
    this.playTone(392, 0.1, 'sine'); // G4
    setTimeout(() => this.playTone(523.25, 0.12, 'sine'), 80); // C5
  }

  // Promotion sound
  playPromotion() {
    this.playChord([523.25, 659.25, 783.99], 0.25, 'sine'); // C-E-G chord
  }

  // Illegal move sound - error beep
  playIllegal() {
    this.playTone(150, 0.15, 'square');
  }

  // Game start
  playGameStart() {
    this.playTone(440, 0.15, 'sine');
    setTimeout(() => this.playTone(554.37, 0.15, 'sine'), 150);
  }

  // Toggle sound on/off
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  // Set volume (0-1)
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Resume audio context (needed after user interaction on some browsers)
  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }
}

// Export singleton instance
export const soundManager = new SoundManager();
export default soundManager;
