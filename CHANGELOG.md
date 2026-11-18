# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

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
