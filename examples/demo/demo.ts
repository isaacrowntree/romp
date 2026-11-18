/* The romp demo: a wordmark of springy letters, a character flung into it,
 * and a cast dropped into a pile, all baked once in a planck world and read
 * every frame. Live mode plays it on the audio clock with sound; the same
 * schedule renders offline to a WAV; the motion check steps every frame.
 *
 * Build: `node examples/demo/build.mjs` → examples/demo/dist/romp-demo.js,
 * an ES module exporting mount(el). It styles itself from CSS custom
 * properties the host page may define (--ink, --fg, --primary, --accent,
 * --font-display, --font-sans, --font-mono), with fallbacks. */
import { Body, Clock, LAYER, SpringyBody, Stage, impactResponse, jiggleParts, nearImpact, poseAt } from "../../src/core/index.js";
import { analyze, formatReport, type FrameRow } from "../../src/check/analyze.js";
import { collectDom } from "../../src/check/dom.js";
import { playLive, renderWav, type Schedule } from "../../src/audio/mix.js";
import { cartoon } from "../../src/audio/cartoon.js";
import { Instruments } from "../../src/audio/index.js";

const W = 800, H = 500, FPS = 30, DURATION = 7.5, FRAMES = Math.round(DURATION * FPS);
const FLOOR = 470, SHELF = 205, SHELF_X0 = 250, SHELF_X1 = 550;
const LETTERS = ["r", "o", "m", "p"];
const LW = 54, LH = 84, LX = (i: number) => 296 + i * 70;
const KNOCK_AT = 50; // frame the character is flung in

interface Who { id: string; color: string; voice: string; x: number; size: number; at: number; vx: number }
const CAST: Who[] = [
  { id: "ada", color: "#4361EE", voice: "hero", x: 330, size: 100, at: 92, vx: 30 },
  { id: "bo", color: "#22D3EE", voice: "squeaky", x: 470, size: 92, at: 99, vx: -30 },
  { id: "cy", color: "#FDE68A", voice: "low", x: 400, size: 104, at: 107, vx: 10 },
  { id: "di", color: "#F472B6", voice: "playful", x: 360, size: 84, at: 116, vx: 25 },
  { id: "eli", color: "#C4B5FD", voice: "sleepy", x: 440, size: 88, at: 124, vx: -20 },
];
// Flung in from above the top-right corner, inside the walls, aimed at the "p".
const ZIP: Who = { id: "zip", color: "#34D399", voice: "loud", x: 740, size: 70, at: KNOCK_AT - 10, vx: -700 };
const HAT = ["brim", "crown", "pom"] as const;

// ── The world, baked once ──────────────────────────────────────────────────
function bake() {
  const s = new Stage(); // screen space: y down
  // A box whose walls run well above the frame, so nothing can bounce out of the picture.
  s.ground([{ x: 10, y: -600 }, { x: 10, y: FLOOR }, { x: W - 10, y: FLOOR }, { x: W - 10, y: -600 }]);
  // The shelf is on its own layer: only the letters and the flung character touch it.
  const shelf = s.ground([{ x: SHELF_X0, y: SHELF }, { x: SHELF_X1, y: SHELF }], { layer: LAYER.B });
  LETTERS.forEach((ch, i) =>
    // Letters (layer D) touch the shelf and the flung character, not each other.
    s.add(new SpringyBody({ id: `letter:${ch}`, x: LX(i), y: -30, w: LW, h: LH, spawn: 4 + i * 6, vy: 600, ground: shelf, groundY: SHELF, hz: 2.6, layer: LAYER.D, mask: LAYER.B | LAYER.C })),
  );
  s.add(new Body({ id: ZIP.id, shape: "circle", x: ZIP.x, y: -60, w: ZIP.size, h: ZIP.size, spawn: ZIP.at, vx: ZIP.vx, vy: 260, spin: 4, restitution: 0.45, bullet: true, layer: LAYER.C, mask: LAYER.FLOOR | LAYER.B | LAYER.D | LAYER.A | LAYER.C }));
  // Round bodies, drawn round: what you see is exactly what collides.
  for (const c of CAST) s.add(new Body({ id: c.id, shape: "circle", x: c.x, y: -30, w: c.size, h: c.size, spawn: c.at, vx: c.vx, vy: 800, upright: true, restitution: 0.33, layer: LAYER.A, mask: LAYER.FLOOR | LAYER.A | LAYER.C }));
  return s.bake({ frames: FRAMES + 2, fps: FPS });
}
const stage = bake();
const letters = LETTERS.map((ch) => stage.get<Body>(`letter:${ch}`));
const zip = stage.get<Body>(ZIP.id);
const cast = CAST.map((c) => stage.get<Body>(c.id));

/** The frame the flung character first hits a letter: where a letter starts to tip. */
const knock = (() => {
  for (let f = KNOCK_AT - 10; f < FRAMES; f++) for (const l of letters) if (Math.abs(poseAt(l, f).angle) > 0.04) return f;
  return KNOCK_AT;
})();

// ── The soundtrack: one schedule, played live or rendered offline ──────────
export const schedule: Schedule = (s, bus, at) => {
  const band = new Instruments(s);
  const beat = 60 / 112;
  const tune = [74, 78, 81, 83, 81, 78, 76, 74];
  for (let b = 0; b * beat < DURATION; b++) {
    const t = at(b * beat);
    if (t == null) continue;
    if (b % 2 === 0) band.kick(t, bus.drums, { vel: 0.22 });
    band.shaker(t, bus.drums, { vel: 0.03, seed: b });
    if (b % 4 === 0) band.upright(t, [50, 47, 43, 45][(b / 4) % 4], bus.music, { vel: 0.22, dur: beat * 1.6 });
    if (b >= 8 && b % 2 === 0) band.pluck(t, tune[(b / 2) % tune.length], bus.music, { vel: 0.18, bright: 0.75, dur: 0.8, seed: b });
  }
  // Every letter's landing: a wooden tock, climbing the scale.
  letters.forEach((l, i) => {
    const t = l.impacts[0] && at(l.impacts[0].t);
    if (t != null && t) s.tock(t - 1 / 30, bus.sfx, { note: [74, 76, 78, 81][i], seed: i });
  });
  // The flung character: a squeal as it takes off, a knock on the letter, boings where it lands.
  const off = at(ZIP.at / FPS);
  if (off != null) {
    s.whoosh(off, 0.5, bus.sfx, { vel: 0.12, peakAt: 0.7, f0: 600, f1: 3200, f2: 900, seed: 3 });
    s.babble(off, 0.45, bus.voice, { voice: ZIP.voice, seed: 7 });
  }
  const k = at(knock / FPS);
  if (k != null) s.tock(k - 1 / 30, bus.sfx, { note: 62, vel: 0.3, seed: 9 });
  zip.impacts.slice(0, 3).forEach((h, j) => {
    const t = at(h.t);
    if (t != null) s.boing(t - 1 / 30, bus.sfx, { k: Math.min(1.3, h.speed / 900), big: 0.8, seed: 20 + j });
  });
  // The cast: a boing per real landing, sized by its speed and the body's size; a word or two once settled.
  CAST.forEach((c, i) => {
    cast[i].impacts.filter((h, j) => j === 0 || h.speed > 400).slice(0, 2).forEach((h, j) => {
      const t = at(h.t);
      if (t != null) s.boing(t - 1 / 30, bus.sfx, { k: Math.min(1.3, h.speed / 900) * (j ? 0.6 : 1), big: c.size / 95, seed: i * 3 + j, pan: (c.x - W / 2) / 900 });
    });
    const landed = cast[i].landed;
    const t = Number.isFinite(landed) ? at(landed / FPS + 0.3) : null;
    if (t != null && i % 2 === 0) s.babble(t, 0.4, bus.voice, { voice: c.voice, seed: i + 1 });
  });
  const end = at(DURATION - 0.9);
  if (end != null) s.ding(end, bus.sfx, { vel: 0.22 });
};

// ── Drawing (DOM, so the motion check reads the real elements) ─────────────
const INK = "#0A0A1A";
function character(c: Who): string {
  const s = c.size, h = s; // round, matching its circle body
  return `<svg viewBox="${-s} ${-s * 1.6} ${s * 2} ${s * 2}" width="${s * 2}" height="${s * 2}" style="position:absolute;left:${-s}px;top:${-s * 1.6}px;overflow:visible" aria-hidden="true">
  <g data-part="body">
    <ellipse cx="0" cy="${-h / 2}" rx="${s / 2}" ry="${h / 2}" fill="${c.color}" stroke="${INK}" stroke-width="5"/>
    ${[-1, 1].map((d) => `<g data-part="eye" transform="translate(${d * s * 0.16} ${-h * 0.56})"><circle r="${s * 0.075}" fill="${INK}"/><circle cx="${-s * 0.024}" cy="${-s * 0.024}" r="${s * 0.024}" fill="#fff"/></g>`).join("")}
    <g data-part="hat" transform="translate(0 ${-h})">
      <g data-part="brim"><rect x="${-s * 0.3}" y="-6" width="${s * 0.6}" height="10" rx="5" fill="${INK}"/>
        <g data-part="crown"><rect x="${-s * 0.17}" y="${-s * 0.3}" width="${s * 0.34}" height="${s * 0.3}" rx="6" fill="${INK}"/>
          <g data-part="pom" transform="translate(0 ${-s * 0.3})"><circle r="${s * 0.08}" fill="${c.color}" stroke="${INK}" stroke-width="4"/></g>
        </g>
      </g>
    </g>
  </g>
</svg>`;
}

export function mount(root: HTMLElement) {
  const css = `
.romp-demo{--rd-ink:var(--ink,#0A0A1A);--rd-soft:var(--ink-soft,#12122B);--rd-raised:var(--ink-raised,#1A1A36);--rd-fg:var(--fg,#F5F3FF);--rd-muted:var(--fg-soft,rgba(245,243,255,.82));--rd-line:var(--border-soft,rgba(245,243,255,.14));--rd-primary:var(--primary,#4361EE);--rd-accent:var(--accent,#22D3EE);color:var(--rd-fg);font-family:var(--font-sans,system-ui,sans-serif)}
.romp-demo .rd-frame{position:relative;width:100%;aspect-ratio:${W}/${H};border-radius:var(--radius-lg,1.25rem);border:1px solid var(--rd-line);background:radial-gradient(120% 90% at 50% 0%,var(--depth,#1E1B4B) 0%,var(--rd-soft) 70%);overflow:hidden}
.romp-demo .rd-stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
.romp-demo .rd-floor{position:absolute;left:10px;right:10px;top:${FLOOR}px;height:30px;background:var(--rd-raised);border-top:2px solid var(--rd-line)}
.romp-demo .rd-shelf{position:absolute;left:${SHELF_X0}px;width:${SHELF_X1 - SHELF_X0}px;top:${SHELF}px;height:10px;border-radius:5px;background:var(--rd-fg);opacity:.85}
.romp-demo .rd-letter{position:absolute;left:0;top:0;width:${LW}px;height:${LH}px;line-height:${LH}px;display:grid;place-items:center;font:400 104px/1 var(--font-display,Georgia,serif);color:var(--rd-fg);transform-origin:50% 50%}
.romp-demo .rd-who{position:absolute;left:0;top:0;width:0;height:0}
.romp-demo .rd-who>i{position:absolute;display:block}
.romp-demo .rd-bug{position:absolute;left:0;top:0;width:150px;height:46px;border-radius:23px;background:#FDE68A;color:#1A1730;font:700 18px/46px var(--font-sans,system-ui);text-align:center;transform-origin:50% 50%}
.romp-demo .rd-controls{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin:.9rem 0 .6rem}
.romp-demo .rd-controls .btn{min-height:44px}
.romp-demo .rd-scrub{flex:1 1 180px;min-width:140px;accent-color:var(--rd-accent);min-height:44px}
.romp-demo .rd-check{display:flex;gap:.4rem;align-items:center;font-size:.9rem;color:var(--rd-muted);min-height:44px}
.romp-demo .rd-check input{width:20px;height:20px;accent-color:var(--rd-accent)}
.romp-demo pre{margin:.4rem 0 0;padding:.9rem 1rem;border-radius:var(--radius,.875rem);border:1px solid var(--rd-line);background:var(--rd-soft);color:var(--rd-muted);font:12.5px/1.5 var(--font-mono,ui-monospace,monospace);white-space:pre-wrap;min-height:3.2em}
.romp-demo audio{width:100%;margin-top:.5rem}
.romp-demo .rd-time{font:600 .85rem var(--font-mono,ui-monospace,monospace);color:var(--rd-muted);min-width:3.6em;text-align:right}
`;
  root.classList.add("romp-demo");
  root.innerHTML = `<style>${css}</style>
<div class="rd-frame"><div class="rd-stage" role="img" aria-label="A wordmark reading romp drops onto a shelf, a small green character is flung into the p, which tips and springs back, then five characters in hats drop into a pile">
  <div class="rd-floor"></div><div class="rd-shelf"></div>
  ${LETTERS.map((ch) => `<div class="rd-letter" data-romp="letter:${ch}">${ch}</div>`).join("")}
  ${[...CAST, ZIP].map((c) => `<div class="rd-who" data-romp="${c.id}">${character(c)}</div>`).join("")}
  <div class="rd-bug" data-romp="sticker">new!</div>
</div></div>
<div class="rd-controls">
  <button type="button" class="btn btn-primary" data-act="play">Play with sound</button>
  <input class="rd-scrub" type="range" min="0" max="${DURATION}" step="${1 / FPS}" value="0" aria-label="Scrub through the film">
  <span class="rd-time" aria-live="off">0.0 s</span>
</div>
<div class="rd-controls">
  <button type="button" class="btn btn-outline-primary" data-act="check">Run the motion check</button>
  <label class="rd-check"><input type="checkbox" data-act="bug"> Plant a bug (a sticker that pops in)</label>
  <button type="button" class="btn btn-outline-primary" data-act="wav">Render WAV offline</button>
</div>
<pre aria-live="polite">The motion check report shows here.</pre>`;

  const frame = root.querySelector<HTMLElement>(".rd-frame")!;
  const stageEl = root.querySelector<HTMLElement>(".rd-stage")!;
  const scrub = root.querySelector<HTMLInputElement>(".rd-scrub")!;
  const time = root.querySelector<HTMLElement>(".rd-time")!;
  const report = root.querySelector<HTMLElement>("pre")!;
  const bugBox = root.querySelector<HTMLInputElement>('[data-act="bug"]')!;
  const letterEls = LETTERS.map((ch) => root.querySelector<HTMLElement>(`[data-romp="letter:${ch}"]`)!);
  const whoEls = [...CAST, ZIP].map((c) => root.querySelector<HTMLElement>(`[data-romp="${c.id}"]`)!);
  const bugEl = root.querySelector<HTMLElement>(".rd-bug")!;
  const fit = () => (stageEl.style.transform = `scale(${frame.clientWidth / W})`);
  new ResizeObserver(fit).observe(frame);
  fit();

  const parts = whoEls.map((el) => {
    const q = (p: string) => el.querySelectorAll<SVGGElement>(`[data-part="${p}"]`);
    return { body: q("body")[0], eyes: [...q("eye")], hat: q("hat")[0], brim: q("brim")[0], crown: q("crown")[0], pom: q("pom")[0] };
  });
  const eyeBase = parts.map((p) => p.eyes.map((e) => e.getAttribute("transform")!));
  const hatBase = parts.map((p) => p.hat.getAttribute("transform")!);
  const pomBase = parts.map((p) => p.pom.getAttribute("transform")!);

  /** The picture at film time t: a pure function of t. */
  function seek(t: number) {
    const f = Math.min(FRAMES, t * FPS);
    letters.forEach((l, i) => {
      const p = poseAt(l, f);
      const el = letterEls[i];
      el.style.display = p.shown ? "" : "none";
      el.style.transform = `translate(${p.x - LW / 2}px, ${p.y - LH / 2}px) rotate(${p.angle}rad)`;
      el.toggleAttribute("data-romp-impact", nearImpact(l.impacts, f) || Math.abs(f - knock) <= 2);
      if (el.hasAttribute("data-romp-impact")) el.dataset.rompImpact = "1";
    });
    [...CAST, ZIP].forEach((c, i) => {
      const b = i < CAST.length ? cast[i] : zip;
      const p = poseAt(b, f);
      const el = whoEls[i];
      el.style.display = p.shown ? "" : "none";
      if (!p.shown) return;
      const h = c.size; // every body is a circle of this diameter
      // The body turns about its centre (where planck puts it), and the drawing hangs
      // from its feet, so rotate at the centre, then drop to the feet.
      el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.angle}rad) translate(0px, ${h / 2}px)`;
      el.style.width = el.style.height = "0";
      // They land against each other in a pile: keep the squash from spreading into a neighbour.
      const look = impactResponse(b, f, i, 900, { squash: 0.15, widen: 0.2 });
      const P = parts[i];
      P.body.setAttribute("transform", `scale(${look.squashX} ${look.squashY})`);
      P.eyes.forEach((e, k) => e.setAttribute("transform", `${eyeBase[i][k]} scale(1 ${Math.max(0.1, 1 - look.blink)})`));
      P.hat.setAttribute("transform", `${hatBase[i]} translate(0 ${-look.lift}) rotate(${look.tilt})`);
      // Follow-through: each hat part lags the one below it.
      const last = [...b.impacts].reverse().find((hh) => hh.frame <= f);
      const j = last ? jiggleParts(HAT, f - last.frame, Math.min(1.3, last.speed / 900), 2) : { brim: 0, crown: 0, pom: 0 };
      P.brim.setAttribute("transform", `rotate(${j.brim * 0.6})`);
      P.crown.setAttribute("transform", `rotate(${j.crown})`);
      P.pom.setAttribute("transform", `${pomBase[i]} rotate(${j.pom * 1.6})`);
      const near = nearImpact(b.impacts, f) || (b === zip && Math.abs(f - knock) <= 2);
      if (near) el.dataset.rompImpact = "1";
      else delete el.dataset.rompImpact;
    });
    // The sticker: grows in properly, unless the bug is planted (then it pops in at full size).
    const STICK = 150;
    const dt = f - STICK;
    const grow = bugBox.checked ? (dt >= 0 ? 1 : 0) : dt < 0 ? 0 : Math.min(1, 1 - Math.exp(-dt / 3) * Math.cos(dt * 0.5));
    bugEl.style.display = dt < 0 ? "none" : "";
    bugEl.style.transform = `translate(${W - 190}px, 40px) scale(${Math.max(0.001, grow)}) rotate(-6deg)`;
    bugEl.style.opacity = bugBox.checked ? "1" : String(Math.min(1, Math.max(0, dt / 4)));
    scrub.value = String(t);
    time.textContent = `${t.toFixed(1)} s`;
  }

  // ── Live: the picture follows the audio clock while sound plays ─────────
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
  const play = root.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  play.onclick = async () => {
    if (clock.playing) {
      clock.pause();
      play.textContent = "Play with sound";
      return;
    }
    audio ??= new AudioContext();
    play.textContent = "Pause";
    await clock.play(clock.t >= DURATION - 1 / FPS ? 0 : clock.t);
  };
  scrub.oninput = () => void clock.seek(+scrub.value);

  // ── Offline: the same schedule, rendered to a WAV ─────────────────────────
  root.querySelector<HTMLButtonElement>('[data-act="wav"]')!.onclick = async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Rendering…";
    const b64 = await renderWav(schedule, { duration: DURATION + 1, extend: cartoon });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    let el = root.querySelector("audio");
    if (!el) {
      el = document.createElement("audio");
      el.controls = true;
      report.before(el);
    }
    el.src = url;
    btn.disabled = false;
    btn.textContent = "Render WAV offline";
  };

  // ── The motion check: every frame, the real elements ──────────────────────
  root.querySelector<HTMLButtonElement>('[data-act="check"]')!.onclick = () => {
    const was = clock.playing;
    if (was) {
      clock.pause();
      play.textContent = "Play with sound";
    }
    const back = clock.t;
    const frames: FrameRow[] = [];
    for (let f = 0; f <= FRAMES; f++) {
      seek(f / FPS);
      frames.push({ f, row: collectDom(stageEl) });
    }
    const box = frame.getBoundingClientRect();
    const r = analyze(frames, { fps: FPS, width: box.width, height: box.height });
    seek(back);
    report.textContent =
      formatReport(r, FPS) +
      (r.issues.length
        ? "\n\nUntick “Plant a bug” and run it again: the sticker then grows in, and the check passes."
        : "\n\nNo pops, strobes, teleports, spikes or crops. The sharp turns are real impacts, marked as such, and the character that flies in from off-frame is entering, so its partial crop is fine. Tick “Plant a bug” to watch it catch one.");
  };

  bugBox.onchange = () => seek(clock.t);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches ? 6.5 : 0;
  seek(still);
  return { seek, clock, schedule, stage };
}
