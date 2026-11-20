// `romp lint plan.ts`: the film's layout as data, from the same `layout` the
// components draw with, so the lint checks what will render. No browser.
import type { Plan } from "../../dist/pipeline/index.js";
import { film, layout, W, H } from "./src/story";

const plan: Plan = {
  width: W,
  height: H,
  band: { top: 240, bottom: 620 },
  banned: ["simply", "just", /\bseamless(ly)?\b/i],
  scenes: film.scenes.map((s) => {
    const d = (s as unknown as { data: { title: string; caption: string } }).data;
    return {
      name: s.name,
      items: [
        { name: "heading", role: "text", heading: true, text: d.title, fontPx: 150, box: layout.heading },
        { name: "phone", role: "device", box: layout.device, screenRect: layout.screen },
        { name: "app", role: "screen", device: "phone", native: { width: 390 }, box: layout.screen },
        { name: "caption", role: "text", text: d.caption, fontPx: 84, opaque: true, box: layout.caption },
      ],
    };
  }),
};
export default plan;
