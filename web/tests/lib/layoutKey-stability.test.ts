import { describe, expect, it } from "vitest";
import { posterLayoutKey } from "../../../poster/layoutKey.js";
import { appearanceToStyle } from "../../src/lib/appearancePrefs.js";
import { setPersonPhoto, updatePersonFields } from "../../../editor/operations.js";
import type { FamilyTree } from "../../../models/types.js";

/**
 * The machine-checkable form of the memo contract EditorCanvas relies on: the layout is memoized
 * on `posterLayoutKey`, so a change that leaves the key equal must NOT re-layout, and a change
 * that alters geometry-relevant data MUST. Exercised through the REAL editor operations, not
 * hand-built trees, so it reflects what an actual edit produces.
 */
function tree(): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "t" },
    persons: {
      p1: {
        id: "p1", name: "Ann", gender: "female", notes: [], media: [], famsIds: [],
        birth: { id: "b", type: "birth", date: { year: 1950 } },
      },
    },
    families: {},
    validation: { validatedAt: "t", issues: [], isValid: true },
  };
}

const style = appearanceToStyle({ displayMode: "photoCards", photoShape: "rounded", showLivingIndicator: false });

describe("layout key stability at the editor seam", () => {
  it("a photo edit keeps the layout key stable (no re-layout)", () => {
    const before = posterLayoutKey(tree(), style);
    const edited = setPersonPhoto(tree(), "p1", { thumb: "T", print: "P" });
    expect(posterLayoutKey(edited, style)).toBe(before);
  });

  it("a death-year edit changes the layout key (living→deceased affects the card)", () => {
    const before = posterLayoutKey(tree(), style);
    const edited = updatePersonFields(tree(), "p1", { death: { year: 2020 } });
    expect(posterLayoutKey(edited, style)).not.toBe(before);
  });
});
