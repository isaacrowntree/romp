/**
 * The audio check: dropouts in a soundtrack. A music bed that cuts to near
 * silence for a moment (0.1–1 s) and comes back reads as a glitch, usually
 * where separately rendered pieces were joined with a gap. Runs on raw samples,
 * so it works on any WAV (`romp check --audio file.wav`) or AudioBuffer.
 */
export interface PcmAudio {
    sampleRate: number;
    /** one Float32Array per channel, -1..1 */
    channels: Float32Array[];
}
/** Read a WAV file (PCM 8/16/24/32-bit or 32/64-bit float, any channel count). */
export declare function readWav(bytes: Uint8Array): PcmAudio;
export interface DropoutOptions {
    /** analysis window, seconds (default 0.02) */
    window?: number;
    /** a gap is quieter than the bed's typical level by this much, dB (default 30) */
    drop?: number;
    /** or below this absolute level, dBFS (overrides `drop`) */
    floor?: number;
    /** shortest gap flagged, seconds (default 0.1) */
    min?: number;
    /** longest gap flagged, seconds (default 1: longer is a rest, on purpose) */
    max?: number;
    /** sound needed on both sides of a gap, seconds (default 0.25) */
    around?: number;
}
export interface Dropout {
    /** seconds */
    t: number;
    duration: number;
    /** the gap's level (its loudest window), and the bed's typical level, dBFS (-120: silence) */
    level: number;
    bed: number;
}
/** RMS per window across all channels, dBFS. */
export declare function rmsWindows(a: PcmAudio | AudioBuffer, window?: number): number[];
/**
 * Dropouts: runs of near-silence between `min` and `max` seconds (0.1–1 s)
 * inside an otherwise continuous bed, with sound on both sides. The bed's level
 * is the median window of the sounding part; a gap is `drop` dB (30) under it.
 * Silence at the very start and end, and long rests, aren't dropouts.
 */
export declare function dropouts(a: PcmAudio | AudioBuffer, o?: DropoutOptions): Dropout[];
/** Format dropouts for a terminal. */
export declare function formatDropouts(ds: Dropout[], file?: string): string;
