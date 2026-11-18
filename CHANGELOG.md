# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [0.4.2] — 2026-11-19

### Fixed
- The **lost** rule's camera test, done properly: the three.js collector splits each
  object's on-screen move into the camera's part (the same world point through last
  frame's camera and this one) and its own; leaving the frame mostly by the
  camera's part means the camera moved on (`Sample.cameraLeft`). 0.4.1's test
  (where it was last in view, through today's camera) missed slow cameras. Tested
  on three camera-driven films: from 40–56 flags per film to the few real exits.

## [0.4.1] — 2026-11-19

### Fixed
- The motion check's **lost** rule no longer flags objects a moving camera leaves
  behind, first try: the three.js collector recorded each object's world position,
  and an object that stayed put in its world while it left the frame was spared.
  Superseded by 0.4.2 (objects that move a little, like a bobbing pin, slipped
  through).

## [0.4.0] — 2026-11-18

### Added
- **romp/particles**: a deterministic particle emitter. Each particle's launch
  comes from a seeded hash of its index and its flight is closed-form (gravity,
  wind, linear drag, sway, spin, confetti flip), so `particlesAt(frame)` is a
  pure function of the frame: any frame, any order, in a live viewer, Remotion
  or the motion check. Particles bounce and come to rest on a `ground` (a y, or
  the polyline you gave `stage.ground()`), grow in and fade out by default (not
  pops), and come out as plain data. Presets `confetti`, `sparks`, `snow` and
  `fountain`; `particleStyle` (DOM), `drawParticles` (canvas), and
  `particleSample` to check a burst as one object.
- `trackBurst(name, particles)` in **romp/remotion**: tracks a particle burst as
  one object for `romp check`.
- **Sound as a signal**: `listen(schedule)` in **romp/audio** runs a schedule
  silently and records every voice it plays; the `Score` answers
  `envelopeAt(t, { bus?, voice?, decay? })`, `beatAt(t)` and
  `onsetsBetween(t0, t1)` as pure functions of film time, for visuals that
  react to the soundtrack without a live analyser.
- **romp/theatre**: `seekSequence`, `followSequence`, `objectsRow` and
  `theatreReport`, so a Theatre.js sequence can host romp-baked motion and the
  motion check can step it.
- **romp/motion-canvas**: `playBaked` (baked poses inside a scene, by its time),
  `centred`, and `motionCanvasReport` / `byKey` / `nodeSample` to run the
  motion check over a Motion Canvas project.
- **romp/lottie** and `romp check --lottie anim.json`: the motion check for
  lottie-web animations (After Effects exports), every layer through its
  parents and precomps: a layer cut in at full size is a pop.
- @theatre/core, @motion-canvas/core, @motion-canvas/2d and lottie-web are
  optional peer dependencies; none of the adapters import them.
- Demo: sparks where the flung character hits, tracked as one burst (the check
  stays clean), and a shelf that brightens on every kick drum, read from the
  score.

## [0.3.1] — 2026-11-18

### Fixed
- Sideways hits are impacts: a body whose horizontal speed reverses sharply (a
  wall, or a neighbour side-on) records an impact with `side: true`, so the motion
  check no longer reads a bounce off a wall as a kink. `landed` ignores side hits,
  and `impactResponse` squashes half as much for them.

## [0.3.0] — 2026-11-18

### Added
- The motion check's **lost** rule: a character that has been in frame leaves it
  entirely and stays out for more than `lostSeconds` (1 s) is flagged; mark a real
  exit with `allowExit` (option, `track(name, { allowExit })`, `userData.allowExit`).
- `impactResponse(body, frame, seed, speedRef, { squash, widen })`: tune how far a
  landing squashes and how much of it spreads sideways, so characters piled
  against each other don't overlap on screen.

### Fixed
- Demo: the flung character no longer bounces out of the picture (walls above the
  frame), can't tunnel through others (`bullet`), turns about its centre instead
  of its feet, and every character is drawn the same round shape as its body, so
  what you see is what collides. The planted-bug sticker keeps dark text in dark mode.

## [0.2.0] — 2026-11-18

### Added
- **Motion check: `cropped`.** A tracked object that's shown and on screen but
  has more than `croppedFraction` (default 0.25) of its own box outside the
  frame for more than `croppedSeconds` (default 0.5 s) in a row. Runs where it's
  entering or leaving (its on-frame share only rises or only falls) and covered
  frames are exempt; opt out per object with `track(name, { allowCrop: true })`
  / `data-romp-allow-crop`, `userData.allowCrop` in three.js, or `allowCrop`
  names. `collectDom` and `motionReport` now report each object's `box`;
  `inFrameShare()` and `screenBox()` are exported.
- `poseAt` / `poseAtTime` take `{ discrete: "nearest" | "previous" }` for how
  booleans and other non-numeric fields blend between baked frames.
- `Stage.add(actor)` sets `actor.stage` before `build()`; `Stage.pose(t)` hands
  every actor with an `apply(pose, t)` its interpolated pose, NaN poses as
  `{ shown: false }`.
- `Drop`: `foot` (a contact circle), `spinAt` and `tilt` that unwind to zero at
  touchdown, `z: [from, to]` depth drift arrested on contact, `rock` direction,
  `ledge` with a `frame` offset; `flight(frame)` and `framePose(frame)`.
  `Body` gains `gravityScale`; `Leap` gains `gravity` and `frame`.
- A docs site at https://isaacrowntree.com/romp/: a live demo (a springy
  wordmark knocked over, a pile of hatted characters whose hats follow through
  with `jiggleParts`, play/pause/scrub with sound on the audio clock, the same
  soundtrack rendered offline to a WAV, and the motion check with a "plant a
  bug" toggle), guides, the API reference (checked against the exports at
  build time) and this changelog. The demo's source is `examples/demo/`.

### Changed
- `romp check` and `motionReport` now pass the frame's height, so the cropped
  check runs by default (this is why it's 0.2.0): an object parked half off the
  edge that passed before is now reported.

## [0.1.1] — 2026-11-18

### Added
- `jiggleParts(parts, dt, strength?, lag?)`: secondary motion for several parts
  at once, each lagging the one before.
- `romp check --arg <json>`: the entry may export a function of the argument,
  so one entry covers several cuts (languages, variants).

### Fixed
- `bin/romp.mjs` is executable, so `bunx romp` / `npx romp` work after
  installing from GitHub.

## [0.1.0] — 2026-11-18

### Added
- **romp/core**: a planck.js (Box2D) `Stage` that bakes a scene once at a fixed
  240 Hz and stores one pose per frame, in screen space (y down) or y-up; the
  actor protocol (`build` / `control` / `sample`); preset actors `Body` (with
  recorded impacts), `SpringyBody` (welds where it lands on its ground), `Drop`
  and `Leap`; collision layers; `poseAt` (frames) and `poseAtTime` (seconds).
- Character motion as pure functions: `impactResponse` (squash, blink,
  follow-through and jiggle from real impacts), `landing`, `hop`, `idle`,
  `blinkAt`, `boing`, `jiggle`, `rock`, `nearImpact`; curves `ease`, `spring`,
  `ringOut`, `stagger`.
- `Clock`: real-time playback driving `seek(t)` on requestAnimationFrame,
  following the audio clock while sound plays.
- **romp/check**: the motion check (`analyze`: pops, strobes, teleports,
  spikes, with whips, covered frames, impacts and seamless swaps exempt),
  `formatReport`, and `collectDom` for `data-romp` elements.
- **romp/remotion** (`track`) and **romp/three** (`motionReport`).
- **romp/audio**: synthesised voices and instruments, `createMix`, and one
  schedule played live (`playLive`) or rendered offline (`renderOffline`,
  `renderWav`); **romp/audio/cartoon** voices.
- CLI: `romp check` (Remotion compositions in headless Chromium) and
  `romp sound` (render a schedule to a loudness-normalised WAV).
- Live demo page in `docs/` and a generated hero GIF.
