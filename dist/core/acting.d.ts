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
/**
 * The mouth at `t` seconds into a line: each syllable opens in ~30 ms, holds,
 * and closes by 95% of its length (the same envelope `babble` voices), round
 * for o/u, wide for i, closed in pauses.
 */
export declare function talk(t: number, syl: readonly Syllable[]): Speech;
/** A talking character's body: the jaw's small squash and a nod on every stressed syllable, over its idle. */
export declare function talkPose(frame: number, t: number, syl: readonly Syllable[], seed?: number): CharacterPose & {
    speech: Speech;
};
export interface GazeKey {
    /** frame the look starts */
    at: number;
    /** -1 (left) … 1 (right) */
    x: number;
    /** -1 (up) … 1 (down) */
    y?: number;
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
    /** frames of crouch before take-off (default 5) */
    crouch?: number;
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
    /** frames to reach the accent (default 1 hard, 9 soft) */
    pop?: number;
    /** frames the extreme is held (default 2 hard, 0 soft) */
    hold?: number;
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
    /** finished (back to idle) */
    done: boolean;
}
/** How long each reaction takes (frames at 30 fps). */
export declare const REACTION_FRAMES: Record<Reaction, number>;
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
}): Reacting;
/**
 * Blinks that don't tick like a metronome: one in each 2.2–4 s, at a seeded
 * moment, and sometimes a double blink. 0 open … 1 shut.
 */
export declare function blinks(frame: number, seed?: number): number;
/**
 * Idle that breathes like breathing (in slower than out), shifts its weight
 * now and then, and blinks irregularly. A drop-in for `idle`.
 */
export declare function alive(frame: number, seed?: number): CharacterPose;
