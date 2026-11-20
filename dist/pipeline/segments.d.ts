/**
 * Cut a film into render segments at scene boundaries, so a fix to one scene
 * re-renders only the segments that show it.
 *
 * Boundaries go at every scene's start and end, and at the start and end of
 * every declared transition, never strictly inside a transition: a transition
 * stays whole inside one segment. Where scenes overlap (a transition drawn
 * from both), that stretch becomes its own segment. Each segment lists every
 * scene it shows, so its cache key changes when any of them does.
 */
export interface SegmentScene {
    name: string;
    /** first frame */
    from: number;
    /** length in frames (with the transitions it shares with its neighbours) */
    frames: number;
}
export interface Segment {
    /** the scene's name, or "a→b" for a stretch shared by two (a transition) */
    name: string;
    /** first and last frame, inclusive */
    from: number;
    to: number;
    /** every scene drawn in it */
    scenes: string[];
}
export declare function planSegments(scenes: SegmentScene[], o?: {
    transitions?: [number, number][];
    total?: number;
}): Segment[];
