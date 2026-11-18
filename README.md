# romp

[![ci](https://github.com/isaacrowntree/romp/actions/workflows/ci.yml/badge.svg)](https://github.com/isaacrowntree/romp/actions)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![live demo](https://img.shields.io/badge/demo-live-7B4FD6.svg)](https://isaacrowntree.com/romp/)

**Physics-baked character motion, a motion check and synthesised sound for videos made in code.** Works with Remotion, three.js or any page with a `seek(t)`, played live on `requestAnimationFrame` or rendered frame by frame.

### ▶ [Try the live demo: drop a pile of blobs, play it with sound, run the motion check](https://isaacrowntree.com/romp/)

[![Seven blob characters dropped into a pile: each one squashes on landing, blinks on impact and its antenna follows through](https://raw.githubusercontent.com/isaacrowntree/romp/master/docs/hero.gif)](https://isaacrowntree.com/romp/)

*Every frame above was read from a simulation baked once at 240 Hz. Each blob's squash, blink and antenna wobble are sized by the real speed of its own impacts, and on the [live demo](https://isaacrowntree.com/romp/) the same impacts fire the boings.*

## Why

Videos made in code (product promos, app previews, explainers) tend to fail the same way: linear easing, things that pop in at full size, motion that kinks where two moves meet, and silence, or a stock track that ignores the picture. Keyframing your way out of that is slow, and you can't see a pop at 30 fps until a viewer does.

romp encodes the fixes as a small library:

- **Choreography says where and when; physics says how.** Anything that falls, piles, gets knocked or hops is a rigid body in a planck.js (Box2D) world, not an eased arc.
- **Bake once, read every frame.** A scene is simulated once at a fixed 240 Hz and one pose per frame is stored. Reading a pose is a pure function of time, so the same motion plays in a live viewer, a frame-by-frame renderer, a scrubber and the motion check, identically.
- **Impacts drive the picture and the sound.** Every landing is recorded with its speed. Squash, closed eyes, follow-through on hats and antennae, and the boing on the soundtrack all hang off the same impact.
- **A motion check you can run in CI.** It steps every frame and flags **pops** (appears or vanishes at full size, opaque), **strobes** (more than ~100 px in one frame at 886 px wide), **teleports** (more than ~300 px) and **spikes** (a kink in the motion), with exemptions for real impacts, deliberate whips, covered frames and fades.
- **Sound that belongs to the picture.** Synthesised voices (marimba, bell, plucks, Rhodes, upright, kit, whooshes, plops, boings, gibberish character voices), a mix tuned for phone speakers, and one schedule function that plays live or renders offline. No samples, so there's nothing to license.

## Install

Not on npm yet: install it from GitHub.

```bash
bun add github:isaacrowntree/romp planck
# for the CLI, also: bun add -d esbuild playwright
```

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

`SpringyBody` welds to its ground where it lands (a letter that can be knocked over and wobbles back), `Drop` and `Leap` are a dropped prop and a ballistic leap through a surface. Collision layers (`LAYER`) keep a pile of characters from landing on a wordmark. Without physics, `landing()`, `hop()`, `idle()`, `blinkAt()` and `boing()` give the same squash-and-stretch vocabulary as pure functions of the frame; `ease`, `spring()` and `ringOut()` are closed-form curves.

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

**Anything else:** build `{ f, row: { name: { x, y, shown, onScreen, area, opacity } } }` per frame and call `analyze(frames, { fps, width })` from `romp/check`.

### CLI

```bash
romp check <entry.tsx> [--public dir] [--from s] [--to s] [--arg json] [--json]
romp sound <module.ts> --out file.wav [--arg json] [--lufs -16]
```

`romp sound` bundles a module exporting `render(arg)` (an `AudioBuffer` or a base64 WAV), renders it in headless Chromium and loudness-normalises it with ffmpeg when it's on your PATH.

## Entry points

| Import | What |
|---|---|
| `romp/core` | `Stage`, `Body`, `SpringyBody`, `Drop`, `Leap`, `LAYER`, `poseAt`, `poseAtTime`, `baked`; `impactResponse`, `landing`, `hop`, `idle`, `blinkAt`, `boing`, `jiggle`, `jiggleParts`, `rock`, `nearImpact`; `ease`, `spring`, `ringOut`, `stagger`; `Clock` |
| `romp/check` | `analyze`, `formatReport`, `collectDom` |
| `romp/remotion` | `track`, `collectDom`, `analyze` |
| `romp/three` | `motionReport`, `screenArea`, `opacityOf` |
| `romp/audio` | `Synth`, `Instruments`, `createMix`, `renderOffline`, `renderWav`, `playLive`, `fitTo`, `wavBase64`, `LEAD` |
| `romp/audio/cartoon` | `cartoon`, `VOICES` |

## License

MIT © Isaac Rowntree
