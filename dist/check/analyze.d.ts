/**
 * The motion check: given every frame's tracked objects (on-screen centre,
 * area, opacity), flags what reads as jank at speed:
 *
 *   pop       appears or vanishes inside the frame already big (≥ 30% of its
 *             largest on-screen area) and opaque: not grown, faded or flown in
 *   strobe    moves more than ~100 px (at 886 px wide) in one frame: reads as a
 *             jump, not motion, at 30 fps. Slow it, or blur it
 *   teleport  visible on both frames and jumped more than ~300 px
 *   jump      moved more than ~40 px in one frame while it sat still (or wasn't
 *             there) for two frames either side: a snap, not a move (a bubble
 *             appearing below its line and jumping up to it). Not at a cut
 *   spike     acceleration jumps far above its neighbours': a kink in the curve
 *             (a missing ease, two moves handed off at different speeds)
 *   lost      has been in frame, then leaves it entirely (still shown) and
 *             stays out for more than `lostSeconds` (1 s): bounced off the
 *             stage or fell out of the picture. `allowExit` marks a real exit.
 *   cropped   shown and on screen, but more than `croppedFraction` (25%) of its
 *             own box is outside the frame for more than `croppedSeconds`
 *             (0.5 s) in a row: a character's head cut off by the edge. Runs
 *             where it's entering or leaving (its on-frame share only rises or
 *             only falls) are fine; needs the collector's `box` and the
 *             frame's `width` and `height`. A `screen` or `focus` that would
 *             fit in the frame must be wholly in it (`screenCroppedFraction`,
 *             1%); one bigger than the frame is a zoom and passes. A sample's
 *             numeric `allowCrop` is its own share
 *   anchor    a text with an `anchor` (another tracked object, its speaker) is
 *             more than `anchorPx` from it, or one with a `ground` (a y in frame
 *             px) shows any of its box below that line
 *   legibility a `screen` (a screenshot or recording of an app or page, with its
 *             `native` width) is drawn so small its body text (`minTextPx`, 16
 *             native px) renders under `legiblePx` (20 px on a 1080 short side)
 *             for more than `legibleSeconds` (0.5 s). Zooming in is fine
 *
 * Exempt: frames inside `whips` (deliberate fast moves) skip speed checks;
 * frames inside `covered` (something fills the frame, or a transition hides the
 * scene) skip everything; impacts (a real landing) aren't spikes; entrances
 * and exits that fade, grow or shrink aren't spikes; `seamless` objects (a
 * swap for an identical twin) aren't pops; `allowCrop` objects (a deliberate
 * close-up, a background running off the edge) aren't cropped.
 *
 * Text rules (text.ts) run over samples that carry a `role`: words a viewer has
 * to read (`text`), the thing being talked about (`focus`) and everything else
 * that moves (`prop`): offsafe, covers, overlap, unfinished, unread, empty and
 * (opt-in) stale. Screens, text size and anchors are in screen.ts; blank,
 * clipped and occupancy in layout.ts.
 *
 * `layoutOnly` (sampled frames, `romp check --every N`): only the rules that
 * read one frame's layout run (cropped, offsafe, covers, overlap, legibility,
 * anchor, clipped, blank, occupancy); the motion rules and the timing text rules
 * (pop, strobe, teleport, jump, spike, lost, unfinished, unread, empty, stale)
 * need every frame and are skipped.
 *
 * It only reads positions, so it works for anything you can seek: a realtime
 * page's seek(t), a frame renderer, three.js or the DOM (see collectDom and
 * romp/three).
 */
import { type TextOptions } from "./text.js";
import { type ScreenOptions } from "./screen.js";
import { type LayoutOptions } from "./layout.js";
/** What a tracked object is, for the text rules. */
export type Role = "text" | "focus" | "prop" | "screen" | "background";
export interface Sample {
    /** on-screen centre, px */
    x: number;
    y: number;
    shown: boolean;
    onScreen: boolean;
    /** on-screen area, px² */
    area: number;
    /** effective opacity 0..1 */
    opacity: number;
    /** a real impact on (or within 2 frames of) this frame */
    impact?: boolean;
    /** never flag as a pop */
    seamless?: boolean;
    /** its own on-screen box in frame px (may extend past the frame), for the cropped check */
    box?: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
    /** never flag as cropped (true), or the share of its box allowed outside the frame */
    allowCrop?: boolean | number;
    /** may leave the frame for good (never flag as lost) */
    allowExit?: boolean;
    /** with a camera (three.js): its latest on-screen move was mostly the camera's,
     * not its own: as it leaves the frame, the camera moved on and left it behind,
     * so it isn't lost */
    cameraLeft?: boolean;
    /** what it is, for the text rules: words to read, the thing being talked about, or anything else */
    role?: Role;
    /** text: characters revealed so far, of all of them (typed or word-by-word reveals). Absent: all shown */
    chars?: {
        shown: number;
        total: number;
    };
    /** text: the words, for its reading time */
    text?: string;
    /** text: its word count, when `text` isn't given */
    words?: number;
    /** text: a scene's heading (a title with an underline or frame): it should be whole as the scene starts */
    heading?: boolean;
    /** paint order (higher draws on top): a prop drawn under a text doesn't overlap it */
    z?: number;
    /** text rules this object may break on purpose */
    allow?: TextKind[];
    /** screen: the content's own size (CSS px of the phone or page it shows: 390 for a phone, 1440 for a desktop page) */
    native?: {
        width: number;
        height?: number;
    };
    /** screen: its body text in native px (default 16) */
    minTextPx?: number;
    /** text: the tracked object it belongs to (a speaker); it must stay within `anchorPx` of it */
    anchor?: string;
    /** text: a ground line, y in frame px; no part of it may show below */
    ground?: number;
    /** text: its smallest text as rendered, px (font-size × on-screen scale) */
    fontPx?: number;
    /** what's left of its box after clipping ancestors (overflow: hidden), frame px; absent: not clipped */
    clip?: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
    /** text: it sits on a solid panel of its own (an opaque background) */
    opaque?: boolean;
}
/** The text rules. */
export type TextKind = "offsafe" | "covers" | "overlap" | "unfinished" | "unread" | "empty" | "stale" | "legibility" | "anchor" | "clipped" | "blank" | "occupancy";
export type IssueKind = "pop" | "strobe" | "teleport" | "jump" | "spike" | "cropped" | "lost" | "untracked" | TextKind;
export interface FrameRow {
    f: number;
    row: Record<string, Sample>;
}
export interface Issue {
    frame: number;
    name: string;
    kind: IssueKind;
    detail: string;
}
export interface AnalyzeOptions extends TextOptions, ScreenOptions, LayoutOptions {
    /** sampled frames: run only the rules that read one frame's layout */
    layoutOnly?: boolean;
    fps?: number;
    /** frame width in px: thresholds scale from 886 px unless given */
    width?: number;
    /** frame height in px (with width, enables the cropped check) */
    height?: number;
    /** cropped: the share of an object's box allowed outside the frame (default 0.25) */
    croppedFraction?: number;
    /** cropped: the share a `screen` or `focus` that fits in the frame may have outside it (default 0.01) */
    screenCroppedFraction?: number;
    /** cropped: how long it may stay over that before it's flagged (default 0.5 s) */
    croppedSeconds?: number;
    /** names never checked for cropping */
    allowCrop?: string[];
    /** lost: how long a character may stay right out of frame before it's flagged (default 1 s) */
    lostSeconds?: number;
    /** names allowed to leave the frame for good (an exit on purpose) */
    allowExit?: string[];
    /** [from, to] seconds of deliberate fast moves */
    whips?: [number, number][];
    /** [from, to] seconds where the scene is hidden */
    covered?: [number, number][];
    /** per-object impact frames (in addition to Sample.impact) */
    impacts?: Record<string, number[]>;
    /** names never checked for pops */
    seamless?: string[];
    strobePx?: number;
    teleportPx?: number;
    /** jump: a one-frame move between still frames bigger than this (default ~40 px at 886 wide) */
    jumpPx?: number;
}
export interface Report {
    tracked: string[];
    frames: number;
    issues: Issue[];
    /** things the check can't see (untracked drawing surfaces over a text, under --strict) */
    warnings?: string[];
}
export declare function analyze(frames: FrameRow[], o?: AnalyzeOptions): Report;
/** The share of a box inside a W×H frame (0..1). */
export declare function inFrameShare(b: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}, W: number, H: number): number;
/** Format a report for a terminal. */
export declare function formatReport(r: Report, fps?: number): string;
