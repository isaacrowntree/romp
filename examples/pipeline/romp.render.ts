// `romp render` / `romp sheet` / `romp bench` read this. Each scene is keyed by
// its own data file and its captions; everything else under src is shared.
import { renderPlan } from "../../dist/remotion/index.js";
import { film, FPS } from "./src/story";

const plan = renderPlan(film, { files: (s) => [`src/scenes/${s.name}.json`] });

export default {
  entry: "src/index.ts",
  composition: "Synthetic",
  fps: FPS,
  ...plan,
  audio: "out/sound.wav",
  out: "out/film.mp4",
};
