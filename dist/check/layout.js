const areaOf = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const inFrame = (b, W, H) => ({ x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(W, b.x1), y1: Math.min(H, b.y1) });
const matches = (name, list) => (list ?? []).some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : p === name));
const seen = (p) => !!p && p.shown && p.onScreen && p.opacity > 0.05 && p.area > 0;
const s1 = (n) => `${n.toFixed(n < 10 ? 1 : 0)} s`;
/** The share of a W×H frame the boxes cover together, on a grid (~1% accuracy). */
export function unionShare(boxes, W, H, cells = 64) {
    if (!boxes.length)
        return 0;
    const cw = W / cells, ch = H / cells;
    let hit = 0;
    for (let gy = 0; gy < cells; gy++) {
        const y = (gy + 0.5) * ch;
        for (let gx = 0; gx < cells; gx++) {
            const x = (gx + 0.5) * cw;
            if (boxes.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1))
                hit++;
        }
    }
    return hit / (cells * cells);
}
export function layoutIssues(frames, names, o, fps, hidden) {
    const out = [];
    const role = new Map(names.map((n) => [n, frames.find((fr) => fr.row[n]?.role)?.row[n].role]));
    const anyRole = [...role.values()].some(Boolean);
    const allowed = (kind, name) => matches(name, o.allow?.[kind]) || frames.some((fr) => fr.row[name]?.allow?.includes(kind));
    const run = (s) => Math.round(s * fps);
    // ── blank ───────────────────────────────────────────────────────────────────
    if (o.blankSeconds !== false && (anyRole || o.strict) && names.length) {
        const limit = run(o.blankSeconds ?? 0.5);
        let start = -1, n = 0;
        const flush = () => {
            if (n > limit)
                out.push({ frame: start, name: "(frame)", kind: "blank", detail: `nothing tracked is visible for ${s1(n / fps)}: an empty frame, not a transition` });
            n = 0;
        };
        for (const { f, row } of frames) {
            if (hidden(f)) {
                flush();
                continue;
            }
            const any = names.some((k) => role.get(k) !== "background" && seen(row[k]));
            if (any)
                flush();
            else {
                if (n === 0)
                    start = f;
                n++;
            }
        }
        flush();
    }
    // ── clipped ─────────────────────────────────────────────────────────────────
    if (o.width && o.height) {
        const W = o.width, H = o.height;
        const frac = o.clippedFraction ?? 0.01;
        const minRun = run(o.clippedSeconds ?? 0.5);
        for (const name of names) {
            if (role.get(name) !== "screen" || allowed("clipped", name))
                continue;
            let r = [];
            const flush = () => {
                if (r.length > minRun) {
                    const rising = r.every((p, k) => k === 0 || p.share >= r[k - 1].share - 0.005);
                    const falling = r.every((p, k) => k === 0 || p.share <= r[k - 1].share + 0.005);
                    const moving = Math.abs(r[r.length - 1].share - r[0].share) > 0.02;
                    if (!(moving && (rising || falling))) {
                        const worst = r.reduce((a, b) => (b.share < a.share ? b : a));
                        const pct = (1 - worst.share) * 100;
                        out.push({ frame: r[0].f, name, kind: "clipped", detail: `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% of its content is cut off by a clipping container for ${s1(r.length / fps)}: fit the content to its device, or crop on purpose with allowCrop` });
                    }
                }
                r = [];
            };
            for (const { f, row } of frames) {
                const p = row[name];
                if (!seen(p) || !p.box || p.allowCrop || hidden(f)) {
                    flush();
                    continue;
                }
                const whole = areaOf(inFrame(p.box, W, H));
                const vis = p.clip ? areaOf(inFrame(p.clip, W, H)) : whole;
                const share = whole > 0 ? vis / whole : 1;
                if (share < 1 - frac)
                    r.push({ f, share, by: p.clip });
                else
                    flush();
            }
            flush();
        }
    }
    // ── occupancy ───────────────────────────────────────────────────────────────
    if (o.occupancy && o.width && o.height) {
        const W = o.width, H = o.height;
        const cfg = typeof o.occupancy === "object" ? o.occupancy : typeof o.occupancy === "number" ? { share: o.occupancy } : {};
        const min = cfg.share ?? 0.2;
        const limit = run(cfg.seconds ?? 2);
        let start = -1, n = 0, worst = 1;
        const flush = () => {
            if (n > limit)
                out.push({ frame: start, name: "(frame)", kind: "occupancy", detail: `what's tracked covers ${Math.round(worst * 100)}% of the frame for ${s1(n / fps)} (under ${Math.round(min * 100)}%): bring it closer, or fill the frame` });
            n = 0;
            worst = 1;
        };
        for (const { f, row } of frames) {
            if (hidden(f)) {
                flush();
                continue;
            }
            const boxes = names.filter((k) => role.get(k) !== "background" && seen(row[k]) && !!row[k].box).map((k) => inFrame(row[k].clip ?? row[k].box, W, H));
            const share = unionShare(boxes, W, H);
            if (share < min) {
                if (n === 0)
                    start = f;
                n++;
                worst = Math.min(worst, share);
            }
            else
                flush();
        }
        flush();
    }
    return out;
}
//# sourceMappingURL=layout.js.map