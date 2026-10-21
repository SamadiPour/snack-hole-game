import { devFlags } from '../dev/flags';
import { Music } from './music';

/** Music bus level per game state (times MUSIC_LEVEL). */
const MUSIC_MODE = { hub: 0.7, round: 1, paused: 0.35 };
const MUSIC_LEVEL = 0.45;
/** At most GULP_MAX gulps start per GULP_WINDOW seconds; a vortex or magnet swallows hundreds a second. */
const GULP_WINDOW = 0.05;
const GULP_MAX = 3;
/** Seconds a settings change may keep fading (ambience, music and master gain ramps). */
const FADE_TAIL = 1.5;

/**
 * Sound effects and ambience are synthesised with WebAudio: gulps (pitch drops with size), combo
 * chimes, level-up arpeggios, fanfare, UI clicks and an ambient bed per map. Background music is
 * a CC0 track per map (see music.ts).
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambient: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: Music | null = null;
  private tunes = true;
  private musicMode: keyof typeof MUSIC_MODE = 'hub';
  private ambientNodes: AudioNode[] = [];
  private noiseBuf: AudioBuffer | null = null;
  /** Gulps started in the current GULP_WINDOW, and when that window opened (ctx seconds). */
  private gulpsInWindow = 0;
  private gulpWindowAt = -1;
  /** Recent gulp density (decays over ~0.6 s); fast streaks play each gulp quieter. */
  private gulpEnergy = 0;
  private gulpAt = 0;
  private lastChime = 0;
  private volume = 0.7;
  private muted = false;
  private ambientOn = true;
  private ambientStyle = '';
  /** Next time (ctx seconds) an ambient one-shot (bird, gull) may play. */
  private nextCritter = 0;
  /** Tab hidden: the context is suspended so nothing plays in the background. */
  private hidden = false;
  /**
   * The state last asked of the context. suspend() and resume() settle later, so ctx.state can
   * still read 'running' right after a suspend; decisions use this instead.
   */
  private intent: 'running' | 'suspended' = 'running';
  /** Context time until which a fade started by a settings change may still be sounding. */
  private fadeUntil = 0;

  /** Must be called from a user gesture. */
  unlock(): void {
    // `?mute` (dev): stay silent for testing, never create the AudioContext.
    if (devFlags.mute) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.ambient = this.ctx.createGain();
      this.ambient.gain.value = 0;
      this.ambient.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      this.music = new Music(this.ctx, this.musicBus);
      this.applyVolume();
      if (this.ambientStyle) this.setAmbient(this.ambientStyle, true);
      // Start it inside this gesture even when muted (sync may suspend it right after): iOS only
      // lets a context that started from a gesture resume later from a slider or a toggle.
      void this.ctx.resume().catch(() => {});
      this.intent = 'running';
    }
    this.sync(true);
  }

  /** Muted or at volume 0: effects are skipped and the context is suspended. */
  private get silent(): boolean {
    return this.muted || this.volume <= 0;
  }

  /**
   * The context runs unless the tab is hidden, muted or at volume 0; fades a settings change
   * started finish first. It never idles while audible: waking it for an effect would need a
   * resume() outside a user gesture, which iOS Safari may refuse.
   */
  private wantRunning(ctx: AudioContext): boolean {
    if (this.hidden) return false;
    if (ctx.currentTime < this.fadeUntil) return true;
    return !this.silent;
  }

  /**
   * Suspends or resumes the context to match wantRunning(). `force` resumes even when running was
   * already asked for: from a user gesture or when the tab is visible again, the only times
   * browsers allow it, since autoplay policy or iOS Safari's 'interrupted' (a phone call,
   * switching apps) may have paused the context without us.
   */
  private sync(force = false): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    const want = this.wantRunning(ctx) ? 'running' : 'suspended';
    if (want === 'running') {
      if (force || this.intent !== 'running') void ctx.resume().catch(() => {});
    } else if (this.intent !== 'suspended') void ctx.suspend().catch(() => {});
    this.intent = want;
  }

  /** The context for a new effect, or null when effects are silent (no context, muted, volume 0 or hidden). */
  private fx(): AudioContext | null {
    const ctx = this.ctx;
    return !ctx || this.hidden || this.silent ? null : ctx;
  }

  /** Suspends all sound while the tab is hidden (music, ambience and effects keep no CPU busy). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.sync(!hidden);
  }

  setVolume(v: number, muted: boolean, ambient: boolean, tunes: boolean): void {
    this.volume = v;
    this.muted = muted;
    this.ambientOn = ambient;
    this.tunes = tunes;
    // Let the fades this change starts finish before the context may suspend.
    if (this.ctx && this.intent === 'running') this.fadeUntil = this.ctx.currentTime + FADE_TAIL;
    this.applyVolume();
    this.syncSong();
    this.sync();
  }

  /**
   * Music plays the current map's track only while music is on and audible (no download
   * otherwise). Volume 0 stops it like mute: the context then suspends, and a track still fading
   * out on a frozen clock would never stop or free its buffer.
   */
  private syncSong(): void {
    if (!this.music) return;
    if (this.tunes && !this.silent && this.ambientStyle) this.music.setSong(this.ambientStyle);
    else this.music.stop();
  }

  /** Music is a bit quieter in the hub and ducks while paused. */
  setMusicMode(mode: keyof typeof MUSIC_MODE): void {
    this.musicMode = mode;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx || !this.ambient) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    this.ambient.gain.setTargetAtTime(this.ambientOn ? 0.22 : 0, this.ctx.currentTime, 0.3);
    this.musicBus?.gain.setTargetAtTime(this.tunes ? MUSIC_LEVEL * MUSIC_MODE[this.musicMode] : 0, this.ctx.currentTime, 0.4);
  }

  endFrame(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Suspends the context once a mute or volume-0 fade has died away.
    this.sync();
    if (this.silent || ctx.state !== 'running') return;
    if (!this.ambientOn) return;
    const critter = CRITTERS[this.ambientStyle];
    if (!critter || ctx.currentTime < this.nextCritter) return;
    if (this.nextCritter > 0) critter.kind === 'gull' ? this.gull(ctx.currentTime + 0.05) : this.bird(ctx.currentTime + 0.05);
    this.nextCritter = ctx.currentTime + critter.min + Math.random() * (critter.max - critter.min);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    // Silent until t: a new gain starts at 1, and rounding can put the first event one sample after
    // the source's start(t), so that sample would play at full level (a click).
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, type: OscillatorType, t: number, peak: number, attack: number, decay: number, endFreq?: number): void {
    if (!this.ctx || !this.sfx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + attack + decay);
    this.env(g, t, peak, attack, decay);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private noise(t: number, dur: number, peak: number, filterFreq: number, q = 1, endFreq?: number, type: BiquadFilterType = 'lowpass'): void {
    if (!this.ctx || !this.sfx || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.01, dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Marimba-ish note: fundamental plus a fast-fading 4th partial for the wooden attack. */
  private mallet(freq: number, t: number, vol: number, decay: number): void {
    this.tone(freq, 'sine', t, vol, 0.004, decay);
    this.tone(freq * 4, 'sine', t, vol * 0.22, 0.002, decay * 0.16);
    this.tone(freq * 2, 'triangle', t, vol * 0.1, 0.003, decay * 0.35);
  }

  /** Soft bell: slightly inharmonic partials, slow decay. */
  private bell(freq: number, t: number, vol: number, decay: number): void {
    this.tone(freq, 'sine', t, vol, 0.006, decay);
    this.tone(freq * 2.01, 'sine', t, vol * 0.35, 0.004, decay * 0.6);
    this.tone(freq * 3.02, 'sine', t, vol * 0.12, 0.003, decay * 0.35);
  }

  /**
   * Gulp: bigger footprint = deeper, longer, louder. Capped per time window (not per frame, so a
   * 120 Hz screen gets no more); stacked gulps drop the extra partial and the noise layer.
   */
  gulp(footprint: number): void {
    const ctx = this.fx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.gulpWindowAt >= GULP_WINDOW || now < this.gulpWindowAt) {
      this.gulpWindowAt = now;
      this.gulpsInWindow = 0;
    }
    if (this.gulpsInWindow >= GULP_MAX) return;
    const n = this.gulpsInWindow++;
    this.gulpEnergy = this.gulpEnergy * Math.exp(-(now - this.gulpAt) / 0.6) + 1;
    this.gulpAt = now;
    const t = now + (n + 1) * 0.012;
    const size = Math.min(1, Math.log2(1 + footprint) / 5);
    const base = 620 * Math.pow(0.42, size * 2.2) * (0.92 + Math.random() * 0.16);
    const dur = 0.09 + size * 0.35;
    const duck = 1 / (1 + 0.12 * Math.max(0, this.gulpEnergy - 2));
    const vol = (0.12 + size * 0.25) * duck;
    this.tone(base * 1.6, 'sine', t, vol, 0.01, dur, base * 0.55);
    if (n > 0) return;
    this.tone(base * 0.8, 'triangle', t + 0.02, vol * 0.6, 0.015, dur * 0.8, base * 0.4);
    if (size > 0.45) this.noise(t, dur * 1.4, vol * 0.5, 900, 1, 120);
  }

  /** Golden prop swallowed: bright coin-like double ding. */
  goldDing(): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bell(1975.5, t, 0.07, 0.35);
    this.bell(2637, t + 0.07, 0.08, 0.6);
    this.noise(t + 0.05, 0.3, 0.025, 7000, 0.7, 11000, 'highpass');
  }

  /** Landmark swallowed: deep rumble and crumbling debris; `full` adds a low boom and a bell chord. */
  landmark(footprint: number, full: boolean): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const size = Math.min(1, Math.log2(1 + footprint) / 5);
    const k = full ? 1 : 0.55;
    this.tone(70 - size * 25, 'sine', t, 0.3 * k, 0.02, full ? 1.2 : 0.6, 28);
    this.noise(t, full ? 1.4 : 0.7, 0.22 * k, 500, 0.8, 70);
    for (let i = 0; i < (full ? 6 : 3); i++) this.noise(t + 0.08 + i * 0.11 + Math.random() * 0.05, 0.12, 0.06 * k, 900 + Math.random() * 900, 2, undefined, 'bandpass');
    if (full) [0, 7, 12].forEach((s) => this.bell(261.6 * Math.pow(2, s / 12), t + 0.45, 0.035, 1.2));
  }

  /** Short announcement jingle for a random event. */
  eventStinger(id: string): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (id === 'rush') {
      // Two honks.
      for (const dt of [0, 0.22]) {
        this.tone(415, 'sawtooth', t + dt, 0.05, 0.01, 0.16);
        this.tone(523, 'sawtooth', t + dt, 0.04, 0.01, 0.16);
      }
    } else if (id === 'ufo') {
      // Wobbly sci-fi warble.
      for (let i = 0; i < 6; i++) this.tone(600 + i * 120, 'sine', t + i * 0.07, 0.05, 0.005, 0.12, 900 + i * 160);
    } else {
      // Rumbling hooves plus a fiddle-ish rising call.
      for (let i = 0; i < 8; i++) this.noise(t + i * 0.09, 0.08, 0.08, 220, 1.5, undefined, 'lowpass');
      [0, 4, 7, 12].forEach((s, i) => this.mallet(392 * Math.pow(2, s / 12), t + 0.1 + i * 0.08, 0.06, 0.25));
    }
  }

  /** Combo milestone: a mallet note that climbs a pentatonic scale with the streak. */
  combo(step: number): void {
    const ctx = this.fx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastChime < 0.06) return;
    this.lastChime = now;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 392 * Math.pow(2, scale[Math.min(scale.length - 1, step)] / 12);
    this.mallet(f, now, 0.09, 0.3);
  }

  /** The combo multiplier just hit its cap: one sparkly flourish, then silence for the streak. */
  comboMax(): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((s, i) => this.mallet(784 * Math.pow(2, s / 12), t + i * 0.045, 0.07, 0.35));
    this.bell(1568, t + 0.24, 0.05, 0.9);
    this.noise(t + 0.2, 0.6, 0.03, 6000, 0.8, 9000, 'highpass');
  }

  levelUp(): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), 'triangle', t + i * 0.06, 0.13, 0.01, 0.22));
    this.noise(t, 0.4, 0.05, 3000, 0.7, 8000, 'bandpass');
  }

  /** Round results: bright mallet run into a soft major chord. `big` for a cleared map. */
  fanfare(big = false): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const run = big ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    run.forEach((s, i) => this.mallet(523.25 * Math.pow(2, s / 12), t + i * 0.075, 0.08, 0.35));
    const t2 = t + run.length * 0.075 + 0.04;
    for (const s of big ? [0, 4, 7, 12, 16] : [0, 4, 7, 12]) this.bell(523.25 * Math.pow(2, s / 12), t2, 0.045, big ? 1.8 : 1.3);
    this.tone(130.8, 'sine', t2, 0.1, 0.02, 0.8);
    for (let i = 0; i < (big ? 8 : 4); i++) this.tone(2093 * Math.pow(2, Math.floor(Math.random() * 5) * 2 / 12), 'sine', t2 + 0.1 + i * 0.07, 0.02, 0.003, 0.25);
  }

  /** Time's up: a bright two-note bell over a soft low thump (replaces the referee whistle). */
  whistle(): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bell(1760, t, 0.08, 1.1);
    this.bell(2217.5, t, 0.05, 1.0);
    this.tone(110, 'sine', t, 0.16, 0.005, 0.35, 55);
  }

  /** Last seconds: soft wood ticks at 5 and 4, rising mallet beeps at 3, 2, 1. */
  tick(secondsLeft: number): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (secondsLeft > 3) {
      this.tone(1100, 'sine', t, 0.05, 0.002, 0.05, 700);
      this.noise(t, 0.03, 0.04, 2400, 5, undefined, 'bandpass');
      return;
    }
    // Race-start style: three equal beeps, then the higher time's-up bell.
    this.mallet(880, t, 0.1, 0.22);
    this.tone(440, 'sine', t, 0.04, 0.004, 0.15);
  }

  click(): void {
    const ctx = this.fx();
    if (!ctx) return;
    this.tone(700, 'triangle', ctx.currentTime, 0.06, 0.003, 0.05, 500);
  }

  buy(): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(1318.5, 'square', t, 0.04, 0.003, 0.08);
    this.tone(1760, 'square', t + 0.07, 0.04, 0.003, 0.16);
    this.tone(2637, 'sine', t + 0.07, 0.04, 0.003, 0.25);
  }

  deny(): void {
    const ctx = this.fx();
    if (!ctx) return;
    this.tone(180, 'sawtooth', ctx.currentTime, 0.05, 0.005, 0.12, 120);
  }

  ability(kind: string): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'dash') {
      // Whoosh + low thump + quick upward zip.
      this.noise(t, 0.4, 0.2, 300, 1.5, 3500, 'bandpass');
      this.tone(95, 'sine', t, 0.22, 0.005, 0.25, 40);
      this.tone(420, 'triangle', t, 0.05, 0.01, 0.16, 1300);
    }
    else if (kind === 'vortex') {
      this.noise(t, 1.2, 0.15, 200, 4, 2000, 'bandpass');
      this.tone(80, 'sawtooth', t, 0.05, 0.1, 1.2, 160);
    } else {
      this.tone(150, 'sine', t, 0.25, 0.02, 0.6, 60);
      this.tone(300, 'triangle', t, 0.08, 0.02, 0.5, 120);
    }
  }

  achievement(): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [0, 7, 12, 16, 19].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 'sine', t + i * 0.07, 0.1, 0.005, 0.4));
  }

  singularity(): void {
    const ctx = this.fx();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(400, 'sawtooth', t, 0.12, 0.05, 2.5, 30);
    this.noise(t, 2.5, 0.2, 6000, 1, 60);
    [0, 7, 12, 19, 24].forEach((s, i) => this.tone(220 * Math.pow(2, s / 12), 'sine', t + 2.2 + i * 0.1, 0.1, 0.01, 1.2));
  }

  /** One songbird phrase: a few quick chirps, sweeping up, down, or a short trill. */
  private bird(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambient) return;
    const out = this.panned(Math.random() * 1.4 - 0.7, 0.18 + Math.random() * 0.12);
    const kind = Math.floor(Math.random() * 3);
    const base = 2300 + Math.random() * 1700;
    const n = kind === 2 ? 1 : 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      const dur = kind === 2 ? 0.35 : 0.06 + Math.random() * 0.04;
      if (kind === 0) {
        o.frequency.setValueAtTime(base * 0.85, st);
        o.frequency.exponentialRampToValueAtTime(base * 1.35, st + dur);
      } else if (kind === 1) {
        o.frequency.setValueAtTime(base * 1.3, st);
        o.frequency.exponentialRampToValueAtTime(base * 0.8, st + dur);
      } else {
        o.frequency.value = base;
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 26 + Math.random() * 10;
        lg.gain.value = base * 0.12;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(st);
        lfo.stop(st + dur + 0.05);
      }
      g.gain.value = 0; // silent until st, see env()
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(1, st + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      o.connect(g).connect(out);
      o.start(st);
      o.stop(st + dur + 0.05);
    }
  }

  /** Distant seagull: two or three falling "kee-ow" cries. */
  private gull(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.panned(Math.random() * 1.6 - 0.8, 0.1 + Math.random() * 0.08);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 1.2;
    f.connect(out);
    const n = 2 + Math.floor(Math.random() * 2);
    const base = 950 + Math.random() * 300;
    for (let i = 0; i < n; i++) {
      const st = t + i * 0.32;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.25, st);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, st + 0.26);
      g.gain.value = 0; // silent until st, see env()
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(1, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.28);
      o.connect(g).connect(f);
      o.start(st);
      o.stop(st + 0.32);
    }
  }

  /** A gain (and stereo position when supported) feeding the ambient bus; auto-disconnects. */
  private panned(pan: number, gain: number): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.ambient!);
      setTimeout(() => {
        g.disconnect();
        p.disconnect();
      }, 3000);
    } else {
      g.connect(this.ambient!);
      setTimeout(() => g.disconnect(), 3000);
    }
    return g;
  }

  /**
   * Looping ambient bed per map: filtered noise shaped into wind, surf or hum by a slow LFO on
   * its level and filter, plus occasional critters (see CRITTERS).
   */
  setAmbient(style: string, force = false): void {
    if (style === this.ambientStyle && !force) {
      // Same map: retries the track if its download failed earlier.
      this.syncSong();
      return;
    }
    this.ambientStyle = style;
    this.nextCritter = 0;
    this.syncSong();
    if (!this.ctx || !this.ambient || !this.noiseBuf) return;
    for (const n of this.ambientNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambientNodes = [];
    const ctx = this.ctx;
    const bed = BEDS[style] ?? BEDS.suburb;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = bed.freq;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = bed.gain;
    // Level swell (gusts / waves).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = bed.rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = bed.gain * bed.depth;
    lfo.connect(lfoGain).connect(g.gain);
    // Filter sweep in step with the swell so gusts brighten a little.
    const lfoF = ctx.createGain();
    lfoF.gain.value = bed.freq * bed.sweep;
    lfo.connect(lfoF).connect(f.frequency);
    src.connect(f).connect(g).connect(this.ambient);
    src.start();
    lfo.start();
    this.ambientNodes.push(src, f, g, lfo, lfoGain, lfoF);
    if (style === 'moon') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 55;
      const og = ctx.createGain();
      og.gain.value = 0.05;
      o.connect(og).connect(this.ambient);
      o.start();
      this.ambientNodes.push(o, og);
    }
  }
}

/** Noise bed per map: lowpass cutoff, level, swell rate (Hz), swell depth and filter sweep (fractions). */
const BEDS: Record<string, { freq: number; gain: number; rate: number; depth: number; sweep: number }> = {
  suburb: { freq: 420, gain: 0.26, rate: 0.07, depth: 0.4, sweep: 0.3 },
  downtown: { freq: 380, gain: 0.35, rate: 0.08, depth: 0.2, sweep: 0.1 },
  farm: { freq: 300, gain: 0.22, rate: 0.06, depth: 0.55, sweep: 0.45 },
  harbor: { freq: 520, gain: 0.3, rate: 0.13, depth: 0.7, sweep: 0.35 },
  airport: { freq: 300, gain: 0.35, rate: 0.08, depth: 0.25, sweep: 0.1 },
  spaceport: { freq: 460, gain: 0.3, rate: 0.1, depth: 0.5, sweep: 0.3 },
  moon: { freq: 140, gain: 0.35, rate: 0.08, depth: 0.15, sweep: 0.1 },
};

/** Occasional ambient one-shots: seconds between them. */
const CRITTERS: Record<string, { kind: 'bird' | 'gull'; min: number; max: number }> = {
  farm: { kind: 'bird', min: 1.2, max: 4.5 },
  suburb: { kind: 'bird', min: 3, max: 8 },
  harbor: { kind: 'gull', min: 5, max: 12 },
  spaceport: { kind: 'gull', min: 7, max: 16 },
};
