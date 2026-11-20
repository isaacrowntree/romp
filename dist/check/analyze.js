/**
 * The motion check: given every frame's tracked objects (on-screen centre,
 * area, opacity), flags what reads as jank at speed:
 *
 *   pop       appears or vanishes inside the frame already big (≥ 30% of its
 *             largest on-screen area) and opaque: not grown, faded or flown in
 *   strobe    moves more than ~100 px (at 886 px wide) in one frame: reads as a
 *             jump, not motion, at 30 fps. Slow it, or blur it
 *   teleport  visible on both frames and jumped more than ~300 px
 *   jump      moved more than ~40 px in one frame while it sat still (or wasn't
 *             there) for two frames either side: a snap, not a move (a bubble
 *             appearing below its line and jumping up to it). Not at a cut
 *   spike     acceleration jumps far above its neighbours': a kink in the curve
 *             (a missing ease, two moves handed off at different speeds)
 *   lost      has been in frame, then leaves it entirely (still shown) and
 *             stays out for more than `lostSeconds` (1 s): bounced off the
 *             stage or fell out of the picture. `allowExit` marks a real exit.
 *   cropped   shown and on screen, but more than `croppedFraction` (25%) of its
 *             own box is outside the frame for more than `croppedSeconds`
 *             (0.5 s) in a row: a character's head cut off by the edge. Runs
 *             where it's entering or leaving (its on-frame share only rises or
 *             only falls) are fine; needs the collector's `box` and the
 *             frame's `width` and `height`. A `screen` or `focus` that would
 *             fit in the frame must be wholly in it (`screenCroppedFraction`,
 *             1%); one bigger than the frame is a zoom and passes. A sample's
 *             numeric `allowCrop` is its own share
 *   anchor    a text with an `anchor` (another tracked object, its speaker) is
 *             more than `anchorPx` from it, or one with a `ground` (a y in frame
 *             px) shows any of its box below that line
 *   legibility a `screen` (a screenshot or recording of an app or page, with its
 *             `native` width) is drawn so small its body text (`minTextPx`, 16
 *             native px) renders under `legiblePx` (20 px on a 1080 short side)
 *             for more than `legibleSeconds` (0.5 s). Zooming in is fine
 *
 * Exempt: frames inside `whips` (deliberate fast moves) skip speed checks;
 * frames inside `covered` (something fills the frame, or a transition hides the
 * scene) skip everything; impacts (a real landing) aren't spikes; entrances
 * and exits that fade, grow or shrink aren't spikes; `seamless` objects (a
 * swap for an identical twin) aren't pops; `allowCrop` objects (a deliberate
 * close-up, a background running off the edge) aren't cropped.
 *
 * Text rules (text.ts) run over samples that carry a `role`: words a viewer has
 * to read (`text`), the thing being talked about (`focus`) and everything else
 * that moves (`prop`): offsafe, covers, overlap, unfinished, unread, empty and
 * (opt-in) stale. Screens, text size and anchors are in screen.ts; blank,
 * clipped and occupancy in layout.ts.
 *
 * `layoutOnly` (sampled frames, `romp check --every N`): only the rules that
 * read one frame's layout run (cropped, offsafe, covers, overlap, legibility,
 * anchor, clipped, blank, occupancy); the motion rules and the timing text rules
 * (pop, strobe, teleport, jump, spike, lost, unfinished, unread, empty, stale)
 * need every frame and are skipped.
 *
 * It only reads positions, so it works for anything you can seek: a realtime
 * page's seek(t), a frame renderer, three.js or the DOM (see collectDom and
 * romp/three).
 */
import { textIssues } from "./text.js";
import { screenIssues } from "./screen.js";
import { layoutIssues } from "./layout.js";
export function analyze(frames, o = {}) {
    const fps = o.fps ?? 30;
    const scale = (o.width ?? 886) / 886;
    const STROBE = o.strobePx ?? 100 * scale;
    const TELEPORT = o.teleportPx ?? 300 * scale;
    const JUMP = o.jumpPx ?? 40 * scale;
    // Positions jump at a scene cut by design.
    const cutAt = new Set((o.scenes ?? []).map((t) => Math.round(t * fps)));
    const hidden = (f) => (o.covered ?? []).some(([a, b]) => f / fps >= a && f / fps <= b);
    const inWhip = (f) => (o.whips ?? []).some(([a, b]) => f / fps >= a && f / fps <= b);
    const names = [...new Set(frames.flatMap((fr) => Object.keys(fr.row)))];
    const blank = { x: 0, y: 0, shown: false, onScreen: false, area: 0, opacity: 0 };
    const issues = [];
    for (const name of o.layoutOnly ? [] : names) {
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
            if (inWhip(b.f) || cutAt.has(b.f))
                continue;
            if (d > TELEPORT)
                issues.push({ frame: b.f, name, kind: "teleport", detail: `${d.toFixed(0)} px in one frame` });
            else if (d > STROBE)
                issues.push({ frame: b.f, name, kind: "strobe", detail: `${d.toFixed(0)} px/frame` });
            else if (d > JUMP && !isImpact(i)) {
                // A snap: still (or absent) two frames either side, then one big move.
                const step = (j) => (j >= 1 && j < s.length && s[j - 1].shown && s[j].shown ? Math.hypot(s[j].x - s[j - 1].x, s[j].y - s[j - 1].y) : 0);
                const around = Math.max(step(i - 2), step(i - 1), step(i + 1), step(i + 2));
                const resized = Math.abs(b.area - a.area) > 0.1 * Math.max(a.area, b.area);
                if (d > 4 * around && !resized) {
                    issues.push({ frame: b.f, name, kind: "jump", detail: `snapped ${d.toFixed(0)} px in one frame between still frames` });
                    continue;
                }
            }
            const ai = acc[i];
            // Exits fading out accelerate away by design; so do entrances growing in
            // and exits shrinking out: the object is changing size, not lurching.
            const fading = b.opacity < a.opacity - 0.01 || a.opacity < 0.99;
            const near = s.slice(Math.max(0, i - 2), i + 2).filter((p) => p.shown);
            const sizing = near.some((p, k) => k > 0 && Math.abs(p.area - near[k - 1].area) > 0.02 * Math.max(p.area, near[k - 1].area));
            const nearCut = cutAt.has(b.f) || cutAt.has(b.f + 1) || cutAt.has(a.f);
            if (ai == null || ai < 6 * scale || fading || sizing || nearCut || isImpact(i))
                continue;
            const around = acc.slice(Math.max(0, i - 4), i - 1).concat(acc.slice(i + 2, i + 5)).filter((x) => x != null);
            const typical = around.length ? around.sort((x, y) => x - y)[Math.floor(around.length / 2)] : 0;
            if (ai > 3 * typical + 4 * scale)
                issues.push({ frame: b.f, name, kind: "spike", detail: `accel ${ai.toFixed(1)} px/f² vs ~${typical.toFixed(1)} around it` });
        }
    }
    if (o.width && o.height)
        issues.push(...cropped(frames, names, o, fps, hidden), ...(o.layoutOnly ? [] : lost(frames, names, o, fps, hidden)));
    issues.push(...textIssues(frames, names, o, fps, hidden), ...screenIssues(frames, names, o, fps, hidden), ...layoutIssues(frames, names, o, fps, hidden));
    issues.sort((a, b) => a.frame - b.frame);
    return { tracked: names, frames: frames.length, issues };
}
/** The share of a box inside a W×H frame (0..1). */
export function inFrameShare(b, W, H) {
    const area = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
    if (area <= 0)
        return 1;
    const w = Math.max(0, Math.min(b.x1, W) - Math.max(b.x0, 0));
    const h = Math.max(0, Math.min(b.y1, H) - Math.max(b.y0, 0));
    return (w * h) / area;
}
function cropped(frames, names, o, fps, hidden) {
    const W = o.width, H = o.height;
    const loose = o.croppedFraction ?? 0.25, tight = o.screenCroppedFraction ?? 0.01;
    const minRun = Math.round((o.croppedSeconds ?? 0.5) * fps);
    const out = [];
    for (const name of names) {
        if ((o.allowCrop ?? []).includes(name))
            continue;
        const role = frames.find((fr) => fr.row[name]?.role)?.row[name].role;
        const strict = role === "screen" || role === "focus";
        // Runs of frames where it's shown, on screen, not covered and too far out of frame.
        let run = [];
        let tightRun = false;
        const flush = () => {
            if (run.length > minRun) {
                const eps = 0.005;
                const rising = run.every((p, k) => k === 0 || p.share >= run[k - 1].share - eps);
                const falling = run.every((p, k) => k === 0 || p.share <= run[k - 1].share + eps);
                const moving = Math.abs(run[run.length - 1].share - run[0].share) > 0.02;
                if (!(moving && (rising || falling))) {
                    const worst = Math.min(...run.map((p) => p.share));
                    const pct = (1 - worst) * 100;
                    out.push({ frame: run[0].f, name, kind: "cropped", detail: `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% of it outside the frame for ${(run.length / fps).toFixed(2)} s${tightRun ? ` (a ${role} that fits in the frame must be wholly in it)` : ""}` });
                }
            }
            run = [];
            tightRun = false;
        };
        for (const { f, row } of frames) {
            const p = row[name];
            if (!p || p.allowCrop === true || (typeof p.allowCrop === "number" && p.allowCrop >= 1)) {
                flush();
                if (p)
                    break;
                continue;
            }
            const share = p.box ? inFrameShare(p.box, W, H) : 1;
            // A screen or focus bigger than the frame is a zoom: let it run off.
            const fits = !!p.box && p.box.x1 - p.box.x0 <= W + 1 && p.box.y1 - p.box.y0 <= H + 1;
            if (strict && !fits && typeof p.allowCrop !== "number") {
                flush();
                continue;
            }
            const isTight = typeof p.allowCrop !== "number" && strict;
            const allowed = typeof p.allowCrop === "number" ? p.allowCrop : isTight ? tight : loose;
            if (p.shown && p.onScreen && !hidden(f) && share < 1 - allowed) {
                run.push({ f, share });
                if (isTight)
                    tightRun = true;
            }
            else
                flush();
        }
        flush();
    }
    return out;
}
/**
 * lost: a character that has been in frame leaves it entirely (while still
 * shown) and stays out for more than `lostSeconds`: it bounced off the stage,
 * fell through the floor, or wandered off. An exit on purpose is marked
 * `allowExit`. Entrances from off-frame are fine (it hasn't been in frame yet).
 */
function lost(frames, names, o, fps, hidden) {
    const W = o.width, H = o.height;
    const minRun = Math.round((o.lostSeconds ?? 1) * fps);
    const out = [];
    for (const name of names) {
        if ((o.allowExit ?? []).includes(name))
            continue;
        let seen = false;
        let leftAt = null;
        let leftBehind = false;
        let outFor = 0;
        let flagged = false;
        for (const { f, row } of frames) {
            const p = row[name];
            if (!p || !p.shown || p.allowExit) {
                leftAt = null;
                outFor = 0;
                if (p?.allowExit)
                    break;
                continue;
            }
            if (hidden(f))
                continue;
            const share = p.box ? inFrameShare(p.box, W, H) : p.onScreen ? 1 : 0;
            const outside = share <= 0.02 && !p.onScreen ? true : share <= 0.02;
            if (!outside) {
                if (share > 0.5)
                    seen = true;
                leftAt = null;
                outFor = 0;
                leftBehind = false;
                continue;
            }
            if (!seen)
                continue; // still entering
            if (leftAt == null) {
                // Left behind by a moving camera: not lost.
                if (p.cameraLeft)
                    leftBehind = true;
                leftAt = f;
            }
            if (leftBehind)
                continue;
            outFor++;
            if (outFor > minRun && !flagged) {
                out.push({ frame: leftAt, name, kind: "lost", detail: `left the frame and stayed out for over ${(minRun / fps).toFixed(1)} s` });
                flagged = true;
            }
        }
    }
    return out;
}
/** Format a report for a terminal. */
export function formatReport(r, fps = 30) {
    const warn = r.warnings?.length ? `\nwarning: ${r.warnings.join("\nwarning: ")}` : "";
    if (!r.issues.length)
        return `motion check: ${r.tracked.length} objects over ${r.frames} frames, no issues${warn}`;
    const lines = r.issues.map((i) => `  ${String(i.frame).padStart(5)}  ${(i.frame / fps).toFixed(2).padStart(6)}s  ${i.kind.padEnd(10)} ${i.name}: ${i.detail}`);
    return `motion check: ${r.issues.length} issue(s) in ${r.tracked.length} objects over ${r.frames} frames\n${lines.join("\n")}${warn}`;
}
//# sourceMappingURL=analyze.js.map