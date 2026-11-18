/**
 * romp for Motion Canvas: scenes are generators that advance one frame per
 * `yield`, and the view's origin is its centre. These helpers play baked romp
 * motion inside a scene by the scene's own time, and run the motion check
 * over a scene's nodes.
 *
 *   export default makeScene2D(function* (view) {
 *     const hero = <Circle size={120} fill="#4361EE" />;
 *     view.add(hero);
 *     yield* playBaked((t) => {
 *       const p = centred(poseAtTime(body, t), 1920, 1080);
 *       hero.position(p.position);
 *       hero.rotation(p.rotation);
 *     }, { duration: 6, time: useTime });
 *   });
 *
 * Thin by design: nothing here imports @motion-canvas/*. Nodes are read
 * through the few methods romp needs (`absolutePosition`, `absoluteOpacity`,
 * `cacheBBox`, `localToWorld`), so fakes work in tests.
 */
import { type AnalyzeOptions, type Report, type Sample } from "../check/analyze.js";
export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";
/**
 * Play baked motion inside a scene: calls apply(t) every frame for `duration`
 * seconds, t counted from when it starts. `time` is Motion Canvas's `useTime`
 * (exact under waitFor's sub-frame offsets); without it, frames are counted at `fps`.
 */
export declare function playBaked(apply: (t: number) => void, o: {
    duration: number;
    time?: () => number;
    fps?: number;
}): Generator<void, void, unknown>;
/** A screen-space pose (px from the top left, radians) placed in a Motion Canvas view (px from the centre, degrees). */
export declare function centred(pose: {
    x: number;
    y: number;
    angle?: number;
}, width: number, height: number): {
    position: [number, number];
    rotation: number;
};
/** The parts of a Motion Canvas `Node` the motion check reads. */
export interface NodeLike {
    key?: string;
    absolutePosition(): {
        x: number;
        y: number;
    };
    absoluteOpacity(): number;
    /** local-space bounds of it and its children */
    cacheBBox?(): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /** a DOMMatrix: local → world (the view, origin at its centre) */
    localToWorld?(): {
        a: number;
        b: number;
        c: number;
        d: number;
        e: number;
        f: number;
    };
}
/** Every node in a view whose `key` is one of these names (give nodes a `key` to track them). */
export declare function byKey(view: {
    findAll(pred: (n: any) => boolean): any[];
}, keys: readonly string[]): Record<string, NodeLike>;
/** One node as a motion-check sample, in frame px (top-left origin). */
export declare function nodeSample(node: NodeLike | null | undefined, width: number, height: number): Sample;
/** One frame's row: every node by name (a missing node is not shown). */
export declare function nodesRow(nodes: Record<string, NodeLike | null | undefined>, width: number, height: number): Record<string, Sample>;
export interface MotionCanvasReportOptions extends AnalyzeOptions {
    /** go to a frame: `(f) => player.playback.seek(f)` */
    seek: (frame: number) => unknown | Promise<unknown>;
    /** this frame's nodes by name: `() => byKey(player.playback.currentScene.getView(), ["hero"])` */
    nodes: () => Record<string, NodeLike | null | undefined>;
    fps: number;
    width: number;
    height: number;
    /** seconds */
    from?: number;
    to: number;
}
/** The motion check over a Motion Canvas project: seeks every frame, reads the nodes, analyses. */
export declare function motionCanvasReport(o: MotionCanvasReportOptions): Promise<Report>;
