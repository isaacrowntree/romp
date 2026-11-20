/**
 * romp/timing: how long words need on screen, as pure functions, so a film's
 * scene lengths come from its captions instead of being typed in by hand.
 *
 *   readingTime(text)          seconds a viewer needs to read it, once it's whole
 *   captionTiming(text)        typing, then holding it whole for its reading time
 *   timeline(scenes)           scene lengths from their captions, transitions that
 *                              never land on a caption's reading window, act cards
 *                              at a sane length; and the `covered` and `scenes`
 *                              options the check wants
 *
 * The defaults are the ones the text rules check against, so a film timed with
 * these passes `unfinished` and `unread` by construction.
 */
export interface ReadingOptions {
    /** words a minute (default 180: a comfortable pace for on-screen text) */
    wpm?: number;
    /** never less than this, seconds (default 1.5: even one word needs a beat) */
    min?: number;
}
/** Words in a text (anything between spaces; `*highlight*` markers don't count). */
export declare function wordCount(text: string): number;
/** Seconds a viewer needs to read a text (or a word count) once it's all on screen. */
export declare function readingTime(text: string | number, o?: ReadingOptions): number;
export interface CaptionTimingOptions extends ReadingOptions {
    /** characters typed a second (default 30; Infinity shows it whole at once) */
    cps?: number;
    /** seconds to hold it whole (default: its reading time) */
    hold?: number;
    /** seconds of entrance before typing starts (default 0: start typing as it appears) */
    enter?: number;
    /** seconds of exit after the hold (default 0) */
    exit?: number;
    fps?: number;
}
export interface CaptionTiming {
    /** characters in the text (highlight markers removed) */
    chars: number;
    words: number;
    enterFrames: number;
    typeFrames: number;
    holdFrames: number;
    exitFrames: number;
    /** enter + type + hold + exit */
    totalFrames: number;
    /** characters shown `frame` frames after the caption starts */
    typed(frame: number): number;
}
/** Typing, then holding it whole for its reading time. */
export declare function captionTiming(text: string, o?: CaptionTimingOptions): CaptionTiming;
export interface CaptionSpec extends CaptionTimingOptions {
    text: string;
    /** seconds of pause before it (default: the timeline's `gap`) */
    gap?: number;
}
export interface SceneSpec {
    name: string;
    /** captions, one after another; the scene lasts at least as long as they need */
    captions?: (string | CaptionSpec)[];
    /** at least this long, seconds (the footage, a physics beat) */
    seconds?: number;
    /** an act card: `actSeconds` long unless `seconds` says otherwise */
    act?: boolean;
    /** seconds of the transition into this scene (default: the timeline's `transition`; 0 or false for a cut) */
    transition?: number | false;
}
export interface TimelineOptions extends CaptionTimingOptions {
    fps?: number;
    /** default transition into each scene after the first, seconds (default 0.5) */
    transition?: number;
    /** act card length, seconds (default 1.2) */
    actSeconds?: number;
    /** pause before each caption after the first, seconds (default 0.15) */
    gap?: number;
    /** after the incoming transition, before the first caption, seconds (default 0.2) */
    lead?: number;
    /** after the last caption, before the outgoing transition, seconds (default 0.2) */
    tail?: number;
}
export interface PlacedCaption {
    text: string;
    /** frames from the scene's start */
    from: number;
    to: number;
    /** frames from the film's start */
    at: number;
    timing: CaptionTiming;
}
export interface Placement {
    index: number;
    /** first frame on the film's timeline (transitions overlap the scene before) */
    start: number;
    /** its length, including the transitions at both ends (Remotion's TransitionSeries counts it this way) */
    frames: number;
    /** frames of the transition into it, and out of it (into the next) */
    transitionIn: number;
    transitionOut: number;
    captions: PlacedCaption[];
}
export interface Timeline<S extends SceneSpec = SceneSpec> {
    fps: number;
    /** the film's length in frames */
    frames: number;
    scenes: (S & Placement)[];
    /** for the check: transitions as covered spans (seconds), every scene start as a cut, and each scene by name (`romp check --scene`) */
    check: {
        covered: [number, number][];
        scenes: number[];
        sections: {
            name: string;
            from: number;
            to: number;
        }[];
    };
}
/**
 * Lay out a film from its scenes. Each scene is at least as long as its
 * captions need (typing, then their reading time), plus the transitions at both
 * ends, so a transition never lands on a caption's reading window. Act cards
 * default to `actSeconds` (1.2 s). Extra length a scene asks for (`seconds`)
 * goes after its captions.
 */
export declare function timeline<S extends SceneSpec>(specs: S[], o?: TimelineOptions): Timeline<S>;
/** A caption at a frame of its scene: is it on, how many characters are typed, and the typed text. */
export declare function captionAt(c: PlacedCaption, frame: number): {
    on: boolean;
    typed: number;
    text: string;
};
