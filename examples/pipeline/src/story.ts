// The film as data: 20 scenes, each 10 s plus a 0.5 s cross-fade, 6,000 frames at 30 fps.
// Each scene's words live in its own JSON file, so editing one changes only that scene's key.
import { timeline } from "../../../dist/timing/index.js";

import s01 from "./scenes/scene-01.json";
import s02 from "./scenes/scene-02.json";
import s03 from "./scenes/scene-03.json";
import s04 from "./scenes/scene-04.json";
import s05 from "./scenes/scene-05.json";
import s06 from "./scenes/scene-06.json";
import s07 from "./scenes/scene-07.json";
import s08 from "./scenes/scene-08.json";
import s09 from "./scenes/scene-09.json";
import s10 from "./scenes/scene-10.json";
import s11 from "./scenes/scene-11.json";
import s12 from "./scenes/scene-12.json";
import s13 from "./scenes/scene-13.json";
import s14 from "./scenes/scene-14.json";
import s15 from "./scenes/scene-15.json";
import s16 from "./scenes/scene-16.json";
import s17 from "./scenes/scene-17.json";
import s18 from "./scenes/scene-18.json";
import s19 from "./scenes/scene-19.json";
import s20 from "./scenes/scene-20.json";

export const SCENES = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20];
export const FPS = 30, W = 2160, H = 3840;
export const film = timeline(
  SCENES.map((s, i) => ({ name: `scene-${String(i + 1).padStart(2, "0")}`, seconds: i === 0 ? 10 : 10.5, data: s })),
  { fps: FPS, transition: 0.5 },
);

/** The layout, shared by the components and the lint plan (composition px). */
export const layout = {
  heading: { x: 160, y: 300, width: 1840, height: 260 },
  device: { x: 480, y: 760, width: 1200, height: 2420 },
  screen: { x: 540, y: 880, width: 1080, height: 2180 },
  caption: { x: 200, y: 3260, width: 1760, height: 300 },
};
