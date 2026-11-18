// ── Seeded randomness: a hash of (seed, particle, channel) ────────────────
/** A uniform 0…1 from a seed, an index and a channel: random access, no state.
 * Changing `count` never reshuffles the particles you already had. */
export function hash01(seed, i, k) {
    let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((i | 0) + 1, 0xc2b2ae35) ^ Math.imul((k | 0) + 1, 0x27d4eb2f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}
const pick = (r, u, def) => (r == null ? def : typeof r === "number" ? r : r[0] + (r[1] - r[0]) * u);
const hi = (r, def) => (r == null ? def : typeof r === "number" ? r : Math.max(r[0], r[1]));
const easeOut = (u) => 1 - (1 - u) ** 3;
const TAU = Math.PI * 2;
const HZ = 240;
const MAX_BOUNCES = 8;
/** below this speed into the ground (px/s) a bounce stops: it rests */
const REST_SPEED = 45;
const DEFAULT_COLORS = ["#4361EE", "#22D3EE", "#F472B6", "#FDE68A", "#34D399", "#C4B5FD"];
/** A deterministic particle emitter. Read it with `particlesAt(frame)`. */
export class Emitter {
    o;
    fps;
    /** total particles */
    count;
    launches = new Map();
    legs = new Map();
    segs;
    constructor(o) {
        this.o = o;
        this.fps = o.fps ?? 30;
        if (o.count == null && (o.rate == null || o.until == null))
            throw new Error("romp: an emitter needs `count`, or `rate` and `until`");
        this.count = Math.max(0, Math.floor(o.count ?? ((o.until - (o.at ?? 0)) / this.fps) * o.rate));
        this.segs = grounds(o.ground);
    }
    get id() {
        return this.o.id;
    }
    /** Seconds after `at` that particle i leaves. */
    bornAt(i) {
        return this.o.rate ? i / this.o.rate : 0;
    }
    /** The first and last frame any particle is alive. */
    get span() {
        const at = this.o.at ?? 0;
        return [at, at + (this.bornAt(Math.max(0, this.count - 1)) + hi(this.o.life, 1.2)) * this.fps];
    }
    launch(i) {
        let l = this.launches.get(i);
        if (l)
            return l;
        const o = this.o, s = o.seed ?? 1;
        const r = (k) => hash01(s, i, k);
        const dir = (o.direction ?? -Math.PI / 2) + ((o.spread ?? TAU) * (r(0) - 0.5));
        const sp = pick(o.speed, r(1), 600);
        const colors = o.colors?.length ? o.colors : DEFAULT_COLORS;
        const shapes = o.shapes?.length ? o.shapes : ["circle"];
        l = {
            born: this.bornAt(i),
            life: pick(o.life, r(2), 1.2),
            x: o.area ? o.area.x0 + (o.area.x1 - o.area.x0) * r(3) : o.x ?? 0,
            y: o.area ? o.area.y0 + (o.area.y1 - o.area.y0) * r(4) : o.y ?? 0,
            vx: Math.cos(dir) * sp,
            vy: Math.sin(dir) * sp,
            size: pick(o.size, r(5), 8),
            angle: r(6) * TAU,
            spin: pick(o.spin, r(7), 0),
            flipHz: pick(o.flip, r(8), 0),
            flip0: r(9) * TAU,
            sway: pick(o.sway, r(10), 0),
            swayHz: pick(o.swayHz ?? [0.2, 0.5], r(11), 0.3),
            sway0: r(12) * TAU,
            color: colors[Math.floor(r(13) * colors.length) % colors.length],
            shape: shapes[Math.floor(r(14) * shapes.length) % shapes.length],
        };
        this.launches.set(i, l);
        return l;
    }
    /** Base flight (no sway) τ seconds into a leg. */
    fly(leg, tau) {
        const k = this.o.drag ?? 0, ax = this.o.wind ?? 0, ay = this.o.gravity ?? 1200;
        if (leg.rest)
            return { x: leg.x, y: leg.y, vx: 0, vy: 0 };
        if (k <= 1e-9)
            return { x: leg.x + leg.vx * tau + 0.5 * ax * tau * tau, y: leg.y + leg.vy * tau + 0.5 * ay * tau * tau, vx: leg.vx + ax * tau, vy: leg.vy + ay * tau };
        const E = Math.exp(-k * tau), tx = ax / k, ty = ay / k;
        return {
            x: leg.x + tx * tau + ((leg.vx - tx) * (1 - E)) / k,
            y: leg.y + ty * tau + ((leg.vy - ty) * (1 - E)) / k,
            vx: tx + (leg.vx - tx) * E,
            vy: ty + (leg.vy - ty) * E,
        };
    }
    swayAt(l, age) {
        return l.sway ? l.sway * Math.sin(TAU * l.swayHz * age + l.sway0) - l.sway * Math.sin(l.sway0) : 0;
    }
    /** Spin accumulated by `age` (it slows with drag, like the flight). */
    turned(l, age) {
        const k = this.o.drag ?? 0;
        return l.angle + l.spin * (k > 1e-9 ? (1 - Math.exp(-k * age)) / k : age);
    }
    /** The legs of particle i's flight: one, or one per bounce. Found once, then reused. */
    flight(i) {
        let legs = this.legs.get(i);
        if (legs)
            return legs;
        const l = this.launch(i);
        legs = [{ start: 0, x: l.x, y: l.y, vx: l.vx, vy: l.vy, rest: false }];
        const segs = this.segs;
        if (segs.length) {
            const h = 1 / HZ;
            const pos = (leg, age) => {
                const p = this.fly(leg, age - leg.start);
                return { ...p, x: p.x + this.swayAt(l, age) };
            };
            let leg = legs[0], prev = pos(leg, 0), skip = -1;
            for (let age = h; age <= l.life + 1e-9 && legs.length <= MAX_BOUNCES; age += h) {
                const cur = pos(leg, age);
                let hit = null;
                for (let s = 0; s < segs.length; s++) {
                    if (s === skip)
                        continue;
                    const u = cross(prev, cur, segs[s]);
                    if (u != null && (!hit || u < hit.u))
                        hit = { u, s };
                }
                skip = -1;
                if (hit) {
                    const g = segs[hit.s];
                    const when = age - h + hit.u * h;
                    const at = { x: prev.x + (cur.x - prev.x) * hit.u, y: prev.y + (cur.y - prev.y) * hit.u };
                    const v = this.fly(leg, when - leg.start);
                    // The ground's normal, facing the particle.
                    let nx = -(g.by - g.ay), ny = g.bx - g.ax;
                    const nl = Math.hypot(nx, ny) || 1;
                    nx /= nl;
                    ny /= nl;
                    if (v.vx * nx + v.vy * ny > 0) {
                        nx = -nx;
                        ny = -ny;
                    }
                    const vn = v.vx * nx + v.vy * ny;
                    const tx = v.vx - vn * nx, ty = v.vy - vn * ny;
                    const out = -vn * (this.o.bounce ?? 0.3), keep = this.o.friction ?? 0.6;
                    const floorLike = ny < -0.5;
                    const ax = at.x + nx * 0.01, ay = at.y + ny * 0.01;
                    if ((floorLike && out < REST_SPEED) || legs.length === MAX_BOUNCES) {
                        const angle = this.o.align ? Math.atan2(v.vy, v.vx) : this.turned(l, when);
                        legs.push({ start: when, x: ax, y: ay, vx: 0, vy: 0, rest: true, angle, flip: l.flipHz ? Math.cos(TAU * l.flipHz * when + l.flip0) : 1 });
                        break;
                    }
                    // The base position excludes the sway, so the next leg starts where the drawn particle is.
                    leg = { start: when, x: ax - this.swayAt(l, when), y: ay, vx: tx * keep + nx * out, vy: ty * keep + ny * out, rest: false };
                    legs.push(leg);
                    prev = pos(leg, when);
                    skip = hit.s;
                    age = when;
                    continue;
                }
                prev = cur;
            }
        }
        this.legs.set(i, legs);
        return legs;
    }
    /** Particle i at film time t (seconds), or null when it isn't alive. */
    one(i, t) {
        const o = this.o, l = this.launch(i);
        const age = t - (o.at ?? 0) / this.fps - l.born;
        if (age < 0 || age >= l.life)
            return null;
        const legs = this.flight(i);
        let leg = legs[0];
        for (const g of legs)
            if (g.start <= age)
                leg = g;
        const f = this.fly(leg, age - leg.start);
        const x = leg.rest ? f.x : f.x + this.swayAt(l, age);
        const grow = o.grow ?? 0.08, shrink = o.shrink ?? 0, fadeIn = o.fadeIn ?? 0, fadeOut = o.fadeOut ?? 0.3;
        const left = l.life - age;
        const size = l.size * (grow > 0 ? easeOut(Math.min(1, age / grow)) : 1) * (shrink > 0 ? Math.min(1, left / shrink) : 1);
        const opacity = (fadeIn > 0 ? Math.min(1, age / fadeIn) : 1) * (fadeOut > 0 ? Math.min(1, left / fadeOut) : 1);
        const speed = Math.hypot(f.vx, f.vy);
        const angle = leg.rest ? leg.angle : o.align ? Math.atan2(f.vy, f.vx) : this.turned(l, age);
        return {
            i,
            emitter: o.id,
            x,
            y: f.y,
            x0: l.x,
            y0: l.y,
            vx: f.vx,
            vy: f.vy,
            angle,
            size,
            length: size + speed * (o.stretch ?? 0) * (size / l.size || 0),
            flip: leg.rest ? leg.flip : l.flipHz ? Math.cos(TAU * l.flipHz * age + l.flip0) : 1,
            opacity,
            color: l.color,
            shape: l.shape,
            age,
            life: l.life,
            resting: leg.rest,
        };
    }
    /** Every live particle at a (fractional) frame: a pure function of the frame. */
    particlesAt(frame) {
        const t = frame / this.fps;
        const out = [];
        if (!this.count)
            return out;
        // A stream: only the particles that can be alive now.
        let i0 = 0, i1 = this.count - 1;
        if (this.o.rate) {
            const since = t - (this.o.at ?? 0) / this.fps;
            i0 = Math.max(0, Math.floor((since - hi(this.o.life, 1.2)) * this.o.rate) - 1);
            i1 = Math.min(this.count - 1, Math.ceil(since * this.o.rate));
        }
        for (let i = i0; i <= i1; i++) {
            const p = this.one(i, t);
            if (p)
                out.push(p);
        }
        return out;
    }
}
/** Every live particle of one or several emitters at a (fractional) frame. */
export function particlesAt(emitters, frame) {
    const list = Array.isArray(emitters) ? emitters : [emitters];
    return list.flatMap((e) => e.particlesAt(frame));
}
/** The ground polylines as segments. */
function grounds(g) {
    if (g == null)
        return [];
    // One ground (a y, or a polyline of points), or a list of them.
    const one = typeof g === "number" || (g.length > 0 && typeof g[0] === "object" && !Array.isArray(g[0]));
    const list = (one ? [g] : g);
    const out = [];
    for (const one of list) {
        if (typeof one === "number")
            out.push({ ax: -1e6, ay: one, bx: 1e6, by: one });
        else
            for (let k = 0; k + 1 < one.length; k++)
                out.push({ ax: one[k].x, ay: one[k].y, bx: one[k + 1].x, by: one[k + 1].y });
    }
    return out;
}
/** Where the step p→q crosses segment g, as a fraction of the step (0…1), or null. */
function cross(p, q, g) {
    const rx = q.x - p.x, ry = q.y - p.y, sx = g.bx - g.ax, sy = g.by - g.ay;
    const d = rx * sy - ry * sx;
    if (Math.abs(d) < 1e-12)
        return null;
    const u = ((g.ax - p.x) * sy - (g.ay - p.y) * sx) / d;
    const v = ((g.ax - p.x) * ry - (g.ay - p.y) * rx) / d;
    // u > 0: a particle that starts on a ground (a fountain at floor level) leaves it, it doesn't hit it.
    return u > 1e-9 && u <= 1 && v >= 0 && v <= 1 ? u : null;
}
/** Confetti: a burst of paper that tumbles, flutters and drifts down. */
export const confetti = (o = {}) => ({
    count: 80,
    direction: -Math.PI / 2,
    spread: Math.PI * 0.55,
    speed: [500, 1100],
    gravity: 900,
    drag: 2.4,
    life: [2.2, 3.2],
    size: [9, 15],
    spin: [-7, 7],
    flip: [0.8, 2.4],
    sway: [4, 14],
    swayHz: [0.6, 1.4],
    shapes: ["rect", "square", "rect", "circle"],
    grow: 0.08,
    fadeOut: 0.5,
    ...o,
});
/** Sparks: a quick, bright, radial spray of streaks that fall and die. */
export const sparks = (o = {}) => ({
    count: 36,
    speed: [350, 1100],
    gravity: 1400,
    drag: 3.5,
    life: [0.25, 0.6],
    size: [2.5, 4.5],
    align: true,
    stretch: 0.025,
    shapes: ["line"],
    colors: ["#FFF7D6", "#FFD166", "#FF9F1C", "#FF6B35"],
    grow: 0.03,
    fadeOut: 0.2,
    shrink: 0.15,
    bounce: 0.4,
    ...o,
});
/** Snow: a stream drifting down from a line above the frame, swaying as it falls. */
export const snow = (o) => {
    const { width, height = width, ...rest } = o;
    return {
        rate: 24,
        area: { x0: -20, y0: -20, x1: width + 20, y1: -20 },
        direction: Math.PI / 2,
        spread: 0.5,
        speed: [20, 60],
        gravity: 70,
        drag: 0.9,
        sway: [8, 24],
        swayHz: [0.15, 0.4],
        // long enough to cross the frame at the drift speed (≈ gravity / drag)
        life: [(height + 40) / 70, (height + 40) / 55],
        size: [3, 8],
        colors: ["#FFFFFF"],
        grow: 0,
        fadeIn: 0.4,
        fadeOut: 0.8,
        ...rest,
    };
};
/** A fountain: a stream thrown up in a narrow cone, arcing back down. */
export const fountain = (o = {}) => ({
    rate: 60,
    direction: -Math.PI / 2,
    spread: 0.35,
    speed: [700, 950],
    gravity: 1500,
    drag: 0.3,
    life: [1, 1.4],
    size: [4, 8],
    colors: ["#22D3EE", "#4361EE", "#A5F3FC"],
    fadeOut: 0.3,
    ...o,
});
// ── Drawing ─────────────────────────────────────────────────────────────────
/** A particle's drawn width and height, px (before `flip`). */
export function particleBox(p) {
    switch (p.shape) {
        case "line":
            return { w: Math.max(p.length, p.size), h: Math.max(1, p.size / 2) };
        case "rect":
            return { w: p.size, h: p.size * 0.55 };
        default:
            return { w: p.size, h: p.size };
    }
}
const CLIP = {
    triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
    star: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
};
/** Inline CSS for one absolutely positioned element per particle (DOM, Remotion). */
export function particleStyle(p) {
    const { w, h } = particleBox(p);
    const style = {
        position: "absolute",
        left: 0,
        top: 0,
        width: `${w}px`,
        height: `${h}px`,
        background: p.color,
        opacity: p.opacity,
        transform: `translate(${p.x - w / 2}px, ${p.y - h / 2}px) rotate(${p.angle}rad) scaleY(${p.flip})`,
        pointerEvents: "none",
    };
    if (p.shape === "circle" || p.shape === "line")
        style.borderRadius = `${Math.min(w, h) / 2}px`;
    const clip = CLIP[p.shape];
    if (clip)
        style.clipPath = clip;
    return style;
}
/** Draw particles onto a canvas 2D context. */
export function drawParticles(ctx, particles) {
    for (const p of particles) {
        if (p.opacity <= 0 || p.size <= 0)
            continue;
        const { w, h } = particleBox(p);
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(1, p.flip);
        ctx.beginPath();
        if (p.shape === "circle")
            ctx.arc(0, 0, w / 2, 0, TAU);
        else if (p.shape === "line") {
            if (ctx.roundRect)
                ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
            else
                ctx.rect(-w / 2, -h / 2, w, h);
        }
        else if (p.shape === "triangle") {
            ctx.moveTo(0, -h / 2);
            ctx.lineTo(w / 2, h / 2);
            ctx.lineTo(-w / 2, h / 2);
        }
        else if (p.shape === "star") {
            for (let k = 0; k < 10; k++) {
                const r = (k % 2 ? 0.4 : 1) * (w / 2), a = -Math.PI / 2 + (k * Math.PI) / 5;
                ctx[k ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
            }
        }
        else
            ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.restore();
    }
}
// ── The motion check ─────────────────────────────────────────────────────────
/** The bounding box of a set of particles, px (null when there are none). */
export function particleBounds(particles) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of particles) {
        if (p.opacity <= 0.01)
            continue;
        const { w, h } = particleBox(p);
        const r = Math.max(w, h) / 2;
        x0 = Math.min(x0, p.x - r);
        y0 = Math.min(y0, p.y - r);
        x1 = Math.max(x1, p.x + r);
        y1 = Math.max(y1, p.y + r);
    }
    return x1 >= x0 ? { x0, y0, x1, y1 } : null;
}
/**
 * A whole burst as ONE motion-check sample: its box, its strongest opacity,
 * and, as its centre, where its particles left from (weighted by opacity).
 * A burst spreading out is a change of size, not a move, so the centre stays
 * put: the last far-flung spark fading out doesn't jerk it. Single sparks fly
 * faster than the strobe limit by design; the burst as a whole grows in from
 * nothing and fades out, so it checks clean.
 */
export function particleSample(particles, frame) {
    const box = particleBounds(particles);
    if (!box)
        return { x: 0, y: 0, shown: false, onScreen: false, area: 0, opacity: 0 };
    let sx = 0, sy = 0, sw = 0, op = 0;
    for (const p of particles) {
        sx += p.x0 * p.opacity;
        sy += p.y0 * p.opacity;
        sw += p.opacity;
        op = Math.max(op, p.opacity);
    }
    // Without the frame's size, the whole box counts as on screen.
    const visW = frame ? Math.max(0, Math.min(box.x1, frame.width) - Math.max(box.x0, 0)) : box.x1 - box.x0;
    const visH = frame ? Math.max(0, Math.min(box.y1, frame.height) - Math.max(box.y0, 0)) : box.y1 - box.y0;
    return {
        x: sx / sw,
        y: sy / sw,
        shown: op > 0.01,
        onScreen: frame ? visW > 0 && visH > 0 : true,
        area: visW * visH,
        opacity: op,
        box,
    };
}
//# sourceMappingURL=index.js.map