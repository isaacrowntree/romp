import { describe, expect, it } from "vitest";
import { jiggle, jiggleParts } from "../src/core/motion.js";

describe("jiggleParts", () => {
  it("gives every part a value, each lagging the one before", () => {
    const parts = jiggleParts(["brim", "bobble", "tassel"], 6, 1, 2);
    expect(Object.keys(parts)).toEqual(["brim", "bobble", "tassel"]);
    expect(parts.brim).toBe(jiggle(6));
    expect(parts.bobble).toBe(jiggle(4));
    expect(parts.tassel).toBe(jiggle(2));
  });
  it("settles to rest", () => {
    const late = jiggleParts(["a", "b"], 400);
    expect(Math.abs(late.a)).toBeLessThan(1e-6);
    expect(Math.abs(late.b)).toBeLessThan(1e-6);
  });
});
