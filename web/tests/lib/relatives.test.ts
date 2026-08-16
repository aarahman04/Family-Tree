import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../../../src/models/types.js";
import { immediateRelatives } from "../../src/lib/relatives.js";

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
  }
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons: p,
    families: f,
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

// Grandpa+Grandma -> Dad; Dad+Mom -> Kid, Sibling; Kid+KidSpouse -> Grandchild
const tree = build(
  [
    P("gpa"),
    P("gma"),
    P("dad", { famcId: "f1" }),
    P("mom"),
    P("kid", { famcId: "f2" }),
    P("sibling", { famcId: "f2" }),
    P("spouse"),
    P("grandchild", { famcId: "f3" }),
  ],
  [
    { id: "f1", husbandId: "gpa", wifeId: "gma", childrenIds: ["dad"] },
    { id: "f2", husbandId: "dad", wifeId: "mom", childrenIds: ["kid", "sibling"] },
    { id: "f3", husbandId: "kid", wifeId: "spouse", childrenIds: ["grandchild"] },
  ]
);

describe("immediateRelatives", () => {
  it("includes self, parents, siblings, spouse and children — but not grandparents", () => {
    const r = immediateRelatives(tree, "kid");
    expect([...r].sort()).toEqual(["dad", "grandchild", "kid", "mom", "sibling", "spouse"].sort());
    expect(r.has("gpa")).toBe(false);
    expect(r.has("gma")).toBe(false);
  });

  it("returns just the person when they have no recorded relatives", () => {
    const solo = build([P("only")], []);
    expect([...immediateRelatives(solo, "only")]).toEqual(["only"]);
  });

  it("returns an empty set for an unknown id", () => {
    expect(immediateRelatives(tree, "nobody").size).toBe(0);
  });
});
