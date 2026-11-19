/**
 * The audio check: dropouts in a soundtrack. A music bed that cuts to near
 * silence for a moment (0.1–1 s) and comes back reads as a glitch, usually
 * where separately rendered pieces were joined with a gap. Runs on raw samples,
 * so it works on any WAV (`romp check --audio file.wav`) or AudioBuffer.
 */
/** Read a WAV file (PCM 8/16/24/32-bit or 32/64-bit float, any channel count). */
export function readWav(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
    if (tag(0) !== "RIFF" || tag(8) !== "WAVE")
        throw new Error("readWav: not a RIFF/WAVE file");
    let fmt = null;
    let o = 12;
    while (o + 8 <= bytes.length) {
        const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
        if (id === "fmt ") {
            let format = v.getUint16(body, true);
            // WAVE_FORMAT_EXTENSIBLE: the real format is the sub-format GUID's first two bytes.
            if (format === 0xfffe && size >= 26)
                format = v.getUint16(body + 24, true);
            fmt = { format, ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
        }
        else if (id === "data") {
            if (!fmt)
                throw new Error("readWav: data before fmt");
            const { format, ch, sr, bits } = fmt;
            const bps = bits / 8;
            const n = Math.floor(Math.min(size, bytes.length - body) / (bps * ch));
            const channels = Array.from({ length: ch }, () => new Float32Array(n));
            for (let i = 0; i < n; i++)
                for (let c = 0; c < ch; c++) {
                    const at = body + (i * ch + c) * bps;
                    let x;
                    if (format === 3)
                        x = bits === 64 ? v.getFloat64(at, true) : v.getFloat32(at, true);
                    else if (bits === 8)
                        x = (v.getUint8(at) - 128) / 128;
                    else if (bits === 16)
                        x = v.getInt16(at, true) / 32768;
                    else if (bits === 24)
                        x = ((v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16)) / 8388608);
                    else
                        x = v.getInt32(at, true) / 2147483648;
                    channels[c][i] = x;
                }
            return { sampleRate: sr, channels };
        }
        o = body + size + (size % 2);
    }
    throw new Error("readWav: no data chunk");
}
/** dBFS, floored at -120 (digital silence) so it stays a number in JSON. */
const dB = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);
/** RMS per window across all channels, dBFS. */
export function rmsWindows(a, window = 0.02) {
    const { sampleRate, channels } = pcm(a);
    const w = Math.max(1, Math.round(window * sampleRate));
    const n = channels[0]?.length ?? 0;
    const out = [];
    for (let s = 0; s + w <= n; s += w) {
        let sum = 0;
        for (const ch of channels)
            for (let i = s; i < s + w; i++)
                sum += ch[i] * ch[i];
        out.push(dB(Math.sqrt(sum / (w * channels.length))));
    }
    return out;
}
function pcm(a) {
    if ("channels" in a)
        return a;
    return { sampleRate: a.sampleRate, channels: Array.from({ length: a.numberOfChannels }, (_, c) => a.getChannelData(c)) };
}
/**
 * Dropouts: runs of near-silence between `min` and `max` seconds (0.1–1 s)
 * inside an otherwise continuous bed, with sound on both sides. The bed's level
 * is the median window of the sounding part; a gap is `drop` dB (30) under it.
 * Silence at the very start and end, and long rests, aren't dropouts.
 */
export function dropouts(a, o = {}) {
    const win = o.window ?? 0.02;
    const lv = rmsWindows(a, win);
    const sounding = lv.filter((x) => x > -70).sort((x, y) => x - y);
    if (!sounding.length)
        return [];
    const bed = sounding[Math.floor(sounding.length / 2)];
    const floor = o.floor ?? bed - (o.drop ?? 30);
    const minW = Math.ceil((o.min ?? 0.1) / win), maxW = Math.floor((o.max ?? 1) / win), around = Math.ceil((o.around ?? 0.25) / win);
    const out = [];
    const loud = (i) => lv[i] > floor;
    let i = 0;
    while (i < lv.length) {
        if (loud(i)) {
            i++;
            continue;
        }
        let j = i;
        while (j < lv.length && !loud(j))
            j++;
        const len = j - i;
        // Sound on both sides: most of the windows just before and just after are above the floor.
        const before = lv.slice(Math.max(0, i - around), i), after = lv.slice(j, j + around);
        const solid = (xs) => xs.length >= around && xs.filter((x) => x > floor).length >= 0.8 * around;
        if (len >= minW && len <= maxW && solid(before) && solid(after)) {
            const level = Math.max(...lv.slice(i, j));
            out.push({ t: +(i * win).toFixed(3), duration: +(len * win).toFixed(3), level: +level.toFixed(1), bed: +bed.toFixed(1) });
        }
        i = j;
    }
    return out;
}
/** Format dropouts for a terminal. */
export function formatDropouts(ds, file = "soundtrack") {
    if (!ds.length)
        return `audio check: ${file}, no dropouts`;
    const lines = ds.map((d) => `  ${d.t.toFixed(2).padStart(7)}s  dropout    ${d.duration.toFixed(2)} s at ${d.level <= -119 ? "silence" : `${d.level} dBFS`} (the bed is ${d.bed} dBFS)`);
    return `audio check: ${ds.length} dropout(s) in ${file}\n${lines.join("\n")}`;
}
//# sourceMappingURL=gaps.js.map