import { describe, expect, it } from "vitest";
import type { FamilyTree, Person, UUID } from "../../../models/types.js";
import { addRelative } from "../../src/lib/addRelative.js";

function base(): FamilyTree {
  const a: Person = { id: "a", name: "A", gender: "male", notes: [], media: [], famsIds: [] };
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons: { a } as Record<UUID, Person>,
    families: {},
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

describe("addRelative", () => {
  it("creates an independent, unlinked person", () => {
    const { tree, personId } = addRelative(base(), "a", "independent");
    expect(tree.persons[personId]!.name).toBe("New person");
    expect(tree.persons[personId]!.famsIds).toEqual([]);
    expect(tree.persons[personId]!.famcId).toBeUndefined();
  });

  it("adds a father linked to the person's family-of-origin", () => {
    const { tree, personId } = addRelative(base(), "a", "father");
    const famcId = tree.persons.a!.famcId!;
    expect(tree.families[famcId]!.husbandId).toBe(personId);
    expect(tree.persons[personId]!.gender).toBe("male");
  });

  it("adds a spouse and a child via the existing operations", () => {
    const spouseResult = addRelative(base(), "a", "spouse");
    const famId = spouseResult.tree.persons.a!.famsIds[0]!;
    const fam = spouseResult.tree.families[famId]!;
    expect([fam.husbandId, fam.wifeId]).toContain(spouseResult.personId);

    const childResult = addRelative(base(), "a", "child");
    const childFam = childResult.tree.persons.a!.famsIds[0]!;
    expect(childResult.tree.families[childFam]!.childrenIds).toContain(childResult.personId);
  });

  it("'parent' fills the father slot first, then the mother slot", () => {
    const first = addRelative(base(), "a", "parent");
    const famcId = first.tree.persons.a!.famcId!;
    expect(first.tree.families[famcId]!.husbandId).toBe(first.personId);

    const second = addRelative(first.tree, "a", "parent");
    expect(second.tree.families[famcId]!.wifeId).toBe(second.personId);
  });
});
