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
export declare class Clock {
    private o;
    t: number;
    playing: boolean;
    private origin;
    private handle;
    constructor(o: ClockOptions);
    private wall;
    play(from?: number): Promise<void>;
    pause(): void;
    /** Jump to t; keeps playing (restarting the sound there) if it was. */
    seek(t: number): Promise<void>;
    /** film time now */
    current(): number;
    private tick;
    private stopLoop;
}
