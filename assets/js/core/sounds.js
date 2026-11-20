'use strict';

import { state } from './state.js';

class SoundEngine {
  constructor() {
    this.ctx = null;
  }

  ensureCtx() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  play(type) {
    if (!state.settings.soundsEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const vol = Math.max(0, Math.min(1, state.settings.soundVolume ?? 0.5)) * 0.25;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const presets = {
      join: [440, 587, 0.12],
      leave: [440, 330, 0.14],
      msg: [660, 784, 0.08],
      react: [523, 659, 0.09],
      game: [523, 784, 0.14],
      win: [523, 880, 0.22],
      mic: [380, 460, 0.06]
    };

    const [f1, f2, dur] = presets[type] || [500, 500, 0.08];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(f2, now + dur);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
}

export const sounds = new SoundEngine();
