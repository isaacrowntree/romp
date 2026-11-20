// A 200 s soundtrack for the synthetic film: a marimba every half second, a bell at each scene.
import { renderWav } from "../../dist/audio/index.js";
import { film } from "./src/story";

export async function render() {
  return renderWav(
    (s, bus, at) => {
      for (let t = 0; t < film.frames / 30; t += 0.5) {
        const w = at(t);
        if (w != null) s.marimba(w, 60 + ((t * 2) % 12), bus.music);
      }
      film.scenes.forEach((sc, i) => {
        const w = at(sc.start / 30);
        if (w != null) s.bell(w, 72 + (i % 5), bus.music);
      });
    },
    { duration: film.frames / 30 },
  );
}
