/**
 * The motion check: given every frame's tracked objects (on-screen centre,
 * area, opacity), flags what reads as jank at speed:
 *
 *   pop       appears or vanishes inside the frame already big (≥ 30% of its
 *             largest on-screen area) and opaque: not grown, faded or flown in
 *   strobe    moves more than ~100 px (at 886 px wide) in one frame: reads as a
 *             jump, not motion, at 30 fps. Slow it, or blur it
 *   teleport  visible on both frames and jumped more than ~300 px
 *   spike     acceleration jumps far above its neighbours': a kink in the curve
 *             (a missing ease, two moves handed off at different speeds)
 *
 * Exempt: frames inside `whips` (deliberate fast moves) skip speed checks;
 * frames inside `covered` (something fills the frame, or a transition hides the
 * scene) skip everything; impacts (a real landing) aren't spikes; entrances
 * and exits that fade, grow or shrink aren't spikes; `seamless` objects (a
 * swap for an identical twin) aren't pops.
 *
 * It only reads positions, so it works for anything you can seek: a realtime
 * page's seek(t), a frame renderer, three.js or the DOM (see collectDom and
 * romp/three).
 */
export function analyze(frames, o = {}) {
    const fps = o.fps ?? 30;
    const scale = (o.width ?? 886) / 886;
    const STROBE = o.strobePx ?? 100 * scale;
    const TELEPORT = o.teleportPx ?? 300 * scale;
    const hidden = (f) => (o.covered ?? []).some(([a, b]) => f / fps >= a && f / fps <= b);
    const inWhip = (f) => (o.whips ?? []).some(([a, b]) => f / fps >= a && f / fps <= b);
    const names = [...new Set(frames.flatMap((fr) => Object.keys(fr.row)))];
    const blank = { x: 0, y: 0, shown: false, onScreen: false, area: 0, opacity: 0 };
    const issues = [];
    for (const name of names) {
        const s = frames.map(({ f, row }) => ({ f, ...(row[name] ?? blank) }));
        const maxArea = Math.max(...s.map((p) => p.area));
        const impacts = new Set((o.impacts?.[name] ?? []).map(Math.round));
        const seamless = (o.seamless ?? []).includes(name) || s.some((p) => p.seamless);
        const isImpact = (i) => s.slice(Math.max(0, i - 2), i + 3).some((p) => p.impact) || [...impacts].some((f) => Math.abs(f - s[i].f) <= 2);
        const acc = s.map((p, i) => {
            if (i === 0 || i === s.length - 1 || !s[i - 1].shown || !p.shown || !s[i + 1].shown)
                return null;
            return Math.hypot(s[i + 1].x - 2 * p.x + s[i - 1].x, s[i + 1].y - 2 * p.y + s[i - 1].y);
        });
        for (let i = 1; i < s.length; i++) {
            const a = s[i - 1], b = s[i];
            if (hidden(a.f) || hidden(b.f) || (s[i + 1] && hidden(s[i + 1].f)))
                continue;
            const edge = b.shown ? b : a;
            if (!seamless && a.shown !== b.shown && edge.onScreen && edge.area > 0.3 * maxArea && edge.opacity > 0.5) {
                issues.push({ frame: b.f, name, kind: "pop", detail: b.shown ? "appears in frame at full size" : "vanishes in frame" });
            }
            if (!a.shown || !b.shown || !(a.onScreen || b.onScreen))
                continue;
            const d = Math.hypot(b.x - a.x, b.y - a.y);
            if (inWhip(b.f))
                continue;
            if (d > TELEPORT)
                issues.push({ frame: b.f, name, kind: "teleport", detail: `${d.toFixed(0)} px in one frame` });
            else if (d > STROBE)
                issues.push({ frame: b.f, name, kind: "strobe", detail: `${d.toFixed(0)} px/frame` });
            const ai = acc[i];
            // Exits fading out accelerate away by design; so do entrances growing in
            // and exits shrinking out: the object is changing size, not lurching.
            const fading = b.opacity < a.opacity - 0.01 || a.opacity < 0.99;
            const near = s.slice(Math.max(0, i - 2), i + 2).filter((p) => p.shown);
            const sizing = near.some((p, k) => k > 0 && Math.abs(p.area - near[k - 1].area) > 0.02 * Math.max(p.area, near[k - 1].area));
            if (ai == null || ai < 6 * scale || fading || sizing || isImpact(i))
                continue;
            const around = acc.slice(Math.max(0, i - 4), i - 1).concat(acc.slice(i + 2, i + 5)).filter((x) => x != null);
            const typical = around.length ? around.sort((x, y) => x - y)[Math.floor(around.length / 2)] : 0;
            if (ai > 3 * typical + 4 * scale)
                issues.push({ frame: b.f, name, kind: "spike", detail: `accel ${ai.toFixed(1)} px/f² vs ~${typical.toFixed(1)} around it` });
        }
    }
    issues.sort((a, b) => a.frame - b.frame);
    return { tracked: names, frames: frames.length, issues };
}
/** Format a report for a terminal. */
export function formatReport(r, fps = 30) {
    if (!r.issues.length)
        return `motion check: ${r.tracked.length} objects over ${r.frames} frames, no issues`;
    const lines = r.issues.map((i) => `  ${String(i.frame).padStart(5)}  ${(i.frame / fps).toFixed(2).padStart(6)}s  ${i.kind.padEnd(8)} ${i.name}: ${i.detail}`);
    return `motion check: ${r.issues.length} issue(s) in ${r.tracked.length} objects over ${r.frames} frames\n${lines.join("\n")}`;
}
//# sourceMappingURL=analyze.js.map