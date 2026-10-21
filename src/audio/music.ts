/**
 * Background music: one CC0 track per map (see CREDITS.md), streamed from public/music/,
 * looped without gaps and cross-faded when the map changes. Everything goes into the `out` bus
 * the Audio class owns (volume, mute, hub/pause ducking). Only the compressed files stay cached
 * (about 6.2 MB for all maps); just the playing track is kept decoded, since decoded PCM is ~10x
 * bigger and would add up to well over 100 MB on mobile.
 */

const TRACKS: Record<string, string> = {
  suburb: 'suburb.mp3',
  farm: 'farm.mp3',
  downtown: 'downtown.mp3',
  harbor: 'harbor.mp3',
  airport: 'airport.mp3',
  spaceport: 'spaceport.mp3',
  moon: 'moon.mp3',
};

const FADE = 1.2;

interface Track {
  buffer: AudioBuffer;
  /** Loop points with the MP3 encoder's silent padding trimmed off both ends. */
  start: number;
  end: number;
}

interface Playing {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/** First and last sample (seconds) louder than the noise floor, so the loop has no silent gap. */
function audibleRange(buf: AudioBuffer): { start: number; end: number } {
  const floor = 1e-3;
  let first = buf.length;
  let last = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    let i = 0;
    while (i < d.length && Math.abs(d[i]) < floor) i++;
    let j = d.length - 1;
    while (j > i && Math.abs(d[j]) < floor) j--;
    first = Math.min(first, i);
    last = Math.max(last, j);
  }
  if (last <= first) return { start: 0, end: buf.duration };
  return { start: first / buf.sampleRate, end: (last + 1) / buf.sampleRate };
}

export class Music {
  /** Compressed track bytes per style; a failed download is dropped so the next visit retries. */
  private files = new Map<string, Promise<ArrayBuffer>>();
  /** The decoded track for the current style. */
  private decoded: { style: string; track: Promise<Track | null> } | null = null;
  private current: Playing | null = null;
  private style = '';
  /** Bumped by every setSong and stop; a load may start playback only if it is still the latest. */
  private request = 0;

  constructor(
    private ctx: AudioContext,
    private out: GainNode,
  ) {}

  private fetchFile(style: string): Promise<ArrayBuffer> {
    let p = this.files.get(style);
    if (!p) {
      const file = TRACKS[style] ?? TRACKS.suburb;
      p = fetch(`${import.meta.env.BASE_URL}music/${file}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))));
      p.catch(() => {
        if (this.files.get(style) === p) this.files.delete(style);
      });
      this.files.set(style, p);
    }
    return p;
  }

  private load(style: string): Promise<Track | null> {
    if (this.decoded?.style !== style) {
      const track = this.fetchFile(style)
        // decodeAudioData detaches the buffer it is given, so decode a copy and keep the original.
        .then((data) => this.ctx.decodeAudioData(data.slice(0)))
        .then((buffer) => ({ buffer, ...audibleRange(buffer) }))
        .catch(() => {
          if (this.decoded?.track === track) this.decoded = null;
          return null;
        });
      this.decoded = { style, track };
    }
    return this.decoded.track;
  }

  /** Switches to the map's track (cross-fade); a no-op if it is already playing. */
  setSong(style: string): void {
    if (style === this.style) return;
    this.style = style;
    const request = ++this.request;
    void this.load(style).then((track) => {
      // Ignore a load that finished after the player moved on: another map, music off, or a newer
      // request for this same map (Farm, Moon, Farm while farm.mp3 downloads) that starts it itself.
      if (request !== this.request) return;
      if (!track) {
        // Failed: forget the style so the next setSong (map change, music toggle) retries.
        this.style = '';
        return;
      }
      const ctx = this.ctx;
      const t = ctx.currentTime;
      this.fadeOut(t);
      const src = ctx.createBufferSource();
      src.buffer = track.buffer;
      src.loop = true;
      src.loopStart = track.start;
      src.loopEnd = track.end;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(1, t + FADE);
      src.connect(gain).connect(this.out);
      src.start(t, track.start);
      this.current = { src, gain };
    });
  }

  /** Fades the music out and releases the decoded track (music turned off or muted). */
  stop(): void {
    this.style = '';
    this.request++;
    this.decoded = null;
    this.fadeOut(this.ctx.currentTime);
  }

  private fadeOut(t: number): void {
    const old = this.current;
    if (!old) return;
    this.current = null;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), t);
    old.gain.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
    old.src.stop(t + FADE + 0.05);
    old.src.onended = () => old.gain.disconnect();
  }
}
