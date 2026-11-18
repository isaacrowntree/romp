/**
 * romp for Remotion (or any DOM renderer): mark what the motion check should
 * follow, and read baked physics by frame.
 *
 *   <div {...track("hero", { impact: nearImpact(body.impacts, frame) })} style={…} />
 *
 * Run the check with the CLI: `romp check src/check-entry.tsx --public public`.
 */
export { collectDom } from "../check/dom.js";
export { analyze, formatReport } from "../check/analyze.js";
/** Data attributes for the motion check: spread them on the element to track. */
export function track(name, o = {}) {
    return {
        "data-romp": name,
        "data-romp-impact": o.impact ? "1" : undefined,
        "data-romp-seamless": o.seamless ? "1" : undefined,
    };
}
//# sourceMappingURL=index.js.map