/**
 * romp/particles: deterministic particles for videos made in code. Confetti,
 * sparks, snow, a fountain: anything that bursts, falls or drifts in numbers.
 *
 * Every particle is a pure function of the frame. Its launch (where, how fast,
 * which way, its size, colour, spin) comes from a seeded hash of its own
 * index, and its flight is closed-form (gravity, wind, linear drag, sway), so
 * `particlesAt(emitter, frame)` returns the same particles for the same frame,
 * in any order, as often as you like: a live viewer, a frame-by-frame renderer
 * (Remotion) and the motion check all see the same burst. Bounces off a ground
 * are found once per particle, on first use, by stepping that same closed form
 * at 240 Hz.
 *
 * Output is plain data ({ x, y, angle, size, opacity, color, shape, … }), so
 * any renderer can draw it: DOM (`particleStyle`), canvas (`drawParticles`),
 * SVG or three.js.
 *
 * Frames are at the emitter's `fps` (default 30); distances are px, times are
 * seconds, angles are radians (screen space: y grows downward, so straight up
 * is −π/2).
 */
import type { Sample } from "../check/analyze.js";
/** A particle's drawn shape. */
export type Shape = "circle" | "square" | "rect" | "triangle" | "star" | "line";
/** A fixed value, or a [min, max] range each particle picks from. */
export type Range = number | readonly [number, number];
/** A ground particles land on: a horizontal line at this y, or a polyline (the points you gave `stage.ground()`). */
export type Ground = number | readonly {
    x: number;
    y: number;
}[];
export interface EmitterOptions {
    /** a name for the burst (each particle carries it as `emitter`) */
    id?: string;
    /** the seed: same seed, same burst. Default 1. */
    seed?: number;
    /** the frame rate `at` and `until` are counted in. Default 30. */
    fps?: number;
    /** the frame emission starts. Default 0. */
    at?: number;
    /** how many particles. Without `rate` they all leave at once (a burst). */
    count?: number;
    /** particles per second: a stream from `at` for `count` particles, or until the frame `until` */
    rate?: number;
    /** the frame a stream stops (with `rate`, instead of `count`) */
    until?: number;
    /** where they leave from: a point… */
    x?: number;
    y?: number;
    /** …or anywhere in a box (snow from a line above the frame: y0 = y1) */
    area?: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
    /** launch direction, radians (−π/2, straight up, by default) */
    direction?: number;
    /** the width of the launch cone, radians (2π, all round, by default) */
    spread?: number;
    /** launch speed, px/s */
    speed?: Range;
    /** px/s² downward. Default 1200. */
    gravity?: number;
    /** px/s² sideways (a steady breeze). Default 0. */
    wind?: number;
    /** linear drag, 1/s: the higher, the sooner they slow to drifting. Default 0. */
    drag?: number;
    /** a side-to-side sway, px (snow, falling leaves) */
    sway?: Range;
    /** how fast it sways, Hz. Default [0.2, 0.5]. */
    swayHz?: Range;
    /** seconds each one lives */
    life?: Range;
    /** px (a circle's diameter, a square's side, a line's thickness × 2) */
    size?: Range;
    /** rad/s */
    spin?: Range;
    /** confetti tumbling: turns per second of a flip about its own axis (`flip` in the output goes 1 → −1 → 1) */
    flip?: Range;
    colors?: readonly string[];
    shapes?: readonly Shape[];
    /** seconds to grow in from nothing. Default 0.08: not a pop. */
    grow?: number;
    /** seconds to fade in. Default 0. */
    fadeIn?: number;
    /** seconds to fade out at the end of its life. Default 0.3: not a pop. */
    fadeOut?: number;
    /** seconds to shrink to nothing at the end of its life. Default 0. */
    shrink?: number;
    /** turn to face the way it's moving (sparks, streaks) */
    align?: boolean;
    /** streak length: `length` = size + speed × stretch (s). Default 0. */
    stretch?: number;
    /** what they land on (one or several) */
    ground?: Ground | readonly Ground[];
    /** bounciness on a ground, 0…1. Default 0.3. */
    bounce?: number;
    /** how much sliding speed a bounce keeps, 0…1. Default 0.6. */
    friction?: number;
}
/** One particle at one frame: plain data for any renderer. */
export interface Particle {
    /** its index in the emitter: stable across frames, so it can key a DOM node */
    i: number;
    emitter?: string;
    /** centre, px */
    x: number;
    y: number;
    /** where it left from, px */
    x0: number;
    y0: number;
    /** velocity, px/s */
    vx: number;
    vy: number;
    /** radians */
    angle: number;
    /** px (grown and shrunk) */
    size: number;
    /** px along `angle`: `size`, or longer for a stretched streak */
    length: number;
    /** confetti tumble: scale its height by this (1 → −1 → 1); 1 when it doesn't flip */
    flip: number;
    opacity: number;
    color: string;
    shape: Shape;
    /** seconds since it left */
    age: number;
    /** seconds it lives */
    life: number;
    /** come to rest on a ground */
    resting: boolean;
}
/** A uniform 0…1 from a seed, an index and a channel: random access, no state.
 * Changing `count` never reshuffles the particles you already had. */
export declare function hash01(seed: number, i: number, k: number): number;
/** A deterministic particle emitter. Read it with `particlesAt(frame)`. */
export declare class Emitter {
    readonly o: EmitterOptions;
    readonly fps: number;
    /** total particles */
    readonly count: number;
    private launches;
    private legs;
    private segs;
    constructor(o: EmitterOptions);
    get id(): string | undefined;
    /** Seconds after `at` that particle i leaves. */
    private bornAt;
    /** The first and last frame any particle is alive. */
    get span(): [number, number];
    private launch;
    /** Base flight (no sway) τ seconds into a leg. */
    private fly;
    private swayAt;
    /** Spin accumulated by `age` (it slows with drag, like the flight). */
    private turned;
    /** The legs of particle i's flight: one, or one per bounce. Found once, then reused. */
    private flight;
    /** Particle i at film time t (seconds), or null when it isn't alive. */
    private one;
    /** Every live particle at a (fractional) frame: a pure function of the frame. */
    particlesAt(frame: number): Particle[];
}
/** Every live particle of one or several emitters at a (fractional) frame. */
export declare function particlesAt(emitters: Emitter | readonly Emitter[], frame: number): Particle[];
type Where = {
    x?: number;
    y?: number;
    at?: number;
} & EmitterOptions;
/** Confetti: a burst of paper that tumbles, flutters and drifts down. */
export declare const confetti: (o?: Where) => EmitterOptions;
/** Sparks: a quick, bright, radial spray of streaks that fall and die. */
export declare const sparks: (o?: Where) => EmitterOptions;
/** Snow: a stream drifting down from a line above the frame, swaying as it falls. */
export declare const snow: (o: Where & {
    width: number;
    height?: number;
}) => EmitterOptions;
/** A fountain: a stream thrown up in a narrow cone, arcing back down. */
export declare const fountain: (o?: Where) => EmitterOptions;
/** A particle's drawn width and height, px (before `flip`). */
export declare function particleBox(p: Particle): {
    w: number;
    h: number;
};
/** Inline CSS for one absolutely positioned element per particle (DOM, Remotion). */
export declare function particleStyle(p: Particle): Record<string, string | number>;
/** Draw particles onto a canvas 2D context. */
export declare function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]): void;
/** The bounding box of a set of particles, px (null when there are none). */
export declare function particleBounds(particles: readonly Particle[]): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
} | null;
/**
 * A whole burst as ONE motion-check sample: its box, its strongest opacity,
 * and, as its centre, where its particles left from (weighted by opacity).
 * A burst spreading out is a change of size, not a move, so the centre stays
 * put: the last far-flung spark fading out doesn't jerk it. Single sparks fly
 * faster than the strobe limit by design; the burst as a whole grows in from
 * nothing and fades out, so it checks clean.
 */
export declare function particleSample(particles: readonly Particle[], frame?: {
    width: number;
    height: number;
}): Sample;
export {};
