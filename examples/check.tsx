// A tiny Remotion composition for `romp check`: two blobs, one dropped with
// physics (clean), one that pops in at full size (flagged).
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Body, Stage, nearImpact, poseAt } from "../src/core/index.js";
import { track } from "../src/remotion/index.js";

const stage = new Stage();
stage.ground([{ x: 0, y: 600 }, { x: 800, y: 600 }]);
stage.add(new Body({ id: "dropped", x: 300, y: -60, w: 120, h: 120, spawn: 5, vy: 600 }));
stage.bake({ frames: 90 });
const dropped = stage.get<Body>("dropped");

function Demo() {
  const frame = useCurrentFrame();
  const p = poseAt(dropped, frame);
  return (
    <AbsoluteFill style={{ background: "#faf6ff" }}>
      {p.shown ? <div {...track("dropped", { impact: nearImpact(dropped.impacts, frame) })} style={{ position: "absolute", left: p.x - 60, top: p.y - 60, width: 120, height: 120, borderRadius: 60, background: "#7b4fd6" }} /> : null}
      {frame >= 40 ? <div {...track("popper")} style={{ position: "absolute", left: 550, top: 300, width: 140, height: 140, borderRadius: 70, background: "#ff4f7b" }} /> : null}
    </AbsoluteFill>
  );
}

export default { component: Demo, durationInFrames: 90, fps: 30, width: 800, height: 700 };
