import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { film, layout } from "./story";

const px = (b: { x: number; y: number; width: number; height: number }) => ({ position: "absolute" as const, left: b.x, top: b.y, width: b.width, height: b.height });

function Scene({ data, frames, tIn }: { data: { title: string; caption: string; hue: number }; frames: number; tIn: number }) {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, Math.max(1, tIn)], [0, 1], { extrapolateRight: "clamp" });
  const typed = Math.min(data.caption.length, Math.max(0, Math.floor((f - 10) * 1.2)));
  return (
    <AbsoluteFill style={{ background: `hsl(${data.hue} 40% 92%)`, opacity: fade, fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ ...px(layout.heading), fontSize: 150, fontWeight: 800, color: `hsl(${data.hue} 50% 22%)` }}>{data.title}</div>
      <div style={{ ...px(layout.device), borderRadius: 160, background: "#111", boxShadow: "0 60px 160px rgba(0,0,0,.35)", transform: `translateY(${Math.sin(f / 40) * 12}px)` }} />
      <div style={{ ...px(layout.screen), borderRadius: 100, overflow: "hidden", background: "#fff", transform: `translateY(${Math.sin(f / 40) * 12}px)` }}>
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} style={{ margin: "28px 40px", height: 60, borderRadius: 18, background: `hsl(${(data.hue + i * 9) % 360} 60% ${70 + (i % 3) * 6}%)`, width: `${60 + ((i * 17 + f) % 35)}%` }} />
        ))}
      </div>
      {Array.from({ length: 16 }, (_, k) => (
        <div key={k} style={{ position: "absolute", left: 120 + k * 120 + Math.sin((f + k * 9) / 18) * 30, top: 3150 + Math.cos((f + k * 7) / 22) * 30, width: 40, height: 40, borderRadius: 20, background: `hsl(${data.hue} 70% 45%)` }} />
      ))}
      <div style={{ ...px(layout.caption), fontSize: 84, lineHeight: 1.25, color: "#222", background: "rgba(255,255,255,.92)", borderRadius: 40, padding: "30px 50px", boxSizing: "border-box" }}>{data.caption.slice(0, typed)}</div>
      <div style={{ position: "absolute", right: 60, top: 60, fontSize: 48, color: "#555" }}>{f}/{frames}</div>
    </AbsoluteFill>
  );
}

export function Film() {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {film.scenes.map((s) => (
        <Sequence key={s.name} from={s.start} durationInFrames={s.frames} name={s.name}>
          <Scene data={(s as any).data} frames={s.frames} tIn={s.transitionIn} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
