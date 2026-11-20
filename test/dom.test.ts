// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { collectDom, untrackedOver } from "../src/check/dom.js";
import { track, trackScreen, trackText } from "../src/remotion/index.js";

/** happy-dom doesn't lay out: give each element its box. */
function el(attrs: Record<string, string | undefined>, box: [number, number, number, number], text = "", tag = "div"): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  e.textContent = text;
  const [left, top, width, height] = box;
  e.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
  return e;
}

describe("collectDom: the text rules' attributes", () => {
  it("reads roles, characters, headings, allow-lists and paint order", () => {
    const root = document.createElement("div");
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1080, height: 1920, right: 1080, bottom: 1920, x: 0, y: 0, toJSON() {} }) as DOMRect;
    root.append(
      el(track("ring", { role: "focus" }), [100, 900, 400, 100]),
      el(trackText("title", "A *new* look", { typed: 4, heading: true, allow: ["offsafe"] }), [60, 100, 900, 120], "A ne"),
      el(track("note", { role: "text" }), [60, 300, 900, 120], "Plain words here"),
      el(track("dot", { role: "prop", z: 99 }), [500, 140, 20, 20]),
    );
    document.body.append(root);
    const row = collectDom(root);
    expect(row.ring.role).toBe("focus");
    expect(row.title).toMatchObject({ role: "text", text: "A new look", chars: { shown: 4, total: 10 }, heading: true, allow: ["offsafe"], z: 1 });
    // No character attributes: the element's own text, all of it shown.
    expect(row.note).toMatchObject({ text: "Plain words here", chars: { shown: 16, total: 16 } });
    expect(row.dot.z).toBe(99);
    expect(row.ring.chars).toBeUndefined();
  });
});

describe("collectDom: screens, anchors and crop shares", () => {
  it("reads a screen's native width, a text's anchor and ground, and a numeric allowCrop", () => {
    const root = document.createElement("div");
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1080, height: 1920, right: 1080, bottom: 1920, x: 0, y: 0, toJSON() {} }) as DOMRect;
    root.append(
      el(trackScreen("app", 390, { minTextPx: 15, allowCrop: 0.1 }), [300, 600, 360, 780]),
      el(trackText("bubble", "Hi there", { anchor: "guide", ground: 1500 }), [100, 1200, 400, 120], "Hi there"),
      el(track("hero", { allowCrop: true }), [0, 0, 10, 10]),
    );
    document.body.append(root);
    const row = collectDom(root);
    expect(row.app).toMatchObject({ role: "screen", native: { width: 390 }, minTextPx: 15, allowCrop: 0.1 });
    expect(row.bubble).toMatchObject({ anchor: "guide", ground: 1500 });
    expect(row.hero.allowCrop).toBe(true);
    root.remove();
  });
});

describe("untrackedOver: what --strict can't see", () => {
  it("finds an untracked drawing surface drawn over a text, not one under it or tracked", () => {
    const root = document.createElement("div");
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1080, height: 1920, right: 1080, bottom: 1920, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const under = el({ id: "backdrop" }, [0, 0, 1080, 1920], "", "canvas");
    const title = el(trackText("title", "Plan the trip"), [100, 200, 880, 140], "Plan the trip");
    const papers = el({ class: "papers flying" }, [0, 0, 1080, 1920], "", "svg");
    const tracked = el(track("van"), [100, 220, 200, 100], "", "canvas");
    const away = el({}, [0, 1600, 200, 200], "", "img");
    root.append(under, title, papers, tracked, away);
    document.body.append(root);
    const found = untrackedOver(root);
    expect(found.map((u) => u.what)).toEqual(["<svg.papers>"]);
    expect(found[0].text).toBe("title");
    root.remove();
  });
});
