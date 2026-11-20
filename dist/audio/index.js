/** romp/audio: synthesised voices and instruments, the mix, and offline or live playback of one schedule. */
export { Synth, midiHz, rng, fitTo } from "./synth.js";
export { Instruments } from "./instruments.js";
export { wavBase64 } from "./wav.js";
export * from "./mix.js";
export { listen, Score } from "./score.js";
export { crossfadeBed } from "./bed.js";
export { readWav, dropouts, rmsWindows, formatDropouts } from "./gaps.js";
import { keyOf } from "../pipeline/key.js";
/**
 * The cache key of a soundtrack: the schedule (by its source), the render
 * options (duration, mix, voices added with `extend`) and whatever data the
 * schedule reads (the timeline, a cue list, synth params): pass those as
 * `deps`, since a function's source doesn't show the values it closes over.
 * Same key, same samples. `romp sound --cache` keys by the whole bundled module.
 */
export function soundKey(schedule, opts, ...deps) {
    return keyOf("romp-sound-1", schedule, opts, deps);
}
//# sourceMappingURL=index.js.map