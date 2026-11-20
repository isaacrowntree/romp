const matches = (name, list) => (list ?? []).some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : p === name));
const visible = (p) => !!p && p.shown && p.opacity > 0.05 && p.area > 0 && !!p.box;
/** The gap between two boxes, px (0 when they touch or overlap). */
export function boxGap(a, b) {
    const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1), dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
    return Math.hypot(dx, dy);
}
export function screenIssues(frames, names, o, fps, hidden) {
    const out = [];
    const short = o.width && o.height ? Math.min(o.width, o.height) : (o.width ?? 1080);
    const allowed = (kind, name) => matches(name, o.allow?.[kind]) || frames.some((fr) => fr.row[name]?.allow?.includes(kind));
    const s1 = (n) => `${n.toFixed(n < 10 ? 1 : 0)} s`;
    // ── legibility ──────────────────────────────────────────────────────────────
    const minPx = o.legiblePx ?? (20 * short) / 1080;
    const legRun = Math.round((o.legibleSeconds ?? 0.5) * fps);
    const textMin = o.textPx ?? minPx;
    for (const name of names) {
        if (allowed("legibility", name))
            continue;
        let r = [];
        const flush = () => {
            if (r.length > legRun) {
                const rising = r.every((p, k) => k === 0 || p.px >= r[k - 1].px - 0.05);
                const falling = r.every((p, k) => k === 0 || p.px <= r[k - 1].px + 0.05);
                const moving = Math.abs(r[r.length - 1].px - r[0].px) > 0.5;
                if (!(moving && (rising || falling))) {
                    const worst = r.reduce((a, b) => (b.px < a.px ? b : a));
                    if (worst.words) {
                        out.push({ frame: r[0].f, name, kind: "legibility", detail: `its text renders at ${worst.px.toFixed(1)} px, under ${Math.round(textMin)} px, for ${s1(r.length / fps)}: set it bigger` });
                        r = [];
                        return;
                    }
                    out.push({
                        frame: r[0].f,
                        name,
                        kind: "legibility",
                        detail: `its ${worst.text} px text renders at ${worst.px.toFixed(1)} px (${worst.native} px wide content drawn at ${Math.round(worst.scale * 100)}%), under ${Math.round(minPx)} px, for ${s1(r.length / fps)}: zoom in, or crop to the part that matters`,
                    });
                }
            }
            r = [];
        };
        for (const { f, row } of frames) {
            const p = row[name];
            if (visible(p) && p.role === "text" && p.fontPx != null && p.opacity >= 0.5 && !hidden(f) && (!p.chars || p.chars.shown > 0)) {
                if (p.fontPx < textMin)
                    r.push({ f, px: p.fontPx, scale: 1, text: p.fontPx, native: 0, words: true });
                else
                    flush();
                continue;
            }
            if (!visible(p) || p.role !== "screen" || !p.native?.width || p.opacity < 0.5 || hidden(f)) {
                flush();
                continue;
            }
            const scale = (p.box.x1 - p.box.x0) / p.native.width;
            const text = p.minTextPx ?? o.minTextPx ?? 16;
            const px = scale * text;
            if (px < minPx)
                r.push({ f, px, scale, text, native: p.native.width });
            else
                flush();
        }
        flush();
    }
    // ── anchor ──────────────────────────────────────────────────────────────────
    const gapMax = o.anchorPx ?? 0.1 * short;
    const anchorRun = Math.round((o.anchorSeconds ?? 0.1) * fps);
    const groundTol = o.groundPx ?? 2;
    for (const name of names) {
        if (allowed("anchor", name))
            continue;
        let groundFlagged = false, gapFlagged = false;
        let gap = null;
        for (const { f, row } of frames) {
            const p = row[name];
            if (!visible(p) || hidden(f)) {
                // Gone: start over (one flag per dip below the line, one per drift away).
                groundFlagged = false;
                gap = null;
                gapFlagged = false;
                continue;
            }
            const b = p.box;
            if (p.ground == null || b.y1 - p.ground <= groundTol)
                groundFlagged = false;
            else if (!groundFlagged) {
                out.push({ frame: f, name, kind: "anchor", detail: `${Math.round(b.y1 - p.ground)} px of it below its ground line (y ${Math.round(p.ground)})${p.opacity < 0.99 ? " while it fades" : ""}: enter and leave above the line` });
                groundFlagged = true;
            }
            const a = p.anchor ? row[p.anchor] : undefined;
            if (p.anchor && visible(a)) {
                const g = boxGap(b, a.box);
                if (g > gapMax) {
                    gap = gap ? { ...gap, n: gap.n + 1, worst: Math.max(gap.worst, g) } : { f, n: 1, worst: g, to: p.anchor };
                    if (gap.n > anchorRun && !gapFlagged) {
                        out.push({ frame: gap.f, name, kind: "anchor", detail: `${Math.round(gap.worst)} px from ${gap.to}, the object it belongs to (over ${Math.round(gapMax)} px)` });
                        gapFlagged = true;
                    }
                }
                else
                    gap = null;
            }
        }
    }
    return out;
}
//# sourceMappingURL=screen.js.map