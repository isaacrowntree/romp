/**
 * Collect the tracked DOM elements of one frame for the motion check. Mark an
 * element with `data-romp="<name>"` (see `track()` in romp/remotion);
 * `data-romp-impact` marks a frame at a real impact, `data-romp-seamless` an
 * object that swaps in for an identical twin. Coordinates are relative to
 * `root` (your composition's frame), so the page can be any size.
 */
import type { Sample } from "./analyze.js";
export declare function collectDom(root?: Element): Record<string, Sample>;
