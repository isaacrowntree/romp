# Contributing to romp

Thanks for taking a look. romp is a small set of rules for motion and sound in
videos made in code, written as a library. Contributions are welcome as long as
they keep it small and deterministic.

## Ground rules

- **Deterministic or it doesn't ship.** Everything must be a pure function of
  time (or of a seed): the same scene bakes to the same poses, the same
  schedule renders the same samples. No `Math.random()`, no wall-clock reads
  outside `Clock`.
- **Every rule ships a test.** A motion check that misses a pop, or a stage
  that bakes differently twice, produces confident-looking wrong videos. Add or
  update a test in `test/`.
- **The core has one runtime dependency: planck.** React, Remotion, three.js,
  esbuild and Playwright are optional peers used only by their entry points.
- **No samples.** Every sound is synthesised, so every user can ship it anywhere.

## Getting set up

```bash
git clone https://github.com/isaacrowntree/romp
cd romp
bun install
bun run test        # vitest
bun run typecheck
bun run lint
bun run build       # tsc → dist/ (ESM + .d.ts) and the demo bundle in docs/
bun run gif         # regenerate docs/hero.gif (needs ffmpeg)
```

The demo page under `docs/` is served by GitHub Pages and doubles as a manual
test surface: open `docs/index.html`, play it with sound and run the motion check.

## Project layout

| Path | What |
|---|---|
| `src/core/` | The physics stage and actors, character motion, curves, the realtime `Clock` |
| `src/check/` | The motion check and the DOM collector |
| `src/remotion/`, `src/three/` | Adapters |
| `src/audio/` | Synth voices, instruments, the mix, live/offline playback, cartoon voices |
| `bin/romp.mjs` | The CLI (`check`, `sound`) |
| `examples/` | A Remotion composition for `romp check` and a schedule for `romp sound` |
| `docs/` | The live demo page and the generated hero |
| `scripts/` | Demo bundle and hero GIF generation |

## Submitting

1. Fork, branch, and make your change with tests.
2. `bun run lint && bun run typecheck && bun run test && bun run build` all green.
3. Open a PR describing the change; for anything visual or audible, include a before/after.

CI runs lint, typecheck, tests and build on every PR.
