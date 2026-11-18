# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

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
