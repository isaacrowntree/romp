/**
 * Collect the tracked DOM elements of one frame for the motion check. Mark an
 * element with `data-romp="<name>"` (see `track()` in romp/remotion);
 * `data-romp-impact` marks a frame at a real impact, `data-romp-seamless` an
 * object that swaps in for an identical twin, `data-romp-allow-crop` one that
 * may run off the frame's edge. Each sample carries its box for the cropped
 * check (pass the frame's `width` and `height` to analyze()). Coordinates are relative to
 * `root` (your composition's frame), so the page can be any size.
 *
 * For the text rules: `data-romp-role` ("text", "focus" or "prop"); on a text,
 * `data-romp-text` (the whole text; else its textContent), `data-romp-chars-shown`
 * and `data-romp-chars-total` (else all of it is shown), `data-romp-words`,
 * `data-romp-heading`, and `data-romp-allow` ("offsafe,covers"). Each sample's
 * `z` is its document order (later draws on top), unless `data-romp-z` says.
 * `data-romp-allow-crop` takes a share too ("0.1"). On a screen,
 * `data-romp-native-width` and `data-romp-min-text-px`; on a text,
 * `data-romp-anchor` (another tracked name) and `data-romp-ground` (a y in
 * frame px).
 *
 * Only `[data-romp]` elements are seen: an untagged element, or a prop drawn
 * inside one `<svg>` or `<canvas>`, is invisible to the check. Track each prop
 * (an SVG child takes `data-romp` too); `untrackedOver()` finds the drawing
 * surfaces and plain text you missed.
 *
 * Each sample's `clip` is what clipping ancestors (overflow other than
 * visible, inside `root`) leave of its box, when that's less than the box. A
 * text's `fontPx` is its smallest font-size × its on-screen scale
 * (`data-romp-font-px` overrides) and `opaque` says it has a solid background
 * of its own (`data-romp-opaque="1"` or `"0"` overrides). `data-romp-role`
 * also takes "background": never counted as something on screen.
 */
import type { Sample } from "./analyze.js";
export declare function collectDom(root?: Element): Record<string, Sample>;
/**
 * What `--strict` can't see, over what it checks: every `<svg>` (outermost),
 * `<canvas>`, `<img>` and `<video>`, and every run of plain text, under `root`
 * that isn't tracked and sits inside nothing tracked, drawn over a shown tracked
 * text or screen: a surface after it in the document (so drawn on top, unless
 * z-index says otherwise); text after a screen, or anywhere on a text. Props
 * drawn in a surface can cross a title unseen, and untracked words can sit on a
 * screen or a caption: track them. `romp check --strict` warns about each one
 * (`--untracked error` fails on them).
 */
export declare function untrackedOver(root: Element): {
    what: string;
    size: string;
    text: string;
    kind: "surface" | "text";
}[];
