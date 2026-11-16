// audio.js — every sound is synthesized with WebAudio: no audio assets, no
// network. Gunshots are filtered noise bursts with a body thump, the charge
// beeps are square blips, the sea is slow filtered noise. One shared noise
// buffer; voices are cheap one-shot nodes.

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.seaLoop();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // A short noise burst through a band filter — the building block of shots,
  // hits and explosions. dist attenuates and dulls distant sounds.
  burst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'bandpass', dist = 0, slide = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const att = 1 / (1 + dist * 0.09);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq * att, t);
    if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * att, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.4, dur + 0.05);
  }

  tone({ freq = 440, dur = 0.1, gain = 0.2, type = 'square', slide = 0, dist = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const att = 1 / (1 + dist * 0.09);
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * att, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot(id, dist = 0) {
    // Callers pass weapon ids; the synth voices are named by gun class.
    const kind = { kestrel: 'pistol', breaker: 'shotgun', dart: 'smg', longbow: 'rifle', harpoon: 'sniper' }[id] || id;
    if (kind === 'sniper') {
      this.burst({ dur: 0.32, freq: 900, gain: 0.85, dist, slide: 0.2 });
      this.tone({ freq: 120, dur: 0.22, gain: 0.5, type: 'triangle', slide: 0.4, dist });
    } else if (kind === 'shotgun') {
      this.burst({ dur: 0.24, freq: 1100, gain: 0.8, dist, slide: 0.3 });
      this.tone({ freq: 140, dur: 0.16, gain: 0.45, type: 'triangle', slide: 0.5, dist });
    } else if (kind === 'smg') {
      this.burst({ dur: 0.09, freq: 2100, gain: 0.42, dist });
    } else if (kind === 'pistol') {
      this.burst({ dur: 0.11, freq: 1700, gain: 0.5, dist, slide: 0.5 });
    } else {
      this.burst({ dur: 0.14, freq: 1500, gain: 0.6, dist, slide: 0.45 });
      this.tone({ freq: 160, dur: 0.1, gain: 0.3, type: 'triangle', slide: 0.5, dist });
    }
  }

  dryFire() { this.tone({ freq: 1200, dur: 0.04, gain: 0.12, type: 'square' }); }
  reload() {
    this.tone({ freq: 700, dur: 0.05, gain: 0.15, type: 'square' });
    setTimeout(() => this.tone({ freq: 500, dur: 0.05, gain: 0.15, type: 'square' }), 180);
    setTimeout(() => this.tone({ freq: 900, dur: 0.06, gain: 0.18, type: 'square' }), 420);
  }
  hitmark(head) {
    this.tone({ freq: head ? 1560 : 1050, dur: 0.07, gain: 0.22, type: 'sine' });
    if (head) this.tone({ freq: 2100, dur: 0.1, gain: 0.18, type: 'sine' });
  }
  hurt() { this.burst({ dur: 0.1, freq: 500, gain: 0.3, type: 'lowpass' }); }
  step(run) { this.burst({ dur: 0.05, freq: run ? 700 : 550, gain: 0.07, type: 'lowpass' }); }
  jump() { this.burst({ dur: 0.06, freq: 800, gain: 0.06, type: 'lowpass' }); }
  buy() { this.tone({ freq: 880, dur: 0.06, gain: 0.15, type: 'sine' }); this.tone({ freq: 1320, dur: 0.09, gain: 0.15, type: 'sine' }); }
  denied() { this.tone({ freq: 220, dur: 0.12, gain: 0.15, type: 'square' }); }
  beep(final) { this.tone({ freq: final ? 1560 : 1040, dur: final ? 0.3 : 0.08, gain: 0.2, type: 'square' }); }
  planted() {
    this.tone({ freq: 780, dur: 0.12, gain: 0.2, type: 'square' });
    setTimeout(() => this.tone({ freq: 1170, dur: 0.2, gain: 0.2, type: 'square' }), 140);
  }
  explosion(dist = 0) {
    this.burst({ dur: 0.7, freq: 300, gain: 0.9, type: 'lowpass', dist, slide: 0.2 });
    this.tone({ freq: 70, dur: 0.6, gain: 0.6, type: 'sine', slide: 0.4, dist });
  }
  flash() { this.tone({ freq: 3200, dur: 0.35, gain: 0.25, type: 'sine', slide: 0.7 }); }
  throwIt() { this.burst({ dur: 0.08, freq: 900, gain: 0.1, type: 'lowpass' }); }
  roundEnd(win) {
    const base = win ? 523 : 392;
    this.tone({ freq: base, dur: 0.16, gain: 0.2, type: 'triangle' });
    setTimeout(() => this.tone({ freq: base * 1.25, dur: 0.16, gain: 0.2, type: 'triangle' }), 150);
    setTimeout(() => this.tone({ freq: base * 1.5, dur: 0.3, gain: 0.22, type: 'triangle' }), 300);
  }

  seaLoop() {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    lfo.start();
  }
}
