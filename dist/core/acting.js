/** Acting: what makes a drawn character read as alive rather than animated,
 * as pure functions of the frame (any frame, any order, the same every render):
 *
 * - speech: words become syllables with real timing (`syllables`), the mouth
 *   opens and rounds on each vowel (`talk`) and the voice can speak the very
 *   same syllables (`babble({ syllables })` in romp/audio), so lips and sound
 *   agree;
 * - eyes: they jump to what matters and hold (saccades in 3 frames), drift a
 *   little while they hold, blink on a big look, and the head follows the eyes
 *   a beat later (`gaze`);
 * - a jump has a crouch before it, a stretch that follows its speed, a hang at
 *   the top and a landing sized by how far it fell (`jump`);
 * - quick reactions with an anticipation each: surprise, giggle, nod, shake (`react`);
 * - squash keeps the body's volume (`keepVolume`).
 *
 * Frames are at the stage's fps (default 30); times in a speech are seconds. */
import { jiggle, landing } from "./motion.js";
/** A deterministic hash of two integers into [0, 1). */
export function hash01(a, b = 0) {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/**
 * The width that keeps a squashed body's volume: `squashY ** -k`. k = 1 keeps
 * its area exactly (squashed to 0.8 tall → 1.25 wide); the default 0.7 reads
 * as rubbery without the drawing spreading too far.
 */
export const keepVolume = (squashY, k = 0.7) => Math.pow(Math.max(0.05, squashY), -k);
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const STOP = /[,.;:!?…，。；：！？、]/u;
const VOWEL_OF = { a: "a", e: "e", i: "i", y: "i", o: "o", u: "u" };
const CJK_VOWELS = ["a", "a", "e", "i", "i", "o", "u", "u"];
/** A Latin word's syllables: its vowel groups (a word-final silent e joins the one before). */
function wordSyllables(word) {
    const w = word.toLowerCase();
    const groups = [...w.matchAll(/[aeiouy]+/g)];
    if (!groups.length)
        return /[a-z]/.test(w) ? [{ text: word, vowel: w.length <= 3 && /^h?m+$/.test(w) ? "m" : "e" }] : [...w.replace(/[^0-9]/g, "")].map((d) => ({ text: d, vowel: "e" }));
    if (groups.length > 1) {
        const last = groups[groups.length - 1];
        if (last[0] === "e" && last.index === w.length - 1 && !/le$/.test(w))
            groups.pop();
    }
    return groups.map((g, i) => {
        const from = i === 0 ? 0 : groups[i - 1].index + groups[i - 1][0].length;
        return { text: g[0], vowel: VOWEL_OF[g[0][0] === "y" && g[0].length > 1 ? g[0][1] : g[0][0]] ?? "e", onset: w.slice(from, g.index).replace(/[^a-z]/g, "") };
    });
}
/**
 * A line of words as timed syllables. English: one per vowel group; Chinese,
 * Japanese and Korean: one per character. Pauses after punctuation, a breath
 * between words, stressed syllables a little longer. Pure: the same text and
 * seed give the same timing, so a mouth and a voice made from it agree.
 */
export function syllables(text, o = {}) {
    const rate = o.rate ?? 8, seed = o.seed ?? 1, pause = o.pause ?? 0.16, gap = o.gap ?? 0.03;
    const out = [];
    let t = 0, n = 0;
    const say = (s, stress) => {
        const len = (1 / rate) * (0.75 + 0.5 * hash01(seed, n)) * (stress ? 1.25 : 1);
        out.push({ t0: t, t1: t + len, vowel: s.vowel, stress, text: s.text, ...(s.onset ? { onset: s.onset } : {}) });
        t += len;
        n++;
    };
    // Words, CJK characters and stops, in order.
    for (const m of text.matchAll(/[\p{L}\p{N}']+|[,.;:!?…，。；：！？、]|\s+/gu)) {
        const tok = m[0];
        if (/^\s+$/.test(tok)) {
            if (out.length)
                t += gap;
            continue;
        }
        if (STOP.test(tok)) {
            if (out.length) {
                t += pause;
                const last = out[out.length - 1];
                const e = /[?？]/.test(tok) ? "?" : /[!！]/.test(tok) ? "!" : /[.。…]/.test(tok) ? "." : ",";
                if (!last.end || e !== ",")
                    last.end = e;
            }
            continue;
        }
        if (CJK.test(tok)) {
            // Each character a syllable; mixed tokens (e.g. "PEARL店") split into runs.
            for (const run of tok.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? []) {
                if (CJK.test(run))
                    say({ text: run, vowel: CJK_VOWELS[Math.floor(hash01(run.codePointAt(0), 7) * CJK_VOWELS.length)] }, n % 4 === 0);
                else
                    wordSyllables(run).forEach((s, i) => say(s, i === 0));
            }
            continue;
        }
        const syl = wordSyllables(tok);
        syl.forEach((s, i) => say(s, syl.length > 1 ? i === 0 : tok.length > 3));
    }
    if (out.length && !out[out.length - 1].end)
        out[out.length - 1].end = ".";
    if (o.fit && t > 0 && out.length) {
        const end = out[out.length - 1].t1;
        const k = o.fit / end;
        for (const s of out) {
            s.t0 *= k;
            s.t1 *= k;
        }
    }
    return out;
}
/**
 * The melody of a line: what makes gibberish understandable is the intention in
 * its pitch, not the words. Each phrase starts high and drifts down
 * (declination); stressed syllables get a pitch accent; a statement falls at
 * its end, a mid-sentence pause lifts a little (more to come), a question
 * rises, and an exclamation is higher and louder throughout. `swing` (0–1) is
 * how sing-song the voice is: seeded wobble around the contour.
 */
export function prosody(syl, o = {}) {
    const swing = o.swing ?? 0.35, seed = o.seed ?? 1;
    const out = [];
    let start = 0;
    for (let i = 0; i < syl.length; i++) {
        if (!syl[i].end && i < syl.length - 1)
            continue;
        const end = syl[i].end ?? ".";
        const n = i - start + 1;
        const lift = end === "!" ? 3 : 0;
        for (let k = start; k <= i; k++) {
            const u = n > 1 ? (k - start) / (n - 1) : 1;
            const s = syl[k];
            let st = lift + 3 * (1 - u) + (s.stress ? 2 : 0) + (hash01(seed + 3, k) - 0.5) * 4 * swing;
            let st1 = st - 0.3;
            if (k === i) {
                if (end === ".")
                    st1 = st - 4;
                else if (end === ",")
                    st1 = st + 2;
                else if (end === "?") {
                    st += 2;
                    st1 = st + 5;
                }
                else if (end === "!")
                    st1 = st + 2;
            }
            out.push({ st0: st, st1, gain: end === "!" ? (k === i ? 1.3 : 1.12) : s.stress ? 1.1 : 0.9 });
        }
        start = i + 1;
    }
    return out;
}
/** How long a line of syllables lasts (seconds). */
export const speechLength = (syl) => (syl.length ? syl[syl.length - 1].t1 : 0);
/**
 * The mouth at `t` seconds into a line (sound time): each syllable snaps open
 * on its vowel, holds, and closes by 95% of its length (the same envelope
 * `babble` voices), round for o/u, wide for i, closed in pauses and for the
 * first frames after m, b or p. The mouth leads the sound by `lead` (2 frames).
 */
export function talk(t0, syl, o = {}) {
    const fps = o.fps ?? 30;
    let t = t0 + (o.lead ?? 2 / fps);
    // On twos: every mouth is held at least 2 frames (no 1-frame flicker).
    if (o.onTwos ?? true)
        t = Math.floor(t * (fps / 2)) / (fps / 2);
    const end = speechLength(syl);
    let idx = -1;
    for (let k = 0; k < syl.length; k++)
        if (t >= syl[k].t0 && t < syl[k].t1)
            idx = k;
    if (idx < 0)
        return { open: 0, vowel: "m", mouth: "closed", talking: t >= 0 && t < end, beat: 0 };
    const s = syl[idx], next = syl[idx + 1];
    const len = s.t1 - s.t0, u = (t - s.t0) / len;
    // m, b, p (and f, v) close the lips before the vowel: at least 3 frames shut.
    if (s.onset && /[mbpfv]$/.test(s.onset) && t - s.t0 < (o.closed ?? 3 / fps))
        return { open: 0, vowel: s.vowel, mouth: "closed", talking: true, beat: 0 };
    // Inside a word the jaw doesn't shut between syllables (unless the next one starts on the lips).
    const joined = !!next && next.t0 - s.t1 < 0.02 && !(next.onset && /[mbpfv]$/.test(next.onset));
    let env = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.35); // vowels pop open, no in-between
    if (joined)
        env = Math.max(env, 0.5);
    const peak = s.vowel === "m" ? 0.15 : s.stress ? 1 : 0.75;
    const open = env * peak;
    const mouth = open < 0.2 ? "closed" : s.vowel === "o" || s.vowel === "u" ? "round" : s.vowel === "i" ? "wide" : "open";
    return { open, vowel: s.vowel, mouth, talking: true, beat: s.stress ? env * (1 - u) : 0 };
}
/** A talking character's body: the jaw's small squash and a nod on every stressed syllable, over its idle. */
export function talkPose(frame, t, syl, seed = 0, o = {}) {
    const sp = talk(t, syl, o);
    // The head's beat leads the sound further than the mouth (3–4 frames).
    const ahead = talk(t + 2 / 30, syl, o);
    const i = alive(frame, seed);
    // Talking is mostly in the mouth, but the body carries the phrase: a slow
    // lean across it, and a dip with a nod on each stressed syllable, led by a
    // small lift 3 frames before (its anticipation).
    const lift = talk(t + 5 / 30, syl, o).beat - ahead.beat;
    const squashY = i.squashY + 0.012 * sp.open - 0.04 * ahead.beat + 0.015 * Math.max(0, lift);
    const lean = 3 * Math.sin((2 * Math.PI * frame) / 84 + seed);
    return { ...i, squashY, squashX: i.squashX * keepVolume(squashY / i.squashY), tilt: i.tilt + lean + 6 * ahead.beat, speech: sp };
}
// ── Eyes ──────────────────────────────────────────────────────────────────
/** Blink shapes (0 open … 1 shut), frame by frame at 30 fps: they close fast and
 * open a little slower, and stay short (a blink of 5 frames already reads as
 * sleepy). Regular: half, shut 2, half, nearly open. Long (with a big look, a
 * change of thought): 2 closing, 2 shut, 3 opening. */
export const BLINK = [0.5, 1, 1, 0.45, 0.1];
export const LONG_BLINK = [0.4, 0.8, 1, 1, 0.6, 0.3, 0.1];
/**
 * Eyes that jump and hold, the way eyes do: each look is a saccade of a few
 * frames, then a hold with small drifts (every 1.2–2.5 s, never in the first
 * 20 frames of a look), a blink with a big change of look, and the head
 * following the eyes on a critically damped spring a couple of frames behind.
 */
export function gaze(frame, o = {}) {
    const seed = o.seed ?? 0, wander = o.wander ?? 0.18, sac = o.saccade ?? 3, w = o.follow ?? 0.3, delay = o.delay ?? 2;
    const keys = [...(o.keys ?? [])].sort((a, b) => a.at - b.at);
    const steps = [];
    const base = (f) => {
        let k;
        for (const x of keys)
            if (x.at <= f)
                k = x;
        return k ?? { at: -Infinity, x: 0, y: 0 };
    };
    const from = Math.min(keys[0]?.at ?? 0, frame) - 240;
    // Pursuit: a look marked `pursue` glides to the next key's, in small steps every frame.
    keys.forEach((k, i) => {
        // A look that ends a pursuit (the eyes are already there) brings no blink.
        steps.push({ at: k.at, x: k.x, y: k.y ?? 0, pursuit: !!keys[i - 1]?.pursue });
        const next = keys[i + 1];
        if (k.pursue && next)
            for (let f = k.at + 1; f < next.at; f++) {
                const u = (f - k.at) / (next.at - k.at);
                steps.push({ at: f, x: k.x + (next.x - k.x) * u, y: (k.y ?? 0) + ((next.y ?? 0) - (k.y ?? 0)) * u, pursuit: true });
            }
    });
    if (wander > 0) {
        const SLOT = 55;
        for (let s = Math.floor(from / SLOT); s * SLOT <= frame; s++) {
            const at = s * SLOT + Math.floor(hash01(seed, s) * 20);
            const b = base(at);
            if (at - b.at < 20 || b.pursue)
                continue;
            steps.push({ at, x: clamp(b.x + (hash01(seed + 31, s) - 0.5) * 2 * wander, -1, 1), y: clamp((b.y ?? 0) + (hash01(seed + 57, s) - 0.5) * wander, -1, 1) });
        }
    }
    steps.sort((a, b) => a.at - b.at);
    // The dip: keys are known ahead, so a big look can be anticipated (a dip that
    // starts 4 frames before the eyes move and is gone 6 after).
    let dip = 0, prev = 0;
    for (const k of keys) {
        const d = Math.abs(k.x - prev);
        prev = k.x;
        if (d < 0.5)
            continue;
        const u = (frame - (k.at - 4)) / 10;
        if (u > 0 && u < 1)
            dip = Math.max(dip, Math.sin(Math.PI * u) * Math.min(1, d));
    }
    let x = 0, y = 0, head = 0, blink = 0, px = 0, py = 0, lastBlink = -Infinity;
    for (const s of steps) {
        if (s.at > frame)
            break;
        const dx = s.x - px, dy = s.y - py;
        const u = smooth((frame - s.at) / sac);
        x += dx * u;
        y += dy * u;
        const th = frame - s.at - delay;
        // The head: a slightly underdamped spring (overshoots ~5% and settles), like a turn's accent.
        if (th > 0) {
            const z = 0.75, wd = w * Math.sqrt(1 - z * z);
            head += dx * (1 - Math.exp(-z * w * th) * (Math.cos(wd * th) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * th)));
        }
        // A blink with a big look, starting with it (people blink on almost every
        // large gaze shift): a long blink, 3 closing, 2 shut, 4 opening. Mid-sized
        // looks blink sometimes, more often the bigger they are.
        const ad = Math.abs(dx), e = frame - s.at;
        const wants = !s.pursuit && s.at - lastBlink >= 12 && (ad >= 0.5 || (ad >= 0.3 && hash01(seed + 7, s.at) < (ad - 0.3) / 0.2));
        if (wants) {
            lastBlink = s.at;
            const shape = ad >= 0.9 ? LONG_BLINK : BLINK;
            if (e >= 0 && e < shape.length)
                blink = Math.max(blink, shape[e]);
        }
        px = s.x;
        py = s.y;
    }
    return { x, y, head, blink, dip };
}
/**
 * One jump from `at`: a crouch (anticipation), take-off stretched by its
 * speed, a parabola that hangs at the top, then the landing squash sized by
 * how hard it came down. Volume kept throughout.
 */
export function jump(frame, at, o = {}) {
    const wt = Math.min(1, Math.max(0, o.weight ?? 0.4)), give = 1.3 - 0.75 * wt; // how much it squashes and stretches
    const H = o.height ?? 120, air = Math.max(4, o.air ?? 16), crouch = Math.max(1, o.crouch ?? 5 + Math.round(3 * Math.max(0, wt - 0.4) / 0.6)), seed = o.seed ?? 0;
    const off = at + crouch, land = off + air;
    const i = alive(frame, seed);
    if (frame < at)
        return { y: 0, pose: i, contact: false, phase: "before" };
    if (frame < off) {
        const u = smooth((frame - at) / crouch);
        const sy = 1 - 0.13 * give * u;
        return { y: 0, pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: i.tilt + 4 * u, lift: -1.5 * u, blink: 0 }, contact: frame >= off - 1, phase: "crouch" };
    }
    if (frame < land) {
        const u = (frame - off) / air;
        const v = 1 - 2 * u; // up +1 … down -1
        const sy = 1 + 0.13 * give * Math.abs(v) ** 1.5; // stretched by speed, round at the top
        return {
            y: -H * 4 * u * (1 - u),
            // The hat drags 2 frames behind the body (follow-through).
            // Drag: rising, the hat is pressed down onto the head; falling, it floats up off it (2 frames behind the body).
            pose: { squashY: sy, squashX: keepVolume(sy), tilt: -8 * (1 - 2 * Math.max(0, frame - 2 - off) / air), lift: -3 * (1 - 2 * Math.max(0, frame - 2 - off) / air), blink: 0, jiggle: jiggle(frame - off, 0.5) },
            contact: frame - off <= 1,
            phase: "air",
        };
    }
    // A hop lands softly; only a long fall hits hard (the squash never flattens it).
    const strength = Math.min(1.0, (0.4 + H / 400) * give);
    const p = landing(frame, land, seed, strength);
    return { y: 0, pose: { ...p, squashX: keepVolume(p.squashY / i.squashY) * i.squashX }, contact: frame - land <= 2, phase: "landed" };
}
/** Frames a take lasts with these options (Infinity if it keeps its settle). */
export function takeLength(o = {}) {
    const hard = (o.accent ?? "hard") === "hard";
    return (o.antic ?? 6) + (o.pop ?? (hard ? 2 : 9)) + (o.hold ?? (hard ? 3 : 0)) + (o.settle ?? 9) + (o.keep ?? 8) + (o.release ?? 10);
}
/**
 * A take's curve at `dt` frames from its start: 0 at rest, −anticDepth at the
 * end of the anticipation, 1 at the accent, settleLevel once settled, then back
 * to 0. Map it onto any pose (a squash, a lean, a head turn). `pop` is the
 * frame the accent lands on (mark it as a contact for the motion check).
 */
export function takeCurve(dt, o = {}) {
    const hard = (o.accent ?? "hard") === "hard";
    const antic = o.antic ?? 6, depth = o.anticDepth ?? 0.35, pop = Math.max(1, o.pop ?? (hard ? 2 : 9)), hold = o.hold ?? (hard ? 3 : 0);
    const settle = o.settle ?? 9, level = o.settleLevel ?? 0.5, keep = o.keep ?? 8, release = o.release ?? 10;
    const t1 = antic, t2 = t1 + pop, t3 = t2 + hold, t4 = t3 + settle, t5 = t4 + keep, t6 = t5 + release;
    const at = (v, phase, smear = 0) => ({ v, phase, pop: t2, smear });
    if (dt < 0)
        return at(0, "rest");
    // Out of the start gently, into the anticipation pose slowly (ease-in-out, weighted to the end).
    if (dt < t1)
        return at(-depth * (1 - Math.pow(1 - smooth(dt / t1), 1.6)), "antic");
    if (dt < t2) {
        const u = (dt - t1 + 1) / pop;
        if (hard) {
            // The pop: a fast in-between (half way, stretched along the move: the
            // smear), then past the accent (an overshoot), then the accent itself.
            if (dt === t1)
                return at(0.5, "accent", o.smear ?? true ? 1 : 0);
            return at(1 + 0.12 * (1 - (dt - t1 - 1) / Math.max(1, pop - 1)), "accent");
        }
        return at(-depth + (1 + depth) * (1 - Math.pow(1 - Math.min(1, u), 3)), "accent");
    }
    if (dt < t3)
        return at(1, "accent");
    if (dt < t4) {
        const u = (dt - t3) / settle;
        // Hard: bounce back past the settle and in (a damped spring); soft: ease in (no bounce).
        const k = hard ? Math.exp(-4.2 * u) * Math.cos(Math.PI * 1.6 * u) : Math.pow(1 - u, 3);
        return at(level + (1 - level) * k, "settle");
    }
    if (dt < t5 || !Number.isFinite(release))
        return at(level, "settle");
    if (dt < t6)
        return at(level * (1 - smooth((dt - t5) / release)), "release");
    return at(0, "done");
}
const SURPRISE = { antic: 6, anticDepth: 0.4, accent: "hard", settleLevel: 0.45 };
/** Frames a reaction lasts with these options (a double take's lead can be set). */
export function reactionFrames(kind, o = {}) {
    return kind === "doubleTake" ? (o.lead ?? DOUBLE_LEAD) + takeLength(SURPRISE) : REACTION_FRAMES[kind];
}
const REALIZE = { antic: 5, anticDepth: 0.5, accent: "soft", pop: 4, settle: 8, settleLevel: 0.35, keep: 6, release: 8 };
const TREMBLE = { antic: 5, anticDepth: 0.4, accent: "hard", hold: 10, settleLevel: 0.4 };
/** A double take: a glance away and back (turns 3 frames apart), then the take. */
const DOUBLE_LEAD = 6;
/** How long each reaction takes (frames at 30 fps). */
export const REACTION_FRAMES = {
    surprise: takeLength(SURPRISE),
    doubleTake: DOUBLE_LEAD + takeLength(SURPRISE),
    realize: takeLength(REALIZE),
    tremble: takeLength(TREMBLE),
    giggle: 26,
    nod: 21,
    shake: 22,
};
/**
 * A loose part following a curve: a damped spring (about 0.55 rad a frame,
 * damping 0.6: ~10% overshoot, settled in ~8 frames) pulled toward the curve's value one frame late, stepped frame
 * by frame from rest. It lags the body, carries past it, and settles: drag and
 * follow-through. Pure: the same curve gives the same result at any frame.
 */
export function follow(curve, frame, o = {}) {
    const w = o.w ?? 0.55, z = o.zeta ?? 0.6, d = o.delay ?? 1, from = o.from ?? Math.min(frame, 0) - 2;
    let x = curve(from - d), v = 0;
    for (let f = from + 1; f <= frame; f++) {
        const target = curve(f - d);
        v += w * w * (target - x) - 2 * z * w * v;
        x += v;
    }
    return x;
}
/** A surprise pose from a take: squashed, sunk and squinting in the
 * anticipation (the hat tipped down); tall, wide-eyed and lifted at the accent.
 * The hat follows the body two frames late and overshoots it (drag and
 * follow-through), and loose parts start to jiggle as the anticipation ends. */
function surprisePose(frame, dt, o, k, seed) {
    const i = alive(frame, seed);
    const c = takeCurve(dt, o);
    const v = c.v, pop = c.pop;
    const antic = Math.max(0, -v), up = Math.max(0, v);
    const sy = (v < 0 ? 1 - 0.375 * k * antic : 1 + 0.2 * k * up) + 0.06 * k * c.smear;
    const hat = follow((f) => takeCurve(f, o).v, dt);
    const eyes = dt >= pop ? 1.1 + 0.15 * Math.exp(-(dt - pop) / 4) : c.smear ? 1.15 : 1;
    return {
        y: v < 0 ? 0.1 * k * antic : -0.12 * k * up,
        pose: {
            squashY: sy,
            squashX: keepVolume(sy) * (c.smear ? 0.92 : 1),
            // The hat rocks on the head and stays on it: at most 12° and 4 units of lift.
            tilt: i.tilt + clamp(-9 * k * hat, -12, 12),
            lift: clamp(hat >= 0 ? 5 * k * hat : 3 * k * hat, -3, 4),
            blink: v < 0 ? Math.min(1, 1.5 * antic) : 0,
            jiggle: dt >= pop - 2 ? jiggle(dt - (pop - 2), k) : 0,
        },
        mouth: v > 0.3 ? "round" : undefined,
        eyeScale: 1 + (eyes - 1) * Math.min(1, Math.max(0, v) / 0.45),
        // The pop and the held extreme, through the bounce-back's start: deliberate changes of speed.
        contact: dt >= pop - 2 && dt <= pop + 4,
        done: false,
    };
}
/**
 * A reaction from `at`, built as a take:
 * - surprise: squash and squint (anticipation), pop tall with eyes wide, a round
 *   mouth and the hat up (a hard accent held 2 frames), bounce back into a
 *   softer held surprise, then relax;
 * - doubleTake: a glance away and back, 3 frames apart, then the surprise;
 * - realize: the acting blink: a dip with the eyes shut, then eyes open and
 *   the head up (a soft accent), settling;
 * - tremble: a moving hold for fear: the accent alternating with a slightly
 *   weaker pose every 2 frames, then settling;
 * - giggle: fast small bounces, eyes squeezed, mouth open, fading;
 * - nod: a small lift first, then two dips forward;
 * - shake: the head and eyes swinging side to side, settling.
 */
export function react(frame, at, kind, o = {}) {
    const seed = o.seed ?? 0, k = o.strength ?? 1;
    const dt = frame - at;
    const i = alive(frame, seed);
    const done = dt >= reactionFrames(kind, o);
    if (dt < 0 || done)
        return { y: 0, pose: i, contact: false, done };
    if (kind === "surprise")
        return surprisePose(frame, dt, SURPRISE, k, seed);
    if (kind === "doubleTake") {
        // The first look (at the thing), then away as if nothing happened, with a
        // blink, then the take with the eyes snapping back: each look a 3-frame
        // saccade, each held long enough to read when there's a lead to hold it.
        const L = o.lead ?? DOUBLE_LEAD;
        const away = Math.round(L * 0.45);
        const sac = (from, to, f0) => from + (to - from) * smooth((dt - f0) / 3);
        if (dt < L) {
            const look = dt < away ? sac(0, 0.6, 0) : sac(0.6, -0.3, away);
            const bl = dt >= away && dt - away < BLINK.length ? BLINK[dt - away] : i.blink;
            return { y: 0, pose: { ...i, blink: bl }, lookX: look, contact: false, done };
        }
        return { ...surprisePose(frame, dt - L, SURPRISE, k, seed), lookX: sac(-0.3, 0.6, L) };
    }
    if (kind === "realize") {
        const c = takeCurve(dt, REALIZE);
        const sy = 1 + 0.08 * k * c.v;
        return {
            y: -0.03 * k * Math.max(0, c.v),
            pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: i.tilt + 5 * k * Math.max(0, -c.v) - 3 * k * Math.max(0, c.v), lift: 3 * k * Math.max(0, c.v), blink: c.v < -0.1 ? 1 : 0 },
            contact: false,
            done,
        };
    }
    if (kind === "tremble") {
        const c = takeCurve(dt, TREMBLE);
        // The moving hold: alternate the accent with a weaker pose every 2 frames while it's held.
        const holding = c.phase === "accent" && dt >= c.pop;
        const weak = holding && Math.floor((dt - c.pop) / 2) % 2 === 1;
        const r0 = surprisePose(frame, dt, TREMBLE, 0.8 * k, seed);
        const r = weak ? { ...r0, y: r0.y * 0.82, pose: { ...r0.pose, squashY: 1 + (r0.pose.squashY - 1) * 0.82 } } : r0;
        const side = holding ? (Math.floor((dt - c.pop) / 2) % 2 ? 1 : -1) : 0;
        return { ...r, pose: { ...r.pose, tilt: r.pose.tilt + 3 * side, jiggle: 2 * side }, mouth: c.v > 0.3 ? "open" : undefined, lookX: 0.2 * side };
    }
    if (kind === "giggle") {
        const fade = Math.exp(-dt / 12);
        const b = Math.sin(dt * 1.6) * fade;
        const sy = 1 + 0.05 * k * b;
        return { y: -0.015 * k * Math.abs(b), pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: 4 * k * Math.sin(dt * 0.8) * fade, blink: 0.65 }, mouth: "open", contact: false, done };
    }
    if (kind === "nod") {
        // A nod on a front-facing body is the face going down and up: a small lift
        // first (the anticipation), then two dips, the second smaller, the eyes
        // half-closing at the bottom, the hat tipping with the head. The body
        // itself barely squashes (a squash reads as a hop).
        if (dt < 3)
            return { y: 0, pose: { ...i, tilt: i.tilt - 2 * smooth(dt / 3) }, faceY: -0.25 * k * smooth(dt / 3), contact: false, done };
        const u = (dt - 3) / (REACTION_FRAMES.nod - 3);
        const dip = Math.sin(Math.PI * 2 * u) ** 2 * (u < 0.5 ? 1 : 0.6);
        const sy = i.squashY - 0.015 * k * dip;
        return { y: 0, pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: i.tilt + 4 * k * dip, lift: -1.5 * k * dip, blink: dip > 0.55 ? 0.55 : i.blink }, faceY: 0.8 * k * dip, contact: false, done };
    }
    // shake
    const fade = 1 - dt / REACTION_FRAMES.shake;
    const s = Math.sin(dt * 0.95) * fade;
    return { y: 0, pose: { ...i, tilt: i.tilt + 9 * k * s, jiggle: 3 * s }, lookX: -0.7 * s, mouth: "closed", contact: false, done };
}
// ── Handoffs ──────────────────────────────────────────────────────────────
/** Two poses mixed: w = 0 is `a`, 1 is `b` (every number interpolated, so a hand-off never jumps). */
export function blendPose(a, b, w) {
    const k = Math.min(1, Math.max(0, w));
    const m = (x, y) => x + (y - x) * k;
    return { squashX: m(a.squashX, b.squashX), squashY: m(a.squashY, b.squashY), tilt: m(a.tilt, b.tilt), lift: m(a.lift, b.lift), blink: m(a.blink, b.blink), jiggle: m(a.jiggle, b.jiggle) };
}
/** The weight of a hand-off at `frame` that starts at `at` and takes `frames` (smoothstep): 0 before, 1 after. */
export const handoff = (frame, at, frames = 5) => smooth((frame - at) / frames);
/**
 * A happy side-to-side waddle in place (a little dance, or a limbless walk):
 * the body rocks about its feet, pausing at each side (it's a pose, so it
 * holds a beat) and passing upright fast with a small bob up, the hat trailing
 * the rock. `period` frames per full left-right cycle (default 20), `angle` the
 * lean each side (default 10°), `from` when it starts (it eases in over half a
 * cycle).
 */
export function waddle(frame, o = {}) {
    const from = o.from ?? 0, P = o.period ?? 20, A = o.angle ?? 10, bob = o.bob ?? 0.03, seed = o.seed ?? 0;
    const i = alive(frame, seed);
    const dt = frame - from;
    if (dt < 0)
        return { angle: 0, y: 0, pose: i };
    const ramp = smooth(dt / (P / 2));
    const ph = (TAU_A * dt) / P;
    // A squared sine: lingers at the sides, quick through the middle.
    const s = Math.sin(ph), lean = Math.sign(s) * Math.abs(s) ** 0.6;
    const upright = 1 - Math.abs(s);
    const sy = i.squashY + 0.03 * upright * ramp;
    return {
        angle: A * lean * ramp,
        y: -bob * upright ** 2 * ramp,
        pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: i.tilt - 0.8 * A * Math.sin(ph - 0.6) * ramp, blink: i.blink },
    };
}
const TAU_A = Math.PI * 2;
// ── Life ──────────────────────────────────────────────────────────────────
/**
 * Blinks that don't tick like a metronome: about `perMinute` (default 14; a
 * calm or focused character blinks less), each at a seeded moment, sometimes
 * doubled, each closing fast and opening slowly (`BLINK`). 0 open … 1 shut.
 */
export function blinks(frame, seed = 0, o = {}) {
    const SLOT = Math.round(((o.fps ?? 30) * 60) / (o.perMinute ?? 14));
    const s = Math.floor(frame / SLOT);
    let v = 0;
    for (const slot of [s, s - 1]) {
        const at = slot * SLOT + Math.floor(hash01(seed + 101, slot) * SLOT * 0.6);
        const dts = [frame - at];
        if (hash01(seed + 202, slot) < 0.1)
            dts.push(frame - at - 9);
        for (const dt of dts)
            if (dt >= 0 && dt < BLINK.length)
                v = Math.max(v, BLINK[dt]);
    }
    return v;
}
/**
 * Idle that breathes like breathing (in slower than out), shifts its weight
 * now and then, and blinks irregularly. A drop-in for `idle`.
 */
export function alive(frame, seed = 0) {
    const ph = (frame + seed * 9) / 11;
    const b = Math.sin(ph + 0.45 * Math.sin(ph)); // skewed: a slower inhale
    const sy = 1 + 0.025 * b;
    const shift = Math.sin((frame + seed * 41) / 47) * Math.sin((frame + seed * 13) / 83);
    const bl = blinks(frame, seed);
    // Kept small: a held pose has to read, so idle is mostly breath, not sway.
    return { squashY: sy - 0.01 * bl, squashX: keepVolume(sy), tilt: 1.4 * Math.sin((frame + seed * 5) / 15) + 1.8 * shift, lift: 0, blink: bl, jiggle: 0 };
}
//# sourceMappingURL=acting.js.map