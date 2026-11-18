/** Curves. Every one is a pure function of its input: no linear interpolation
 * should reach the screen without one of these on it. */
export declare const clamp01: (x: number) => number;
/** 0→1 progress of t through [a, b], clamped. */
export declare const span: (t: number, a: number, b: number) => number;
export declare const lerp: (a: number, b: number, x: number) => number;
export declare const ease: {
    /** expo-like out: entrances, draw-ons */
    out: (x: number) => number;
    /** quint in-out: camera, long moves */
    inOut: (x: number) => number;
    /** exits only (exits are faster than entrances, ~0.6×) */
    in: (x: number) => number;
    /** gentle in-out for slow drifts */
    sine: (x: number) => number;
    /** gentler entrance for things flying in from near the lens */
    outCubic: (x: number) => number;
    /** gravity: an accelerating fall */
    fall: (x: number) => number;
};
export interface SpringPreset {
    damping: number;
    stiffness: number;
    mass: number;
}
export declare const SPRING: {
    snappy: {
        damping: number;
        stiffness: number;
        mass: number;
    };
    smooth: {
        damping: number;
        stiffness: number;
        mass: number;
    };
    bouncy: {
        damping: number;
        stiffness: number;
        mass: number;
    };
};
/** A damped spring from 0 to 1 started at elapsed 0 (seconds). Closed form: pure in time. Overshoots when underdamped. */
export declare function spring(elapsed: number, p?: SpringPreset): number;
/** A ring-out from 1 to 0 (squash, wobble, settle): the spring's overshoot, inverted. */
export declare const ringOut: (elapsed: number, p?: SpringPreset) => number;
/** Start time of the i-th sibling, `frames` apart (stagger 2–4 frames). */
export declare const stagger: (t0: number, i: number, frames?: number, fps?: number) => number;
