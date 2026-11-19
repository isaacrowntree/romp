/**
 * One continuous bed under a whole cut. Scenes that each write their own music
 * leave holes where they join (a section stops on its last bar, the next one
 * starts on its first); `crossfadeBed()` gives each section its own gain, runs each one
 * `fade` seconds past its joins, and crossfades them, so the music never drops
 * out between scenes.
 *
 *   crossfadeBed(s, bus.music, [
 *     { from: 0, to: 12.4, write: (out, t0, t1) => groove(s, out, t0, t1) },
 *     { from: 12.4, to: 40, write: (out, t0, t1) => pads(s, out, t0, t1) },
 *   ], { fade: 0.6 });
 */
/**
 * Lay sections end to end as one bed: each section's `to` is stretched to the
 * next one's `from` (no gaps, ever), each is written `fade / 2` past both ends,
 * and an equal-power crossfade joins them. Returns the joins (seconds).
 */
export function crossfadeBed(s, out, sections, o = {}) {
    const fade = o.fade ?? 0.5;
    const half = fade / 2;
    const list = [...sections].sort((a, b) => a.from - b.from);
    const joins = [];
    list.forEach((sec, i) => {
        const next = list[i + 1];
        const to = next ? next.from : sec.to;
        const fadeIn = i > 0, fadeOut = !!next;
        const level = sec.level ?? 1;
        const g = s.gain(fadeIn ? 0 : level);
        g.connect(out);
        const p = g.gain;
        const t0 = Math.max(0, sec.from - (fadeIn ? half : 0));
        const t1 = to + (fadeOut ? half : 0);
        // Equal-power curve, sampled: the sum of the two sections holds its loudness through the join.
        const curve = (a, b, up) => {
            const steps = 8;
            for (let k = 0; k <= steps; k++) {
                const x = k / steps;
                p.linearRampToValueAtTime(level * (up ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2)), a + (b - a) * x);
            }
        };
        p.setValueAtTime(fadeIn ? 0 : level, t0);
        if (fadeIn)
            curve(t0, sec.from + half, true);
        if (fadeOut) {
            p.setValueAtTime(level, to - half);
            curve(to - half, t1, false);
            joins.push(to);
        }
        sec.write(g, t0, t1);
    });
    return joins;
}
//# sourceMappingURL=bed.js.map