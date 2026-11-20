/**
 * Rules for screens and anchored words:
 *
 *   legibility  a `screen` (a screenshot or screen recording of an app or a web
 *               page, tracked with its `native` width) is drawn so small that
 *               its body text (`minTextPx`, 16 native px) comes out under
 *               `legiblePx` (20 px at a 1080 px short side, in proportion to
 *               the frame's short side) for more than `legibleSeconds` (0.5 s).
 *               A phone mock a third of a portrait frame wide, a whole desktop
 *               page in a browser frame. Zooming in or out (its size only rises,
 *               or only falls) is fine; so is a screen zoomed or cropped to the
 *               part that matters
 *   anchor      a text with an `anchor` (the tracked object it belongs to: a
 *               speech bubble's speaker) is more than `anchorPx` (10% of the
 *               short side) from that object's box for more than
 *               `anchorSeconds` (0.1 s); or a text with a `ground` (a y in frame
 *               px) shows any of its box more than `groundPx` (2 px) below that
 *               line, for even a frame: a bubble that enters under the ground
 *               and jumps up, or slides under it to leave
 */
import type { FrameRow, Issue, Sample, TextKind } from "./analyze.js";
export interface ScreenOptions {
    /** legibility: the smallest text size on the output, px (default 20 at a 1080 px short side) */
    legiblePx?: number;
    /** legibility: a screen's body text in native px when the sample doesn't say (default 16) */
    minTextPx?: number;
    /** legibility: how long a screen may stay too small (default 0.5 s) */
    legibleSeconds?: number;
    /** anchor: how far a text may sit from its anchor's box, px (default 10% of the short side) */
    anchorPx?: number;
    /** anchor: how long it may (default 0.1 s) */
    anchorSeconds?: number;
    /** anchor: how far a text may dip below its ground line, px (default 2) */
    groundPx?: number;
    allow?: Partial<Record<TextKind, string[]>>;
}
type Box = NonNullable<Sample["box"]>;
/** The gap between two boxes, px (0 when they touch or overlap). */
export declare function boxGap(a: Box, b: Box): number;
export declare function screenIssues(frames: FrameRow[], names: string[], o: ScreenOptions & {
    width?: number;
    height?: number;
}, fps: number, hidden: (f: number) => boolean): Issue[];
export {};
