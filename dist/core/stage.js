/**
 * The physics stage: one Box2D world (planck.js) per scene. Choreography says
 * where and when; physics says how.
 *
 * A scene is simulated ONCE, in fixed steps, and every actor's pose is stored
 * per frame. Reading a pose afterwards is a pure function of time, so the same
 * motion plays in a realtime viewer (seconds, interpolated), a frame-by-frame
 * renderer (frames), a scrubber, and the motion check.
 *
 * Units: metres in the world, px on screen (`pxPerMetre`). Screen space
 * (`yDown: true`, the default: DOM, canvas, Remotion) has gravity pointing +y;
 * y-up space (`yDown: false`: three.js) has gravity pointing −y.
 */
import { Box, Chain, Circle, Edge, Polygon, Vec2, WeldJoint, World } from "planck";
/** Collision layers. Combine with `|`. Everything touches FLOOR by default. */
export const LAYER = { FLOOR: 0x0001, A: 0x0002, B: 0x0004, C: 0x0008, D: 0x0010 };
export class Stage {
    world;
    ppm;
    yDown;
    actors = [];
    fps = 30;
    baked = false;
    constructor(o = {}) {
        this.ppm = o.pxPerMetre ?? 100;
        this.yDown = o.yDown ?? true;
        const g = o.gravity ?? 9.81 * 2.2;
        this.world = new World({ gravity: Vec2(0, this.yDown ? g : -g) });
    }
    /** px → metres */
    m = (px) => px / this.ppm;
    /** metres → px */
    px = (metres) => metres * this.ppm;
    /** screen px point → world Vec2 */
    v = (x, y) => Vec2(this.m(x), this.m(y));
    /** Static ground along a polyline (px). */
    ground(points, o = {}) {
        const b = this.world.createBody();
        b.createFixture(Chain(points.map((p) => this.v(p.x, p.y)), false), { friction: o.friction ?? 0.8, filterCategoryBits: o.layer ?? LAYER.FLOOR });
        return b;
    }
    add(actor) {
        actor.stage = this;
        actor.build(this);
        this.actors.push(actor);
        return actor;
    }
    /** Simulate frames 0…n (or 0…duration s) at `hz`, storing one pose per frame per actor. */
    bake(o) {
        this.fps = o.fps ?? 30;
        const hz = o.hz ?? 240;
        const n = o.frames ?? Math.ceil((o.duration ?? 0) * this.fps);
        const dt = 1 / hz;
        const per = Math.max(1, Math.round(hz / this.fps));
        for (const a of this.actors)
            a.frames = [];
        let t = 0;
        for (let f = 0; f <= n; f++) {
            for (const a of this.actors)
                a.frames.push(a.sample(t));
            for (let s = 0; s < per; s++) {
                for (const a of this.actors)
                    a.control?.(t, dt);
                this.world.step(dt, 10, 8);
                t += dt;
            }
        }
        this.baked = true;
        return this;
    }
    /**
     * The live-viewer convenience: every actor's interpolated pose at time `t`
     * (seconds) handed to its `apply(pose, t)`. A pose with a NaN anywhere is
     * passed as `{ shown: false }` (a NaN position corrupts a renderer's depth
     * sort, so it's treated as hidden).
     */
    pose(t, o = {}) {
        for (const a of this.actors) {
            if (!a.apply || !a.frames?.length)
                continue;
            const p = rawPoseAt(a, t * this.fps, o);
            a.apply(hasNaN(p) ? { shown: false } : p, t);
        }
    }
    get(id) {
        const a = this.actors.find((x) => x.id === id);
        if (!a)
            throw new Error(`romp: no actor "${id}"`);
        return a;
    }
}
function rawPoseAt(a, frame, o = {}) {
    const fr = a.frames;
    if (!fr || fr.length === 0)
        throw new Error("romp: bake() the stage before reading poses");
    const i = Math.max(0, Math.min(fr.length - 1, Math.floor(frame)));
    const j = Math.min(fr.length - 1, i + 1);
    const x = Math.min(1, Math.max(0, frame - i));
    return blend(fr[i], fr[j], x, o.discrete ?? "nearest");
}
/** An actor's pose at a fractional FRAME (offline renderers: Remotion, seek(t)×fps). */
export function poseAt(a, frame, o = {}) {
    const p = rawPoseAt(a, frame, o);
    return hasNaN(p) ? { ...p, shown: false } : p;
}
/** An actor's pose at a time in SECONDS (realtime viewers), interpolated. */
export function poseAtTime(a, t, fps = 30, o = {}) {
    return poseAt(a, t * fps, o);
}
function blend(a, b, x, mode) {
    const pick = () => (mode === "previous" ? (x < 1 ? a : b) : x < 0.5 ? a : b);
    if (typeof a === "number")
        return a + (b - a) * x;
    if (typeof a !== "object" || a === null)
        return pick();
    if (Array.isArray(a))
        return a.map((v, k) => blend(v, b[k], x, mode));
    const A = a, B = b;
    if (A.shown === false || B.shown === false)
        return pick();
    const out = {};
    for (const k of Object.keys(A))
        out[k] = blend(A[k], B[k], x, mode);
    return out;
}
function hasNaN(v) {
    if (typeof v === "number")
        return Number.isNaN(v);
    if (v && typeof v === "object")
        return Object.values(v).some(hasNaN);
    return false;
}
/** Memoise a baked stage per key: build once, read every frame. */
const cache = new Map();
export function baked(key, build) {
    let s = cache.get(key);
    if (!s) {
        s = build();
        cache.set(key, s);
    }
    return s;
}
/** Forget memoised stages (tests, hot reload). */
export const clearBaked = () => cache.clear();
/**
 * A rigid body with its impacts recorded: a character, a prop, a drop of
 * anything. Pose = centre (px) and angle; `impacts` drive squash, wobble and
 * sound.
 */
export class Body {
    o;
    id;
    body;
    impacts = [];
    frames;
    lastV = 0;
    stage;
    constructor(o) {
        this.o = o;
        this.id = o.id;
    }
    get spawnFrame() {
        return this.o.spawn ?? 0;
    }
    build(stage) {
        this.stage = stage;
        const o = this.o;
        const sgn = stage.yDown ? 1 : -1;
        // Feet at (x, y): the centre is half a height "up".
        const cy = o.shape === "circle" ? o.y - sgn * (o.w / 2) : o.y - sgn * (o.h / 2);
        this.body = stage.world.createDynamicBody({
            position: stage.v(o.x, cy),
            active: this.spawnFrame <= 0,
            angularDamping: o.angularDamping ?? 5,
            fixedRotation: !!o.upright,
            bullet: o.bullet ?? false,
            gravityScale: o.gravityScale ?? 1,
        });
        const hw = stage.m(o.w / 2), hh = stage.m(o.h / 2);
        let shape;
        if (o.shape === "circle")
            shape = Circle(hw);
        else if (o.shape === "box")
            shape = Box(hw, hh);
        else {
            const r = Math.min(hw, hh) * 0.45;
            shape = Polygon([Vec2(-hw + r, -hh), Vec2(hw - r, -hh), Vec2(hw, -hh + r), Vec2(hw, hh - r), Vec2(hw - r, hh), Vec2(-hw + r, hh), Vec2(-hw, hh - r), Vec2(-hw, -hh + r)]);
        }
        this.body.createFixture(shape, {
            density: o.density ?? 1.2,
            friction: o.friction ?? 0.7,
            restitution: o.restitution ?? 0.3,
            filterCategoryBits: o.layer ?? LAYER.A,
            filterMaskBits: o.mask ?? 0xffff,
        });
        this.body.setLinearVelocity(stage.v(o.vx ?? 0, o.vy ?? 0));
        this.body.setAngularVelocity(o.spin ?? 0);
    }
    control(t) {
        const st = this.stage;
        const frame = t * st.fps;
        if (frame >= this.spawnFrame && !this.body.isActive())
            this.body.setActive(true);
        if (!this.body.isActive())
            return;
        // An impact: a sudden loss of speed in the gravity direction.
        const v = this.body.getLinearVelocity();
        const down = st.yDown ? v.y : -v.y;
        if (this.lastV > 0.8 && this.lastV - down > 0.8) {
            const imp = { frame, t, speed: st.px(this.lastV), vx: st.px(v.x) };
            this.impacts.push(imp);
            this.onImpact(imp);
        }
        this.lastV = down;
    }
    /** hook for subclasses */
    onImpact(_imp) { }
    sample(t) {
        const p = this.body.getPosition();
        return { shown: t * this.stage.fps >= this.spawnFrame - 1e-9, x: this.stage.px(p.x), y: this.stage.px(p.y), angle: this.body.getAngle() };
    }
    /** first time it lands (frames), or Infinity */
    get landed() {
        return this.impacts[0]?.frame ?? Infinity;
    }
}
/**
 * A body held upright by a springy weld to `ground`, attached where it first
 * lands ON that ground (a mid-air knock doesn't weld it). It can be knocked
 * over and wobbles back: letters on a shelf, a sign on a post.
 */
export class SpringyBody extends Body {
    welded = false;
    constructor(o) {
        super({ shape: "box", angularDamping: 0.6, ...o });
    }
    onImpact() {
        const o = this.o;
        if (this.welded)
            return;
        const st = this.stage;
        const p = this.body.getPosition();
        const half = st.m(o.h / 2) * (st.yDown ? 1 : -1);
        const footY = st.px(p.y + half);
        if (Math.abs(footY - o.groundY) > 6)
            return;
        this.welded = true;
        st.world.createJoint(WeldJoint({ frequencyHz: o.hz ?? 2, dampingRatio: o.damping ?? 0.18 }, o.ground, this.body, Vec2(p.x, p.y + half)));
    }
    get isWelded() {
        return this.welded;
    }
}
/**
 * Something dropped or thrown onto a surface, staying upright (fixed rotation):
 * a real fall and a small damped hop. Contact arrests everything: spin, tilt
 * and depth drift reach their rest exactly at touchdown (`flight()`), and the
 * rock about the contact point is the caller's to draw (`rock()` in
 * core/motion, with `flight().rockDir`). Optionally lands on its own ledge.
 */
export class Drop extends Body {
    constructor(o) {
        super({ shape: "circle", upright: true, restitution: 0.2, bullet: true, ...o });
    }
    get d() {
        return this.o;
    }
    build(stage) {
        super.build(stage);
        const o = this.d;
        if (o.foot != null) {
            // Replace the body's shape with the foot: a small circle at the contact point.
            for (let f = this.body.getFixtureList(); f;) {
                const next = f.getNext();
                this.body.destroyFixture(f);
                f = next;
            }
            const sgn = stage.yDown ? 1 : -1;
            const half = o.shape === "circle" ? o.w / 2 : o.h / 2;
            this.body.createFixture(Circle(Vec2(0, stage.m(sgn * (half - o.foot))), stage.m(o.foot)), {
                density: o.density ?? 20,
                friction: o.friction ?? 1.2,
                restitution: o.restitution ?? 0.2,
                filterCategoryBits: o.layer ?? LAYER.A,
                filterMaskBits: o.mask ?? 0xffff,
            });
        }
        const l = o.ledge;
        if (l)
            stage.world.createBody().createFixture(Edge(stage.v(l.x0, l.y), stage.v(l.x1, l.y)), { friction: 1.2, filterCategoryBits: LAYER.FLOOR });
    }
    /** Spin, tilt, depth and rock direction at a (fractional) frame. */
    flight(frame) {
        const o = this.d;
        const start = this.spawnFrame;
        const land = this.landed;
        const u = Number.isFinite(land) && land > start ? Math.min(1, Math.max(0, (frame - start) / (land - start))) : frame >= land ? 1 : 0;
        const last = [...this.impacts].reverse().find((h) => h.frame <= frame);
        const side = last && Math.abs(last.vx ?? 0) > 3 ? -Math.sign(last.vx) : null;
        return {
            u,
            spin: (o.spinAt ?? 0) * (1 - u),
            tilt: (o.tilt ?? 0) * (1 - u),
            z: o.z ? o.z[0] + (o.z[1] - o.z[0]) * u : null,
            rockDir: side ?? o.rock ?? 1,
        };
    }
    /** The pose placed in its parent's frame (physics pose minus `frame`). */
    framePose(frame, po = {}) {
        const p = poseAt(this, frame, po);
        const off = this.d.frame;
        return off ? { ...p, x: p.x - off.x, y: p.y - off.y } : p;
    }
}
/**
 * A ballistic leap through a surface line (a fish out of water): gravity only,
 * touches nothing, records each `crossing` of the surface with its velocity so
 * a scene can splash at the real spot.
 */
export class Leap {
    o;
    id;
    body;
    frames;
    crossings = [];
    stage;
    above = false;
    /** `gravity` scales the stage's gravity (default 1); `frame` is subtracted from the pose to place it */
    constructor(o) {
        this.o = o;
        this.id = o.id;
    }
    build(stage) {
        this.stage = stage;
        this.body = stage.world.createDynamicBody({ position: stage.v(this.o.x, this.o.y), active: (this.o.spawn ?? 0) <= 0, gravityScale: this.o.gravity ?? 1 });
        this.body.createFixture(Circle(stage.m((this.o.size ?? 60) / 2)), { density: 10, isSensor: true, filterMaskBits: 0 });
        this.body.setLinearVelocity(stage.v(this.o.vx, this.o.vy));
    }
    control(t) {
        const st = this.stage;
        const frame = t * st.fps;
        if (frame >= (this.o.spawn ?? 0) && !this.body.isActive() && this.crossings.length < 2)
            this.body.setActive(true);
        if (!this.body.isActive())
            return;
        const y = st.px(this.body.getPosition().y);
        const above = st.yDown ? y < this.o.surface : y > this.o.surface;
        if (above !== this.above) {
            const v = this.body.getLinearVelocity();
            this.crossings.push({ frame, t, x: st.px(this.body.getPosition().x), out: above, vx: st.px(v.x), vy: st.px(v.y) });
        }
        this.above = above;
        if (!above && this.crossings.length >= 2)
            this.body.setActive(false);
    }
    sample() {
        if (!this.body.isActive())
            return { shown: false, x: 0, y: 0, angle: 0, heading: 0, speed: 0 };
        const p = this.body.getPosition(), v = this.body.getLinearVelocity();
        const off = this.o.frame ?? { x: 0, y: 0 };
        return { shown: true, x: this.stage.px(p.x) - off.x, y: this.stage.px(p.y) - off.y, angle: 0, heading: Math.atan2(v.y, v.x), speed: this.stage.px(Math.hypot(v.x, v.y)) };
    }
}
//# sourceMappingURL=stage.js.map