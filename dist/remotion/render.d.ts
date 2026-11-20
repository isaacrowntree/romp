import { type Segment } from "../pipeline/segments.js";
export interface RenderScene {
    name: string;
    /** first frame and length (with the transitions it shares) */
    from: number;
    frames: number;
    /** source files or directories only this scene uses (the rest of `src` is shared) */
    files?: string[];
    /** the data the scene is drawn from (captions, layout): part of its key */
    props?: unknown;
    /** media files only this scene uses (keyed by size and modification time) */
    media?: string[];
}
export interface RenderSettings {
    /** the Remotion entry (the file that calls registerRoot) */
    entry: string;
    /** composition id */
    composition: string;
    inputProps?: Record<string, unknown>;
    /** the public dir (default "public") */
    publicDir?: string;
    /** frames rendered at once (default: Remotion's choice; `romp bench` finds yours) */
    concurrency?: number | string | null;
    /** OpenGL backend for Chromium ("angle" is fast for WebGL on macOS; default: Remotion's) */
    gl?: "angle" | "egl" | "swangle" | "swiftshader" | "vulkan" | "angle-egl" | null;
    /** output scale (default 1) */
    scale?: number;
    log?: (line: string) => void;
}
export interface RenderConfig extends RenderSettings {
    scenes: RenderScene[];
    /** declared transitions, [from, to) frames: cuts never fall inside one */
    transitions?: [number, number][];
    /** the film's length in frames (default: the scenes' end) */
    frames?: number;
    /** source dirs (default ["src"]); files no scene claims are shared by all */
    src?: string[];
    /** extra files every segment depends on (default: package.json and lockfiles) */
    shared?: string[];
    /** the soundtrack, muxed once over the joined video */
    audio?: string;
    out: string;
    /** cache dir (default ".romp/cache") */
    cache?: string;
    crf?: number;
    x264Preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow" | "placebo";
    /** names of scenes to re-render even when cached */
    force?: string[];
}
export interface Manifest {
    composition: string;
    out: string;
    frames: number;
    segments: (Segment & {
        key: string;
        file: string;
        rebuilt: boolean;
        seconds: number;
    })[];
    /** scenes whose segments were rendered this run */
    rebuilt: string[];
    seconds: {
        bundle: number;
        render: number;
        join: number;
        total: number;
    };
}
/** The keys: one per scene, one for what every segment shares. */
export declare function sceneKeys(cfg: RenderConfig, root?: string): {
    shared: string;
    scenes: Record<string, string>;
};
/** Render only what changed, join, mux the soundtrack once. */
export declare function renderScenes(cfg: RenderConfig): Promise<Manifest>;
export interface SheetOptions extends RenderSettings {
    /** frames, inclusive (default: all) */
    from?: number;
    to?: number;
    /** every Nth frame (default: one a second) */
    every?: number;
    /** render scale (default 0.5) */
    scale?: number;
    cols?: number;
    rows?: number;
    /** tile width on the page, px (default 480) */
    tileWidth?: number;
    /** named spans (frames) to label tiles with */
    sections?: {
        name: string;
        from: number;
        to: number;
    }[];
    /** output dir */
    out: string;
}
/** Contact sheets from one `renderFrames` call. */
export declare function renderSheet(o: SheetOptions): Promise<{
    pages: string[];
    frames: number;
    seconds: number;
}>;
/** One frame at full resolution (PNG). */
export declare function renderStill(o: RenderSettings & {
    frame: number;
    out: string;
}): Promise<string>;
/** Time a short range at each concurrency; the fastest wins. */
export declare function bench(o: RenderSettings & {
    frames?: [number, number];
    concurrencies?: number[];
}): Promise<{
    results: {
        concurrency: number;
        seconds: number;
        fps: number;
    }[];
    best: number;
}>;
