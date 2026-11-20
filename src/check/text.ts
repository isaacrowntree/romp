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
import { readingTime, type ReadingOptions } from "../timing/index.js";

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
export function safeArea(W: number, H: number, safe?: number | Partial<Margins>): Margins {
  if (typeof safe === "number") return { top: H * safe, bottom: H * safe, left: W * safe, right: W * safe };
  const portrait = H >= W;
  const def: Margins = portrait
    ? { top: Math.round(H * 0.05), bottom: Math.round(H * 0.05), left: Math.round(W * 0.035), right: Math.round(W * 0.035) }
    : { top: Math.round(H * 0.035), bottom: Math.round(H * 0.035), left: Math.round(W * 0.05), right: Math.round(W * 0.05) };
  return { ...def, ...safe };
}

type Box = NonNullable<Sample["box"]>;
const areaOf = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
/** The area two boxes share, px². */
export function boxOverlap(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
}

const matches = (name: string, list?: string[]) => (list ?? []).some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : p === name));
const visible = (p?: Sample): p is Sample => !!p && p.shown && p.opacity > 0.05 && p.area > 0;
const legible = (p?: Sample): p is Sample => visible(p) && p.opacity >= 0.5;
const complete = (p: Sample) => !p.chars || p.chars.shown >= p.chars.total;
const s1 = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} s`;
const quote = (p: Sample) => {
  if (!p.text) return "";
  const t = p.chars ? p.text.slice(0, Math.max(0, p.chars.shown)) : p.text;
  const cut = t.length > 48 ? `${t.slice(0, 47)}…` : t;
  return ` ("${cut}${p.chars && p.chars.shown < p.chars.total ? "…" : ""}")`;
};
/** Seconds a text takes to read, from its words (or its characters, at ~6 a word). */
const needOf = (p: Sample, o: TextOptions) => readingTime(p.text ?? p.words ?? (p.chars ? Math.max(1, Math.round(p.chars.total / 6)) : 1), o.reading);

export function textIssues(frames: FrameRow[], names: string[], o: TextOptions & { width?: number; height?: number }, fps: number, hidden: (f: number) => boolean): Issue[] {
  const out: Issue[] = [];
  const roles = new Map<string, Sample["role"]>();
  for (const n of names) {
    const r = frames.find((fr) => fr.row[n]?.role)?.row[n].role;
    roles.set(n, r ?? (o.strict ? "prop" : undefined));
  }
  const texts = names.filter((n) => roles.get(n) === "text");
  if (!texts.length) return out;
  const allowed = (kind: TextKind, name: string) => matches(name, o.allow?.[kind]) || frames.some((fr) => fr.row[name]?.allow?.includes(kind));
  const cuts = new Set((o.scenes ?? []).map((s) => Math.round(s * fps)));
  // A cut ends a text's time on screen: a scene start, or the first covered frame.
  const isCut = (i: number) => i > 0 && (cuts.has(frames[i].f) || (hidden(frames[i].f) && !hidden(frames[i - 1].f)));
  const run = (s: number) => Math.round(s * fps);

  // ── offsafe ────────────────────────────────────────────────────────────────
  if (o.width && o.height) {
    const W = o.width, H = o.height;
    const m = safeArea(W, H, o.safe);
    const minRun = run(o.offsafeSeconds ?? 0.1);
    for (const name of texts) {
      if (allowed("offsafe", name)) continue;
      let r: { f: number; over: number; edge: string }[] = [];
      const flush = () => {
        if (r.length > minRun) {
          const rising = r.every((p, k) => k === 0 || p.over >= r[k - 1].over - 0.5);
          const falling = r.every((p, k) => k === 0 || p.over <= r[k - 1].over + 0.5);
          const moving = Math.abs(r[r.length - 1].over - r[0].over) > 2;
          if (!(moving && (rising || falling))) {
            const worst = r.reduce((a, b) => (b.over > a.over ? b : a));
            out.push({ frame: r[0].f, name, kind: "offsafe", detail: `${Math.round(worst.over)} px past the ${worst.edge} safe margin (${Math.round(m[worst.edge as keyof Margins])} px) for ${s1(r.length / fps)}` });
          }
        }
        r = [];
      };
      for (const { f, row } of frames) {
        const p = row[name];
        if (!legible(p) || !p.box || hidden(f)) {
          flush();
          continue;
        }
        const b = p.box;
        const edges = { top: m.top - b.y0, bottom: b.y1 - (H - m.bottom), left: m.left - b.x0, right: b.x1 - (W - m.right) };
        const [edge, over] = Object.entries(edges).reduce((a, e) => (e[1] > a[1] ? e : a));
        if (over > 0.5) r.push({ f, over, edge });
        else flush();
      }
      flush();
    }
  }

  // ── unfinished, unread, empty ───────────────────────────────────────────────
  const emptyRun = run(o.emptySeconds ?? 0.2);
  const headingRun = run(o.headingSeconds ?? 0.5);
  /** per text, per frame index: frames it has been whole and legible in this appearance */
  const wholeFor = new Map<string, number[]>();
  for (const name of texts) {
    const whole: number[] = new Array(frames.length).fill(0);
    wholeFor.set(name, whole);
    let open = false, full = 0, last: Sample | null = null, since = 0;
    let blank = 0, typing = 0, flaggedEmpty = false;
    const close = (i: number, why: string) => {
      if (open && last) {
        if (!complete(last)) {
          if (!allowed("unfinished", name)) out.push({ frame: frames[i].f, name, kind: "unfinished", detail: `${why} at ${last.chars!.shown} of ${last.chars!.total} characters${quote(last)}` });
        } else {
          const need = needOf(last, o);
          if (full < Math.round(need * fps) && !allowed("unread", name)) out.push({ frame: frames[i].f, name, kind: "unread", detail: `${why} after ${s1(full / fps)} whole; it takes ${s1(need)} to read${quote(last)}` });
        }
      }
      open = false;
      full = 0;
      last = null;
      blank = 0;
      typing = 0;
      flaggedEmpty = false;
    };
    for (let i = 0; i < frames.length; i++) {
      const { f, row } = frames[i];
      const p = row[name];
      const vis = visible(p) && !hidden(f);
      if (open && isCut(i)) close(i, cuts.has(f) ? "the scene cuts" : "covered");
      else if (open && !vis) close(i, "gone");
      if (!vis) continue;
      if (!open) {
        open = true;
        since = i;
      }
      last = p;
      if (complete(p) && legible(p)) full++;
      whole[i] = full;
      // Empty: its box with no words; or a heading still typing well after it appears.
      if (allowed("empty", name) || flaggedEmpty) continue;
      blank = p.chars && p.chars.shown <= 0 ? blank + 1 : 0;
      typing = p.heading && !complete(p) ? typing + 1 : 0;
      if (blank > emptyRun) {
        out.push({ frame: frames[i - blank + 1].f, name, kind: "empty", detail: `its box shows with no words for over ${s1(emptyRun / fps)}` });
        flaggedEmpty = true;
      } else if (typing > headingRun && i - since + 1 === typing) {
        out.push({ frame: frames[since].f, name, kind: "empty", detail: `a heading still typing ${s1(typing / fps)} after it appears${quote(p)}: bring it in whole with its scene` });
        flaggedEmpty = true;
      }
    }
    // The checked range ends with it still on screen: what comes next is unknown, so no verdict.
  }

  // ── covers, overlap ─────────────────────────────────────────────────────────
  const coversRun = run(o.coversSeconds ?? 0.1), overlapRun = run(o.overlapSeconds ?? 0.2), propRun = Math.max(1, run(o.propOverlapSeconds ?? 0.04));
  const coversFrac = o.coversFraction ?? 0.05, overlapFrac = o.overlapFraction ?? 0.02;
  const runs = new Map<string, { start: number; n: number; flagged: boolean; seen: number }>();
  for (let i = 0; i < frames.length; i++) {
    const { f, row } = frames[i];
    if (hidden(f)) continue;
    const here = names.filter((n) => roles.get(n) && legible(row[n]) && row[n].box);
    const ts = here.filter((n) => roles.get(n) === "text");
    const others = here.filter((n) => roles.get(n) !== "text");
    const bump = (key: string, kind: "covers" | "overlap", name: string, limit: number, detail: () => string) => {
      const r = runs.get(key);
      const cur = r && r.seen === i - 1 ? r : { start: f, n: 0, flagged: false, seen: i };
      cur.n++;
      cur.seen = i;
      runs.set(key, cur);
      if (cur.n > limit && !cur.flagged) {
        cur.flagged = true;
        out.push({ frame: cur.start, name, kind, detail: detail() });
      }
    };
    for (let a = 0; a < ts.length; a++) {
      const t = row[ts[a]], tb = t.box!;
      for (let b = a + 1; b < ts.length; b++) {
        const u = row[ts[b]], ub = u.box!;
        const share = boxOverlap(tb, ub) / Math.max(1, Math.min(areaOf(tb), areaOf(ub)));
        if (share > overlapFrac && !allowed("overlap", ts[a]) && !allowed("overlap", ts[b]))
          bump(`o|${ts[a]}|${ts[b]}`, "overlap", ts[a], overlapRun, () => `overlaps the text ${ts[b]} (${Math.round(share * 100)}% of the smaller)`);
      }
      for (const n of others) {
        const q = row[n], qb = q.box!;
        const shared = boxOverlap(tb, qb);
        if (shared <= 0) continue;
        if (roles.get(n) === "focus") {
          const share = shared / Math.max(1, areaOf(qb));
          if (share > coversFrac && !allowed("covers", ts[a]) && !allowed("covers", n))
            bump(`c|${ts[a]}|${n}`, "covers", ts[a], coversRun, () => `covers ${Math.round(share * 100)}% of the focus ${n}, the thing it's about`);
        } else {
          // A prop drawn under the text (a backdrop, the device it captions) is fine.
          if (q.z != null && t.z != null && q.z < t.z) continue;
          const share = shared / Math.max(1, Math.min(areaOf(tb), areaOf(qb)));
          if (share > overlapFrac && !allowed("overlap", ts[a]) && !allowed("overlap", n))
            bump(`p|${ts[a]}|${n}`, "overlap", ts[a], propRun, () => `${n} is drawn over it (${Math.round(share * 100)}% of the smaller)`);
        }
      }
    }
  }

  // ── stale ───────────────────────────────────────────────────────────────────
  if (o.stale || (o.strict && o.stale !== false)) {
    const limit = run(typeof o.stale === "number" ? o.stale : 3);
    const same = (a?: Sample, b?: Sample) => {
      if (!a || !b) return !a && !b;
      if (a.shown !== b.shown) return false;
      if (!a.shown) return true;
      return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.area - b.area) <= 0.01 * Math.max(a.area, b.area, 1) && Math.abs(a.opacity - b.opacity) < 0.01 && (a.chars?.shown ?? -1) === (b.chars?.shown ?? -1);
    };
    let n = 0, start = 0, who = "";
    const flush = () => {
      if (n > limit && !allowed("stale", who)) out.push({ frame: start, name: who, kind: "stale", detail: `nothing moves for ${s1(n / fps)} after its words were read: cut sooner, or give the eye something` });
      n = 0;
    };
    for (let i = 1; i < frames.length; i++) {
      const { f, row } = frames[i];
      const prev = frames[i - 1].row;
      const still = !hidden(f) && !isCut(i) && names.every((k) => same(prev[k], row[k]));
      const onScreen = texts.filter((t) => legible(row[t]));
      const read = onScreen.length > 0 && onScreen.every((t) => wholeFor.get(t)![i] >= Math.round(needOf(row[t], o) * fps));
      if (still && read) {
        if (n === 0) {
          start = f;
          who = onScreen[0];
        }
        n++;
      } else flush();
    }
    flush();
  }
  return out;
}

