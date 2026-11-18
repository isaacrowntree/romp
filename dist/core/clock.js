export class Clock {
    o;
    t = 0;
    playing = false;
    origin = 0; // wall/audio time at film t = 0
    handle = null;
    constructor(o) {
        this.o = o;
    }
    wall() {
        if (this.o.audio && this.o.audio.state === "running")
            return this.o.audio.currentTime;
        return (this.o.now ?? (() => performance.now() / 1000))();
    }
    async play(from = this.t) {
        if (this.playing)
            this.stopLoop();
        this.t = Math.max(0, Math.min(this.o.duration, from >= this.o.duration ? 0 : from));
        if (this.o.audio && this.o.audio.state !== "running")
            await this.o.audio.resume?.();
        await this.o.onPlay?.(this.t);
        this.origin = this.wall() - this.t;
        this.playing = true;
        this.tick();
    }
    pause() {
        if (!this.playing)
            return;
        this.t = this.current();
        this.stopLoop();
        this.o.onStop?.();
    }
    /** Jump to t; keeps playing (restarting the sound there) if it was. */
    async seek(t) {
        const was = this.playing;
        if (was) {
            this.stopLoop();
            this.o.onStop?.();
        }
        this.t = Math.max(0, Math.min(this.o.duration, t));
        this.o.seek(this.t);
        if (was)
            await this.play(this.t);
    }
    /** film time now */
    current() {
        return this.playing ? this.wall() - this.origin : this.t;
    }
    tick = () => {
        if (!this.playing)
            return;
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
    stopLoop() {
        this.playing = false;
        if (this.handle != null)
            (this.o.cancelRaf ?? cancelAnimationFrame)(this.handle);
        this.handle = null;
    }
}
//# sourceMappingURL=clock.js.map