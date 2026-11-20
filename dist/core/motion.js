import { poseAt } from "./stage.js";
const TAU = Math.PI * 2;
export const REST = { squashX: 1, squashY: 1, tilt: 0, lift: 0, blink: 0, jiggle: 0 };
/** A decaying oscillation that is 1 at dt = 0: the "boing". */
export const boing = (dt, freq = 0.11, decay = 0.09) => (dt < 0 ? 0 : Math.exp(-decay * dt) * Math.cos(TAU * freq * dt));
/** Unsynced blinks: each character has its own seed. 0 open … 1 shut. */
export function blinkAt(frame, seed = 0) {
    const period = 70 + ((seed * 37) % 41);
    const t = (((frame + seed * 13) % period) + period) % period;
    return t < 2 ? 1 : t < 4 ? 0.5 : 0;
}
/** Idle: breathing squash, a lazy sway, blinks. */
export function idle(frame, seed = 0) {
    const b = Math.sin((frame + seed * 9) / 9);
    return { squashY: 1 + 0.025 * b, squashX: 1 - 0.018 * b, tilt: 2.5 * Math.sin((frame + seed * 5) / 14), lift: 0, blink: blinkAt(frame, seed), jiggle: 0 };
}
/** Secondary jiggle for loose parts after a jolt at `dt` frames ago. */
export function jiggle(dt, strength = 1) {
    return 10 * strength * Math.exp(-0.08 * Math.max(0, dt)) * Math.sin(TAU * 0.13 * dt + 1.1);
}
/** `jiggle` for several parts at once (a hat's pieces, antennae, dangles): each
 * part lags the one before by `lag` frames, so they follow through in turn
 * instead of moving as one. */
export function jiggleParts(parts, dt, strength = 1, lag = 1.5) {
    const out = {};
    parts.forEach((id, i) => (out[id] = jiggle(dt - i * lag, strength)));
    return out;
}
/** After a landing at frame `land`: squash then wobble back, the hat following through. Before it: stretched in the fall. */
export function landing(frame, land, seed = 0, strength = 1) {
    const dt = frame - land;
    if (dt < 0)
        return { squashY: 1.12, squashX: 0.9, tilt: -6, lift: 1.5, blink: 0, jiggle: 0 };
    const s = 0.26 * strength * boing(dt, 0.12, 0.13);
    const i = idle(frame, seed);
    return {
        squashY: i.squashY - s,
        squashX: i.squashX + s * 0.85,
        tilt: 16 * strength * Math.exp(-0.1 * dt) * Math.sin(TAU * 0.09 * dt + 0.6) + i.tilt,
        lift: Math.max(0, 3 * strength * Math.exp(-0.2 * dt) * Math.sin(TAU * 0.1 * dt)),
        blink: dt < 3 ? 1 : i.blink,
        jiggle: jiggle(dt, strength),
    };
}
/** A continuous hop cycle: `period` frames per hop, `height` px. y is the offset (up is negative in screen space). */
export function hop(frame, period = 16, height = 70, seed = 0) {
    const t = ((((frame + seed * 3) % period) + period) % period) / period;
    const air = Math.sin(Math.PI * t);
    // On the ground (|t| near 0) the body squashes and springs back smoothly;
    // in the air it stretches with its speed (most leaving and arriving, round at
    // the top). Width follows height, so the volume holds.
    const d = Math.min(t, 1 - t);
    const squash = d < 0.16 ? 0.18 * Math.cos((d / 0.16) * (Math.PI / 2)) ** 2 : 0;
    const s = Math.min(1, Math.max(0, (d - 0.04) / 0.22));
    const stretch = 0.1 * Math.abs(Math.cos(Math.PI * t)) * s * s * (3 - 2 * s);
    const squashY = 1 - squash + stretch;
    return {
        y: -height * air,
        pose: {
            squashY,
            squashX: Math.pow(squashY, -0.7),
            tilt: -14 * Math.cos(TAU * (t - 0.18)),
            lift: 3 * air,
            blink: d < 0.06 ? 0.6 : blinkAt(frame, seed),
            jiggle: jiggle(frame % period, 0.8),
        },
    };
}
export function impactResponse(actor, frame, seed = 0, speedRef = 900, style = {}) {
    const SQUASH = style.squash ?? 0.28, WIDEN = style.widen ?? 0.85;
    let s = 0, tilt = 0, lift = 0, shut = 0, jig = 0;
    for (const hit of actor.impacts) {
        const dt = frame - hit.frame;
        if (dt < 0)
            continue;
        const k = Math.min(1.4, hit.speed / speedRef) * (hit.side ? 0.5 : 1);
        s += SQUASH * k * Math.exp(-0.13 * dt) * Math.cos(TAU * 0.12 * dt);
        tilt += 18 * k * Math.exp(-0.1 * dt) * Math.sin(TAU * 0.09 * dt + 0.6);
        lift += Math.max(0, 4 * k * Math.exp(-0.2 * dt) * Math.sin(TAU * 0.1 * dt));
        if (dt < 3 && k > 0.3)
            shut = 1;
        jig += jiggle(dt, k);
    }
    const i = idle(frame, seed);
    const p = poseAt(actor, frame), q = poseAt(actor, frame - 1);
    const fps = 30;
    const v = (p.y - q.y) * fps;
    const falling = v > 300 && actor.impacts.every((h) => h.frame > frame);
    const stretch = falling ? Math.min(0.14, v / 9000) : 0;
    return {
        squashY: i.squashY - s + stretch,
        squashX: i.squashX + s * WIDEN - stretch * 0.6,
        tilt: tilt + i.tilt - stretch * 60,
        lift: lift + stretch * 30,
        blink: shut || i.blink,
        jiggle: jig,
    };
}
/** Is `frame` within `window` frames of one of these impacts? (Mark it for the motion check.) */
export const nearImpact = (impacts, frame, window = 2) => impacts.some((h) => Math.abs(h.frame - frame) <= window);
/** A rigid prop rocking about its contact point after each impact (a damped oscillation), and a barely-there compression. */
export function rock(impacts, frame, fps = 30, o = {}) {
    const w0 = TAU * (o.hz ?? 2.4), zeta = o.zeta ?? 0.5, wd = w0 * Math.sqrt(1 - zeta * zeta);
    let angle = 0, squash = 0;
    for (const hit of impacts) {
        const e = (frame - hit.frame) / fps;
        if (e <= 0)
            continue;
        const dir = Math.abs(hit.vx) > 3 ? -Math.sign(hit.vx) : o.dir ?? 1;
        angle += dir * Math.min(o.max ?? 0.12, hit.speed * 0.0001) * Math.exp(-zeta * w0 * e) * Math.sin(wd * e);
        squash += Math.min(0.03, hit.speed * 0.000025) * Math.exp(-6 * e);
    }
    return { angle, squash };
}
//# sourceMappingURL=motion.js.map