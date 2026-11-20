/**
 * Collect the tracked DOM elements of one frame for the motion check. Mark an
 * element with `data-romp="<name>"` (see `track()` in romp/remotion);
 * `data-romp-impact` marks a frame at a real impact, `data-romp-seamless` an
 * object that swaps in for an identical twin, `data-romp-allow-crop` one that
 * may run off the frame's edge. Each sample carries its box for the cropped
 * check (pass the frame's `width` and `height` to analyze()). Coordinates are relative to
 * `root` (your composition's frame), so the page can be any size.
 *
 * For the text rules: `data-romp-role` ("text", "focus" or "prop"); on a text,
 * `data-romp-text` (the whole text; else its textContent), `data-romp-chars-shown`
 * and `data-romp-chars-total` (else all of it is shown), `data-romp-words`,
 * `data-romp-heading`, and `data-romp-allow` ("offsafe,covers"). Each sample's
 * `z` is its document order (later draws on top), unless `data-romp-z` says.
 * `data-romp-allow-crop` takes a share too ("0.1"). On a screen,
 * `data-romp-native-width` and `data-romp-min-text-px`; on a text,
 * `data-romp-anchor` (another tracked name) and `data-romp-ground` (a y in
 * frame px).
 *
 * Only `[data-romp]` elements are seen: an untagged element, or a prop drawn
 * inside one `<svg>` or `<canvas>`, is invisible to the check. Track each prop
 * (an SVG child takes `data-romp` too); `untrackedOver()` finds the drawing
 * surfaces and plain text you missed.
 *
 * Each sample's `clip` is what clipping ancestors (overflow other than
 * visible, inside `root`) leave of its box, when that's less than the box. A
 * text's `fontPx` is its smallest font-size × its on-screen scale
 * (`data-romp-font-px` overrides) and `opaque` says it has a solid background
 * of its own (`data-romp-opaque="1"` or `"0"` overrides). `data-romp-role`
 * also takes "background": never counted as something on screen.
 */
import type { Sample, TextKind } from "./analyze.js";

export function collectDom(root: Element = document.body): Record<string, Sample> {
  const frame = root.getBoundingClientRect();
  const out: Record<string, Sample> = {};
  root.querySelectorAll<HTMLElement>("[data-romp]").forEach((el, order) => {
    const name = el.dataset.romp!;
    const r = el.getBoundingClientRect();
    let opacity = 1;
    let shown = r.width > 0 && r.height > 0;
    // What clipping ancestors (overflow other than visible, inside the frame) leave of it.
    type Rect = { left: number; top: number; right: number; bottom: number };
    let clip: Rect | null = null;
    for (let n: HTMLElement | null = el; n && n !== root.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") shown = false;
      opacity *= parseFloat(cs.opacity || "1");
      if (n !== el && n !== root && clips(cs)) {
        const c = n.getBoundingClientRect();
        const cur: Rect = clip ?? { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        clip = { left: Math.max(cur.left, c.left), top: Math.max(cur.top, c.top), right: Math.min(cur.right, c.right), bottom: Math.min(cur.bottom, c.bottom) };
      }
    }
    const x = r.left + r.width / 2 - frame.left, y = r.top + r.height / 2 - frame.top;
    const visW = Math.max(0, Math.min(r.right, frame.right) - Math.max(r.left, frame.left));
    const visH = Math.max(0, Math.min(r.bottom, frame.bottom) - Math.max(r.top, frame.top));
    const sample: Sample = {
      x,
      y,
      shown: shown && opacity > 0.01,
      onScreen: visW > 0 && visH > 0,
      area: shown ? visW * visH : 0,
      opacity: shown ? opacity : 0,
      impact: el.dataset.rompImpact === "1",
      seamless: el.dataset.rompSeamless === "1",
      box: { x0: r.left - frame.left, y0: r.top - frame.top, x1: r.right - frame.left, y1: r.bottom - frame.top },
      allowCrop: el.dataset.rompAllowCrop == null ? false : el.dataset.rompAllowCrop === "1" ? true : +el.dataset.rompAllowCrop,
      allowExit: el.dataset.rompAllowExit === "1",
    };
    const d = el.dataset;
    const role = d.rompRole;
    if (role === "text" || role === "focus" || role === "prop" || role === "screen" || role === "background") sample.role = role;
    if (clip && (clip.left > r.left + 0.5 || clip.top > r.top + 0.5 || clip.right < r.right - 0.5 || clip.bottom < r.bottom - 0.5))
      sample.clip = { x0: clip.left - frame.left, y0: clip.top - frame.top, x1: Math.max(clip.left, clip.right) - frame.left, y1: Math.max(clip.top, clip.bottom) - frame.top };
    if (d.rompNativeWidth != null) sample.native = { width: +d.rompNativeWidth };
    if (d.rompMinTextPx != null) sample.minTextPx = +d.rompMinTextPx;
    if (d.rompAnchor) sample.anchor = d.rompAnchor;
    if (d.rompGround != null) sample.ground = +d.rompGround;
    sample.z = d.rompZ != null ? +d.rompZ : order;
    if (d.rompAllow) sample.allow = d.rompAllow.split(",").map((k) => k.trim()) as TextKind[];
    if (role === "text") {
      const text = d.rompText ?? el.textContent ?? "";
      const total = d.rompCharsTotal != null ? +d.rompCharsTotal : [...text].length;
      sample.text = text;
      sample.chars = { shown: d.rompCharsShown != null ? +d.rompCharsShown : total, total };
      if (d.rompWords != null) sample.words = +d.rompWords;
      if (d.rompHeading === "1") sample.heading = true;
      sample.fontPx = d.rompFontPx != null ? +d.rompFontPx : fontPxOf(el, r);
      sample.opaque = d.rompOpaque != null ? d.rompOpaque === "1" : opaqueOf(el);
    }
    // Several elements with one name: keep the biggest (a character drawn twice for a keyline, say).
    if (!out[name] || sample.area > out[name].area) out[name] = sample;
  });
  return out;
}

const clips = (cs: CSSStyleDeclaration) => [cs.overflow, cs.overflowX, cs.overflowY].some((v) => v && v !== "visible" && v !== "");

/** The smallest text inside an element as drawn, px: computed font-size × its on-screen scale. */
function fontPxOf(el: HTMLElement, r: DOMRect): number | undefined {
  const scale = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
  let min = Infinity;
  const visit = (n: Element) => {
    if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim())) {
      const px = parseFloat(getComputedStyle(n).fontSize);
      if (px > 0) min = Math.min(min, px);
    }
    for (const c of n.children) visit(c);
  };
  visit(el);
  return min < Infinity ? min * scale : undefined;
}

/** A solid panel of its own: an opaque background colour, or a background image. */
function opaqueOf(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
  const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || "");
  if (!m) return false;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length < 4 || parseFloat(parts[3]) >= 0.9;
}

/**
 * What `--strict` can't see, over what it checks: every `<svg>` (outermost),
 * `<canvas>`, `<img>` and `<video>`, and every run of plain text, under `root`
 * that isn't tracked and sits inside nothing tracked, drawn over a shown tracked
 * text or screen: a surface after it in the document (so drawn on top, unless
 * z-index says otherwise); text after a screen, or anywhere on a text. Props
 * drawn in a surface can cross a title unseen, and untracked words can sit on a
 * screen or a caption: track them. `romp check --strict` warns about each one
 * (`--untracked error` fails on them).
 */
export function untrackedOver(root: Element): { what: string; size: string; text: string; kind: "surface" | "text" }[] {
  const frame = root.getBoundingClientRect();
  const shownIn = (el: Element) => {
    for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity || "1") <= 0.01) return false;
    }
    return true;
  };
  const targets = [...root.querySelectorAll<HTMLElement>('[data-romp][data-romp-role="text"], [data-romp][data-romp-role="screen"]')]
    .map((el) => ({ el, r: el.getBoundingClientRect(), screen: el.dataset.rompRole === "screen" }))
    .filter(({ el, r }) => r.width > 0 && r.height > 0 && shownIn(el));
  if (!targets.length) return [];
  const meets = (r: { left: number; top: number; right: number; bottom: number }, t: { r: DOMRect }) => Math.min(r.right, t.r.right) > Math.max(r.left, t.r.left) && Math.min(r.bottom, t.r.bottom) > Math.max(r.top, t.r.top);
  const after = (t: { el: Element }, el: Node) => !!(t.el.compareDocumentPosition(el) & 4); /* FOLLOWING */
  const where = (r: { left: number; top: number; right: number; bottom: number }) => `${Math.round(r.right - r.left)}×${Math.round(r.bottom - r.top)} at ${Math.round(r.left - frame.left)},${Math.round(r.top - frame.top)}`;
  const out: { what: string; size: string; text: string; kind: "surface" | "text" }[] = [];
  root.querySelectorAll<Element>("svg, canvas, img, video").forEach((el) => {
    if (el.tagName.toLowerCase() === "svg" && el.parentElement?.closest("svg")) return;
    if (el.closest("[data-romp]") || el.querySelector("[data-romp]")) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || !shownIn(el)) return;
    const hit = targets.find((t) => after(t, el) && meets(r, t));
    if (!hit) return;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const c = (el.getAttribute("class") ?? "").trim();
    const cls = c ? `.${c.split(/\s+/)[0]}` : "";
    const src = tag === "img" ? ` ${(el.getAttribute("src") ?? "").split("/").pop()?.slice(0, 40)}` : "";
    out.push({ what: `<${tag}${id}${cls}>${src}`, size: where(r), text: hit.el.dataset.romp!, kind: "surface" });
  });
  // Plain text with no tracked ancestor (text inside an untracked <svg> is that surface's).
  const walk = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const words = (n.textContent ?? "").trim();
    const parent = n.parentElement;
    if (!words || !parent || parent.closest("[data-romp], svg, script, style") || !shownIn(parent)) continue;
    let r: { left: number; top: number; right: number; bottom: number } = parent.getBoundingClientRect();
    try {
      const range = document.createRange();
      range.selectNodeContents(n);
      const rr = range.getBoundingClientRect();
      if (rr.width > 0 && rr.height > 0) r = rr;
    } catch {
      /* no Range layout: the parent's box */
    }
    if (r.right - r.left <= 0 || r.bottom - r.top <= 0) continue;
    const hit = targets.find((t) => meets(r, t) && (!t.screen || after(t, n)));
    if (!hit) continue;
    out.push({ what: `text "${words.length > 32 ? `${words.slice(0, 31)}…` : words}"`, size: where(r), text: hit.el.dataset.romp!, kind: "text" });
  }
  return out;
}
