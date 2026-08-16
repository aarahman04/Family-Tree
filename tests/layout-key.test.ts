import { describe, expect, it } from "vitest";
import { posterLayoutKey } from "../src/poster/layoutKey.js";
import { computePersonBox } from "../src/poster/boxSizing.js";
import { DEFAULT_POSTER_STYLE } from "../src/poster/types.js";
import type { FamilyTree } from "../src/models/types.js";

function tree(): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "t" },
    persons: {
      p1: { id: "p1", name: "Ann", gender: "female", notes: [], media: [], famsIds: [], birth: { id: "b", type: "birth", date: { year: 1950 } } },
    },
    families: {},
    validation: { validatedAt: "t", issues: [], isValid: true },
  };
}

describe("posterLayoutKey", () => {
  it("is unchanged when only a photo is added/changed", () => {
    const a = tree();
    const b = tree();
    b.persons.p1!.photo = { thumb: "data:image/webp;base64,X", print: "data:image/webp;base64,Y" };
    expect(posterLayoutKey(b, DEFAULT_POSTER_STYLE)).toBe(posterLayoutKey(a, DEFAULT_POSTER_STYLE));
  });

  it("changes when a name changes", () => {
    const a = tree();
    const b = tree();
    b.persons.p1!.name = "Anne";
    expect(posterLayoutKey(b, DEFAULT_POSTER_STYLE)).not.toBe(posterLayoutKey(a, DEFAULT_POSTER_STYLE));
  });

  it("changes when the display mode changes", () => {
    const a = tree();
    expect(posterLayoutKey(a, { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" })).not.toBe(
      posterLayoutKey(a, DEFAULT_POSTER_STYLE)
    );
  });

  it("changes when a death year is added", () => {
    const a = tree();
    const b = tree();
    b.persons.p1!.death = { id: "d", type: "death", date: { year: 2020 } };
    expect(posterLayoutKey(b, DEFAULT_POSTER_STYLE)).not.toBe(posterLayoutKey(a, DEFAULT_POSTER_STYLE));
  });
});

/**
 * The key must stay in lockstep with box geometry: fields that change a box's size/position
 * belong in the key; fields that only change how a node is drawn must NOT. These guard both
 * directions, so drift (a geometry field silently added/removed from either side) breaks a test.
 */
describe("posterLayoutKey ↔ box geometry stay in lockstep", () => {
  const box = (style: typeof DEFAULT_POSTER_STYLE) =>
    computePersonBox("Alexander Hamilton", "1755–1804", undefined, style);

  it("displayMode changes the key AND the box geometry together", () => {
    const compact = DEFAULT_POSTER_STYLE;
    const cards = { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" as const };
    expect(posterLayoutKey(tree(), cards)).not.toBe(posterLayoutKey(tree(), compact));
    expect(box(cards).height).not.toBe(box(compact).height);
  });

  it("photoShape and showLivingIndicator change NEITHER the box geometry NOR the key (render-only, even in photoCards)", () => {
    const cards = { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" as const };
    const circle = { ...cards, photoShape: "circle" as const };
    const living = { ...cards, showLivingIndicator: !cards.showLivingIndicator };
    // Geometry is identical even where a real photo slot exists...
    expect(box(circle)).toEqual(box(cards));
    expect(box(living)).toEqual(box(cards));
    // ...and both are excluded from the key, so toggling them reuses the cached layout.
    expect(posterLayoutKey(tree(), circle)).toBe(posterLayoutKey(tree(), cards));
    expect(posterLayoutKey(tree(), living)).toBe(posterLayoutKey(tree(), cards));
  });
});
