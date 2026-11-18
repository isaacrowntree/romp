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
import { analyze, type AnalyzeOptions, type FrameRow, type Report, type Sample } from "../check/analyze.js";

export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";

/** The parts of a lottie-web `AnimationItem` romp reads. */
export interface LottieLike {
  goToAndStop(value: number, isFrame?: boolean): void;
  totalFrames: number;
  frameRate?: number;
  animationData?: { w: number; h: number; fr: number };
  renderer: any;
}

export interface LottieCollectOptions {
  /** only these layers (names, or "Precomp/Layer" paths). Default: every layer with content. */
  layers?: readonly string[];
  /** the comp's size, px (default: the animation's w × h) */
  width?: number;
  height?: number;
}

type Pt = [number, number];
const apply = (m: ArrayLike<number>, x: number, y: number): Pt => [x * m[0] + y * m[4] + m[12], x * m[1] + y * m[5] + m[13]];

/** A point in a layer's own space → comp space: its transform, its parents', then each precomp it sits in. */
function toComp(elem: any, x: number, y: number): Pt {
  let p: Pt = elem.finalTransform?.mProp?.v?.props ? apply(elem.finalTransform.mProp.v.props, x, y) : [x, y];
  for (const h of elem.hierarchy ?? []) if (h.finalTransform?.mProp?.v?.props) p = apply(h.finalTransform.mProp.v.props, p[0], p[1]);
  const comp = elem.comp;
  if (comp?.finalTransform && comp.data) p = toComp(comp, p[0], p[1]);
  return p;
}

/** Shown: in its in/out range, not hidden, and so is every precomp around it. */
function inRange(elem: any): boolean {
  for (let e = elem; e?.data && e.finalTransform; e = e.comp) if (!e.isInRange || e.data.hd) return false;
  return true;
}

/** Opacity: its own times every precomp's around it (parenting doesn't pass opacity on). */
function opacityOf(elem: any): number {
  let o = 1;
  for (let e = elem; e?.data && e.finalTransform; e = e.comp) o *= e.finalTransform?.mProp?.o?.v ?? 1;
  return Math.max(0, Math.min(1, o));
}

/** The layer's content bounds in its own space, or null when romp can't tell. */
function localBounds(elem: any): { x0: number; y0: number; x1: number; y1: number } | null {
  const d = elem.data;
  if (d.ty === 0 && d.w) return { x0: 0, y0: 0, x1: d.w, y1: d.h };
  if (d.ty === 1) return { x0: 0, y0: 0, x1: d.sw, y1: d.sh };
  if (d.ty === 2) {
    const a = elem.assetData;
    return a?.w ? { x0: 0, y0: 0, x1: a.w, y1: a.h } : null;
  }
  if (d.ty === 4 && Array.isArray(elem.shapes)) {
    // Every path's vertices and tangent handles, through its groups' transforms (a conservative box).
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const item of elem.shapes) {
      const sh = item.sh;
      const paths = sh?.paths?.shapes ? sh.paths.shapes.slice(0, sh.paths._length) : sh?.v ? [sh.v] : [];
      for (const path of paths) {
        for (let k = 0; k < (path._length ?? path.v?.length ?? 0); k++) {
          for (const q of [path.v[k], path.i?.[k], path.o?.[k]]) {
            if (!q) continue;
            let pt: Pt = [q[0], q[1]];
            for (const tr of item.transformers ?? []) if (tr.mProps?.v?.props) pt = apply(tr.mProps.v.props, pt[0], pt[1]);
            x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]); x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]);
          }
        }
      }
    }
    return x1 > x0 || y1 > y0 ? { x0, y0, x1, y1 } : null;
  }
  if (d.ty === 5 && typeof elem.layerElement?.getBBox === "function") {
    const b = elem.layerElement.getBBox();
    return b.width > 0 ? { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height } : null;
  }
  return null;
}

/** Every built layer element, with its name (precomp layers as "Precomp/Layer"). */
function layersOf(elements: any[] | undefined, prefix = "", out: { name: string; elem: any }[] = []) {
  const seen = new Map<string, number>();
  for (const elem of elements ?? []) {
    if (!elem?.data) continue;
    const base = prefix + (elem.data.nm ?? `layer ${elem.data.ind}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const name = n > 1 ? `${base} (${n})` : base;
    out.push({ name, elem });
    if (elem.data.ty === 0 && elem.elements) layersOf(elem.elements, `${name}/`, out);
  }
  return out;
}

/** One frame's row: every tracked layer's sample (call after goToAndStop). */
export function collectLottie(anim: LottieLike, o: LottieCollectOptions = {}): Record<string, Sample> {
  const W = o.width ?? anim.animationData?.w ?? 0, H = o.height ?? anim.animationData?.h ?? 0;
  const row: Record<string, Sample> = {};
  for (const { name, elem } of layersOf(anim.renderer?.elements)) {
    const d = elem.data;
    if (o.layers ? !o.layers.includes(name) && !o.layers.includes(d.nm) : d.ty === 3 || d.td || d.ty === 6) continue;
    const shown = inRange(elem);
    const local = shown ? localBounds(elem) : null;
    let box: Sample["box"];
    if (local) {
      const pts = [toComp(elem, local.x0, local.y0), toComp(elem, local.x1, local.y0), toComp(elem, local.x0, local.y1), toComp(elem, local.x1, local.y1)];
      box = { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
    }
    const anchor = toComp(elem, 0, 0);
    const x = box ? (box.x0 + box.x1) / 2 : anchor[0], y = box ? (box.y0 + box.y1) / 2 : anchor[1];
    const visW = box ? Math.max(0, Math.min(box.x1, W) - Math.max(box.x0, 0)) : 0;
    const visH = box ? Math.max(0, Math.min(box.y1, H) - Math.max(box.y0, 0)) : 0;
    const opacity = shown ? opacityOf(elem) : 0;
    row[name] = {
      x,
      y,
      shown: shown && opacity > 0.01,
      onScreen: box ? visW > 0 && visH > 0 : x >= 0 && y >= 0 && x <= W && y <= H,
      area: shown ? visW * visH : 0,
      opacity,
      box,
    };
  }
  return row;
}

export interface LottieReportOptions extends AnalyzeOptions, LottieCollectOptions {
  /** frames (lottie's own, from 0); default the whole animation */
  from?: number;
  to?: number;
}

/** Step every frame (goToAndStop(f, true)) and collect the rows. */
export function lottieFrames(anim: LottieLike, o: LottieReportOptions = {}): FrameRow[] {
  const frames: FrameRow[] = [];
  const last = Math.min(o.to ?? Infinity, Math.ceil(anim.totalFrames) - 1);
  for (let f = Math.max(0, o.from ?? 0); f <= last; f++) {
    anim.goToAndStop(f, true);
    frames.push({ f, row: collectLottie(anim, o) });
  }
  return frames;
}

/** The motion check over a Lottie animation: fps, width and height come from the animation. */
export function lottieReport(anim: LottieLike, o: LottieReportOptions = {}): Report {
  const fps = o.fps ?? anim.frameRate ?? anim.animationData?.fr ?? 30;
  return analyze(lottieFrames(anim, o), { ...o, fps, width: o.width ?? anim.animationData?.w, height: o.height ?? anim.animationData?.h });
}
