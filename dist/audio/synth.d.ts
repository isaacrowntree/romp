/** Deterministic noise: the whole soundtrack is a pure function of the film. */
export function rng(seed?: number): () => number;
export function fitTo(pcs: any, midi: any): any;
export function midiHz(m: any): number;
export class Synth {
    constructor(ctx: any);
    ctx: any;
    noise: any;
    gain(v?: number): any;
    pan(p: any, out: any): any;
    filter(type: any, f: any, q?: number): any;
    noiseSrc(t: any, dur: any, seed?: number): any;
    /** Attack–hold–exponential-decay envelope on a fresh gain node. */
    env(t: any, { a, h, d, peak }?: {
        a?: number | undefined;
        h?: number | undefined;
        d?: number | undefined;
        peak?: number | undefined;
    }): any;
    /**
     * The nearest note to `midi` that belongs to the chord sounding at t (`this.harmony`, set by the
     * mixer from the score): a tonal effect is part of the band's chord, never a semitone against it.
     */
    fit(t: any, midi: any): any;
    /** A felt-tip highlighter swiped across a word: band-passed noise brightening as it goes. */
    marker(t: any, dur: any, out: any, { vel }?: {
        vel?: number | undefined;
    }): void;
    /** A bell / glockenspiel: inharmonic partials with their own decays. */
    bell(t: any, midi: any, out: any, { vel, dur, pan, bright }?: {
        vel?: number | undefined;
        dur?: number | undefined;
        pan?: number | undefined;
        bright?: number | undefined;
    }): void;
    /**
     * Marimba: a film's sonic family (one voice for every tonal effect, the way a
     * phone's system tones share one). A struck wooden bar — fundamental, the
     * tuned 4th partial, a little of the 10th — and a felt-mallet knock. Use it
     * for every tonal effect, in the score's key (see `fit`).
     */
    marimba(t: any, midi: any, out: any, { vel, dur, pan, soft }?: {
        vel?: number | undefined;
        dur?: number | undefined;
        pan?: number | undefined;
        soft?: number | undefined;
    }): void;
    /** Rim click (the bossa clave): a woody tock. */
    rim(t: any, out: any, { vel, seed }?: {
        vel?: number | undefined;
        seed?: number | undefined;
    }): void;
    /** Paper card hinging up: a dry papery flap. */
    flap(t: any, out: any, { vel, size, pan, seed }?: {
        vel?: number | undefined;
        size?: number | undefined;
        pan?: number | undefined;
        seed?: number | undefined;
    }): void;
    /**
     * Whoosh: filtered noise in three parts — prepare (rises), cross (`peakAt`,
     * loudest and brightest), release (falls darker). Speed → brightness and length.
     */
    whoosh(t: any, dur: any, out: any, { vel, peakAt, f0, f1, f2, q, pan0, pan1, seed }?: {
        vel?: number | undefined;
        peakAt?: number | undefined;
        f0?: number | undefined;
        f1?: number | undefined;
        f2?: number | undefined;
        q?: number | undefined;
        pan0?: number | undefined;
        pan1?: number | undefined;
        seed?: number | undefined;
    }): void;
    /** UI tap: the soft iOS-style tick. */
    tap(t: any, out: any, { vel }?: {
        vel?: number | undefined;
    }): void;
    /**
     * Water, built the way water actually sounds: bubble resonance — a sine whose
     * pitch sweeps quickly *up* (the "plop") — not hiss. Entry: a deep plunk, a
     * short bright spray, then droplets and small bubbles. Exit (`out`): a light
     * "shlp" and a couple of drips.
     */
    splash(t: any, out: any, { vel, big, seed }?: {
        vel?: number | undefined;
        big?: number | undefined;
        seed?: number | undefined;
    }): void;
    /** Fire: a whoomp as it catches. */
    ignite(t: any, out: any, { vel }?: {
        vel?: number | undefined;
    }): void;
    /** Fire crackle from t0 to t1: random pops and a low breath, level shaped by `level(t)`. */
    crackle(t0: any, t1: any, out: any, { vel, level, seed }?: {
        vel?: number | undefined;
        level?: (() => number) | undefined;
        seed?: number | undefined;
    }): void;
    /** Crickets: tiny pulsed chirps, far off. */
    crickets(t0: any, t1: any, out: any, { vel, level, seed }?: {
        vel?: number | undefined;
        level?: (() => number) | undefined;
        seed?: number | undefined;
    }): void;
    /** A bed of filtered noise whose gain follows `shape(t)` (sampled every 50 ms). */
    bed(t0: any, t1: any, out: any, { vel, level, shape, seed, type, f, q, fmod }: {
        vel: any;
        level?: (() => number) | undefined;
        shape?: (() => number) | undefined;
        seed?: number | undefined;
        type?: string | undefined;
        f?: number | undefined;
        q?: number | undefined;
        fmod?: null | undefined;
    }): void;
    /** The sea: a low wash that swells and draws back (~3.6 s a wave), and the fizz of it breaking. */
    surf(t0: any, t1: any, out: any, { vel, level, seed }?: {
        vel?: number | undefined;
        level?: (() => number) | undefined;
        seed?: number | undefined;
    }): void;
    /** Wind over the hills: a band of noise wandering in pitch and strength. */
    wind(t0: any, t1: any, out: any, { vel, level, seed }?: {
        vel?: number | undefined;
        level?: (() => number) | undefined;
        seed?: number | undefined;
    }): void;
    /** A town's hum: a low distant rumble and a soft wash of far-off traffic. */
    hum(t0: any, t1: any, out: any, { vel, level, seed }?: {
        vel?: number | undefined;
        level?: (() => number) | undefined;
        seed?: number | undefined;
    }): void;
    /** Birdsong: short phrases of quick, gliding whistles, here and there, never busy. */
    birds(t0: any, t1: any, out: any, { vel, level, seed }?: {
        vel?: number | undefined;
        level?: (() => number) | undefined;
        seed?: number | undefined;
    }): void;
    /** A gull's call: a bright, falling, slightly rough cry, twice. */
    gullCall(t: any, out: any, { vel, pan }?: {
        vel?: number | undefined;
        pan?: number | undefined;
    }): void;
    /** A riser: noise + a saw sweeping up, building to `t + dur`. */
    riser(t: any, dur: any, out: any, { vel }?: {
        vel?: number | undefined;
    }): void;
    /** A soft landing thump with weight (the map arriving, the logo). */
    thump(t: any, out: any, { vel }?: {
        vel?: number | undefined;
    }): void;
    /** A switch (headlights): a dry mechanical click. */
    click(t: any, out: any, { vel }?: {
        vel?: number | undefined;
    }): void;
    /** A small engine: a pass-by (Doppler: pitch falls as it passes) or a cheerful rev. */
    engine(t: any, dur: any, out: any, { vel, f0, f1, passAt, pan0, pan1, rev }?: {
        vel?: number | undefined;
        f0?: number | undefined;
        f1?: number | undefined;
        passAt?: number | undefined;
        pan0?: number | undefined;
        pan1?: number | undefined;
        rev?: boolean | undefined;
    }): void;
    /** A generated room: decaying stereo noise as a convolver impulse. */
    reverb(seconds?: number, decay?: number): any;
}
