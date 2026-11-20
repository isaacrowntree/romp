/**
 * Plan lint: check a film's layout from its plan, before anything renders. A
 * plan is data: per scene (and per beat inside a scene), the boxes on screen
 * (devices and the screens in them with their native size, texts with their
 * font size, focus rings, props) and the camera that frames them. No browser:
 * it runs in milliseconds.
 *
 * It runs the frame check's own layout rules on the plan, with the same names
 * and thresholds (`analyze(…, { layoutOnly: true })`): offsafe, covers,
 * overlap, legibility (after the camera's zoom), cropped, clipped, anchor and,
 * when asked, occupancy. And four rules only a plan can answer:
 *
 *   fill    a screen doesn't fill its device's screen area (letterboxed, or
 *           cropped inside it), more than `fillFraction` (1%) off on any side
 *   focus   a beat marked `focus: true` (the voice-over points at something)
 *           has no focus box
 *   banned  a text uses a banned word or pattern (`banned`, case-insensitive,
 *           whole words for strings)
 *   band    with a reserved heading band (`band: { top, bottom }`, frame px):
 *           a heading outside it, or anything else inside it
 *
 * Boxes are in the composition's px before the camera; the camera maps them to
 * the frame: out = in × scale + (x, y). Items with `fixed: true` (a caption
 * overlay) ignore the camera.
 */
import { type AnalyzeOptions, type Role, type TextKind } from "../check/analyze.js";
export interface PlanRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type PlanRole = Role | "device";
export interface PlanItem {
    name: string;
    role: PlanRole;
    box: PlanRect;
    /** text: its words */
    text?: string;
    /** text: font size in composition px (scaled by the camera) */
    fontPx?: number;
    heading?: boolean;
    /** text: on a solid panel of its own */
    opaque?: boolean;
    /** screen: its content's native width (390 for a phone) */
    native?: {
        width: number;
    };
    minTextPx?: number;
    /** screen: the device it sits in (an item with `screenRect`) */
    device?: string;
    /** device: where its screen is, composition px */
    screenRect?: PlanRect;
    /** paint order (default: list order) */
    z?: number;
    /** not moved by the camera (an overlay) */
    fixed?: boolean;
    /** rules it may break on purpose */
    allow?: string[];
    anchor?: string;
    ground?: number;
}
export interface PlanCamera {
    scale?: number;
    x?: number;
    y?: number;
}
export interface PlanBeat {
    name?: string;
    camera?: PlanCamera;
    /** added to (or, by name, replacing) the scene's items */
    items?: PlanItem[];
    /** the voice-over points at something here: there must be a focus box */
    focus?: boolean;
}
export interface PlanScene {
    name: string;
    camera?: PlanCamera;
    items?: PlanItem[];
    focus?: boolean;
    beats?: PlanBeat[];
}
export interface Plan {
    width: number;
    height: number;
    scenes: PlanScene[];
    /** the safe area (as the frame check's `safe`) */
    safe?: AnalyzeOptions["safe"];
    /** a reserved heading band, frame px */
    band?: {
        top: number;
        bottom: number;
    };
    /** words or patterns no text may use */
    banned?: (string | RegExp)[];
    /** the occupancy rule (opt-in, as the frame check's) */
    occupancy?: AnalyzeOptions["occupancy"];
    /** fill: how far a screen may be off its device's screen area, as a share of its size (default 0.01) */
    fillFraction?: number;
    /** any other frame-check option (thresholds, allow-lists) */
    options?: AnalyzeOptions;
}
export type LintKind = TextKind | "cropped" | "fill" | "focus" | "banned" | "band";
export interface LintIssue {
    scene: string;
    beat?: string;
    name: string;
    kind: LintKind;
    detail: string;
}
export declare function lintPlan(plan: Plan): {
    issues: LintIssue[];
    scenes: number;
    beats: number;
};
/** Format a lint report for a terminal. */
export declare function formatLint(r: {
    issues: LintIssue[];
    scenes: number;
    beats: number;
}): string;
