import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { deletePerson } from "../editor/operations.js";
import { applyEdit } from "../editor/index.js";

function P(id: string, opts: Partial<Person> = {}): Person {
  return { id, name: id, gender: "unknown", notes: [], media: [], famsIds: [], ...opts };
}
function build(persons: Person[], families: Family[]): FamilyTree {
  const p: Record<UUID, Person> = {};
  for (const person of persons) p[person.id] = { ...person, famsIds: [] };
  const f: Record<UUID, Family> = {};
  for (const fam of families) {
    f[fam.id] = fam;
    for (const s of [fam.husbandId, fam.wifeId]) if (s && p[s]) p[s]!.famsIds.push(fam.id);
    for (const c of fam.childrenIds) if (p[c]) p[c]!.famcId = fam.id;
  }
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons: p,
    families: f,
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

// dad + mom -> kid ; dad's parent is gpa ; "orphan" is the lone child of a parentless family.
const tree = build(
  [
    P("gpa"),
    P("dad", { famcId: "f0" }),
    P("mom"),
    P("kid", { famcId: "f1" }),
    P("orphan", { famcId: "f2" }),
  ],
  [
    { id: "f0", husbandId: "gpa", childrenIds: ["dad"] },
    { id: "f1", husbandId: "dad", wifeId: "mom", childrenIds: ["kid"] },
    { id: "f2", childrenIds: ["orphan"] },
  ]
);

describe("deletePerson", () => {
  it("detaches a spouse and keeps the family (with the other spouse + child)", () => {
    const next = deletePerson(tree, "mom");
    expect(next.persons.mom).toBeUndefined();
    const f1 = next.families.f1!;
    expect(f1.wifeId).toBeUndefined();
    expect(f1.husbandId).toBe("dad");
    expect(f1.childrenIds).toEqual(["kid"]);
    // Kid still points at f1; dad still lists f1.
    expect(next.persons.kid!.famcId).toBe("f1");
    expect(next.persons.dad!.famsIds).toContain("f1");
  });

  it("prunes a family that becomes truly empty", () => {
    // orphan is f2's only member, so deleting orphan leaves f2 empty -> pruned.
    const next = deletePerson(tree, "orphan");
    expect(next.persons.orphan).toBeUndefined();
    expect(next.families.f2).toBeUndefined();
    expect(next.families.f1).toBeDefined(); // unrelated family untouched
  });

  it("keeps a family that still has a member after detaching", () => {
    // Deleting gpa leaves f0 with its child (dad), so f0 survives and dad keeps famcId.
    const next = deletePerson(tree, "gpa");
    expect(next.families.f0!.husbandId).toBeUndefined();
    expect(next.families.f0!.childrenIds).toEqual(["dad"]);
    expect(next.persons.dad!.famcId).toBe("f0");
  });

  it("removes a person from a family's children list", () => {
    const next = deletePerson(tree, "kid");
    expect(next.persons.kid).toBeUndefined();
    expect(next.families.f1!.childrenIds).toEqual([]);
    expect(next.families.f1!.husbandId).toBe("dad"); // both spouses remain
  });

  it("re-derives references so the result passes integrity validation", () => {
    const validated = applyEdit(tree, (t) => deletePerson(t, "dad"));
    expect(validated.persons.dad).toBeUndefined();
    expect(validated.families.f1!.husbandId).toBeUndefined();
    expect(validated.families.f1!.wifeId).toBe("mom");
    expect(validated.persons.mom!.famsIds).toEqual(["f1"]);
    expect(validated.persons.kid!.famcId).toBe("f1");
    // No dangling references => no integrity *errors* (missing-parent is only a warning).
    expect(validated.validation.issues.some((i) => i.severity === "error")).toBe(false);
  });

  it("throws for an unknown id", () => {
    expect(() => deletePerson(tree, "nobody")).toThrow();
  });
});
