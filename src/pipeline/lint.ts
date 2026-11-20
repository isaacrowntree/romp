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
import { analyze, type AnalyzeOptions, type FrameRow, type Sample, type Role, type TextKind } from "../check/analyze.js";

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
  native?: { width: number };
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
  band?: { top: number; bottom: number };
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

type Box = { x0: number; y0: number; x1: number; y1: number };
const toBox = (r: PlanRect): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height });
const through = (b: Box, c: PlanCamera | undefined): Box => {
  const s = c?.scale ?? 1, x = c?.x ?? 0, y = c?.y ?? 0;
  return { x0: b.x0 * s + x, y0: b.y0 * s + y, x1: b.x1 * s + x, y1: b.y1 * s + y };
};
const meet = (a: Box, b: Box): Box => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
const overlaps = (a: Box, b: Box) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

/** The beats of a scene, each with its own items and camera. */
function beatsOf(s: PlanScene): { name?: string; camera?: PlanCamera; items: PlanItem[]; focus?: boolean }[] {
  const base = s.items ?? [];
  if (!s.beats?.length) return [{ camera: s.camera, items: base, focus: s.focus }];
  return s.beats.map((b) => {
    const extra = b.items ?? [];
    const names = new Set(extra.map((i) => i.name));
    return { name: b.name, camera: b.camera ?? s.camera, items: [...base.filter((i) => !names.has(i.name)), ...extra], focus: b.focus ?? s.focus };
  });
}

export function lintPlan(plan: Plan): { issues: LintIssue[]; scenes: number; beats: number } {
  const issues: LintIssue[] = [];
  const W = plan.width, H = plan.height;
  const fillFrac = plan.fillFraction ?? 0.01;
  const banned = (plan.banned ?? []).map((b) => (typeof b === "string" ? new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : b));
  let beats = 0;
  for (const scene of plan.scenes) {
    for (const beat of beatsOf(scene)) {
      beats++;
      const at = (name: string, kind: LintKind, detail: string, allow?: string[]) => {
        if (allow?.includes(kind)) return;
        if (!issues.some((i) => i.scene === scene.name && i.beat === beat.name && i.name === name && i.kind === kind)) issues.push({ scene: scene.name, beat: beat.name, name, kind, detail });
      };
      const scale = (it: PlanItem) => (it.fixed ? 1 : (beat.camera?.scale ?? 1));
      const boxOf = (it: PlanItem) => (it.fixed ? toBox(it.box) : through(toBox(it.box), beat.camera));
      const byName = new Map(beat.items.map((i) => [i.name, i]));

      // The frame check's layout rules, on this beat held still.
      const row: Record<string, Sample> = {};
      beat.items.forEach((it, order) => {
        const b = boxOf(it);
        const vis = meet(b, { x0: 0, y0: 0, x1: W, y1: H });
        const area = Math.max(0, vis.x1 - vis.x0) * Math.max(0, vis.y1 - vis.y0);
        const s: Sample = {
          x: (b.x0 + b.x1) / 2,
          y: (b.y0 + b.y1) / 2,
          shown: true,
          onScreen: area > 0,
          area,
          opacity: 1,
          box: b,
          role: it.role === "device" ? "prop" : it.role,
          z: it.z ?? order,
          allow: it.allow as TextKind[] | undefined,
        };
        if (it.role === "text") {
          const t = it.text ?? "";
          s.text = t;
          s.chars = { shown: [...t].length, total: [...t].length };
          if (it.fontPx != null) s.fontPx = it.fontPx * scale(it);
          if (it.heading) s.heading = true;
          if (it.opaque) s.opaque = true;
          if (it.anchor) s.anchor = it.anchor;
          if (it.ground != null) s.ground = it.ground;
        }
        if (it.role === "screen") {
          if (it.native) s.native = it.native;
          if (it.minTextPx != null) s.minTextPx = it.minTextPx;
          const dev = it.device ? byName.get(it.device) : undefined;
          if (dev?.screenRect) {
            const sr = dev.fixed ? toBox(dev.screenRect) : through(toBox(dev.screenRect), beat.camera);
            const c = meet(b, sr);
            if (c.x0 > b.x0 + 0.5 || c.y0 > b.y0 + 0.5 || c.x1 < b.x1 - 0.5 || c.y1 < b.y1 - 0.5) s.clip = c;
          }
        }
        row[it.name] = s;
      });
      const fps = 10;
      const frames: FrameRow[] = Array.from({ length: fps * 3 }, (_, f) => ({ f, row }));
      const r = analyze(frames, { fps, ...plan.options, width: W, height: H, safe: plan.safe ?? plan.options?.safe, occupancy: plan.occupancy ?? plan.options?.occupancy, layoutOnly: true, blankSeconds: false });
      for (const i of r.issues) {
        const it = byName.get(i.name);
        // fill speaks for a screen in a device.
        if (i.kind === "clipped" && it?.device) continue;
        at(i.name, i.kind as LintKind, i.detail.replace(/ for \d+(\.\d+)? s/, ""), it?.allow);
      }

      // fill: a screen in a device fills its screen area.
      for (const it of beat.items) {
        if (it.role !== "screen" || !it.device) continue;
        const dev = byName.get(it.device);
        if (!dev?.screenRect) {
          at(it.name, "fill", `its device "${it.device}" isn't in this beat, or has no screenRect`, it.allow);
          continue;
        }
        const a = it.box, d = dev.screenRect;
        const tolX = fillFrac * d.width, tolY = fillFrac * d.height;
        const gaps = { left: a.x - d.x, top: a.y - d.y, right: d.x + d.width - (a.x + a.width), bottom: d.y + d.height - (a.y + a.height) };
        const off = Object.entries(gaps).filter(([k, g]) => Math.abs(g) > (k === "left" || k === "right" ? tolX : tolY));
        if (off.length) {
          const how = off.map(([k, g]) => `${g > 0 ? `${Math.round(g)} px short` : `${Math.round(-g)} px over`} at the ${k}`).join(", ");
          at(it.name, "fill", `doesn't fill ${it.device}'s screen: ${how} (composition px). Size it to the screen area exactly`, it.allow);
        }
      }
      // focus: a focus beat has a focus box.
      if (beat.focus && !beat.items.some((i) => i.role === "focus")) at("(beat)", "focus", "a focus beat with no focus box: ring or highlight the thing the voice-over is about");
      // banned words.
      for (const it of beat.items) {
        if (it.role !== "text" || !it.text) continue;
        const hit = banned.find((re) => re.test(it.text!));
        if (hit) at(it.name, "banned", `uses ${hit.source.replace(/\\b/g, "")}: "${it.text.length > 60 ? `${it.text.slice(0, 59)}…` : it.text}"`, it.allow);
      }
      // band: headings in it, nothing else.
      if (plan.band) {
        const band: Box = { x0: 0, y0: plan.band.top, x1: W, y1: plan.band.bottom };
        for (const it of beat.items) {
          if (it.role === "background") continue;
          const b = boxOf(it);
          if (it.role === "text" && it.heading) {
            if (b.y0 < band.y0 - 0.5 || b.y1 > band.y1 + 0.5) at(it.name, "band", `a heading outside the heading band (y ${plan.band.top}–${plan.band.bottom}): it spans y ${Math.round(b.y0)}–${Math.round(b.y1)}`, it.allow);
          } else if (overlaps(b, band)) at(it.name, "band", `reaches into the heading band (y ${plan.band.top}–${plan.band.bottom}), kept for headings`, it.allow);
        }
      }
    }
  }
  return { issues, scenes: plan.scenes.length, beats };
}

/** Format a lint report for a terminal. */
export function formatLint(r: { issues: LintIssue[]; scenes: number; beats: number }): string {
  if (!r.issues.length) return `plan lint: ${r.scenes} scenes, ${r.beats} beats, no issues`;
  const lines = r.issues.map((i) => `  ${(i.beat ? `${i.scene} / ${i.beat}` : i.scene).padEnd(28)} ${i.kind.padEnd(10)} ${i.name}: ${i.detail}`);
  return `plan lint: ${r.issues.length} issue(s) in ${r.scenes} scenes, ${r.beats} beats\n${lines.join("\n")}`;
}
