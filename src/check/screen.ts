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
const matches = (name: string, list?: string[]) => (list ?? []).some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : p === name));
const visible = (p?: Sample): p is Sample => !!p && p.shown && p.opacity > 0.05 && p.area > 0 && !!p.box;
/** The gap between two boxes, px (0 when they touch or overlap). */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1), dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

export function screenIssues(frames: FrameRow[], names: string[], o: ScreenOptions & { width?: number; height?: number }, fps: number, hidden: (f: number) => boolean): Issue[] {
  const out: Issue[] = [];
  const short = o.width && o.height ? Math.min(o.width, o.height) : (o.width ?? 1080);
  const allowed = (kind: TextKind, name: string) => matches(name, o.allow?.[kind]) || frames.some((fr) => fr.row[name]?.allow?.includes(kind));
  const s1 = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} s`;

  // ── legibility ──────────────────────────────────────────────────────────────
  const minPx = o.legiblePx ?? (20 * short) / 1080;
  const legRun = Math.round((o.legibleSeconds ?? 0.5) * fps);
  for (const name of names) {
    if (allowed("legibility", name)) continue;
    let r: { f: number; px: number; scale: number; text: number; native: number }[] = [];
    const flush = () => {
      if (r.length > legRun) {
        const rising = r.every((p, k) => k === 0 || p.px >= r[k - 1].px - 0.05);
        const falling = r.every((p, k) => k === 0 || p.px <= r[k - 1].px + 0.05);
        const moving = Math.abs(r[r.length - 1].px - r[0].px) > 0.5;
        if (!(moving && (rising || falling))) {
          const worst = r.reduce((a, b) => (b.px < a.px ? b : a));
          out.push({
            frame: r[0].f,
            name,
            kind: "legibility",
            detail: `its ${worst.text} px text renders at ${worst.px.toFixed(1)} px (${worst.native} px wide content drawn at ${Math.round(worst.scale * 100)}%), under ${Math.round(minPx)} px, for ${s1(r.length / fps)}: zoom in, or crop to the part that matters`,
          });
        }
      }
      r = [];
    };
    for (const { f, row } of frames) {
      const p = row[name];
      if (!visible(p) || p.role !== "screen" || !p.native?.width || p.opacity < 0.5 || hidden(f)) {
        flush();
        continue;
      }
      const scale = (p.box!.x1 - p.box!.x0) / p.native.width;
      const text = p.minTextPx ?? o.minTextPx ?? 16;
      const px = scale * text;
      if (px < minPx) r.push({ f, px, scale, text, native: p.native.width });
      else flush();
    }
    flush();
  }

  // ── anchor ──────────────────────────────────────────────────────────────────
  const gapMax = o.anchorPx ?? 0.1 * short;
  const anchorRun = Math.round((o.anchorSeconds ?? 0.1) * fps);
  const groundTol = o.groundPx ?? 2;
  for (const name of names) {
    if (allowed("anchor", name)) continue;
    let groundFlagged = false, gapFlagged = false;
    type Gap = { f: number; n: number; worst: number; to: string };
    let gap = null as Gap | null;
    for (const { f, row } of frames) {
      const p = row[name];
      if (!visible(p) || hidden(f)) {
        // Gone: start over (one flag per dip below the line, one per drift away).
        groundFlagged = false;
        gap = null;
        gapFlagged = false;
        continue;
      }
      const b = p.box!;
      if (p.ground == null || b.y1 - p.ground <= groundTol) groundFlagged = false;
      else if (!groundFlagged) {
        out.push({ frame: f, name, kind: "anchor", detail: `${Math.round(b.y1 - p.ground)} px of it below its ground line (y ${Math.round(p.ground)})${p.opacity < 0.99 ? " while it fades" : ""}: enter and leave above the line` });
        groundFlagged = true;
      }
      const a = p.anchor ? row[p.anchor] : undefined;
      if (p.anchor && visible(a)) {
        const g = boxGap(b, a.box!);
        if (g > gapMax) {
          gap = gap ? { ...gap, n: gap.n + 1, worst: Math.max(gap.worst, g) } : { f, n: 1, worst: g, to: p.anchor };
          if (gap.n > anchorRun && !gapFlagged) {
            out.push({ frame: gap.f, name, kind: "anchor", detail: `${Math.round(gap.worst)} px from ${gap.to}, the object it belongs to (over ${Math.round(gapMax)} px)` });
            gapFlagged = true;
          }
        } else gap = null;
      }
    }
  }
  return out;
}
