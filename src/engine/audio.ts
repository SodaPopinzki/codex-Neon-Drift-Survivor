export type AudioCue = 'shoot' | 'hit' | 'levelUp' | 'dash';

export class AudioManager {
  private context: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private volume = 0.5;

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.gainNode) this.gainNode.gain.value = this.volume;
  }

  play(cue: AudioCue): void {
    const context = this.ensureContext();
    const gainNode = this.gainNode;
    if (!context || !gainNode || context.state !== 'running' || this.volume <= 0.001) return;

    const t0 = context.currentTime;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = cue === 'hit' ? 'triangle' : 'square';

    const spec =
      cue === 'shoot'
        ? { freq: 540, decay: 0.06, peak: 0.08, glide: -40 }
        : cue === 'hit'
          ? { freq: 220, decay: 0.08, peak: 0.12, glide: -70 }
          : cue === 'dash'
            ? { freq: 330, decay: 0.11, peak: 0.1, glide: 120 }
            : { freq: 760, decay: 0.22, peak: 0.16, glide: 180 };

    osc.frequency.setValueAtTime(spec.freq, t0);
    osc.frequency.linearRampToValueAtTime(spec.freq + spec.glide, t0 + spec.decay);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(spec.peak, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.decay);

    osc.connect(env);
    env.connect(gainNode);
    osc.start(t0);
    osc.stop(t0 + spec.decay + 0.02);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.context) {
      const Ctx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.context = new Ctx();
      this.gainNode = this.context.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.context.destination);
      window.addEventListener('pointerdown', this.unlock, { passive: true });
      window.addEventListener('keydown', this.unlock, { passive: true });
    }
    return this.context;
  }

  private unlock = (): void => {
    if (!this.context || this.context.state === 'running') return;
    void this.context.resume();
  };
}
