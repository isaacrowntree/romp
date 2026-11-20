/**
 * The text rules: what goes wrong with words on screen in a video made in code.
 * They run over samples that carry a `role` (`track(name, { role: "text" })`,
 * `data-romp-role`), so a film that tags nothing gets nothing new.
 *
 *   offsafe     a text (a caption, a speech bubble, a heading) is legible but its
 *               box isn't inside the safe area for more than `offsafeSeconds`
 *               (0.1 s): words must never touch the edge. Sliding in or out (its
 *               overhang only shrinks, or only grows) is fine
 *   covers      a text sits over the `focus` (the highlighted thing being talked
 *               about) for more than `coversSeconds` (0.1 s)
 *   overlap     two texts overlap for more than `overlapSeconds` (0.2 s), or a
 *               prop is drawn over a text (papers, a vehicle, confetti crossing a
 *               title) for more than `propOverlapSeconds` (two frames): a fast
 *               prop over words is exactly what reads as a glitch
 *   unfinished  a text disappears, or its scene cuts, before every character is
 *               shown: a caption cut off mid-word
 *   unread      a text is whole for less than its reading time (`readingTime()`)
 *               before it goes or its scene cuts
 *   empty       a text's box (a bubble, a heading's underline) is visible with no
 *               words for more than `emptySeconds` (0.2 s); or a heading is still
 *               typing `headingSeconds` (0.5 s) after it appears: a blank title
 *               between scenes. A heading should arrive whole with its scene
 *   stale       (strict, or `stale: true`) nothing tracked changes at all for
 *               more than `staleSeconds` (3 s) after every text on screen was read
 *
 * Scene cuts (`scenes`, seconds) and the start of every `covered` span end a
 * text's time on screen, whether or not its element stays mounted.
 */
import type { FrameRow, Issue, Sample, TextKind } from "./analyze.js";
import { type ReadingOptions } from "../timing/index.js";
export interface Margins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface TextOptions {
    /** scene starts (cuts), seconds: a text's time on screen ends at a cut */
    scenes?: number[];
    /** untagged objects count as props for the overlap rule, and the stale rule runs */
    strict?: boolean;
    /** the safe area: a share of each side (0.05), or margins in px. Default: `safeArea()` */
    safe?: number | Partial<Margins>;
    /** offsafe: how long a text may stay outside the safe area (default 0.1 s) */
    offsafeSeconds?: number;
    /** covers: the share of the focus box a text may cover (default 0.05) */
    coversFraction?: number;
    /** covers: how long (default 0.1 s) */
    coversSeconds?: number;
    /** overlap: the share of the smaller box two objects may share (default 0.02) */
    overlapFraction?: number;
    /** overlap: how long two texts may (default 0.2 s) */
    overlapSeconds?: number;
    /** overlap: how long a prop may be drawn over a text (default 0.04 s: two frames in a row at 30 fps) */
    propOverlapSeconds?: number;
    /** empty: how long a text's box may show no words (default 0.2 s) */
    emptySeconds?: number;
    /** empty: how long a heading may still be typing after it appears (default 0.5 s) */
    headingSeconds?: number;
    /** unread: the reading speed (`readingTime` options) */
    reading?: ReadingOptions;
    /** stale: on (or on, with its length in seconds; default 3 s). On under `strict` */
    stale?: boolean | number;
    /** text rules to skip, by object name (a trailing `*` matches a prefix: `"caption:*"`) */
    allow?: Partial<Record<TextKind, string[]>>;
}
/**
 * The safe area's margins for a W×H frame, in px: 5% of the long side at each of
 * its ends (a phone's notch, rounded corners, status bar and home indicator sit
 * there), 3.5% of the short side at each of its edges. 1080×1920: 38 px left and
 * right, 96 px top and bottom; 1920×1080: 96 px left and right, 38 px top and
 * bottom. `safe` overrides: a share of each dimension, or margins in px.
 */
export declare function safeArea(W: number, H: number, safe?: number | Partial<Margins>): Margins;
type Box = NonNullable<Sample["box"]>;
/** The area two boxes share, px². */
export declare function boxOverlap(a: Box, b: Box): number;
export declare function textIssues(frames: FrameRow[], names: string[], o: TextOptions & {
    width?: number;
    height?: number;
}, fps: number, hidden: (f: number) => boolean): Issue[];
export {};
