// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { collectDom } from "../src/check/dom.js";
import { track, trackText } from "../src/remotion/index.js";

/** happy-dom doesn't lay out: give each element its box. */
function el(attrs: Record<string, string | undefined>, box: [number, number, number, number], text = ""): HTMLElement {
  const e = document.createElement("div");
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
