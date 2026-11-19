/**
 * One continuous bed under a whole cut. Scenes that each write their own music
 * leave holes where they join (a section stops on its last bar, the next one
 * starts on its first); `crossfadeBed()` gives each section its own gain, runs each one
 * `fade` seconds past its joins, and crossfades them, so the music never drops
 * out between scenes.
 *
 *   crossfadeBed(s, bus.music, [
 *     { from: 0, to: 12.4, write: (out, t0, t1) => groove(s, out, t0, t1) },
 *     { from: 12.4, to: 40, write: (out, t0, t1) => pads(s, out, t0, t1) },
 *   ], { fade: 0.6 });
 */
export interface BedSection {
    /** film seconds the section owns */
    from: number;
    to: number;
    /** write the section's music into `out` between t0 and t1 (its span, plus the crossfades) */
    write: (out: GainNode, t0: number, t1: number) => void;
    /** level (default 1) */
    level?: number;
}
export interface BedOptions {
    /** crossfade length at every join, seconds (default 0.5) */
    fade?: number;
}
/**
 * Lay sections end to end as one bed: each section's `to` is stretched to the
 * next one's `from` (no gaps, ever), each is written `fade / 2` past both ends,
 * and an equal-power crossfade joins them. Returns the joins (seconds).
 */
export declare function crossfadeBed(s: {
    gain(v?: number): GainNode;
}, out: AudioNode, sections: BedSection[], o?: BedOptions): number[];
