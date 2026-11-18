export class Instruments {
    /** @param s the soundtrack's Synth (its context, shared noise and plumbing) */
    constructor(s: any);
    s: any;
    ctx: any;
    ksCache: Map<any, any>;
    gain(v: any): any;
    pan(p: any, out: any): any;
    filter(type: any, f: any, q: any): any;
    noiseSrc(t: any, dur: any, seed: any): any;
    env(t: any, o: any): any;
    /** Karplus–Strong plucked string: a burst of noise in a damped delay line. Sounds like a nylon guitar / harp. */
    pluck(t: any, midi: any, out: any, { vel, bright, dur, pan, seed }?: {
        vel?: number | undefined;
        bright?: number | undefined;
        dur?: number | undefined;
        pan?: number | undefined;
        seed?: number | undefined;
    }): void;
    /** A soft kick: a pitch-dropped sine with a felt click on top. */
    kick(t: any, out: any, { vel }?: {
        vel?: number | undefined;
    }): void;
    /** Shaker: high-passed noise, a short swell. */
    shaker(t: any, out: any, { vel, seed }?: {
        vel?: number | undefined;
        seed?: number | undefined;
    }): void;
    /**
     * Rhodes-style electric piano: 2-op FM (sine modulating sine at 1:1) whose
     * index decays — the warm bell of a DX "E.Piano" — plus a short high tine.
     * Round and clean: no saws, nothing buzzy.
     */
    rhodes(t: any, midi: any, out: any, { vel, dur, pan }?: {
        vel?: number | undefined;
        dur?: number | undefined;
        pan?: number | undefined;
    }): void;
    /** Acoustic piano: slightly inharmonic partials, brighter when struck harder, and a felt hammer. */
    piano(t: any, midi: any, out: any, { vel, dur, pan }?: {
        vel?: number | undefined;
        dur?: number | undefined;
        pan?: number | undefined;
    }): void;
    /** Upright bass: a low plucked string (Karplus–Strong, dark) with a finger thump. */
    upright(t: any, midi: any, out: any, { vel, dur }?: {
        vel?: number | undefined;
        dur?: number | undefined;
    }): void;
    /** Rim click (the bossa clave): a woody tock. */
    rim(t: any, out: any, { vel, seed }?: {
        vel?: number | undefined;
        seed?: number | undefined;
    }): void;
    /** Brushes on a snare: a soft swept swish. */
    brush(t: any, out: any, { vel, dur, seed }?: {
        vel?: number | undefined;
        dur?: number | undefined;
        seed?: number | undefined;
    }): void;
}
