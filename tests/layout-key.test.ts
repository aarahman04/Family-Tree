import { describe, expect, it } from "vitest";
import { posterLayoutKey } from "../poster/layoutKey.js";
import { DEFAULT_POSTER_STYLE } from "../poster/types.js";
import type { FamilyTree } from "../models/types.js";

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
