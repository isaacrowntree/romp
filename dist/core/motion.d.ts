/** Character motion from a few rules, as pure functions of the frame:
 * - anticipation, then a spring that overshoots;
 * - squash on every landing, stretch in the air, about the feet;
 * - the hat (or ears, hair, antenna) lags the body and settles with a decaying wobble;
 * - nobody is ever perfectly still: idle breathing and unsynced blinks.
 * Frames here are at the stage's fps (default 30). */
import type { Body, Impact } from "./stage.js";
/** A character's pose: squash about the feet, a secondary part's tilt/lift, blink 0 open…1 shut, a wobble for loose parts. */
export interface CharacterPose {
    squashX: number;
    squashY: number;
    /** degrees, for a hat / ears / hair (follow-through) */
    tilt: number;
    /** px up, for the same */
    lift: number;
    blink: number;
    /** degrees of secondary jiggle for small loose parts */
    jiggle: number;
}
export declare const REST: CharacterPose;
/** A decaying oscillation that is 1 at dt = 0: the "boing". */
export declare const boing: (dt: number, freq?: number, decay?: number) => number;
/** Unsynced blinks: each character has its own seed. 0 open … 1 shut. */
export declare function blinkAt(frame: number, seed?: number): number;
/** Idle: breathing squash, a lazy sway, blinks. */
export declare function idle(frame: number, seed?: number): CharacterPose;
/** Secondary jiggle for loose parts after a jolt at `dt` frames ago. */
export declare function jiggle(dt: number, strength?: number): number;
/** `jiggle` for several parts at once (a hat's pieces, antennae, dangles): each
 * part lags the one before by `lag` frames, so they follow through in turn
 * instead of moving as one. */
export declare function jiggleParts(parts: readonly string[], dt: number, strength?: number, lag?: number): Record<string, number>;
/** After a landing at frame `land`: squash then wobble back, the hat following through. Before it: stretched in the fall. */
export declare function landing(frame: number, land: number, seed?: number, strength?: number): CharacterPose;
/**
 * A continuous hop cycle: `period` frames per hop, `height` px. y is the offset
 * (up is negative in screen space). The landing is hit, not eased into: the
 * body falls fastest at the contact, squashes on that frame and cushions back
 * out; then it crouches for the next take-off (anticipation). In the air it
 * stretches with its speed and hangs round at the top; width keeps the volume.
 */
export declare function hop(frame: number, period?: number, height?: number, seed?: number): {
    y: number;
    pose: CharacterPose;
};
/**
 * A simulated body's pose from its REAL impacts: squash, closed eyes, hat
 * follow-through and jiggle summed over every recorded impact and sized by how
 * hard it hit; stretched while falling fast. `speedRef` (px/s) is the impact
 * speed that counts as a full hit.
 */
/** How a landing reads. `squash`: how much a hard landing squashes (0.28 = 28% shorter).
 * `widen`: how much of that squash spreads sideways (0.85 by default; lower it for
 * characters that land against each other in a pile, so the drawing doesn't
 * spread past its body into a neighbour it's touching). */
export interface ImpactStyle {
    squash?: number;
    widen?: number;
}
export declare function impactResponse(actor: Body, frame: number, seed?: number, speedRef?: number, style?: ImpactStyle): CharacterPose;
/** Is `frame` within `window` frames of one of these impacts? (Mark it for the motion check.) */
export declare const nearImpact: (impacts: Impact[], frame: number, window?: number) => boolean;
/** A rigid prop rocking about its contact point after each impact (a damped oscillation), and a barely-there compression. */
export declare function rock(impacts: Impact[], frame: number, fps?: number, o?: {
    hz?: number;
    zeta?: number;
    max?: number;
    dir?: 1 | -1;
}): {
    angle: number;
    squash: number;
};
