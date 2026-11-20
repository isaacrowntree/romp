import { describe, expect, it } from "vitest";
import { lintPlan, formatLint, type Plan, type PlanItem, type PlanScene } from "../src/pipeline/lint.js";

const W = 1080, H = 1920;
// A clean scene: a heading up top, a phone whose screen fills its screen area, a caption below.
const heading = (o: Partial<PlanItem> = {}): PlanItem => ({ name: "heading", role: "text", heading: true, text: "Plan the trip", fontPx: 72, box: { x: 80, y: 140, width: 920, height: 120 }, ...o });
const device = (o: Partial<PlanItem> = {}): PlanItem => ({ name: "phone", role: "device", box: { x: 240, y: 380, width: 600, height: 1220 }, screenRect: { x: 270, y: 440, width: 540, height: 1100 }, ...o });
const screen = (o: Partial<PlanItem> = {}): PlanItem => ({ name: "app", role: "screen", device: "phone", native: { width: 390 }, box: { x: 270, y: 440, width: 540, height: 1100 }, ...o });
const caption = (o: Partial<PlanItem> = {}): PlanItem => ({ name: "caption", role: "text", text: "Tap once to book", fontPx: 44, opaque: true, box: { x: 100, y: 1660, width: 880, height: 120 }, ...o });
const scene = (items: PlanItem[], o: Partial<PlanScene> = {}): PlanScene => ({ name: "s1", items, ...o });
const lint = (scenes: PlanScene[], o: Partial<Plan> = {}) => lintPlan({ width: W, height: H, scenes, ...o });
const kinds = (r: ReturnType<typeof lintPlan>) => r.issues.map((i) => `${i.kind}:${i.name}`);

describe("plan lint", () => {
  it("passes a clean plan, fast and without a browser", () => {
    const t = performance.now();
    const r = lint(Array.from({ length: 30 }, (_, i) => ({ ...scene([heading(), device(), screen(), caption()]), name: `s${i}` })), { band: { top: 100, bottom: 300 }, banned: ["simply"] });
    expect(r.issues).toEqual([]);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(formatLint(r)).toBe("plan lint: 30 scenes, 30 beats, no issues");
  });
  it("offsafe: a caption against the edge", () => {
    expect(kinds(lint([scene([caption({ box: { x: 10, y: 1660, width: 880, height: 120 } })])]))).toEqual(["offsafe:caption"]);
  });
  it("covers: a bubble over the focus ring", () => {
    const ring: PlanItem = { name: "ring", role: "focus", box: { x: 300, y: 900, width: 300, height: 120 } };
    const r = lint([scene([ring, caption({ name: "bubble", box: { x: 250, y: 880, width: 500, height: 140 } })])]);
    expect(kinds(r)).toContain("covers:bubble");
  });
  it("overlap: a heading over a screen, unless it has a panel", () => {
    const low = heading({ box: { x: 80, y: 500, width: 920, height: 120 }, z: 5 });
    expect(kinds(lint([scene([device(), screen(), low])]))).toContain("overlap:heading");
    expect(kinds(lint([scene([device(), screen(), { ...low, opaque: true }])]))).not.toContain("overlap:heading");
  });
  it("legibility after the camera's zoom: a phone pulled back to a third of the frame", () => {
    const items = [device(), screen()];
    expect(kinds(lint([scene(items)]))).toEqual([]);
    const r = lint([scene(items, { camera: { scale: 0.6, x: 216, y: 380 } })]);
    expect(kinds(r)).toContain("legibility:app");
    // And text shrinks with it: 44 px × 0.4 is too small.
    expect(kinds(lint([scene([caption()], { camera: { scale: 0.4, x: 300, y: 600 } })]))).toContain("legibility:caption");
    // A fixed overlay ignores the camera.
    expect(kinds(lint([scene([caption({ fixed: true })], { camera: { scale: 0.4, x: 300, y: 600 } })]))).toEqual([]);
  });
  it("fill: a screen letterboxed in its device, or cropped inside it", () => {
    const short = lint([scene([device(), screen({ box: { x: 270, y: 440, width: 540, height: 960 } })])]);
    expect(short.issues[0]).toMatchObject({ kind: "fill", name: "app" });
    expect(short.issues[0].detail).toMatch(/140 px short at the bottom/);
    const over = lint([scene([device(), screen({ box: { x: 270, y: 440, width: 540, height: 1300 } })])]);
    expect(kinds(over)).toEqual(["fill:app"]);
    expect(over.issues[0].detail).toMatch(/200 px over at the bottom/);
    expect(kinds(lint([scene([screen()])]))).toEqual(["fill:app"]); // its device is missing
  });
  it("occupancy (opt-in): everything tiny in the middle", () => {
    const tiny = [{ name: "dot", role: "prop" as const, box: { x: 500, y: 900, width: 80, height: 80 } }, caption({ box: { x: 400, y: 1000, width: 280, height: 60 }, fontPx: 30 })];
    expect(kinds(lint([scene(tiny)]))).toEqual([]);
    expect(kinds(lint([scene(tiny)], { occupancy: true }))).toContain("occupancy:(frame)");
  });
  it("focus: a focus beat with no focus box", () => {
    const r = lint([scene([heading()], { beats: [{ name: "intro" }, { name: "the button", focus: true }, { name: "ringed", focus: true, items: [{ name: "ring", role: "focus", box: { x: 400, y: 900, width: 200, height: 100 } }] }] })]);
    expect(r.issues.map((i) => `${i.beat}:${i.kind}`)).toEqual(["the button:focus"]);
    expect(r.beats).toBe(3);
  });
  it("banned words, whole words and patterns", () => {
    const r = lint([scene([caption({ text: "Simply tap to book" }), heading({ text: "Simplyfy" })])], { banned: ["simply", /\bjust\b/i] });
    expect(kinds(r)).toEqual(["banned:caption"]);
    expect(kinds(lint([scene([caption({ text: "It just works" })])], { banned: [/\bjust\b/i] }))).toEqual(["banned:caption"]);
  });
  it("band: headings in the reserved band, nothing else", () => {
    const band = { top: 100, bottom: 300 };
    expect(kinds(lint([scene([heading({ box: { x: 80, y: 280, width: 920, height: 120 } })])], { band }))).toEqual(["band:heading"]);
    expect(kinds(lint([scene([heading({ box: { x: 80, y: 140, width: 600, height: 120 } }), { name: "sticker", role: "prop", box: { x: 800, y: 250, width: 120, height: 120 } }])], { band }))).toEqual(["band:sticker"]);
  });
  it("respects allow and a beat's own camera", () => {
    expect(kinds(lint([scene([caption({ box: { x: 10, y: 1660, width: 880, height: 120 }, allow: ["offsafe"] })])]))).toEqual([]);
    const r = lint([scene([device(), screen()], { beats: [{ name: "wide" }, { name: "pulled back", camera: { scale: 0.6, x: 216, y: 380 } }] })]);
    expect(r.issues.map((i) => `${i.beat}:${i.kind}`)).toEqual(["pulled back:legibility"]);
  });
});
