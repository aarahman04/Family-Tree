import { describe, expect, it } from "vitest";
import type { PosterNode } from "../../../src/poster/types.js";
import { hitTestNode } from "../../src/lib/canvasHitTest.js";

const n = (personId: string, x: number, y: number): PosterNode => ({
  personId,
  generation: 0,
  x,
  y,
  width: 100,
  height: 40,
  name: personId,
  nameLines: [personId],
  rtl: false,
  gender: "unknown",
});

describe("hitTestNode", () => {
  const nodes = [n("a", 100, 100), n("b", 400, 100)];

  it("returns the node under the point (accounting for margin)", () => {
    expect(hitTestNode(nodes, 40 + 100, 40 + 100, 40)).toBe("a");
    expect(hitTestNode(nodes, 40 + 400, 40 + 100, 40)).toBe("b");
  });

  it("returns undefined in empty space between nodes", () => {
    expect(hitTestNode(nodes, 40 + 250, 40 + 100, 40)).toBeUndefined();
  });

  it("returns the topmost node when boxes overlap", () => {
    const overlapping = [n("under", 100, 100), n("over", 110, 100)];
    expect(hitTestNode(overlapping, 40 + 105, 40 + 100, 40)).toBe("over");
  });
});
