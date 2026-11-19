import { readingTime } from "../timing/index.js";
/**
 * The safe area's margins for a W×H frame, in px: 5% of the long side at each of
 * its ends (a phone's notch, rounded corners, status bar and home indicator sit
 * there), 3.5% of the short side at each of its edges. 1080×1920: 38 px left and
 * right, 96 px top and bottom; 1920×1080: 96 px left and right, 38 px top and
 * bottom. `safe` overrides: a share of each dimension, or margins in px.
 */
export function safeArea(W, H, safe) {
    if (typeof safe === "number")
        return { top: H * safe, bottom: H * safe, left: W * safe, right: W * safe };
    const portrait = H >= W;
    const def = portrait
        ? { top: Math.round(H * 0.05), bottom: Math.round(H * 0.05), left: Math.round(W * 0.035), right: Math.round(W * 0.035) }
        : { top: Math.round(H * 0.035), bottom: Math.round(H * 0.035), left: Math.round(W * 0.05), right: Math.round(W * 0.05) };
    return { ...def, ...safe };
}
const areaOf = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
/** The area two boxes share, px². */
export function boxOverlap(a, b) {
    return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
}
const matches = (name, list) => (list ?? []).some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : p === name));
const visible = (p) => !!p && p.shown && p.opacity > 0.05 && p.area > 0;
const legible = (p) => visible(p) && p.opacity >= 0.5;
const complete = (p) => !p.chars || p.chars.shown >= p.chars.total;
const s1 = (n) => `${n.toFixed(n < 10 ? 1 : 0)} s`;
const quote = (p) => {
    if (!p.text)
        return "";
    const t = p.chars ? p.text.slice(0, Math.max(0, p.chars.shown)) : p.text;
    const cut = t.length > 48 ? `${t.slice(0, 47)}…` : t;
    return ` ("${cut}${p.chars && p.chars.shown < p.chars.total ? "…" : ""}")`;
};
/** Seconds a text takes to read, from its words (or its characters, at ~6 a word). */
const needOf = (p, o) => readingTime(p.text ?? p.words ?? (p.chars ? Math.max(1, Math.round(p.chars.total / 6)) : 1), o.reading);
export function textIssues(frames, names, o, fps, hidden) {
    const out = [];
    const roles = new Map();
    for (const n of names) {
        const r = frames.find((fr) => fr.row[n]?.role)?.row[n].role;
        roles.set(n, r ?? (o.strict ? "prop" : undefined));
    }
    const texts = names.filter((n) => roles.get(n) === "text");
    if (!texts.length)
        return out;
    const allowed = (kind, name) => matches(name, o.allow?.[kind]) || frames.some((fr) => fr.row[name]?.allow?.includes(kind));
    const cuts = new Set((o.scenes ?? []).map((s) => Math.round(s * fps)));
    // A cut ends a text's time on screen: a scene start, or the first covered frame.
    const isCut = (i) => i > 0 && (cuts.has(frames[i].f) || (hidden(frames[i].f) && !hidden(frames[i - 1].f)));
    const run = (s) => Math.round(s * fps);
    // ── offsafe ────────────────────────────────────────────────────────────────
    if (o.width && o.height) {
        const W = o.width, H = o.height;
        const m = safeArea(W, H, o.safe);
        const minRun = run(o.offsafeSeconds ?? 0.1);
        for (const name of texts) {
            if (allowed("offsafe", name))
                continue;
            let r = [];
            const flush = () => {
                if (r.length > minRun) {
                    const rising = r.every((p, k) => k === 0 || p.over >= r[k - 1].over - 0.5);
                    const falling = r.every((p, k) => k === 0 || p.over <= r[k - 1].over + 0.5);
                    const moving = Math.abs(r[r.length - 1].over - r[0].over) > 2;
                    if (!(moving && (rising || falling))) {
                        const worst = r.reduce((a, b) => (b.over > a.over ? b : a));
                        out.push({ frame: r[0].f, name, kind: "offsafe", detail: `${Math.round(worst.over)} px past the ${worst.edge} safe margin (${Math.round(m[worst.edge])} px) for ${s1(r.length / fps)}` });
                    }
                }
                r = [];
            };
            for (const { f, row } of frames) {
                const p = row[name];
                if (!legible(p) || !p.box || hidden(f)) {
                    flush();
                    continue;
                }
                const b = p.box;
                const edges = { top: m.top - b.y0, bottom: b.y1 - (H - m.bottom), left: m.left - b.x0, right: b.x1 - (W - m.right) };
                const [edge, over] = Object.entries(edges).reduce((a, e) => (e[1] > a[1] ? e : a));
                if (over > 0.5)
                    r.push({ f, over, edge });
                else
                    flush();
            }
            flush();
        }
    }
    // ── unfinished, unread, empty ───────────────────────────────────────────────
    const emptyRun = run(o.emptySeconds ?? 0.2);
    const headingRun = run(o.headingSeconds ?? 0.5);
    /** per text, per frame index: frames it has been whole and legible in this appearance */
    const wholeFor = new Map();
    for (const name of texts) {
        const whole = new Array(frames.length).fill(0);
        wholeFor.set(name, whole);
        let open = false, full = 0, last = null, since = 0;
        let blank = 0, typing = 0, flaggedEmpty = false;
        const close = (i, why) => {
            if (open && last) {
                if (!complete(last)) {
                    if (!allowed("unfinished", name))
                        out.push({ frame: frames[i].f, name, kind: "unfinished", detail: `${why} at ${last.chars.shown} of ${last.chars.total} characters${quote(last)}` });
                }
                else {
                    const need = needOf(last, o);
                    if (full < Math.round(need * fps) && !allowed("unread", name))
                        out.push({ frame: frames[i].f, name, kind: "unread", detail: `${why} after ${s1(full / fps)} whole; it takes ${s1(need)} to read${quote(last)}` });
                }
            }
            open = false;
            full = 0;
            last = null;
            blank = 0;
            typing = 0;
            flaggedEmpty = false;
        };
        for (let i = 0; i < frames.length; i++) {
            const { f, row } = frames[i];
            const p = row[name];
            const vis = visible(p) && !hidden(f);
            if (open && isCut(i))
                close(i, cuts.has(f) ? "the scene cuts" : "covered");
            else if (open && !vis)
                close(i, "gone");
            if (!vis)
                continue;
            if (!open) {
                open = true;
                since = i;
            }
            last = p;
            if (complete(p) && legible(p))
                full++;
            whole[i] = full;
            // Empty: its box with no words; or a heading still typing well after it appears.
            if (allowed("empty", name) || flaggedEmpty)
                continue;
            blank = p.chars && p.chars.shown <= 0 ? blank + 1 : 0;
            typing = p.heading && !complete(p) ? typing + 1 : 0;
            if (blank > emptyRun) {
                out.push({ frame: frames[i - blank + 1].f, name, kind: "empty", detail: `its box shows with no words for over ${s1(emptyRun / fps)}` });
                flaggedEmpty = true;
            }
            else if (typing > headingRun && i - since + 1 === typing) {
                out.push({ frame: frames[since].f, name, kind: "empty", detail: `a heading still typing ${s1(typing / fps)} after it appears${quote(p)}: bring it in whole with its scene` });
                flaggedEmpty = true;
            }
        }
        // The checked range ends with it still on screen: what comes next is unknown, so no verdict.
    }
    // ── covers, overlap ─────────────────────────────────────────────────────────
    const coversRun = run(o.coversSeconds ?? 0.1), overlapRun = run(o.overlapSeconds ?? 0.2);
    const coversFrac = o.coversFraction ?? 0.05, overlapFrac = o.overlapFraction ?? 0.02;
    const runs = new Map();
    for (let i = 0; i < frames.length; i++) {
        const { f, row } = frames[i];
        if (hidden(f))
            continue;
        const here = names.filter((n) => roles.get(n) && legible(row[n]) && row[n].box);
        const ts = here.filter((n) => roles.get(n) === "text");
        const others = here.filter((n) => roles.get(n) !== "text");
        const bump = (key, kind, name, limit, detail) => {
            const r = runs.get(key);
            const cur = r && r.seen === i - 1 ? r : { start: f, n: 0, flagged: false, seen: i };
            cur.n++;
            cur.seen = i;
            runs.set(key, cur);
            if (cur.n > limit && !cur.flagged) {
                cur.flagged = true;
                out.push({ frame: cur.start, name, kind, detail: detail() });
            }
        };
        for (let a = 0; a < ts.length; a++) {
            const t = row[ts[a]], tb = t.box;
            for (let b = a + 1; b < ts.length; b++) {
                const u = row[ts[b]], ub = u.box;
                const share = boxOverlap(tb, ub) / Math.max(1, Math.min(areaOf(tb), areaOf(ub)));
                if (share > overlapFrac && !allowed("overlap", ts[a]) && !allowed("overlap", ts[b]))
                    bump(`o|${ts[a]}|${ts[b]}`, "overlap", ts[a], overlapRun, () => `overlaps the text ${ts[b]} (${Math.round(share * 100)}% of the smaller)`);
            }
            for (const n of others) {
                const q = row[n], qb = q.box;
                const shared = boxOverlap(tb, qb);
                if (shared <= 0)
                    continue;
                if (roles.get(n) === "focus") {
                    const share = shared / Math.max(1, areaOf(qb));
                    if (share > coversFrac && !allowed("covers", ts[a]) && !allowed("covers", n))
                        bump(`c|${ts[a]}|${n}`, "covers", ts[a], coversRun, () => `covers ${Math.round(share * 100)}% of the focus ${n}, the thing it's about`);
                }
                else {
                    // A prop drawn under the text (a backdrop, the device it captions) is fine.
                    if (q.z != null && t.z != null && q.z < t.z)
                        continue;
                    const share = shared / Math.max(1, Math.min(areaOf(tb), areaOf(qb)));
                    if (share > overlapFrac && !allowed("overlap", ts[a]) && !allowed("overlap", n))
                        bump(`p|${ts[a]}|${n}`, "overlap", ts[a], overlapRun, () => `${n} is drawn over it (${Math.round(share * 100)}% of the smaller)`);
                }
            }
        }
    }
    // ── stale ───────────────────────────────────────────────────────────────────
    if (o.stale || (o.strict && o.stale !== false)) {
        const limit = run(typeof o.stale === "number" ? o.stale : 3);
        const same = (a, b) => {
            if (!a || !b)
                return !a && !b;
            if (a.shown !== b.shown)
                return false;
            if (!a.shown)
                return true;
            return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.area - b.area) <= 0.01 * Math.max(a.area, b.area, 1) && Math.abs(a.opacity - b.opacity) < 0.01 && (a.chars?.shown ?? -1) === (b.chars?.shown ?? -1);
        };
        let n = 0, start = 0, who = "";
        const flush = () => {
            if (n > limit && !allowed("stale", who))
                out.push({ frame: start, name: who, kind: "stale", detail: `nothing moves for ${s1(n / fps)} after its words were read: cut sooner, or give the eye something` });
            n = 0;
        };
        for (let i = 1; i < frames.length; i++) {
            const { f, row } = frames[i];
            const prev = frames[i - 1].row;
            const still = !hidden(f) && !isCut(i) && names.every((k) => same(prev[k], row[k]));
            const onScreen = texts.filter((t) => legible(row[t]));
            const read = onScreen.length > 0 && onScreen.every((t) => wholeFor.get(t)[i] >= Math.round(needOf(row[t], o) * fps));
            if (still && read) {
                if (n === 0) {
                    start = f;
                    who = onScreen[0];
                }
                n++;
            }
            else
                flush();
        }
        flush();
    }
    return out;
}
//# sourceMappingURL=text.js.map