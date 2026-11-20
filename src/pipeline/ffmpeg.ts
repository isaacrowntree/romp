/**
 * ffmpeg recipes as argument lists (pure, testable) and a runner.
 *
 *   concatArgs   join segments with `-c copy` (the concat demuxer): no re-encode,
 *                so the segments must share codec settings (one render config)
 *   muxArgs      put a soundtrack under a silent video, video copied
 *   encodeArgs   one ffmpeg process, several outputs: decode once, `split`, and
 *                encode each size (a 4K master and a 1080p share copy)
 *   marksArgs    frame-difference scene detection (`select=gt(scene,t)`); read
 *                its output with `parseMarks`
 */
import { execFile, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

export function concatList(files: string[]): string {
  return files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

/** `ffmpeg -f concat -safe 0 -i list.txt -c copy out` (write `concatList(files)` to the list first). */
export function concatArgs(listFile: string, out: string): string[] {
  return ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", out];
}

/** A soundtrack to AAC in an .m4a, ready to mux with no re-encode (`muxArgs(…, { copyAudio: true })`). */
export function aacArgs(audio: string, out: string, o: { audioBitrate?: string } = {}): string[] {
  return ["-v", "error", "-y", "-i", audio, "-vn", "-c:a", "aac", "-b:a", o.audioBitrate ?? "320k", out];
}

/** A silent video and a soundtrack: video copied, audio to AAC (or copied, when already AAC), cut to the shorter. */
export function muxArgs(video: string, audio: string, out: string, o: { audioBitrate?: string; copyAudio?: boolean; seconds?: number } = {}): string[] {
  const a = o.copyAudio ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", o.audioBitrate ?? "320k"];
  // Copied audio cuts by packet, and -shortest can then drop the last video frame: cut to the video's length instead.
  const len = o.seconds != null ? ["-t", o.seconds.toFixed(6)] : ["-shortest"];
  return ["-v", "error", "-y", "-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", ...a, ...len, "-movflags", "+faststart", out];
}

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
export function encodeArgs(input: string, outputs: EncodeOutput[]): string[] {
  if (!outputs.length) throw new Error("encodeArgs: no outputs");
  const n = outputs.length;
  const labels = outputs.map((_, i) => `v${i}`);
  const chains = outputs.map((o, i) => (o.height ? `[s${i}]scale=-2:${o.height}:flags=lanczos[${labels[i]}]` : `[s${i}]null[${labels[i]}]`));
  const filter = `[0:v]split=${n}${outputs.map((_, i) => `[s${i}]`).join("")};${chains.join(";")}`;
  const args = ["-v", "error", "-y", "-i", input, "-filter_complex", filter];
  outputs.forEach((o, i) => {
    args.push("-map", `[${labels[i]}]`);
    if (o.audio !== false) args.push("-map", "0:a?", "-c:a", "aac", "-b:a", o.audio ?? "192k");
    args.push("-c:v", "libx264", "-preset", o.preset ?? "medium", "-crf", String(o.crf ?? 18), "-pix_fmt", "yuv420p", "-movflags", "+faststart", o.file);
  });
  return args;
}

/** Frame-difference cut detection: frames whose scene score passes `threshold` (0..1, default 0.3). */
export function marksArgs(input: string, threshold = 0.3): string[] {
  return ["-hide_banner", "-nostats", "-i", input, "-an", "-vf", `select='gt(scene\\,${threshold})',showinfo`, "-f", "null", "-"];
}

/** Cut times (seconds) from `marksArgs`' stderr, at least `minGap` seconds apart. */
export function parseMarks(stderr: string, minGap = 0.5): number[] {
  const out: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    const t = +m[1];
    if (!out.length || t - out[out.length - 1] >= minGap) out.push(t);
  }
  return out;
}

/** Run ffmpeg (or ffprobe); resolves with stderr, rejects with it. */
export function ffmpeg(args: string[], o: { bin?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(o.bin ?? "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(`${o.bin ?? "ffmpeg"} exited ${code}: ${err.slice(-2000)}`))));
  });
}

/** Frames and duration of a video's first stream (ffprobe). */
export function probe(file: string): Promise<{ frames: number; seconds: number; width: number; height: number; fps: number }> {
  return new Promise((resolve, reject) =>
    execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets,width,height,r_frame_rate:format=duration", "-of", "json", file], (e, out) => {
      if (e) return reject(e);
      const j = JSON.parse(out);
      const s = j.streams[0];
      const [a, b] = String(s.r_frame_rate).split("/").map(Number);
      resolve({ frames: +s.nb_read_packets, seconds: +j.format.duration, width: s.width, height: s.height, fps: a / (b || 1) });
    }),
  );
}

/** Join segments with no re-encode. */
export async function concat(files: string[], out: string, listFile = `${out}.txt`): Promise<void> {
  writeFileSync(listFile, concatList(files));
  await ffmpeg(concatArgs(listFile, out));
}

/** Cut points in a long recording (seconds), by frame difference. */
export async function marksFromVideo(file: string, o: { threshold?: number; minGap?: number } = {}): Promise<number[]> {
  return parseMarks(await ffmpeg(marksArgs(file, o.threshold ?? 0.3)), o.minGap ?? 0.5);
}
