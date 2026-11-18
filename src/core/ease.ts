/** Curves. Every one is a pure function of its input: no linear interpolation
 * should reach the screen without one of these on it. */

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0→1 progress of t through [a, b], clamped. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= (X(s) - x) / d;
    }
    return Y(Math.min(1, Math.max(0, s)));
  };
};

export const ease = {
  /** expo-like out: entrances, draw-ons */
  out: bezier(0.16, 1, 0.3, 1),
  /** quint in-out: camera, long moves */
  inOut: bezier(0.83, 0, 0.17, 1),
  /** exits only (exits are faster than entrances, ~0.6×) */
  in: bezier(0.7, 0, 0.84, 0),
  /** gentle in-out for slow drifts */
  sine: (x: number) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2,
  /** gentler entrance for things flying in from near the lens */
  outCubic: (x: number) => 1 - (1 - clamp01(x)) ** 3,
  /** gravity: an accelerating fall */
  fall: (x: number) => clamp01(x) ** 2,
};

export interface SpringPreset {
  damping: number;
  stiffness: number;
  mass: number;
}
export const SPRING = {
  snappy: { damping: 14, stiffness: 160, mass: 0.6 },
  smooth: { damping: 20, stiffness: 90, mass: 1 },
  bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
} satisfies Record<string, SpringPreset>;

/** A damped spring from 0 to 1 started at elapsed 0 (seconds). Closed form: pure in time. Overshoots when underdamped. */
export function spring(elapsed: number, p: SpringPreset = SPRING.smooth): number {
  if (elapsed <= 0) return 0;
  const { damping: c, stiffness: k, mass: m } = p;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * elapsed) * (Math.cos(wd * elapsed) + ((zeta * w0) / wd) * Math.sin(wd * elapsed));
  }
  return 1 - Math.exp(-w0 * elapsed) * (1 + w0 * elapsed);
}

/** A ring-out from 1 to 0 (squash, wobble, settle): the spring's overshoot, inverted. */
export const ringOut = (elapsed: number, p: SpringPreset = SPRING.bouncy) => (elapsed <= 0 ? 0 : 1 - spring(elapsed, p));

/** Start time of the i-th sibling, `frames` apart (stagger 2–4 frames). */
export const stagger = (t0: number, i: number, frames = 3, fps = 30) => t0 + (i * frames) / fps;
