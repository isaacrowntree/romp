# romp

[![ci](https://github.com/isaacrowntree/romp/actions/workflows/ci.yml/badge.svg)](https://github.com/isaacrowntree/romp/actions)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![docs and live demo](https://img.shields.io/badge/docs-live%20demo-5A3FC0.svg)](https://isaacrowntree.com/romp/)

**Physics-baked character motion, a motion check and synthesised sound for videos made in code.** Works with Remotion, three.js or any page with a `seek(t)`, played live on `requestAnimationFrame` or rendered frame by frame.

### ▶ [Docs and live demo](https://isaacrowntree.com/romp/)

[![The romp wordmark drops onto a shelf, a small character is flung into the p in a spray of sparks, the p tips over and springs back upright, then five characters in hats drop into a pile](https://raw.githubusercontent.com/isaacrowntree/romp/master/docs/hero.gif)](https://isaacrowntree.com/romp/)

*Every frame above was read from one simulation baked at 240 Hz. The letters are springy bodies welded where they land, so the p wobbles back after the knock; each character's squash, blink and hat follow-through (`jiggleParts`) are sized by the real speed of its own impacts. On the [live demo](https://isaacrowntree.com/romp/) you can play it with sound on the audio clock, scrub, render the same soundtrack offline to a WAV, and run the motion check, then plant a bug and watch it fail.*

## Why

Videos made in code (product promos, app previews, explainers) tend to fail the same way: linear easing, things that pop in at full size, motion that kinks where two moves meet, and silence, or a stock track that ignores the picture. Keyframing your way out of that is slow, and you can't see a pop at 30 fps until a viewer does.

romp encodes the fixes as a small library:

- **Choreography says where and when; physics says how.** Anything that falls, piles, gets knocked or hops is a rigid body in a planck.js (Box2D) world, not an eased arc.
- **Bake once, read every frame.** A scene is simulated once at a fixed 240 Hz and one pose per frame is stored. Reading a pose is a pure function of time, so the same motion plays in a live viewer, a frame-by-frame renderer, a scrubber and the motion check, identically.
- **Impacts drive the picture and the sound.** Every landing is recorded with its speed. Squash, closed eyes, follow-through on hats and antennae, and the boing on the soundtrack all hang off the same impact.
- **A motion check you can run in CI.** It steps every frame and flags **pops** (appears or vanishes at full size, opaque), **strobes** (more than ~100 px in one frame at 886 px wide), **teleports** (more than ~300 px), **jumps** (a one-frame snap between still frames), **spikes** (a kink in the motion), **lost** (a character that leaves the frame and stays out) and **crops** (more than a quarter of it outside the frame for more than half a second, other than while entering or leaving), with exemptions for real impacts, deliberate whips, covered frames, fades and objects you allow to crop.
- **Words a viewer can read.** Track a caption, a speech bubble or a heading as text and the check also flags words outside the **safe area**, a bubble that **covers** the thing it's about, texts that **overlap** (or a prop drawn over a title), a caption **unfinished** when its scene cuts, one gone before it could be **read**, and an **empty** bubble or a heading still typing after its scene starts. `captionTiming()` and `timeline()` size scenes from their captions so a film passes by construction, and `romp check --audio` catches the soundtrack **dropping out** where pieces were joined.
- **Sound that belongs to the picture.** Synthesised voices (marimba, bell, plucks, Rhodes, upright, kit, whooshes, plops, boings, gibberish character voices), a mix tuned for phone speakers, and one schedule function that plays live or renders offline. No samples, so there's nothing to license. The same schedule is also a **signal** the picture can react to (`listen()`: envelopes, beats, onsets), with no live analyser.
- **Particles that render frame by frame.** Confetti, sparks, snow and fountains from a seeded emitter whose every particle is a pure function of the frame, so they work in Remotion (where real-time particle libraries can't).
- **Bring your own timeline.** Adapters for Theatre.js and Motion Canvas, and the motion check for Lottie (After Effects) exports.

## Install

Not on npm yet: install it from GitHub.

```bash
bun add github:isaacrowntree/romp planck
# for the CLI, also: bun add -d esbuild playwright
```

The adapters (`romp/three`, `romp/remotion`, `romp/theatre`, `romp/motion-canvas`, `romp/lottie`) work with libraries you already use; they're optional peer dependencies, so core users install none of them.

## Usage

### Physics: bake a scene, read poses

```ts
import { Stage, Body, poseAt, impactResponse, nearImpact } from "romp/core";

const stage = new Stage(); // screen space (y down); new Stage({ yDown: false }) for three.js
stage.ground([{ x: 40, y: 200 }, { x: 40, y: 1830 }, { x: 1040, y: 1830 }, { x: 1040, y: 200 }]);
stage.add(new Body({ id: "hero", x: 540, y: -100, w: 150, h: 150, spawn: 10, vy: 900, spin: 0.3 }));
stage.bake({ frames: 200, fps: 30 }); // once

const hero = stage.get<Body>("hero");
const pose = poseAt(hero, frame);              // { shown, x, y, angle }, interpolated
const look = impactResponse(hero, frame);       // { squashX, squashY, tilt, lift, blink, jiggle }
```

`SpringyBody` welds to its ground where it lands (a letter that can be knocked over and wobbles back). `Drop` is a dropped prop: a contact foot, a gravity scale, spin and tilt that unwind to zero at touchdown, depth drift arrested on contact, a rock direction, and its own ledge drawn in its parent's frame (`flight()`, `framePose()`); `Leap` is a ballistic leap through a surface. Your own actors implement `build`, `control`, `sample` and optionally `apply(pose, t)`: `stage.pose(t)` calls every `apply`, and `poseAt(actor, frame, { discrete: "previous" })` holds booleans until the next frame when you need to match an existing renderer. Collision layers (`LAYER`) keep a pile of characters from landing on a wordmark. Without physics, `landing()`, `hop()`, `idle()`, `blinkAt()` and `boing()` give the same squash-and-stretch vocabulary as pure functions of the frame, and the acting helpers make a character read as alive: lip-sync from the words (`syllables`, `talk`, and `babble({ syllables })` voicing the same syllables), eyes that jump and hold with the head following (`gaze`), a jump with its crouch and hang (`jump`), reactions with their anticipations (`react`), uneven breathing and blinks (`alive`); `ease`, `spring()` and `ringOut()` are closed-form curves.

### Two ways to play: live, or frame by frame

**Live** (a viewer page): the `Clock` drives your `seek(t)` on `requestAnimationFrame`. While sound plays the picture follows the **audio clock**, so they can't drift.

```ts
import { Clock } from "romp/core";
import { playLive } from "romp/audio";
import { cartoon } from "romp/audio/cartoon";

const audio = new AudioContext();
let live;
const clock = new Clock({
  seek, duration: 6, audio,
  onPlay: async (t) => { live = await playLive(audio, schedule, { from: t, extend: cartoon }); },
  onStop: () => live?.stop(),
});
button.onclick = () => (clock.playing ? clock.pause() : clock.play());
```

**Offline** (Remotion, or a seek(t) page captured to MP4): read poses by frame, and render the same schedule to a WAV.

```ts
import { renderWav } from "romp/audio";
export const render = () => renderWav(schedule, { duration: 6, extend: cartoon }); // `romp sound` runs this
```

In Remotion, read by frame: `poseAt(body, useCurrentFrame())`.

### Sound: one schedule, written once

```ts
import { Instruments, type Schedule } from "romp/audio";

export const schedule: Schedule = (s, bus, at) => {
  const band = new Instruments(s);                        // pluck, kick, shaker, rhodes, piano, upright, rim, brush
  for (let b = 0; b < 12; b++) {
    const t = at(b * 0.5); if (t == null) continue;        // at(): film time → context time (null = already played)
    band.kick(t, bus.drums);
    s.marimba(t, 74 + (b % 5) * 2, bus.music, { vel: 0.15 });
  }
  for (const hit of hero.impacts) {
    const t = at(hit.t); if (t != null) s.boing(t - 1 / 30, bus.sfx, { k: hit.speed / 900 }); // transients lead by a frame
  }
};
```

The mix (`createMix`) has music, drums, sfx and voice buses with a shared room, a 70 Hz high-pass, a low shelf and a glue compressor. `romp/audio/cartoon` adds `plop`, `boing`, `babble` (gibberish voices: `hero`, `squeaky`, `low`, `sleepy`, …, or your own `{ f0, swing, rate }`), `slurp`, `beep`, `ding`, `tock`, `pip`, `swish` and `scribble`. Set `s.harmony = (t) => pitchClassSet` and every tonal effect fits the chord sounding at that moment.

The rules worth keeping: **restraint** (only each beat's focal event gets a sound), **one family** (tonal effects on one voice, in the score's key), **transients lead the picture by about a frame**, **no identical repeats** (every voice takes a seed), and **keep the energy in 200 Hz–6 kHz** so it survives a phone speaker.

### Sound as a signal

`listen(schedule)` runs your schedule once, silently, and records every voice it plays. The score it returns answers in film seconds, as pure functions of t, so a pulse on the kick looks the same live, rendered and in the motion check:

```ts
import { listen } from "romp/audio";
import { cartoon } from "romp/audio/cartoon";

const score = listen(schedule, { extend: cartoon });
score.envelopeAt(t, { voice: "kick", decay: 0.25 }); // how loud the kicks are at t (sum of each hit's level)
score.envelopeAt(t, { bus: "music" });               // anything on a bus
score.beatAt(t);                                     // { index, phase 0→1, since } between drum onsets
score.onsetsBetween(t - 1 / 30, t, { bus: "sfx" });  // what started this frame
```

Events carry `{ t, end, voice, bus, vel, midi?, shape }`: a hit attacks and decays over its voice's ring, a swell (`whoosh`, `riser`) rises to its peak, a bed (`crackle`, `surf`) holds. Times are as scheduled, so transients still lead the picture by a frame.

### Particles

```ts
import { Emitter, confetti, sparks, snow, fountain, particleStyle } from "romp/particles";

const burst = new Emitter(confetti({ x: 540, y: 900, at: 45, seed: 3, ground: 1830 }));
const ps = burst.particlesAt(frame); // [{ i, x, y, angle, size, length, flip, opacity, color, shape, … }]
ps.map((p) => <i key={p.i} style={particleStyle(p)} />);   // or drawParticles(ctx, ps) on a canvas
```

Every particle's launch comes from a seeded hash of its index and its flight is closed-form (gravity, wind, linear drag, sway, spin, confetti flip), so any frame can be read in any order. `ground` takes a y or the polyline you gave `stage.ground()`; particles bounce and come to rest on it. Presets are plain options to spread and override: `confetti`, `sparks` (streaks that face their motion), `snow` (a stream from above the frame) and `fountain`.

**The motion check and particles.** Particles grow in (`grow`, 0.08 s) and fade out (`fadeOut`, 0.3 s) by default, so even tracked one by one they aren't pops. Fast sparks are strobes by design, so don't track single particles: track the burst as one object, `trackBurst(name, ps)` from `romp/remotion` (an empty element covering the burst, centred where it comes from) or `particleSample(ps)` for your own collector. Untracked elements are never checked.

### The motion check

**Remotion / DOM:** mark what to follow, then run the CLI.

```tsx
import { track } from "romp/remotion";
<div {...track("hero", { impact: nearImpact(hero.impacts, frame) })} style={…} />
```

```ts
// check.tsx
import { MyVideo } from "./MyVideo";
export default { component: MyVideo, durationInFrames: 1500, fps: 30, width: 1080, height: 1920, covered: [[4.2, 4.9]] };
```

```bash
bunx romp check check.tsx --public public   # exit 1 on issues; --json for machines
```

**three.js:** name your objects, then

```ts
import { motionReport } from "romp/three";
const { issues } = motionReport({ seek, scene, camera, fps: 30, W: 886, H: 1920, from: 0, to: 30, whips, covered });
```

**Lottie (After Effects exports):** every layer, every frame, through lottie-web's own transforms (parents and precomps included).

```ts
import { lottieReport, formatReport } from "romp/lottie";
const anim = lottie.loadAnimation({ container, renderer: "svg", autoplay: false, animationData });
console.log(formatReport(lottieReport(anim), anim.frameRate)); // a layer cut in at full size is a pop
```

```bash
bunx romp check --lottie anim.json [--layers ball,badge]   # needs lottie-web in your project
```

**Theatre.js:** a sequence's `position` is film seconds, so it can host romp's baked motion and the check can step it.

```ts
import { onChange } from "@theatre/core";
import { followSequence, seekSequence, theatreReport, objectsRow } from "romp/theatre";

followSequence(sheet.sequence, onChange, (t) => stage.pose(t));     // Theatre's playhead drives romp
const seek = seekSequence(sheet.sequence, (t) => stage.pose(t));      // or romp (Clock, a frame) drives Theatre
const report = theatreReport({ sequence: sheet.sequence, to: 6, fps: 30, width: 1920, height: 1080, collect: () => objectsRow(objects) });
```

**Motion Canvas:** play baked poses inside a scene by its time, and check a project's nodes.

```ts
import { playBaked, centred, motionCanvasReport, byKey } from "romp/motion-canvas";
yield* playBaked((t) => { const p = centred(poseAtTime(body, t), 1920, 1080); hero.position(p.position); hero.rotation(p.rotation); }, { duration: 6, time: useTime });

const report = await motionCanvasReport({ seek: (f) => player.playback.seek(f), nodes: () => byKey(player.playback.currentScene.getView(), ["hero"]), fps: 30, width: 1920, height: 1080, to: 6 });
```

**Anything else:** build `{ f, row: { name: { x, y, shown, onScreen, area, opacity, box? } } }` per frame and call `analyze(frames, { fps, width, height })` from `romp/check` (the cropped and lost checks need `box`, `width` and `height`).

### Text on screen: the text rules and timing helpers

Captions typed into speech bubbles, headings over footage, a ring round the button being described: the motion check can't tell these from props unless you say what they are. Give a tracked object a **role** (`text`, `focus`, `prop`, `screen` or `background`) and, for text, its words and how many characters are showing, and these rules run as well:

| Issue | What it means |
|---|---|
| `offsafe` | A legible text's box isn't inside the safe area for more than 0.1 s. The default safe area keeps 5% of the long side at each of its ends (notch, rounded corners, status bar) and 3.5% of the short side at each edge: 38 px left and right and 96 px top and bottom at 1080×1920, the other way round at 1920×1080. Words must never touch the edge, unlike `cropped`'s 25% for props; sliding in or out is fine. `safe` takes a share or margins in px. |
| `covers` | A text sits over the `focus` box (the highlighted thing it's talking about) for more than 0.1 s: a bubble covering the very button it describes. |
| `overlap` | Two texts overlap for more than 0.2 s, or a prop is drawn over a text (papers piling over a title, dots falling through it) for two frames. A prop drawn *under* the text (lower `z`: the collector uses document order) is a backdrop, not an overlap. |
| `unfinished` | A text disappears, or its scene cuts (`scenes`, or the start of a `covered` transition), before every character is shown: a caption cut off mid-word. |
| `unread` | A text is whole for less than its reading time (`readingTime()`: 180 words a minute, never under 1.5 s) before it goes. |
| `empty` | A bubble or heading box shows with no words for more than 0.2 s, or a heading (`heading: true`) is still typing 0.5 s after it appears: the blank title between scenes. A heading should arrive whole with its scene. |
| `stale` | (with `--strict`, or `stale: true`) Nothing tracked changes for more than 3 s after every text on screen was read. |

Every rule has its thresholds as options and an allow-list: `allow: { offsafe: ["credits"], covers: ["caption:*"] }` (a trailing `*` matches a prefix), or `allow` on the object (`track(name, { allow: ["covers"] })`, `data-romp-allow="covers"`). **The rules are on by default for anything with a role**, so a film that tags nothing sees no change. `--strict` (or `strict: true`) goes further: every untagged tracked object counts as a prop for `overlap`, and `stale` runs.

### Screens, props over words, and anchored bubbles

Three more kinds of fault that a check of tracked boxes only catches if it knows what they are:

| Issue | What it means |
|---|---|
| `legibility` | A `screen` (a screenshot or screen recording of an app or a web page) is drawn so small that its body text can't be read: its rendered width over its `native` width, times its body text (`minTextPx`, 16 native px), comes out under 20 px on a 1080 px short side (`legiblePx`, in proportion to the frame's short side) for more than 0.5 s. A phone mock a third of a portrait frame wide (390 → 360 px: 14.8 px text) fails; so does a whole 1440 px page in a browser frame. Zooming in or out is fine, and a screen zoomed or cropped to the part that matters passes. Track the element drawn at the content's full size (the image, not a cropping window). |
| `cropped` | For a `screen` or `focus` that would fit in the frame, the tolerance is 1% (`screenCroppedFraction`), not 25%: a phone 2% off the right edge fails. One bigger than the frame is a zoom and passes. Any object can take its own share: `allowCrop: 0.1`. |
| `overlap` | A prop drawn over a text is flagged after two frames (`propOverlapSeconds`, 0.04 s), not 0.2 s: a fast prop crossing a title (a vehicle, papers, confetti) is exactly what reads as a glitch. Two texts still get 0.2 s. |
| `jump` | Any tracked object moves more than ~40 px (scaled from 886 px wide; `jumpPx`) in one frame while it sits still, or isn't there yet, for two frames either side: a bubble that appears 60 px low and snaps up to its place. Under the strobe limit, so it used to pass. Not at a scene cut (`scenes`), and not when its size changes in that frame. |
| `anchor` | A text with a `ground` (a y in frame px) shows any of its box below that line (entering under the ground and jumping up, or sliding under it to leave); or a text with an `anchor` (the tracked object it belongs to, its speaker) is more than `anchorPx` (10% of the short side) from it for more than 0.1 s. |

```tsx
import { trackScreen, trackText } from "romp/remotion";
<Img src={shot} {...trackScreen("app", 390)} style={{ width: 640 }} />           // 390: the phone's CSS width
<div {...trackText(`bubble:${from}`, line, { typed, anchor: "guide", ground: 1500 })}>…</div>
```

**What the check can't see.** It only follows `[data-romp]` elements. An untagged element is invisible, even under `--strict` (which counts untagged *tracked* objects as props), and so is anything drawn inside one `<svg>` or `<canvas>`: papers flying across a title inside a full-frame SVG pass unseen. Track each prop (SVG children take `data-romp` too). `romp check --strict` warns about every untracked `<svg>`, `<canvas>`, `<img>` or `<video>` drawn over a tracked text or screen (after it in the document), and every run of plain text with no tracked ancestor drawn on one; `--untracked error` fails on them. `untrackedOver(root)` from `romp/check` lists them for your own collector.

### Empty frames, clipped screens, small text and a tiny picture

| Issue | What it means |
|---|---|
| `blank` | Nothing tracked is visible (or only objects with `role: "background"`) for more than 0.5 s (`blankSeconds`), outside `covered` spans: an empty frame between scenes. Runs once anything in the film has a role, or under `strict`; reported on the name `(frame)`. |
| `clipped` | A `screen`'s content is cut by a clipping ancestor (`overflow: hidden`) by more than 1% of its in-frame box for more than 0.5 s: a screenshot taller than the phone it sits in. The DOM collector works out each sample's `clip` through its clipping ancestors (the frame itself isn't one: that's `cropped`). Sliding in through a mask is fine; a deliberate crop window takes `allowCrop`. |
| `legibility` | Now for words too: a `text` whose smallest font-size × its on-screen scale (`fontPx`, read by the collector, or `data-romp-font-px`) is under 20 px on a 1080 short side (`textPx`) for more than 0.5 s. Tag labels and bubbles as `text`, not `screen`, to get it. |
| `overlap` | A text on a `screen`'s content, whichever is drawn on top, for more than 0.2 s, unless the text sits on a solid panel of its own (`opaque`: an opaque background colour or image, read by the collector; `track(name, { opaque })` overrides). A heading laid over a screenshot used to pass. |
| `occupancy` | (opt-in: `occupancy: true \| share \| { share, seconds }`, or `--occupancy`) the tracked boxes together cover less than 20% of the frame for more than 2 s: everything tiny in the middle of a big frame. `background` objects don't count. |

**Remotion:** time captions with `captionTiming`, lay scenes out with `timeline`, and track the words.

```tsx
import { captionTiming, timeline, trackText, track, sceneSequence } from "romp/remotion";

// The film as data: each scene is as long as its captions need (typing, then reading
// time), transitions never land on a caption's reading window, act cards default to 1.2 s.
export const film = timeline([
  { name: "intro", seconds: 4 },
  { name: "act-one", act: true },
  { name: "confirm", captions: ["Is this yours?", "One tap and it's on your phone"] },
], { fps: 30, transition: 0.5, cps: 30 });

function Bubble({ text, from }: { text: string; from: number }) {
  const frame = useCurrentFrame();
  const t = captionTiming(text);
  if (frame < from || frame >= from + t.totalFrames) return null;
  const typed = t.typed(frame - from);
  return <div {...trackText(`bubble:${from}`, text, { typed })} style={…}>{text.slice(0, typed)}</div>;
}
<div {...track("ring", { role: "focus" })} style={…} />          // what the bubble must not cover
<h1 {...trackText("title", heading, { heading: true })}>{heading}</h1>

// check.tsx: the timeline's transitions are `covered`, its scene starts are cuts
export default { component: Film, durationInFrames: film.frames, fps: 30, width: 1080, height: 1920, ...film.check };
```

`film.scenes[i]` carries `start`, `frames`, `transitionIn`, `transitionOut` and its `captions` (`from`, `to`, `timing`); `sceneSequence(scene)` gives a `<Sequence>`'s `from` and `durationInFrames`, and `frames` is the length a `TransitionSeries.Sequence` wants. Without attributes for the characters, the collector reads the element's own text as all shown.

**Framework-free:** the same data on any sample.

```ts
import { analyze, formatReport } from "romp/check";
import { captionTiming } from "romp/timing";

const t = captionTiming("Saved, and live on the phone");
const frames = Array.from({ length: t.totalFrames }, (_, f) => ({ f, row: {
  caption: { x: 540, y: 200, shown: true, onScreen: true, area: 8e4, opacity: 1, box: { x0: 140, y0: 150, x1: 940, y1: 250 },
             role: "text", text: "Saved, and live on the phone", chars: { shown: t.typed(f), total: t.chars } },
} }));
console.log(formatReport(analyze(frames, { fps: 30, width: 1080, height: 1920 })));
```

### The soundtrack: dropouts, and one continuous bed

A music bed that cuts to near silence for a moment and comes back reads as a glitch. It usually happens where separately written pieces were joined with a gap. `romp check --audio mix.wav` (or `dropouts(buffer)` from `romp/audio`) flags runs of 0.1–1 s at least 30 dB under the bed's typical level with sound on both sides; silence at the ends and longer rests are left alone.

```bash
bunx romp check --audio public/sound/mix.wav            # the audio alone
bunx romp check check.tsx --audio public/sound/mix.wav  # both; either fails the command
```

`crossfadeBed(synth, bus.music, sections, { fade: 0.5 })` writes the music as one bed: each section's end is stretched to the next one's start, each is written a little past its joins, and an equal-power crossfade joins them.

### The render pipeline: sheets, scene renders, a sound cache and a plan lint

Most of the time spent on a film made in code isn't the check: it's full renders to look at it. `romp/pipeline` (framework-free) and `romp/remotion/render` (the thin Remotion binding, needing `@remotion/renderer` and `@remotion/bundler` in your project) cut that down. Each command reads a config, `romp.render.ts` by default:

```ts
// romp.render.ts
import { renderPlan } from "romp/remotion";
import { film } from "./src/film";          // your timeline()

export default {
  entry: "src/index.ts",                    // the file that calls registerRoot
  composition: "Film",
  fps: 30,
  ...renderPlan(film, { files: (s) => [`src/scenes/${s.name}.tsx`], media: (s) => [`public/rec/${s.name}.mp4`] }),
  audio: "out/sound.wav",
  out: "out/film.mp4",
};
```

- **`romp sheet`**: review contact sheets straight from the composition. One `renderFrames` call renders every Nth frame (default one a second) at half scale as JPEGs, then they're laid out in pages (4×3 by default) with a timestamp, frame number and scene name under each tile, in headless Chromium (no ffmpeg font filters needed). `--scene`, `--from/--to` (seconds), `--every`, `--scale`, `--cols/--rows`, `--tile`, `--out`. `--still <frame>` renders one full-size frame instead.
- **`romp render`**: per-scene rendering with a cache. The film is cut into segments at scene boundaries; a transition (where two scenes overlap, or a span you declare in `transitions`) stays whole in one segment and is never cut. Each segment's key is the hash of every scene it shows (its `props`, its own `files` by content, its `media` by size and time), everything else under `src` (and `package.json`, lockfiles, the rest of `public` by size and time), and the render settings. Only segments whose key changed are rendered (muted, `frameRange`, one browser for all of them); then they're joined with `ffmpeg -c copy` (one render config, so the codec settings match) and the soundtrack is muxed once. It writes `out.mp4.manifest.json`: every segment, its key, whether it was rebuilt and how long it took. `--force scene,…` re-renders scenes regardless.
- **`romp sound --cache .romp/cache`**: the soundtrack is keyed by the bundled module (the schedule, the voices, the timeline it reads), its `--arg` and the loudness, and reused when nothing changed. In code: `soundKey(schedule, opts, ...deps)` from `romp/audio` and `cachedFile(dir, key, ".wav", make)` from `romp/pipeline`.
- **`romp lint plan.ts`**: the plan lint, in milliseconds and with no browser. A plan is data: per scene (and per beat), the boxes on screen and the camera that frames them. It runs the frame check's own layout rules with the same names and thresholds (offsafe, covers, overlap, legibility after the camera's zoom, cropped, clipped, anchor and, if asked, occupancy), plus four only a plan can answer: `fill` (a screen not filling its device's screen area), `focus` (a beat marked `focus` with no focus box), `banned` (words or patterns no text may use) and `band` (a reserved heading band: headings in it, nothing else).
- **`romp bench`** times a short range at several concurrencies and prints the fastest (`--frames 0-149`, `--concurrency 1,2,4,8`). Pass the winner as `concurrency` in the config, or `--concurrency`.
- **`romp encode in.mp4 --out master.mp4 --out share.mp4@1080`** decodes once and encodes every size in one ffmpeg process (`split`), instead of one pass per size.
- **`romp marks recording.mp4`** finds cut points in a long screen recording by frame difference (`--threshold 0.3`, `--min-gap 0.5`), to split it per beat.
- **`romp lock <name> -- <command…>`** runs a command holding a lock on a device or resource; a second one is refused (exit 75) while the first is alive, and a lock left by a dead process is taken over. `acquireLock(name)` in code.

**How a Remotion film feeds the lint.** Keep the layout in plain functions (`phoneBox(scene)`, `headingBox(scene)`, the camera per beat) in a module that doesn't import React, and have both the components and `plan.ts` call them: the lint then checks what will render. `examples/pipeline` in this repo is a 20-scene, 6,000-frame film wired this way.

**Capture.** romp doesn't drive simulators or test runners. Wrap your capture command in `romp lock <device> -- …` so two runs can't fight over one device, record one long take, and split it with `romp marks` (or `marksFromVideo`) into the beats your scenes use.

**Render settings.** Run `romp bench` once per machine and keep its concurrency. Use `gl: "angle"` on macOS when scenes use WebGL or heavy CSS filters (it renders on the GPU); leave it unset for plain DOM. Keep segment renders at `codec: "h264"` with one `crf` (18 is visually lossless for review and share copies), so `-c copy` joins work, and make share copies from the master with `romp encode` rather than rendering twice.

| On a 6,000-frame, 20-scene 4K portrait film | Before | With romp |
|---|---|---|
| A review sheet (1 frame a second) | 175 s (a full render, then 1 frame a second pulled out) | 6.7 s for all 200 tiles (17 pages); 2.4 s for one scene |
| Re-render after a one-scene fix | 167 s (a full re-render) | 28 s (3 of 39 segments); 0.9 s to go back to a version already rendered |
| Soundtrack, unchanged | 43 s | 0.2 s |
| Plan lint | (render, then look) | 0.06 s for 20 scenes |

Measured with `examples/pipeline` on a 12-core Apple-silicon laptop (`baseline.mjs` there is the before). A cold `romp render` costs a little more than one full render (234 s against 167 s: 39 renders instead of one); every render after that is only what changed. The real film these numbers were asked for is heavier (about 21 minutes per full 4K render), so its savings are bigger in seconds.

### CLI

```bash
romp check <entry.tsx> [--public dir] [--from s] [--to s] [--scene name] [--scenes] [--jobs n] [--every n]
           [--arg json] [--strict] [--untracked error] [--occupancy [share]] [--no-media] [--paced] [--audio file.wav] [--json]
romp check --audio <file.wav> [--json]
romp check --lottie <anim.json> [--layers a,b] [--from s] [--to s] [--json]
romp sheet [romp.render.ts] [--out dir] [--every n] [--scale 0.5] [--cols 4] [--rows 3] [--tile 480] [--scene name] [--from s] [--to s] [--still frame]
romp render [romp.render.ts] [--force scene,…] [--concurrency n] [--gl angle] [--out file] [--json]
romp bench [romp.render.ts] [--frames a-b] [--concurrency 1,2,4,8]
romp lint <plan.ts> [--json]
romp encode <in.mp4> --out a.mp4 --out b.mp4@1080 [--crf 18] [--preset medium]
romp marks <recording.mp4> [--threshold 0.3] [--min-gap 0.5] [--json]
romp lock <name> [--dir d] -- <command…>
romp sound <module.ts> --out file.wav [--arg json] [--lufs -16] [--cache .romp/cache]
```

`romp check` exits 1 on any issue (motion, text or audio). `--strict` counts every untagged tracked object as a prop for the overlap rule, runs the stale rule and warns about untracked drawing surfaces and plain text over a tracked text or screen; `--untracked error` makes those warnings fail the check. `romp sound` bundles a module exporting `render(arg)` (an `AudioBuffer` or a base64 WAV), renders it in headless Chromium and loudness-normalises it with ffmpeg when it's on your PATH.

**Speed.** Each frame is seeked with React flushed synchronously (no waiting on animation frames), in Chromium with its frame-rate limit off, and the frames are shared across `--jobs` pages (default: half the cores, at most 8). The rows are merged in frame order and checked as one film, so rules over neighbouring frames see across shard edges. A 6,000-frame composition went from 201 s to about 7 s. `--paced` waits two animation frames per frame instead, for a film that updates itself in effects; `--no-media` skips loading video and audio files.

- `--scenes` lists the film's scenes: the entry's `sections` (a timeline's `check` has them, by name), or its `scenes` cuts numbered from 1. `--scene <name|n>` checks one.
- `--every N` reads every Nth frame and runs only the rules that read one frame's layout: cropped, offsafe, covers, overlap, legibility, anchor, clipped, blank and occupancy. pop, strobe, teleport, jump, spike, lost, unfinished, unread, empty and stale need every frame and are skipped.
- If the page crashes, the check prints the page's latest console output and replays that stretch to name the frame it died on.

## Entry points

| Import | What |
|---|---|
| `romp/core` | `Stage` (`add`, `bake`, `pose`, `get`), `Body`, `SpringyBody`, `Drop`, `Leap`, `LAYER`, `poseAt`, `poseAtTime`, `baked`; `impactResponse`, `landing`, `hop`, `idle`, `blinkAt`, `boing`, `jiggle`, `jiggleParts`, `rock`, `nearImpact`; acting: `syllables`, `talk`, `talkPose`, `gaze`, `jump`, `react`, `alive`, `blinks`, `keepVolume`; `ease`, `spring`, `ringOut`, `stagger`; `Clock` |
| `romp/check` | `analyze`, `formatReport`, `collectDom`, `inFrameShare`, `safeArea`, `boxOverlap` |
| `romp/timing` | `readingTime`, `wordCount`, `captionTiming`, `timeline`, `captionAt` |
| `romp/remotion` | `track`, `trackText`, `trackScreen`, `trackBurst`, `sceneSequence`, `renderPlan`, `captionTiming`, `captionAt`, `timeline`, `readingTime`, `collectDom`, `analyze` |
| `romp/three` | `motionReport`, `screenBox`, `screenArea`, `opacityOf` |
| `romp/audio` | `Synth`, `Instruments`, `createMix`, `renderOffline`, `renderWav`, `playLive`, `listen`, `Score`, `fitTo`, `wavBase64`, `LEAD`, `crossfadeBed`, `dropouts`, `readWav`, `rmsWindows`, `formatDropouts` |
| `romp/audio/cartoon` | `cartoon`, `VOICES` |
| `romp/particles` | `Emitter`, `particlesAt`, `confetti`, `sparks`, `snow`, `fountain`, `particleStyle`, `drawParticles`, `particleBox`, `particleBounds`, `particleSample`, `hash01` |
| `romp/theatre` | `seekSequence`, `followSequence`, `objectSample`, `objectsRow`, `theatreFrames`, `theatreReport` |
| `romp/motion-canvas` | `playBaked`, `centred`, `byKey`, `nodeSample`, `nodesRow`, `motionCanvasReport` |
| `romp/lottie` | `collectLottie`, `lottieFrames`, `lottieReport` |
| `romp/pipeline` | `lintPlan`, `formatLint`, `planSegments`, `keyOf`, `stableKey`, `hashString`, `cachedFile`, `listFiles`, `hashFiles`, `stampFiles`, `montage`, `sheetHtml`, `timecode`, `concat`, `concatArgs`, `muxArgs`, `encodeArgs`, `marksFromVideo`, `parseMarks`, `ffmpeg`, `probe`, `acquireLock` |
| `romp/remotion/render` | `renderScenes`, `renderSheet`, `renderStill`, `bench`, `sceneKeys` |

## License

MIT © Isaac Rowntree
