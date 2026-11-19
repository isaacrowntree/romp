/** romp/audio: synthesised voices and instruments, the mix, and offline or live playback of one schedule. */
export { Synth, midiHz, rng, fitTo } from "./synth.js";
export { Instruments } from "./instruments.js";
export { wavBase64 } from "./wav.js";
export * from "./mix.js";
export { listen, Score, type ScoreEvent, type ScoreFilter, type ListenOptions } from "./score.js";
export { crossfadeBed, type BedSection, type BedOptions } from "./bed.js";
export { readWav, dropouts, rmsWindows, formatDropouts, type PcmAudio, type Dropout, type DropoutOptions } from "./gaps.js";
