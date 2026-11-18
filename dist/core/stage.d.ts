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
    get<A extends Actor = Body>(id: string): A;
}
/** An actor's pose at a fractional FRAME (offline renderers: Remotion, seek(t)×fps). */
export declare function poseAt<P extends object>(a: Actor<P>, frame: number): P;
/** An actor's pose at a time in SECONDS (realtime viewers), interpolated. */
export declare function poseAtTime<P extends object>(a: Actor<P>, t: number, fps?: number): P;
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
    protected stage: Stage;
    private lastV;
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
export declare class Drop extends Body {
    constructor(o: BodyOptions & {
        ledge?: {
            x0: number;
            x1: number;
            y: number;
        };
    });
    build(stage: Stage): void;
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
    private stage;
    private above;
    constructor(o: {
        id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        surface: number;
        size?: number;
        spawn?: number;
    });
    build(stage: Stage): void;
    control(t: number): void;
    sample(): LeapPose;
}
