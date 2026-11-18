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
import { Vec2, World, type Body as PlanckBody } from "planck";
/** Collision layers. Combine with `|`. Everything touches FLOOR by default. */
export declare const LAYER: {
    readonly FLOOR: 1;
    readonly A: 2;
    readonly B: 4;
    readonly C: 8;
    readonly D: 16;
};
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
    /** optional: draw a pose (Stage.pose(t) calls it, e.g. onto a three.js object) */
    apply?(pose: P, t: number): void;
    /** set by Stage.add() before build() */
    stage?: Stage;
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
export declare class Stage {
    readonly world: World;
    readonly ppm: number;
    readonly yDown: boolean;
    readonly actors: Actor[];
    fps: number;
    baked: boolean;
    constructor(o?: StageOptions);
    /** px → metres */
    m: (px: number) => number;
    /** metres → px */
    px: (metres: number) => number;
    /** screen px point → world Vec2 */
    v: (x: number, y: number) => Vec2;
    /** Static ground along a polyline (px). */
    ground(points: {
        x: number;
        y: number;
    }[], o?: {
        friction?: number;
        layer?: number;
    }): PlanckBody;
    add<A extends Actor>(actor: A): A;
    /** Simulate frames 0…n (or 0…duration s) at `hz`, storing one pose per frame per actor. */
    bake(o: {
        frames?: number;
        duration?: number;
        fps?: number;
        hz?: number;
    }): this;
    /**
     * The live-viewer convenience: every actor's interpolated pose at time `t`
     * (seconds) handed to its `apply(pose, t)`. A pose with a NaN anywhere is
     * passed as `{ shown: false }` (a NaN position corrupts a renderer's depth
     * sort, so it's treated as hidden).
     */
    pose(t: number, o?: PoseOptions): void;
    get<A extends Actor = Body>(id: string): A;
}
/** How non-numeric fields (booleans, strings, `shown`) blend between two
 * baked frames: "nearest" switches at the halfway point (the default),
 * "previous" holds the earlier frame's value until the next frame. */
export interface PoseOptions {
    discrete?: "nearest" | "previous";
}
/** An actor's pose at a fractional FRAME (offline renderers: Remotion, seek(t)×fps). */
export declare function poseAt<P extends object>(a: Actor<P>, frame: number, o?: PoseOptions): P;
/** An actor's pose at a time in SECONDS (realtime viewers), interpolated. */
export declare function poseAtTime<P extends object>(a: Actor<P>, t: number, fps?: number, o?: PoseOptions): P;
export declare function baked(key: string, build: () => Stage): Stage;
/** Forget memoised stages (tests, hot reload). */
export declare const clearBaked: () => void;
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
    /** multiplies the stage's gravity for this body (default 1): scaled-down props fall snappier with > 1 */
    gravityScale?: number;
}
/**
 * A rigid body with its impacts recorded: a character, a prop, a drop of
 * anything. Pose = centre (px) and angle; `impacts` drive squash, wobble and
 * sound.
 */
export declare class Body implements Actor<BodyPose> {
    readonly o: BodyOptions;
    id: string;
    body: PlanckBody;
    impacts: Impact[];
    frames?: BodyPose[];
    private lastV;
    stage: Stage;
    constructor(o: BodyOptions);
    get spawnFrame(): number;
    build(stage: Stage): void;
    control(t: number): void;
    /** hook for subclasses */
    protected onImpact(_imp: Impact): void;
    sample(t: number): BodyPose;
    /** first time it lands (frames), or Infinity */
    get landed(): number;
}
/**
 * A body held upright by a springy weld to `ground`, attached where it first
 * lands ON that ground (a mid-air knock doesn't weld it). It can be knocked
 * over and wobbles back: letters on a shelf, a sign on a post.
 */
export declare class SpringyBody extends Body {
    private welded;
    constructor(o: BodyOptions & {
        ground: PlanckBody;
        groundY: number;
        hz?: number;
        damping?: number;
    });
    protected onImpact(): void;
    get isWelded(): boolean;
}
/**
 * Something dropped or thrown onto a surface, staying upright (fixed rotation):
 * a real fall and a small damped hop. Rocking about its contact point and the
 * compression on each impact are the caller's to draw, from `impacts`
 * (see `rock()` in core/motion). Optionally lands on its own ledge.
 */
export interface DropOptions extends BodyOptions {
    /** its own landing edge (a hillside it stands on), in physics coordinates (px) */
    ledge?: {
        x0: number;
        x1: number;
        y: number;
    };
    /** contact foot: a small circle of this radius (px) is all that touches the
     * ground, its bottom at the body's feet (a pin's tip). Default: the whole body. */
    foot?: number;
    /** subtracted from the physics pose to place it (`framePose`): lay a ledge far
     * from everything else in the world, then draw it in its parent's frame */
    frame?: {
        x: number;
        y: number;
    };
    /** spin and tilt (radians) at spawn, unwinding at a constant rate to 0 at touchdown */
    spinAt?: number;
    tilt?: number;
    /** depth at spawn and at touchdown, at a constant velocity, arrested on contact */
    z?: [number, number];
    /** which way an impact rocks it when it lands straight down (a sideways landing wins) */
    rock?: 1 | -1;
}
/** What `Drop.flight(frame)` gives: the in-flight values that stop at touchdown. */
export interface DropFlight {
    /** 0 at spawn … 1 at touchdown (and after) */
    u: number;
    spin: number;
    tilt: number;
    z: number | null;
    /** the rock direction for the latest impact: its sideways speed's sign, else `rock` */
    rockDir: 1 | -1;
}
/**
 * Something dropped or thrown onto a surface, staying upright (fixed rotation):
 * a real fall and a small damped hop. Contact arrests everything: spin, tilt
 * and depth drift reach their rest exactly at touchdown (`flight()`), and the
 * rock about the contact point is the caller's to draw (`rock()` in
 * core/motion, with `flight().rockDir`). Optionally lands on its own ledge.
 */
export declare class Drop extends Body {
    constructor(o: DropOptions);
    private get d();
    build(stage: Stage): void;
    /** Spin, tilt, depth and rock direction at a (fractional) frame. */
    flight(frame: number): DropFlight;
    /** The pose placed in its parent's frame (physics pose minus `frame`). */
    framePose(frame: number, po?: PoseOptions): BodyPose;
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
export declare class Leap implements Actor<LeapPose> {
    readonly o: {
        id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        surface: number;
        size?: number;
        spawn?: number;
        gravity?: number;
        frame?: {
            x: number;
            y: number;
        };
    };
    id: string;
    body: PlanckBody;
    frames?: LeapPose[];
    crossings: {
        frame: number;
        t: number;
        x: number;
        out: boolean;
        vx: number;
        vy: number;
    }[];
    stage: Stage;
    private above;
    /** `gravity` scales the stage's gravity (default 1); `frame` is subtracted from the pose to place it */
    constructor(o: {
        id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        surface: number;
        size?: number;
        spawn?: number;
        gravity?: number;
        frame?: {
            x: number;
            y: number;
        };
    });
    build(stage: Stage): void;
    control(t: number): void;
    sample(): LeapPose;
}
