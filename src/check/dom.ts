/**
 * Collect the tracked DOM elements of one frame for the motion check. Mark an
 * element with `data-romp="<name>"` (see `track()` in romp/remotion);
 * `data-romp-impact` marks a frame at a real impact, `data-romp-seamless` an
 * object that swaps in for an identical twin, `data-romp-allow-crop` one that
 * may run off the frame's edge. Each sample carries its box for the cropped
 * check (pass the frame's `width` and `height` to analyze()). Coordinates are relative to
 * `root` (your composition's frame), so the page can be any size.
 */
import type { Sample } from "./analyze.js";

export function collectDom(root: Element = document.body): Record<string, Sample> {
  const frame = root.getBoundingClientRect();
  const out: Record<string, Sample> = {};
  root.querySelectorAll<HTMLElement>("[data-romp]").forEach((el) => {
    const name = el.dataset.romp!;
    const r = el.getBoundingClientRect();
    let opacity = 1;
    let shown = r.width > 0 && r.height > 0;
    for (let n: HTMLElement | null = el; n && n !== root.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") shown = false;
      opacity *= parseFloat(cs.opacity || "1");
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
      allowCrop: el.dataset.rompAllowCrop === "1",
    };
    // Several elements with one name: keep the biggest (a character drawn twice for a keyline, say).
    if (!out[name] || sample.area > out[name].area) out[name] = sample;
  });
  return out;
}
