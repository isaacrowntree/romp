/**
 * The realtime clock: drives a `seek(t)` from requestAnimationFrame for a live
 * viewer. When sound is playing the picture follows the AUDIO clock
 * (AudioContext.currentTime), so picture and sound can't drift; otherwise it
 * follows performance.now(). Play, pause, seek, loop.
 *
 * Offline rendering doesn't need this: call your seek(t) per frame (or read
 * poses by frame) and render the soundtrack with `renderOffline`.
 */
export interface ClockOptions {
  /** called every animation frame with the film time (seconds) */
  seek: (t: number) => void;
  duration: number;
  loop?: boolean;
  /** an AudioContext to follow while playing (picture follows sound) */
  audio?: AudioContext | null;
  /** called on play from time t (start your live sound here: playLive({ from: t })) */
  onPlay?: (t: number) => void | Promise<void>;
  /** called on pause / seek-while-playing (stop your live sound here) */
  onStop?: () => void;
  /** injectable for tests */
  now?: () => number;
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
}

export class Clock {
  t = 0;
  playing = false;
  private origin = 0; // wall/audio time at film t = 0
  private handle: number | null = null;
  constructor(private o: ClockOptions) {}

  private wall(): number {
    if (this.o.audio && this.o.audio.state === "running") return this.o.audio.currentTime;
    return (this.o.now ?? (() => performance.now() / 1000))();
  }

  async play(from = this.t) {
    if (this.playing) this.stopLoop();
    this.t = Math.max(0, Math.min(this.o.duration, from >= this.o.duration ? 0 : from));
    if (this.o.audio && this.o.audio.state !== "running") await this.o.audio.resume?.();
    await this.o.onPlay?.(this.t);
    this.origin = this.wall() - this.t;
    this.playing = true;
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    this.t = this.current();
    this.stopLoop();
    this.o.onStop?.();
  }

  /** Jump to t; keeps playing (restarting the sound there) if it was. */
  async seek(t: number) {
    const was = this.playing;
    if (was) {
      this.stopLoop();
      this.o.onStop?.();
    }
    this.t = Math.max(0, Math.min(this.o.duration, t));
    this.o.seek(this.t);
    if (was) await this.play(this.t);
  }

  /** film time now */
  current(): number {
    return this.playing ? this.wall() - this.origin : this.t;
  }

  private tick = () => {
    if (!this.playing) return;
    let t = this.current();
    if (t >= this.o.duration) {
      if (this.o.loop) {
        this.o.onStop?.();
        this.playing = false;
        void this.play(0);
        return;
      }
      t = this.o.duration;
      this.t = t;
      this.o.seek(t);
      this.stopLoop();
      this.o.onStop?.();
      return;
    }
    this.t = t;
    this.o.seek(t);
    this.handle = (this.o.raf ?? requestAnimationFrame)(this.tick);
  };

  private stopLoop() {
    this.playing = false;
    if (this.handle != null) (this.o.cancelRaf ?? cancelAnimationFrame)(this.handle);
    this.handle = null;
  }
}
