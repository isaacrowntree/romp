/**
 * romp/timing: how long words need on screen, as pure functions, so a film's
 * scene lengths come from its captions instead of being typed in by hand.
 *
 *   readingTime(text)          seconds a viewer needs to read it, once it's whole
 *   captionTiming(text)        typing, then holding it whole for its reading time
 *   timeline(scenes)           scene lengths from their captions, transitions that
 *                              never land on a caption's reading window, act cards
 *                              at a sane length; and the `covered` and `scenes`
 *                              options the check wants
 *
 * The defaults are the ones the text rules check against, so a film timed with
 * these passes `unfinished` and `unread` by construction.
 */
/** Words in a text (anything between spaces; `*highlight*` markers don't count). */
export function wordCount(text) {
    return text.replace(/\*/g, "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
/** Seconds a viewer needs to read a text (or a word count) once it's all on screen. */
export function readingTime(text, o = {}) {
    const words = typeof text === "number" ? text : wordCount(text);
    return Math.max(o.min ?? 1.5, (words * 60) / (o.wpm ?? 180));
}
/** Typing, then holding it whole for its reading time. */
export function captionTiming(text, o = {}) {
    const fps = o.fps ?? 30;
    const cps = o.cps ?? 30;
    const chars = [...text.replace(/\*/g, "")].length;
    const enterFrames = Math.round((o.enter ?? 0) * fps);
    const typeFrames = cps === Infinity ? 0 : Math.ceil((chars / cps) * fps);
    const holdFrames = Math.round((o.hold ?? readingTime(text, o)) * fps);
    const exitFrames = Math.round((o.exit ?? 0) * fps);
    return {
        chars,
        words: wordCount(text),
        enterFrames,
        typeFrames,
        holdFrames,
        exitFrames,
        totalFrames: enterFrames + typeFrames + holdFrames + exitFrames,
        typed(frame) {
            const t = frame - enterFrames;
            if (t < 0)
                return 0;
            if (typeFrames === 0 || t >= typeFrames)
                return chars;
            return Math.min(chars, Math.floor(((t + 1) / typeFrames) * chars));
        },
    };
}
/**
 * Lay out a film from its scenes. Each scene is at least as long as its
 * captions need (typing, then their reading time), plus the transitions at both
 * ends, so a transition never lands on a caption's reading window. Act cards
 * default to `actSeconds` (1.2 s). Extra length a scene asks for (`seconds`)
 * goes after its captions.
 */
export function timeline(specs, o = {}) {
    const fps = o.fps ?? 30;
    const fr = (s) => Math.round(s * fps);
    const trans = specs.map((s, i) => (i === 0 || s.transition === false ? 0 : fr(s.transition ?? o.transition ?? 0.5)));
    const scenes = [];
    let start = 0;
    specs.forEach((spec, i) => {
        const tIn = trans[i], tOut = trans[i + 1] ?? 0;
        const caps = [];
        let at = tIn + (spec.captions?.length ? fr(o.lead ?? 0.2) : 0);
        (spec.captions ?? []).forEach((c, k) => {
            const cs = typeof c === "string" ? { text: c } : c;
            if (k > 0)
                at += fr(cs.gap ?? o.gap ?? 0.15);
            const timing = captionTiming(cs.text, { ...o, ...cs, fps });
            caps.push({ text: cs.text, from: at, to: at + timing.totalFrames, at: start + at, timing });
            at += timing.totalFrames;
        });
        const need = at + (caps.length ? fr(o.tail ?? 0.2) : 0) + tOut;
        const asked = spec.seconds != null ? fr(spec.seconds) : spec.act ? fr(o.actSeconds ?? 1.2) : 0;
        const frames = Math.max(need, asked, tIn + tOut + 1);
        scenes.push({ ...spec, index: i, start, frames, transitionIn: tIn, transitionOut: tOut, captions: caps });
        start += frames - tOut;
    });
    const last = scenes[scenes.length - 1];
    const frames = last ? last.start + last.frames : 0;
    return {
        fps,
        frames,
        scenes,
        check: {
            covered: scenes.filter((s) => s.transitionIn > 0).map((s) => [s.start / fps, (s.start + s.transitionIn) / fps]),
            scenes: scenes.slice(1).map((s) => s.start / fps),
            sections: scenes.map((s) => ({ name: s.name, from: s.start / fps, to: (s.start + s.frames) / fps })),
        },
    };
}
/** A caption at a frame of its scene: is it on, how many characters are typed, and the typed text. */
export function captionAt(c, frame) {
    const on = frame >= c.from && frame < c.to;
    const typed = on ? c.timing.typed(frame - c.from) : 0;
    return { on, typed, text: [...c.text.replace(/\*/g, "")].slice(0, typed).join("") };
}
//# sourceMappingURL=index.js.map