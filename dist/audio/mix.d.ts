/** Transients lead the picture by about a frame (30 fps). */
export declare const LEAD: number;
export interface Buses {
    music: GainNode;
    drums: GainNode;
    sfx: GainNode;
    voice: GainNode;
    master: GainNode;
}
export interface MixOptions {
    /** bus levels */
    levels?: Partial<Record<"music" | "drums" | "sfx" | "voice" | "master", number>>;
    /** reverb sends per bus */
    sends?: Partial<Record<"music" | "drums" | "sfx" | "voice", number>>;
    /** room length (s) */
    room?: number;
}
/**
 * Buses with a shared room: music, drums, sfx, voice → master → 70 Hz high-pass
 * → −5 dB low shelf at 160 Hz → glue compressor (−14 dB, 3:1) → destination.
 * Phone speakers: keep the energy in 200 Hz–6 kHz.
 */
export declare function createMix(s: any, opts?: MixOptions): Buses;
/**
 * Where film time goes on the context. `at(t)` returns the context time for
 * film time t, or null when t is before the start (already played).
 */
export type At = (t: number) => number | null;
/** What you write: schedule every note and cue in film seconds via `at`. */
export type Schedule = (s: any, buses: Buses, at: At) => void | Promise<void>;
export interface RenderOptions extends MixOptions {
    duration: number;
    sampleRate?: number;
    channels?: number;
    /** add voices to the synth before scheduling (e.g. `cartoon`) */
    extend?: (s: any) => void;
}
/** Render a schedule offline, deterministically: same schedule → same samples. */
export declare function renderOffline(schedule: Schedule, opts: RenderOptions): Promise<AudioBuffer>;
/** The same, as a base64 WAV (for a CLI or a page to save). */
export declare function renderWav(schedule: Schedule, opts: RenderOptions): Promise<string>;
export interface LiveOptions extends MixOptions {
    /** film time to start from (seconds) */
    from?: number;
    /** scheduling headroom (s) so the first notes aren't late */
    latency?: number;
    extend?: (s: any) => void;
}
/**
 * Play a schedule live on a realtime AudioContext from film time `from`.
 * Returns the context-time origin (film t = origin + t) and a stop().
 * Seek = stop() and play again from the new t. Everything before `from` is skipped.
 */
export declare function playLive(ctx: AudioContext, schedule: Schedule, opts?: LiveOptions): Promise<{
    origin: number;
    stop(): void;
}>;
