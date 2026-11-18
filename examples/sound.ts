// A schedule for `romp sound`: a little groove and three boings.
import { Instruments, renderWav, type Schedule } from "../src/audio/index.js";
import { cartoon } from "../src/audio/cartoon.js";

const schedule: Schedule = (s, bus, at) => {
  const band = new Instruments(s);
  for (let b = 0; b < 8; b++) {
    const t = at(b * 0.5);
    if (t == null) continue;
    if (b % 2 === 0) band.kick(t, bus.drums, { vel: 0.3 });
    s.marimba(t, [74, 76, 78, 81, 83][b % 5], bus.music, { vel: 0.18 });
  }
  [0.6, 1.4, 2.2].forEach((x, i) => s.boing(at(x)!, bus.sfx, { k: 0.5 + i * 0.3, seed: i }));
  s.babble(at(2.6)!, 0.6, bus.voice, { voice: "squeaky" });
};

export const render = () => renderWav(schedule, { duration: 4, extend: cartoon });
