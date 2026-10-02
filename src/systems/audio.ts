// Tiny WebAudio synth for cozy procedural SFX. No audio files needed.
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch { /* audio unavailable */ }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 1, when = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  click()  { this.ensure(); this.tone(660, 0.07, 'triangle', 0.6); }
  pop()    { this.ensure(); this.tone(420, 0.09, 'sine', 0.8, 0, 880); }       // order bubble
  pickup() { this.ensure(); this.tone(520, 0.08, 'triangle', 0.7, 0, 760); }
  serve()  { this.ensure(); this.tone(523, 0.1, 'triangle', 0.7); this.tone(784, 0.14, 'triangle', 0.7, 0.09); }
  coin()   { this.ensure(); this.tone(988, 0.08, 'square', 0.35); this.tone(1319, 0.16, 'square', 0.3, 0.07); }
  happy()  { this.ensure(); this.tone(523, 0.1, 'sine', 0.7); this.tone(659, 0.1, 'sine', 0.7, 0.1); this.tone(784, 0.18, 'sine', 0.7, 0.2); }
  angry()  { this.ensure(); this.tone(220, 0.22, 'sawtooth', 0.4, 0, 140); }
  sizzle() { this.ensure(); this.tone(180, 0.35, 'sawtooth', 0.25, 0, 320); this.tone(240, 0.3, 'triangle', 0.3, 0.05, 420); }
  perfect(){ this.ensure(); [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.7, i * 0.08)); }
  dayEnd() { this.ensure(); [392, 440, 523, 587].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.6, i * 0.13)); }
  buy()    { this.ensure(); this.tone(700, 0.08, 'triangle', 0.6, 0, 1050); this.tone(1050, 0.12, 'triangle', 0.5, 0.08); }
}

export const sfx = new Sfx();
