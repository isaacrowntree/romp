/** The mix, and the two ways to hear a schedule: rendered offline (an
 * OfflineAudioContext → AudioBuffer/WAV, for frame-by-frame video renders) or
 * played live on a realtime AudioContext from any time t (for a viewer page).
 * Both run the SAME schedule function: write your score and cues once. */
import { Synth } from "./synth.js";
import { wavBase64 } from "./wav.js";
/** Transients lead the picture by about a frame (30 fps). */
export const LEAD = 1 / 30;
/**
 * Buses with a shared room: music, drums, sfx, voice → master → 70 Hz high-pass
 * → −5 dB low shelf at 160 Hz → glue compressor (−14 dB, 3:1) → destination.
 * Phone speakers: keep the energy in 200 Hz–6 kHz.
 */
export function createMix(s, opts = {}) {
    const ctx = s.ctx;
    const L = { music: 0.42, drums: 0.4, sfx: 0.95, voice: 0.8, master: 0.9, ...opts.levels };
    const S = { music: 0.25, drums: 0.1, sfx: 0.16, voice: 0.12, ...opts.sends };
    const master = s.gain(L.master);
    const hp = s.filter("highpass", 70, 0.7);
    const shelf = ctx.createBiquadFilter();
    shelf.type = "lowshelf";
    shelf.frequency.value = 160;
    shelf.gain.value = -5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    master.connect(hp).connect(shelf).connect(comp).connect(ctx.destination);
    const verb = s.reverb(opts.room ?? 1.8, 3);
    const verbOut = s.gain(0.28);
    verb.connect(verbOut).connect(master);
    const bus = (k) => {
        const g = s.gain(L[k]);
        g.connect(master);
        const send = s.gain(S[k]);
        g.connect(send).connect(verb);
        return g;
    };
    return { music: bus("music"), drums: bus("drums"), sfx: bus("sfx"), voice: bus("voice"), master };
}
/** Render a schedule offline, deterministically: same schedule → same samples. */
export async function renderOffline(schedule, opts) {
    const sr = opts.sampleRate ?? 48000;
    const ctx = new OfflineAudioContext(opts.channels ?? 2, Math.ceil(opts.duration * sr), sr);
    const s = new Synth(ctx);
    opts.extend?.(s);
    const buses = createMix(s, opts);
    await schedule(s, buses, (t) => (t < 0 ? null : t));
    return ctx.startRendering();
}
/** The same, as a base64 WAV (for a CLI or a page to save). */
export async function renderWav(schedule, opts) {
    return wavBase64(await renderOffline(schedule, opts));
}
/**
 * Play a schedule live on a realtime AudioContext from film time `from`.
 * Returns the context-time origin (film t = origin + t) and a stop().
 * Seek = stop() and play again from the new t. Everything before `from` is skipped.
 */
export async function playLive(ctx, schedule, opts = {}) {
    const from = opts.from ?? 0;
    const latency = opts.latency ?? 0.08;
    const s = new Synth(ctx);
    opts.extend?.(s);
    const buses = createMix(s, opts);
    // Everything goes through the master; disconnecting it silences this take.
    const origin = ctx.currentTime + latency - from;
    await schedule(s, buses, (t) => (t < from ? null : origin + t));
    return {
        origin,
        stop() {
            try {
                buses.master.disconnect();
            }
            catch {
                /* already stopped */
            }
        },
    };
}
//# sourceMappingURL=mix.js.map