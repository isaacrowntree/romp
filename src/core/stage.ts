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
import { Box, Chain, Circle, Edge, Polygon, Vec2, WeldJoint, World, type Body as PlanckBody } from "planck";

/** Collision layers. Combine with `|`. Everything touches FLOOR by default. */
export const LAYER = { FLOOR: 0x0001, A: 0x0002, B: 0x0004, C: 0x0008, D: 0x0010 } as const;

export interface StageOptions {
  /** px per metre (Box2D is tuned for 0.1–10 m objects). Default 100. */
  pxPerMetre?: number;
  /** gravity in m/s², as a magnitude. Default 9.81 × 2.2 (small things fall snappily). */
  gravity?: number;
  /** screen space (y grows downward). Default true. */
  yDown?: boolean;
}

/** A recorded impact: a sudden loss of speed into a surface. */
export interface Impact {
  /** fractional frame */
  frame: number;
  /** seconds */
  t: number;
  /** speed into the contact, px/s */
  speed: number;
  /** sideways speed at contact, px/s */
  vx: number;
}

/**
 * The actor protocol: anything that moves on its own.
 *   build(stage)      create bodies
 *   control(t, dt)    every physics step (drive motors, spawn, record events)
 *   sample(t)         this frame's pose: a plain object of numbers/booleans
 * Poses are interpolated between baked frames: numbers lerp, booleans and
 * `shown: false` switch at the halfway point.
 */
export interface Actor<P extends object = any> {
  build(stage: Stage): void;
  control?(t: number, dt: number): void;
  sample(t: number): P;
  /** filled by bake(): one pose per frame */
  frames?: P[];
  /** optional name for lookups */
  id?: string;
}

/** The pose of a rigid body on screen. */
export interface BodyPose {
  shown: boolean;
  x: number;
  y: number;
  /** radians (screen space: clockwise positive when yDown) */
  angle: number;
}

export class Stage {
  readonly world: World;
  readonly ppm: number;
  readonly yDown: boolean;
  readonly actors: Actor[] = [];
  fps = 30;
  baked = false;

  constructor(o: StageOptions = {}) {
    this.ppm = o.pxPerMetre ?? 100;
    this.yDown = o.yDown ?? true;
    const g = o.gravity ?? 9.81 * 2.2;
    this.world = new World({ gravity: Vec2(0, this.yDown ? g : -g) });
  }

  /** px → metres */
  m = (px: number) => px / this.ppm;
  /** metres → px */
  px = (metres: number) => metres * this.ppm;
  /** screen px point → world Vec2 */
  v = (x: number, y: number) => Vec2(this.m(x), this.m(y));

  /** Static ground along a polyline (px). */
  ground(points: { x: number; y: number }[], o: { friction?: number; layer?: number } = {}): PlanckBody {
    const b = this.world.createBody();
    b.createFixture(Chain(points.map((p) => this.v(p.x, p.y)), false), { friction: o.friction ?? 0.8, filterCategoryBits: o.layer ?? LAYER.FLOOR });
    return b;
  }

  add<A extends Actor>(actor: A): A {
    actor.build(this);
    this.actors.push(actor);
    return actor;
  }

  /** Simulate frames 0…n (or 0…duration s) at `hz`, storing one pose per frame per actor. */
  bake(o: { frames?: number; duration?: number; fps?: number; hz?: number }): this {
    this.fps = o.fps ?? 30;
    const hz = o.hz ?? 240;
    const n = o.frames ?? Math.ceil((o.duration ?? 0) * this.fps);
    const dt = 1 / hz;
    const per = Math.max(1, Math.round(hz / this.fps));
    for (const a of this.actors) a.frames = [];
    let t = 0;
    for (let f = 0; f <= n; f++) {
      for (const a of this.actors) a.frames!.push(a.sample(t));
      for (let s = 0; s < per; s++) {
        for (const a of this.actors) a.control?.(t, dt);
        this.world.step(dt, 10, 8);
        t += dt;
      }
    }
    this.baked = true;
    return this;
  }

  get<A extends Actor = Body>(id: string): A {
    const a = this.actors.find((x) => x.id === id);
    if (!a) throw new Error(`romp: no actor "${id}"`);
    return a as A;
  }
}

/** An actor's pose at a fractional FRAME (offline renderers: Remotion, seek(t)×fps). */
export function poseAt<P extends object>(a: Actor<P>, frame: number): P {
  const fr = a.frames;
  if (!fr || fr.length === 0) throw new Error("romp: bake() the stage before reading poses");
  const i = Math.max(0, Math.min(fr.length - 1, Math.floor(frame)));
  const j = Math.min(fr.length - 1, i + 1);
  const x = Math.min(1, Math.max(0, frame - i));
  const p = blend(fr[i], fr[j], x) as P;
  return hasNaN(p) ? ({ ...p, shown: false } as P) : p;
}

/** An actor's pose at a time in SECONDS (realtime viewers), interpolated. */
export function poseAtTime<P extends object>(a: Actor<P>, t: number, fps = 30): P {
  return poseAt(a, t * fps);
}

function blend(a: unknown, b: unknown, x: number): unknown {
  if (typeof a === "number") return a + ((b as number) - a) * x;
  if (typeof a !== "object" || a === null) return x < 0.5 ? a : b;
  if (Array.isArray(a)) return a.map((v, k) => blend(v, (b as unknown[])[k], x));
  const A = a as Record<string, unknown>, B = b as Record<string, unknown>;
  if (A.shown === false || B.shown === false) return x < 0.5 ? a : b;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(A)) out[k] = blend(A[k], B[k], x);
  return out;
}

function hasNaN(v: unknown): boolean {
  if (typeof v === "number") return Number.isNaN(v);
  if (v && typeof v === "object") return Object.values(v).some(hasNaN);
  return false;
}

/** Memoise a baked stage per key: build once, read every frame. */
const cache = new Map<string, Stage>();
export function baked(key: string, build: () => Stage): Stage {
  let s = cache.get(key);
  if (!s) {
    s = build();
    cache.set(key, s);
  }
  return s;
}
/** Forget memoised stages (tests, hot reload). */
export const clearBaked = () => cache.clear();

// ── Preset actors ───────────────────────────────────────────────────────────

export interface BodyOptions {
  id: string;
  /** feet (bottom centre) in px, at spawn */
  x: number;
  y: number;
  /** shape: "rounded" (a chamfered box: stacks well, rolls a little), "box" or "circle" */
  shape?: "rounded" | "box" | "circle";
  w: number;
  h: number;
  /** frame it appears (inactive before). Default 0. */
  spawn?: number;
  /** launch velocity, px/s (screen axes) */
  vx?: number;
  vy?: number;
  /** angular velocity, rad/s */
  spin?: number;
  restitution?: number;
  friction?: number;
  density?: number;
  /** never rotates (a character that must stay upright) */
  upright?: boolean;
  angularDamping?: number;
  /** its collision layer and what it collides with */
  layer?: number;
  mask?: number;
  bullet?: boolean;
}

/**
 * A rigid body with its impacts recorded: a character, a prop, a drop of
 * anything. Pose = centre (px) and angle; `impacts` drive squash, wobble and
 * sound.
 */
export class Body implements Actor<BodyPose> {
  id: string;
  body!: PlanckBody;
  impacts: Impact[] = [];
  frames?: BodyPose[];
  protected stage!: Stage;
  private lastV = 0;
  constructor(readonly o: BodyOptions) {
    this.id = o.id;
  }
  get spawnFrame() {
    return this.o.spawn ?? 0;
  }
  build(stage: Stage) {
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
    });
    const hw = stage.m(o.w / 2), hh = stage.m(o.h / 2);
    let shape;
    if (o.shape === "circle") shape = Circle(hw);
    else if (o.shape === "box") shape = Box(hw, hh);
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
  control(t: number) {
    const st = this.stage;
    const frame = t * st.fps;
    if (frame >= this.spawnFrame && !this.body.isActive()) this.body.setActive(true);
    if (!this.body.isActive()) return;
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
  protected onImpact(_imp: Impact) {}
  sample(t: number): BodyPose {
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
  private welded = false;
  constructor(o: BodyOptions & { ground: PlanckBody; groundY: number; hz?: number; damping?: number }) {
    super({ shape: "box", angularDamping: 0.6, ...o });
  }
  protected onImpact() {
    const o = this.o as BodyOptions & { ground: PlanckBody; groundY: number; hz?: number; damping?: number };
    if (this.welded) return;
    const st = this.stage;
    const p = this.body.getPosition();
    const half = st.m(o.h / 2) * (st.yDown ? 1 : -1);
    const footY = st.px(p.y + half);
    if (Math.abs(footY - o.groundY) > 6) return;
    this.welded = true;
    st.world.createJoint(WeldJoint({ frequencyHz: o.hz ?? 2, dampingRatio: o.damping ?? 0.18 }, o.ground, this.body, Vec2(p.x, p.y + half)));
  }
  get isWelded() {
    return this.welded;
  }
}

/**
 * Something dropped or thrown onto a surface, staying upright (fixed rotation):
 * a real fall and a small damped hop. Rocking about its contact point and the
 * compression on each impact are the caller's to draw, from `impacts`
 * (see `rock()` in core/motion). Optionally lands on its own ledge.
 */
export class Drop extends Body {
  constructor(o: BodyOptions & { ledge?: { x0: number; x1: number; y: number } }) {
    super({ shape: "circle", upright: true, restitution: 0.2, bullet: true, ...o });
  }
  build(stage: Stage) {
    super.build(stage);
    const l = (this.o as { ledge?: { x0: number; x1: number; y: number } }).ledge;
    if (l) stage.world.createBody().createFixture(Edge(stage.v(l.x0, l.y), stage.v(l.x1, l.y)), { friction: 1.2, filterCategoryBits: LAYER.FLOOR });
  }
}

export interface LeapPose extends BodyPose {
  /** direction of travel (radians), for pointing the nose */
  heading: number;
  speed: number;
}

/**
 * A ballistic leap through a surface line (a fish out of water): gravity only,
 * touches nothing, records each `crossing` of the surface with its velocity so
 * a scene can splash at the real spot.
 */
export class Leap implements Actor<LeapPose> {
  id: string;
  body!: PlanckBody;
  frames?: LeapPose[];
  crossings: { frame: number; t: number; x: number; out: boolean; vx: number; vy: number }[] = [];
  private stage!: Stage;
  private above = false;
  constructor(readonly o: { id: string; x: number; y: number; vx: number; vy: number; surface: number; size?: number; spawn?: number }) {
    this.id = o.id;
  }
  build(stage: Stage) {
    this.stage = stage;
    this.body = stage.world.createDynamicBody({ position: stage.v(this.o.x, this.o.y), active: (this.o.spawn ?? 0) <= 0 });
    this.body.createFixture(Circle(stage.m((this.o.size ?? 60) / 2)), { density: 10, isSensor: true, filterMaskBits: 0 });
    this.body.setLinearVelocity(stage.v(this.o.vx, this.o.vy));
  }
  control(t: number) {
    const st = this.stage;
    const frame = t * st.fps;
    if (frame >= (this.o.spawn ?? 0) && !this.body.isActive() && this.crossings.length < 2) this.body.setActive(true);
    if (!this.body.isActive()) return;
    const y = st.px(this.body.getPosition().y);
    const above = st.yDown ? y < this.o.surface : y > this.o.surface;
    if (above !== this.above) {
      const v = this.body.getLinearVelocity();
      this.crossings.push({ frame, t, x: st.px(this.body.getPosition().x), out: above, vx: st.px(v.x), vy: st.px(v.y) });
    }
    this.above = above;
    if (!above && this.crossings.length >= 2) this.body.setActive(false);
  }
  sample(): LeapPose {
    if (!this.body.isActive()) return { shown: false, x: 0, y: 0, angle: 0, heading: 0, speed: 0 };
    const p = this.body.getPosition(), v = this.body.getLinearVelocity();
    return { shown: true, x: this.stage.px(p.x), y: this.stage.px(p.y), angle: 0, heading: Math.atan2(v.y, v.x), speed: this.stage.px(Math.hypot(v.x, v.y)) };
  }
}
