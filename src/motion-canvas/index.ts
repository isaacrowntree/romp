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
import { analyze, type AnalyzeOptions, type FrameRow, type Report, type Sample } from "../check/analyze.js";

export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";

/**
 * Play baked motion inside a scene: calls apply(t) every frame for `duration`
 * seconds, t counted from when it starts. `time` is Motion Canvas's `useTime`
 * (exact under waitFor's sub-frame offsets); without it, frames are counted at `fps`.
 */
export function* playBaked(apply: (t: number) => void, o: { duration: number; time?: () => number; fps?: number }): Generator<void, void, unknown> {
  const fps = o.fps ?? 30;
  const t0 = o.time?.() ?? 0;
  for (let n = 0; ; n++) {
    const t = o.time ? o.time() - t0 : n / fps;
    apply(Math.min(t, o.duration));
    if (t >= o.duration - 1e-9) return;
    yield;
  }
}

/** A screen-space pose (px from the top left, radians) placed in a Motion Canvas view (px from the centre, degrees). */
export function centred(pose: { x: number; y: number; angle?: number }, width: number, height: number): { position: [number, number]; rotation: number } {
  return { position: [pose.x - width / 2, pose.y - height / 2], rotation: ((pose.angle ?? 0) * 180) / Math.PI };
}

/** The parts of a Motion Canvas `Node` the motion check reads. */
export interface NodeLike {
  key?: string;
  absolutePosition(): { x: number; y: number };
  absoluteOpacity(): number;
  /** local-space bounds of it and its children */
  cacheBBox?(): { x: number; y: number; width: number; height: number };
  /** a DOMMatrix: local → world (the view, origin at its centre) */
  localToWorld?(): { a: number; b: number; c: number; d: number; e: number; f: number };
}

/** Every node in a view whose `key` is one of these names (give nodes a `key` to track them). */
export function byKey(view: { findAll(pred: (n: any) => boolean): any[] }, keys: readonly string[]): Record<string, NodeLike> {
  const out: Record<string, NodeLike> = {};
  for (const n of view.findAll((n) => keys.includes(n?.key))) out[n.key] = n;
  return out;
}

/** One node as a motion-check sample, in frame px (top-left origin). */
export function nodeSample(node: NodeLike | null | undefined, width: number, height: number): Sample {
  if (!node) return { x: 0, y: 0, shown: false, onScreen: false, area: 0, opacity: 0 };
  const p = node.absolutePosition();
  const opacity = Math.max(0, Math.min(1, node.absoluteOpacity()));
  let box: Sample["box"];
  const b = node.cacheBBox?.(), m = node.localToWorld?.();
  if (b && m && b.width > 0 && b.height > 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
      const wx = m.a * cx + m.c * cy + m.e + width / 2, wy = m.b * cx + m.d * cy + m.f + height / 2;
      x0 = Math.min(x0, wx); y0 = Math.min(y0, wy); x1 = Math.max(x1, wx); y1 = Math.max(y1, wy);
    }
    box = { x0, y0, x1, y1 };
  }
  const x = p.x + width / 2, y = p.y + height / 2;
  const visW = box ? Math.max(0, Math.min(box.x1, width) - Math.max(box.x0, 0)) : 0;
  const visH = box ? Math.max(0, Math.min(box.y1, height) - Math.max(box.y0, 0)) : 0;
  const shown = opacity > 0.01;
  return {
    x,
    y,
    shown,
    onScreen: box ? visW > 0 && visH > 0 : x >= 0 && y >= 0 && x <= width && y <= height,
    area: shown ? visW * visH : 0,
    opacity: shown ? opacity : 0,
    box,
  };
}

/** One frame's row: every node by name (a missing node is not shown). */
export function nodesRow(nodes: Record<string, NodeLike | null | undefined>, width: number, height: number): Record<string, Sample> {
  const row: Record<string, Sample> = {};
  for (const [name, n] of Object.entries(nodes)) row[name] = nodeSample(n, width, height);
  return row;
}

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
export async function motionCanvasReport(o: MotionCanvasReportOptions): Promise<Report> {
  const frames: FrameRow[] = [];
  for (let f = Math.round((o.from ?? 0) * o.fps); f <= Math.round(o.to * o.fps); f++) {
    await o.seek(f);
    frames.push({ f, row: nodesRow(o.nodes(), o.width, o.height) });
  }
  return analyze(frames, o);
}
