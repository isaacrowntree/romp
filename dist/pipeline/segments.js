/**
 * Cut a film into render segments at scene boundaries, so a fix to one scene
 * re-renders only the segments that show it.
 *
 * Boundaries go at every scene's start and end, and at the start and end of
 * every declared transition, never strictly inside a transition: a transition
 * stays whole inside one segment. Where scenes overlap (a transition drawn
 * from both), that stretch becomes its own segment. Each segment lists every
 * scene it shows, so its cache key changes when any of them does.
 */
export function planSegments(scenes, o = {}) {
    if (!scenes.length)
        return [];
    const total = o.total ?? Math.max(...scenes.map((s) => s.from + s.frames));
    const trans = (o.transitions ?? []).map(([a, b]) => [Math.round(a), Math.round(b)]);
    const marks = new Set([0, total]);
    for (const s of scenes) {
        marks.add(s.from);
        marks.add(s.from + s.frames);
    }
    for (const [a, b] of trans) {
        marks.add(a);
        marks.add(b);
    }
    const cuts = [...marks].filter((c) => c >= 0 && c <= total && !trans.some(([a, b]) => c > a && c < b)).sort((x, y) => x - y);
    const out = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        const from = cuts[i], to = cuts[i + 1] - 1;
        if (to < from)
            continue;
        const here = scenes.filter((s) => s.from <= to && s.from + s.frames - 1 >= from).map((s) => s.name);
        out.push({ name: here.length ? here.join("→") : `gap@${from}`, from, to, scenes: here });
    }
    // Merge neighbours that show exactly the same scenes (a cut that split nothing).
    const merged = [];
    for (const s of out) {
        const last = merged[merged.length - 1];
        if (last && last.to + 1 === s.from && last.scenes.join("|") === s.scenes.join("|") && !trans.some(([a, b]) => s.from === a || s.from === b))
            last.to = s.to;
        else
            merged.push({ ...s });
    }
    return merged;
}
//# sourceMappingURL=segments.js.map