/**
 * Rules over a frame's layout as a whole:
 *
 *   blank      nothing tracked is visible (or only `background`) for more than
 *              `blankSeconds` (0.5 s), outside `covered` spans: an empty frame
 *              between scenes. Runs once anything in the film has a role (or
 *              under `strict`)
 *   clipped    a `screen`'s content is cut by a clipping ancestor (overflow:
 *              hidden: its `clip` rect is smaller than its box) by more than
 *              `clippedFraction` (1%) of the part inside the frame, for more
 *              than `clippedSeconds` (0.5 s): a screenshot taller than the
 *              phone it sits in. Sliding in or out through a mask is fine; a
 *              deliberate crop window takes `allowCrop`
 *   occupancy  (opt-in: `occupancy: true | share | { share, seconds }`) the
 *              tracked boxes together cover less than `share` (20%) of the
 *              frame for more than `seconds` (2 s): everything tiny in the
 *              middle of a big frame. `background` objects don't count
 */
import type { FrameRow, Issue, Sample, TextKind } from "./analyze.js";
export interface LayoutOptions {
    /** blank: how long nothing may be visible (default 0.5 s); false turns it off */
    blankSeconds?: number | false;
    /** clipped: the share of a screen's in-frame box a clipping ancestor may hide (default 0.01) */
    clippedFraction?: number;
    /** clipped: how long (default 0.5 s) */
    clippedSeconds?: number;
    /** occupancy: on, or the least share of the frame tracked boxes should cover, or both and how long (default 0.2, 2 s) */
    occupancy?: boolean | number | {
        share?: number;
        seconds?: number;
    };
    strict?: boolean;
    allow?: Partial<Record<TextKind, string[]>>;
}
type Box = NonNullable<Sample["box"]>;
/** The share of a W×H frame the boxes cover together, on a grid (~1% accuracy). */
export declare function unionShare(boxes: Box[], W: number, H: number, cells?: number): number;
export declare function layoutIssues(frames: FrameRow[], names: string[], o: LayoutOptions & {
    width?: number;
    height?: number;
}, fps: number, hidden: (f: number) => boolean): Issue[];
export {};
