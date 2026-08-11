import { afterEach, describe, expect, it } from "vitest";
import type { FamilyTree } from "../../../models/types.js";
import { clearSavedSession, loadSavedSession, saveSession } from "../../src/lib/autosave.js";

const tree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: { a: { id: "a", name: "A", gender: "male", notes: [], media: [], famsIds: [] } },
  families: {},
  validation: { validatedAt: "", issues: [], isValid: true },
};

afterEach(() => clearSavedSession());

describe("autosave", () => {
  it("round-trips a saved session with a timestamp", () => {
    expect(loadSavedSession()).toBeUndefined();
    saveSession({ tree, fileName: "Family.ged" });
    const loaded = loadSavedSession();
    expect(loaded?.fileName).toBe("Family.ged");
    expect(loaded?.tree.persons.a?.name).toBe("A");
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("clears a saved session", () => {
    saveSession({ tree, fileName: "Family.ged" });
    clearSavedSession();
    expect(loadSavedSession()).toBeUndefined();
  });

  it("ignores malformed stored data", () => {
    localStorage.setItem("familyTree.autosave.v1", "{ not json");
    expect(loadSavedSession()).toBeUndefined();
  });

  it("persists thumb only — strips print bytes on save, keeps thumb (thumb-only persistence)", () => {
    const withPhoto: FamilyTree = {
      ...tree,
      persons: { a: { ...tree.persons.a!, photo: { thumb: "THUMB", print: "PRINT", alt: "A" } } },
    };
    saveSession({ tree: withPhoto, fileName: "Family.ged" });

    // Round-trip: reload from storage and confirm print is gone, thumb (+alt) survived.
    const loaded = loadSavedSession();
    expect(loaded?.tree.persons.a?.photo?.thumb).toBe("THUMB");
    expect(loaded?.tree.persons.a?.photo?.print).toBeUndefined();
    expect(loaded?.tree.persons.a?.photo?.alt).toBe("A");

    // The in-memory tree is NOT mutated — print stays available for export this session.
    expect(withPhoto.persons.a?.photo?.print).toBe("PRINT");
  });
});
