/* The romp demo: blobs dropped into a pile. Real-time on requestAnimationFrame
 * (the picture follows the audio clock when sound is on), the motion check run
 * over the same seek(t), and the same scene rendered frame by frame for the GIF. */
import { Body, Clock, Stage, impactResponse, nearImpact, poseAt, type CharacterPose } from "../src/core/index.js";
import { analyze, formatReport, type FrameRow } from "../src/check/analyze.js";
import { createMix, playLive, type Schedule } from "../src/audio/mix.js";
import { cartoon } from "../src/audio/cartoon.js";
import { Instruments } from "../src/audio/index.js";

const W = 720, H = 720, FPS = 30, DURATION = 6;
const COLORS = ["#7B4FD6", "#FF4F7B", "#FFB43B", "#2FB57E", "#3BA7FF", "#FF8A3B", "#B18AF0"];
const VOICES = ["hero", "squeaky", "low", "playful", "sunny", "sleepy", "loud"];
const CAST = COLORS.map((c, i) => ({ id: `blob${i}`, color: c, voice: VOICES[i], x: 140 + ((i * 97) % 440), size: 90 + ((i * 37) % 50), at: 6 + i * 7 }));

function world() {
  const s = new Stage();
  s.ground([{ x: 40, y: 120 }, { x: 40, y: 660 }, { x: 680, y: 660 }, { x: 680, y: 120 }]);
  CAST.forEach((c, i) => s.add(new Body({ id: c.id, x: c.x, y: -20, w: c.size, h: c.size * 0.9, spawn: c.at, vx: (i % 2 ? -1 : 1) * 80, vy: 700, spin: (i % 2 ? 1 : -1) * 0.5, upright: true, restitution: 0.35 })));
  return s.bake({ frames: DURATION * FPS, fps: FPS });
}
const stage = world();
const bodies = CAST.map((c) => stage.get<Body>(c.id));

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const ctx = canvas.getContext("2d")!;
canvas.width = W * devicePixelRatio;
canvas.height = H * devicePixelRatio;
ctx.scale(devicePixelRatio, devicePixelRatio);

function blob(x: number, y: number, size: number, color: string, p: CharacterPose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p.squashX, p.squashY);
  ctx.translate(0, -size * 0.45);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#24163A";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(0, 0, size / 2, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // an antenna that follows through (the "hat")
  ctx.save();
  ctx.translate(0, -size * 0.43);
  ctx.rotate((p.tilt * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -size * 0.25 - p.lift);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -size * 0.25 - p.lift, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#24163A";
  ctx.fill();
  ctx.restore();
  // eyes (blink = squash the eye vertically)
  for (const ex of [-size * 0.16, size * 0.16]) {
    ctx.save();
    ctx.translate(ex, -size * 0.04);
    ctx.scale(1, Math.max(0.1, 1 - p.blink));
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = "#24163A";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-size * 0.025, -size * 0.025, size * 0.022, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** The picture at film time t: a pure function of t. */
export function seek(t: number) {
  const f = t * FPS;
  ctx.fillStyle = "#FAF6FF";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#EFE7FF";
  ctx.fillRect(40, 660, 640, 60);
  CAST.forEach((c, i) => {
    const p = poseAt(bodies[i], f);
    if (!p.shown) return;
    blob(p.x, p.y + c.size * 0.45, c.size, c.color, impactResponse(bodies[i], f, i));
  });
}

/** The soundtrack, written once: played live here, or rendered offline. */
export const schedule: Schedule = (s, bus, at) => {
  const band = new Instruments(s);
  const beat = 60 / 112;
  for (let b = 0; b < DURATION / beat; b++) {
    const t = at(b * beat);
    if (t == null) continue;
    if (b % 2 === 0) band.kick(t, bus.drums, { vel: 0.25 });
    band.shaker(t, bus.drums, { vel: 0.03, seed: b });
    s.marimba(t, [74, 76, 78, 81, 83][b % 5], bus.music, { vel: 0.12, dur: 0.5 });
  }
  CAST.forEach((c, i) => {
    bodies[i].impacts.filter((h, j) => j === 0 || h.speed > 400).slice(0, 2).forEach((h, j) => {
      const t = at(h.t);
      if (t != null) s.boing(t - 1 / 30, bus.sfx, { k: Math.min(1.3, h.speed / 900) * (j ? 0.6 : 1), big: c.size / 110, seed: i * 3 + j });
    });
    const t = at(bodies[i].landed / FPS + 0.25);
    if (t != null && Number.isFinite(t)) s.babble(t, 0.45, bus.voice, { voice: c.voice, seed: i + 1 });
  });
};

let audio: AudioContext | null = null;
let live: { stop(): void } | null = null;
const clock = new Clock({
  seek,
  duration: DURATION,
  loop: true,
  get audio() {
    return audio;
  },
  onPlay: async (t) => {
    if (!audio) return;
    live?.stop();
    live = await playLive(audio, schedule, { from: t, extend: cartoon });
  },
  onStop: () => {
    live?.stop();
    live = null;
  },
});

const play = document.querySelector<HTMLButtonElement>("#play")!;
play.onclick = async () => {
  if (clock.playing) {
    clock.pause();
    play.textContent = "Play with sound";
    return;
  }
  audio ??= new AudioContext();
  play.textContent = "Pause";
  await clock.play(clock.t >= DURATION ? 0 : clock.t);
};
document.querySelector<HTMLButtonElement>("#check")!.onclick = () => {
  // The motion check over the same seek(t): read each body's pose per frame.
  const frames: FrameRow[] = [];
  for (let f = 0; f <= DURATION * FPS; f++) {
    const row: FrameRow["row"] = {};
    CAST.forEach((c, i) => {
      const p = poseAt(bodies[i], f);
      const half = c.size / 2;
      const onScreen = p.y + half > 0 && p.y - half < H && p.x + half > 0 && p.x - half < W;
      row[c.id] = { x: p.x, y: p.y, shown: p.shown, onScreen, area: p.shown ? c.size * c.size : 0, opacity: p.shown ? 1 : 0, impact: nearImpact(bodies[i].impacts, f) };
    });
    frames.push({ f, row });
  }
  const r = analyze(frames, { fps: FPS, width: W });
  document.querySelector("#report")!.textContent = formatReport(r, FPS) + (r.issues.length ? "" : "\n\nEvery blob enters from above the frame (no pops), moves under the strobe limit, and its sharp turns are real impacts.");
};
void createMix;
(window as unknown as { rompSeek: (t: number) => void }).rompSeek = seek;
seek(new URLSearchParams(location.search).has("still") ? 3 : 0);
