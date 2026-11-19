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
export { captionTiming, captionAt, readingTime, timeline } from "../timing/index.js";
import { particleSample } from "../particles/index.js";
/** Data attributes for the motion check: spread them on the element to track. */
export function track(name, o = {}) {
    return {
        "data-romp": name,
        "data-romp-impact": o.impact ? "1" : undefined,
        "data-romp-seamless": o.seamless ? "1" : undefined,
        "data-romp-allow-crop": o.allowCrop ? "1" : undefined,
        "data-romp-allow-exit": o.allowExit ? "1" : undefined,
        "data-romp-role": o.role,
        "data-romp-allow": o.allow?.length ? o.allow.join(",") : undefined,
        "data-romp-z": o.z != null ? String(o.z) : undefined,
    };
}
/**
 * Track words on screen (a caption, a speech bubble, a heading) for the text
 * rules: its whole text, and how many characters of it are showing.
 *
 *   const t = captionTiming(line);
 *   const typed = t.typed(frame - from);
 *   <div {...trackText(`bubble:${from}`, line, { typed })}>{line.slice(0, typed)}</div>
 */
export function trackText(name, text, o = {}) {
    const total = [...text.replace(/\*/g, "")].length;
    return {
        ...track(name, { ...o, role: "text" }),
        "data-romp-text": text.replace(/\*/g, ""),
        "data-romp-chars-total": String(total),
        "data-romp-chars-shown": String(Math.max(0, Math.min(total, o.typed ?? total))),
        "data-romp-heading": o.heading ? "1" : undefined,
    };
}
/** Props for a `<Sequence>` (or a `TransitionSeries.Sequence`'s length) from a placed scene. */
export function sceneSequence(scene) {
    return { from: scene.start, durationInFrames: scene.frames, name: scene.name };
}
/**
 * Track a particle burst as ONE object: props for an empty element centred on
 * where the burst comes from, covering all of it, at its strongest opacity. Render it next to the
 * particles (untracked themselves: single sparks outrun the strobe limit by
 * design) and the motion check sees the burst grow in, travel and fade out.
 *
 *   const sparks = emitter.particlesAt(frame);
 *   <div {...trackBurst("sparks", sparks)} />
 *   {sparks.map((p) => <i key={p.i} style={particleStyle(p)} />)}
 */
export function trackBurst(name, particles, o = {}) {
    const s = particleSample(particles);
    const b = s.box;
    // Centred on where the burst comes from (the DOM collector reads an element's
    // centre), and wide enough to cover every particle.
    const rx = b ? Math.max(s.x - b.x0, b.x1 - s.x) : 0, ry = b ? Math.max(s.y - b.y0, b.y1 - s.y) : 0;
    return {
        ...track(name, o),
        style: {
            position: "absolute",
            left: s.x - rx,
            top: s.y - ry,
            width: 2 * rx,
            height: 2 * ry,
            opacity: s.opacity,
            display: s.shown ? "block" : "none",
            pointerEvents: "none",
        },
    };
}
//# sourceMappingURL=index.js.map