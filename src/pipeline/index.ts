/**
 * romp/pipeline: the render pipeline around a film, framework-free. Keys and
 * caches, render segments cut at scene boundaries, ffmpeg recipes (concat,
 * mux, one-pass multi-size encodes, cut detection), contact sheets, a device
 * lock, and the plan lint. Node only (except `stableKey`, `keyOf`,
 * `planSegments`, `lintPlan`, which run anywhere). The Remotion binding is
 * `romp/remotion/render`.
 */
export { stableKey, hashString, keyOf } from "./key.js";
export { planSegments, type Segment, type SegmentScene } from "./segments.js";
export { concatList, concatArgs, aacArgs, muxArgs, encodeArgs, marksArgs, parseMarks, ffmpeg, probe, concat, marksFromVideo, type EncodeOutput } from "./ffmpeg.js";
export { listFiles, hashFiles, stampFiles, sha } from "./files.js";
export { acquireLock, LockHeld, type Lock } from "./lock.js";
export { cachedFile } from "./cache.js";
export { montage, sheetHtml, pages, timecode, type Tile, type MontageOptions } from "./montage.js";
export { lintPlan, formatLint, type Plan, type PlanScene, type PlanBeat, type PlanItem, type PlanRect, type PlanCamera, type PlanRole, type LintIssue, type LintKind } from "./lint.js";
