/**
 * romp for Remotion (or any DOM renderer): mark what the motion check should
 * follow, and read baked physics by frame.
 *
 *   <div {...track("hero", { impact: nearImpact(body.impacts, frame) })} style={…} />
 *
 * Run the check with the CLI: `romp check src/check-entry.tsx --public public`.
 */
export { collectDom } from "../check/dom.js";
export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";

/** Data attributes for the motion check: spread them on the element to track. */
export function track(name: string, o: { impact?: boolean; seamless?: boolean } = {}): Record<string, string | undefined> {
  return {
    "data-romp": name,
    "data-romp-impact": o.impact ? "1" : undefined,
    "data-romp-seamless": o.seamless ? "1" : undefined,
  };
}

/** What a `romp check` entry file default-exports. */
export interface CheckEntry {
  component: any;
  props?: Record<string, unknown>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  /** [from, to] seconds of deliberate fast moves */
  whips?: [number, number][];
  /** [from, to] seconds where the scene is hidden (a transition, a full-frame card) */
  covered?: [number, number][];
}
