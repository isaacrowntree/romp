/**
 * The motion check: given every frame's tracked objects (on-screen centre,
 * area, opacity), flags what reads as jank at speed:
 *
 *   pop       appears or vanishes inside the frame already big (≥ 30% of its
 *             largest on-screen area) and opaque: not grown, faded or flown in
 *   strobe    moves more than ~100 px (at 886 px wide) in one frame: reads as a
 *             jump, not motion, at 30 fps. Slow it, or blur it
 *   teleport  visible on both frames and jumped more than ~300 px
 *   spike     acceleration jumps far above its neighbours': a kink in the curve
 *             (a missing ease, two moves handed off at different speeds)
 *
 * Exempt: frames inside `whips` (deliberate fast moves) skip speed checks;
 * frames inside `covered` (something fills the frame, or a transition hides the
 * scene) skip everything; impacts (a real landing) aren't spikes; entrances
 * and exits that fade, grow or shrink aren't spikes; `seamless` objects (a
 * swap for an identical twin) aren't pops.
 *
 * It only reads positions, so it works for anything you can seek: a realtime
 * page's seek(t), a frame renderer, three.js or the DOM (see collectDom and
 * romp/three).
 */
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
}
export interface FrameRow {
    f: number;
    row: Record<string, Sample>;
}
export interface Issue {
    frame: number;
    name: string;
    kind: "pop" | "strobe" | "teleport" | "spike";
    detail: string;
}
export interface AnalyzeOptions {
    fps?: number;
    /** frame width in px: thresholds scale from 886 px unless given */
    width?: number;
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
}
export interface Report {
    tracked: string[];
    frames: number;
    issues: Issue[];
}
export declare function analyze(frames: FrameRow[], o?: AnalyzeOptions): Report;
/** Format a report for a terminal. */
export declare function formatReport(r: Report, fps?: number): string;
