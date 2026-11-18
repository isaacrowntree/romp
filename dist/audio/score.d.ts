import { type Schedule } from "./mix.js";
/** One sound the schedule played. */
export interface ScoreEvent {
    /** film seconds it starts (as scheduled: transients lead the picture by a frame) */
    t: number;
    /** film seconds it has died away (or a bed stops) */
    end: number;
    /** the voice: "kick", "marimba", "boing", "babble", … */
    voice: string;
    /** "music", "drums", "sfx", "voice", or "other" */
    bus: string;
    /** its level (the voice's `vel`, or its default) */
    vel: number;
    /** the note, for tonal voices (marimba, bell, pluck, rhodes, piano, upright, tock) */
    midi?: number;
    /** "hit": attacks then decays; "swell": rises to a peak and falls (whoosh, riser); "bed": steady from t to end (crackle, surf) */
    shape: "hit" | "swell" | "bed";
    /** for a swell, where its peak is, 0…1 of its length */
    peakAt?: number;
}
/** Which events to read: by bus, by voice, or both (a list matches any). */
export interface ScoreFilter {
    bus?: string | readonly string[];
    voice?: string | readonly string[];
}
export interface ListenOptions {
    /** add voices to the synth before scheduling (e.g. `cartoon`) */
    extend?: (s: any) => void;
}
/**
 * Run a schedule silently and record every voice it plays. Pure: the same
 * schedule always gives the same score. The schedule must be synchronous
 * (most are); `at(t)` is the identity, as when rendering offline.
 */
export declare function listen(schedule: Schedule, opts?: ListenOptions): Score;
/** What a schedule plays, as pure functions of film time. */
export declare class Score {
    /** every event, sorted by time */
    readonly events: readonly ScoreEvent[];
    constructor(events: ScoreEvent[]);
    /** The events a filter selects. */
    select(f?: ScoreFilter): ScoreEvent[];
    /** Events that start in [t0, t1). */
    onsetsBetween(t0: number, t1: number, f?: ScoreFilter): ScoreEvent[];
    /**
     * How loud the selected sounds are at t: the sum of each event's level
     * through its shape (a hit attacks in 5 ms and decays over its ring; a
     * swell rises to its peak and falls; a bed holds). `decay` (s) overrides
     * every hit's ring: short for a snappy pulse.
     */
    envelopeAt(t: number, f?: ScoreFilter & {
        decay?: number;
    }): number;
    /**
     * Where t sits in the beat: the selected onsets (the drums bus by default)
     * are the grid. `index` counts beats from 0 (−1 before the first), `phase`
     * goes 0 → 1 from one onset to the next, `since` is seconds since the last.
     * Onsets closer than 30 ms count as one.
     */
    beatAt(t: number, f?: ScoreFilter): {
        index: number;
        phase: number;
        since: number;
        t0: number;
        t1: number;
    };
}
