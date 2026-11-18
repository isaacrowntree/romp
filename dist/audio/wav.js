/** 16-bit PCM WAV of an AudioBuffer, as base64 (browser: uses btoa). */
export function wavBase64(buffer) {
    const ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, str) => { for (let i = 0; i < str.length; i++)
        data.setUint8(o + i, str.charCodeAt(i)); };
    w(0, "RIFF");
    data.setUint32(4, 36 + n * ch * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, ch, true);
    data.setUint32(24, sr, true);
    data.setUint32(28, sr * ch * 2, true);
    data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true);
    w(36, "data");
    data.setUint32(40, n * ch * 2, true);
    const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++)
        for (let c = 0; c < ch; c++) {
            const x = Math.max(-1, Math.min(1, chans[c][i]));
            data.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
            o += 2;
        }
    const bytes = new Uint8Array(data.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}
//# sourceMappingURL=wav.js.map