export declare function concatList(files: string[]): string;
/** `ffmpeg -f concat -safe 0 -i list.txt -c copy out` (write `concatList(files)` to the list first). */
export declare function concatArgs(listFile: string, out: string): string[];
/** A soundtrack to AAC in an .m4a, ready to mux with no re-encode (`muxArgs(…, { copyAudio: true })`). */
export declare function aacArgs(audio: string, out: string, o?: {
    audioBitrate?: string;
}): string[];
/** A silent video and a soundtrack: video copied, audio to AAC (or copied, when already AAC), cut to the shorter. */
export declare function muxArgs(video: string, audio: string, out: string, o?: {
    audioBitrate?: string;
    copyAudio?: boolean;
    seconds?: number;
}): string[];
export interface EncodeOutput {
    file: string;
    /** output height in px (width follows, even); absent: the input's size */
    height?: number;
    /** x264 CRF (default 18) */
    crf?: number;
    /** x264 preset (default "medium") */
    preset?: string;
    /** audio bitrate (default "192k"); false drops audio */
    audio?: string | false;
}
/** One decode, several encodes: `[0:v]split=N`, each scaled and encoded in the same process. */
export declare function encodeArgs(input: string, outputs: EncodeOutput[]): string[];
/** Frame-difference cut detection: frames whose scene score passes `threshold` (0..1, default 0.3). */
export declare function marksArgs(input: string, threshold?: number): string[];
/** Cut times (seconds) from `marksArgs`' stderr, at least `minGap` seconds apart. */
export declare function parseMarks(stderr: string, minGap?: number): number[];
/** Run ffmpeg (or ffprobe); resolves with stderr, rejects with it. */
export declare function ffmpeg(args: string[], o?: {
    bin?: string;
}): Promise<string>;
/** Frames and duration of a video's first stream (ffprobe). */
export declare function probe(file: string): Promise<{
    frames: number;
    seconds: number;
    width: number;
    height: number;
    fps: number;
}>;
/** Join segments with no re-encode. */
export declare function concat(files: string[], out: string, listFile?: string): Promise<void>;
/** Cut points in a long recording (seconds), by frame difference. */
export declare function marksFromVideo(file: string, o?: {
    threshold?: number;
    minGap?: number;
}): Promise<number[]>;
