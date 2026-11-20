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
import { type CharacterPose } from "./motion.js";
/** A deterministic hash of two integers into [0, 1). */
export declare function hash01(a: number, b?: number): number;
/**
 * The width that keeps a squashed body's volume: `squashY ** -k`. k = 1 keeps
 * its area exactly (squashed to 0.8 tall → 1.25 wide); the default 0.7 reads
 * as rubbery without the drawing spreading too far.
 */
export declare const keepVolume: (squashY: number, k?: number) => number;
/** A vowel's mouth: a/e open, i wide, o/u round, m closed (a hum). */
export type Vowel = "a" | "e" | "i" | "o" | "u" | "m";
export interface Syllable {
    /** seconds from the start of the line */
    t0: number;
    t1: number;
    vowel: Vowel;
    /** a stressed syllable: louder, longer, a little nod */
    stress: boolean;
    /** the letters (or character) it came from */
    text: string;
    /** the consonants before its vowel ("str" in "string"; "" for CJK): m, b and p close the lips first */
    onset?: string;
    /** the last syllable before punctuation: how the phrase ends (a statement, a question, an exclamation, a pause mid-sentence) */
    end?: "." | "?" | "!" | ",";
}
export interface SyllableOptions {
    /** syllables a second (default 8: brisk cartoon speech) */
    rate?: number;
    /** jitter in syllable lengths (default 1) */
    seed?: number;
    /** stretch or squeeze the whole line to last exactly this many seconds */
    fit?: number;
    /** seconds of silence after , . ! ? and their CJK forms (default 0.16) */
    pause?: number;
    /** seconds between words (default 0.03) */
    gap?: number;
}
/**
 * A line of words as timed syllables. English: one per vowel group; Chinese,
 * Japanese and Korean: one per character. Pauses after punctuation, a breath
 * between words, stressed syllables a little longer. Pure: the same text and
 * seed give the same timing, so a mouth and a voice made from it agree.
 */
export declare function syllables(text: string, o?: SyllableOptions): Syllable[];
export interface Pitch {
    /** semitones from the voice's base pitch at the syllable's start and end */
    st0: number;
    st1: number;
    /** loudness relative to normal */
    gain: number;
}
/**
 * The melody of a line: what makes gibberish understandable is the intention in
 * its pitch, not the words. Each phrase starts high and drifts down
 * (declination); stressed syllables get a pitch accent; a statement falls at
 * its end, a mid-sentence pause lifts a little (more to come), a question
 * rises, and an exclamation is higher and louder throughout. `swing` (0–1) is
 * how sing-song the voice is: seeded wobble around the contour.
 */
export declare function prosody(syl: readonly Syllable[], o?: {
    swing?: number;
    seed?: number;
}): Pitch[];
/** How long a line of syllables lasts (seconds). */
export declare const speechLength: (syl: readonly Syllable[]) => number;
export interface Speech {
    /** 0 closed … 1 wide open */
    open: number;
    /** the vowel being said (or "m" between syllables) */
    vowel: Vowel;
    /** a mouth to draw, from the vowel and how open it is */
    mouth: "closed" | "open" | "wide" | "round";
    /** still talking (inside the line) */
    talking: boolean;
    /** 0…1: a stressed syllable's beat, for a nod or a squash */
    beat: number;
}
export interface TalkOptions {
    /** seconds the mouth runs ahead of the sound (default 2 frames at 30 fps: the
     * eye reads a mouth shape before the ear hears it, so lip-sync is drawn early) */
    lead?: number;
    /** seconds the lips stay shut before a vowel after m, b or p (default 3 frames) */
    closed?: number;
    /** hold each mouth for 2 frames (animate on twos, as hand-drawn lip-sync does), default true */
    onTwos?: boolean;
    fps?: number;
}
/**
 * The mouth at `t` seconds into a line (sound time): each syllable snaps open
 * on its vowel, holds, and closes by 95% of its length (the same envelope
 * `babble` voices), round for o/u, wide for i, closed in pauses and for the
 * first frames after m, b or p. The mouth leads the sound by `lead` (2 frames).
 */
export declare function talk(t0: number, syl: readonly Syllable[], o?: TalkOptions): Speech;
/** A talking character's body: the jaw's small squash and a nod on every stressed syllable, over its idle. */
export declare function talkPose(frame: number, t: number, syl: readonly Syllable[], seed?: number, o?: TalkOptions): CharacterPose & {
    speech: Speech;
};
/** Blink shapes (0 open … 1 shut), frame by frame at 30 fps: they close fast and
 * open a little slower, and stay short (a blink of 5 frames already reads as
 * sleepy). Regular: half, shut 2, half, nearly open. Long (with a big look, a
 * change of thought): 2 closing, 2 shut, 3 opening. */
export declare const BLINK: number[];
export declare const LONG_BLINK: number[];
export interface GazeKey {
    /** frame the look starts */
    at: number;
    /** -1 (left) … 1 (right) */
    x: number;
    /** -1 (up) … 1 (down) */
    y?: number;
    /** follow something moving: glide from this look to the next key's (smooth
     * pursuit), instead of holding and jumping to it */
    pursue?: boolean;
}
export interface GazeOptions {
    /** where to look, from when (sorted or not) */
    keys?: readonly GazeKey[];
    seed?: number;
    /** how far the eyes drift while holding a look (default 0.18; 0 for none) */
    wander?: number;
    /** frames a saccade takes (default 3) */
    saccade?: number;
    /** how quickly the head follows (per frame, default 0.3) and how far behind it starts (default 2 frames) */
    follow?: number;
    delay?: number;
}
export interface Gaze {
    /** the eyes, -1…1 */
    x: number;
    y: number;
    /** the head following them, -1…1 (scale it to a tilt or a turn) */
    head: number;
    /** a blink that comes with a big look (0…1) */
    blink: number;
    /** 0…1: the small dip a body makes just before a big look (its anticipation): squash by it */
    dip: number;
}
/**
 * Eyes that jump and hold, the way eyes do: each look is a saccade of a few
 * frames, then a hold with small drifts (every 1.2–2.5 s, never in the first
 * 20 frames of a look), a blink with a big change of look, and the head
 * following the eyes on a critically damped spring a couple of frames behind.
 */
export declare function gaze(frame: number, o?: GazeOptions): Gaze;
export interface JumpOptions {
    /** px at the top (default 120) */
    height?: number;
    /** frames in the air (default 16) */
    air?: number;
    /** frames of crouch before take-off (default 5, plus up to 3 more when heavy) */
    crouch?: number;
    /** 0 light … 1 heavy (default 0.4): heavier squashes and stretches less, crouches longer and lands harder in the body, not the hat */
    weight?: number;
    seed?: number;
}
export interface Jumping {
    /** px offset, up is negative */
    y: number;
    pose: CharacterPose;
    /** a take-off or touch-down this frame (mark it for the motion check) */
    contact: boolean;
    phase: "before" | "crouch" | "air" | "landed";
}
/**
 * One jump from `at`: a crouch (anticipation), take-off stretched by its
 * speed, a parabola that hangs at the top, then the landing squash sized by
 * how hard it came down. Volume kept throughout.
 */
export declare function jump(frame: number, at: number, o?: JumpOptions): Jumping;
export interface TakeOptions {
    /** frames easing into the anticipation (default 6) */
    antic?: number;
    /** how far the anticipation goes the other way, as a share of the accent (default 0.35) */
    anticDepth?: number;
    /** "hard" pops to the accent, holds, and bounces back; "soft" eases in (default "hard") */
    accent?: "hard" | "soft";
    /** frames to reach the accent (default 2 hard: an in-between and an overshoot; 9 soft) */
    pop?: number;
    /** frames the extreme is held (default 3 hard, 0 soft) */
    hold?: number;
    /** hard accents: one stretched in-between frame past the accent on the way in
     * (the smear a fast move leaves); default true */
    smear?: boolean;
    /** frames into the settle (default 9) */
    settle?: number;
    /** the settle, as a share of the accent (default 0.5) */
    settleLevel?: number;
    /** frames the settle is held (default 8) */
    keep?: number;
    /** frames back to rest (default 10; Infinity keeps the settle) */
    release?: number;
}
export type TakePhase = "rest" | "antic" | "accent" | "settle" | "release" | "done";
/** Frames a take lasts with these options (Infinity if it keeps its settle). */
export declare function takeLength(o?: TakeOptions): number;
/**
 * A take's curve at `dt` frames from its start: 0 at rest, −anticDepth at the
 * end of the anticipation, 1 at the accent, settleLevel once settled, then back
 * to 0. Map it onto any pose (a squash, a lean, a head turn). `pop` is the
 * frame the accent lands on (mark it as a contact for the motion check).
 */
export declare function takeCurve(dt: number, o?: TakeOptions): {
    v: number;
    phase: TakePhase;
    pop: number;
    smear: number;
};
export type Reaction = "surprise" | "doubleTake" | "realize" | "tremble" | "giggle" | "nod" | "shake";
export interface Reacting {
    /** offset up, as a share of the character's height (multiply by its size) */
    y: number;
    pose: CharacterPose;
    /** a mouth to draw, when the reaction calls for one */
    mouth?: "round" | "open" | "closed";
    /** eyes left/right, when it moves them */
    lookX?: number;
    /** the accent's pop and hold (a deliberate change of speed): mark it as a contact for the motion check */
    contact: boolean;
    /** eye size (1 = as drawn): wide with surprise */
    eyeScale?: number;
    /** finished (back to idle) */
    done: boolean;
}
/** Frames a reaction lasts with these options (a double take's lead can be set). */
export declare function reactionFrames(kind: Reaction, o?: {
    lead?: number;
}): number;
/** How long each reaction takes (frames at 30 fps). */
export declare const REACTION_FRAMES: Record<Reaction, number>;
/**
 * A loose part following a curve: a damped spring (about 0.55 rad a frame,
 * damping 0.6: ~10% overshoot, settled in ~8 frames) pulled toward the curve's value one frame late, stepped frame
 * by frame from rest. It lags the body, carries past it, and settles: drag and
 * follow-through. Pure: the same curve gives the same result at any frame.
 */
export declare function follow(curve: (frame: number) => number, frame: number, o?: {
    w?: number;
    zeta?: number;
    delay?: number;
    from?: number;
}): number;
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
export declare function react(frame: number, at: number, kind: Reaction, o?: {
    seed?: number;
    strength?: number;
    lead?: number;
}): Reacting;
/** Two poses mixed: w = 0 is `a`, 1 is `b` (every number interpolated, so a hand-off never jumps). */
export declare function blendPose(a: CharacterPose, b: CharacterPose, w: number): CharacterPose;
/** The weight of a hand-off at `frame` that starts at `at` and takes `frames` (smoothstep): 0 before, 1 after. */
export declare const handoff: (frame: number, at: number, frames?: number) => number;
export interface Waddling {
    /** degrees to rotate the body about its feet (positive leans right) */
    angle: number;
    /** offset up, as a share of the character's height */
    y: number;
    pose: CharacterPose;
}
/**
 * A happy side-to-side waddle in place (a little dance, or a limbless walk):
 * the body rocks about its feet, pausing at each side (it's a pose, so it
 * holds a beat) and passing upright fast with a small bob up, the hat trailing
 * the rock. `period` frames per full left-right cycle (default 20), `angle` the
 * lean each side (default 10°), `from` when it starts (it eases in over half a
 * cycle).
 */
export declare function waddle(frame: number, o?: {
    from?: number;
    period?: number;
    angle?: number;
    bob?: number;
    seed?: number;
}): Waddling;
/**
 * Blinks that don't tick like a metronome: about `perMinute` (default 14; a
 * calm or focused character blinks less), each at a seeded moment, sometimes
 * doubled, each closing fast and opening slowly (`BLINK`). 0 open … 1 shut.
 */
export declare function blinks(frame: number, seed?: number, o?: {
    perMinute?: number;
    fps?: number;
}): number;
/**
 * Idle that breathes like breathing (in slower than out), shifts its weight
 * now and then, and blinks irregularly. A drop-in for `idle`.
 */
export declare function alive(frame: number, seed?: number): CharacterPose;
