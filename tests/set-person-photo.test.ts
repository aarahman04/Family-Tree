import { describe, expect, it } from "vitest";
import { setPersonPhoto } from "../editor/operations.js";
import type { FamilyTree, PersonPhoto } from "../models/types.js";

function tree(): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "t" },
    persons: { p1: { id: "p1", name: "Ann", gender: "female", notes: [], media: [], famsIds: [] } },
    families: {},
    validation: { validatedAt: "t", issues: [], isValid: true },
  };
}
const photo: PersonPhoto = { thumb: "T", print: "P" };

describe("setPersonPhoto", () => {
  it("sets a photo immutably", () => {
    const t0 = tree();
    const t1 = setPersonPhoto(t0, "p1", photo);
    expect(t1.persons.p1!.photo).toEqual(photo);
    expect(t0.persons.p1!.photo).toBeUndefined(); // original unchanged
    expect(t1).not.toBe(t0);
  });
  it("clears a photo when passed undefined", () => {
    const t1 = setPersonPhoto(tree(), "p1", photo);
    const t2 = setPersonPhoto(t1, "p1", undefined);
    expect(t2.persons.p1!.photo).toBeUndefined();
  });
});
