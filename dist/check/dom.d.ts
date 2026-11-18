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
export declare function collectDom(root?: Element): Record<string, Sample>;
