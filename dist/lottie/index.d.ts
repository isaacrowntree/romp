/**
 * The motion check for Lottie (After Effects exports played by lottie-web):
 * step the animation with `goToAndStop(frame, true)`, read every layer's
 * transform, opacity and in/out points as lottie-web computed them, and run
 * romp's checks. A layer that cuts in at full size is a pop; one that jumps
 * is a strobe or teleport; one parked half off the comp is cropped.
 *
 *   const anim = lottie.loadAnimation({ container, renderer: "svg", autoplay: false, animationData });
 *   const report = lottieReport(anim);          // every layer, every frame
 *   console.log(formatReport(report, anim.frameRate));
 *
 * Or from a terminal: `romp check --lottie anim.json`.
 *
 * Nothing here imports lottie-web: it reads the animation you loaded, so it
 * runs with any renderer (svg, canvas, html), in a browser or under a DOM shim.
 * Layers are named by their After Effects name; layers inside a precomp are
 * "Precomp/Layer". Null and matte layers aren't tracked.
 */
import { type AnalyzeOptions, type FrameRow, type Report, type Sample } from "../check/analyze.js";
export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";
/** The parts of a lottie-web `AnimationItem` romp reads. */
export interface LottieLike {
    goToAndStop(value: number, isFrame?: boolean): void;
    totalFrames: number;
    frameRate?: number;
    animationData?: {
        w: number;
        h: number;
        fr: number;
    };
    renderer: any;
}
export interface LottieCollectOptions {
    /** only these layers (names, or "Precomp/Layer" paths). Default: every layer with content. */
    layers?: readonly string[];
    /** the comp's size, px (default: the animation's w × h) */
    width?: number;
    height?: number;
}
/** One frame's row: every tracked layer's sample (call after goToAndStop). */
export declare function collectLottie(anim: LottieLike, o?: LottieCollectOptions): Record<string, Sample>;
export interface LottieReportOptions extends AnalyzeOptions, LottieCollectOptions {
    /** frames (lottie's own, from 0); default the whole animation */
    from?: number;
    to?: number;
}
/** Step every frame (goToAndStop(f, true)) and collect the rows. */
export declare function lottieFrames(anim: LottieLike, o?: LottieReportOptions): FrameRow[];
/** The motion check over a Lottie animation: fps, width and height come from the animation. */
export declare function lottieReport(anim: LottieLike, o?: LottieReportOptions): Report;
