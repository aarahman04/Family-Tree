import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../src/models/types.js";
import { parseNodeFtt } from "../src/parser/index.js";
import { analyzeInfluence } from "../src/analysis/influence.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * A x B -> C, D (siblings). C x E -> F, G. A also x H -> I, an independent second marriage B has
 * no part in, so A (5 total descendants: C, D, F, G, I) unambiguously outscores B (4: C, D, F, G)
 * for "most influential" -- descendant counting is bidirectional (both parents of a family share
 * credit for its children), so without this second line A and B would tie. Meanwhile C is the
 * more directly-connected person (2 parents + spouse + 2 children + 1 sibling = 6 edges) -- the
 * two metrics should pick DIFFERENT people.
 */
function tree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "A", gender: 1 }),
      personRow({ id: 2, name: "B", gender: 2 }),
      personRow({ id: 3, name: "C", famc: 10, gender: 1 }),
      personRow({ id: 4, name: "D", famc: 10 }),
      personRow({ id: 5, name: "E", gender: 2 }),
      personRow({ id: 6, name: "F", famc: 20 }),
      personRow({ id: 7, name: "G", famc: 20 }),
      personRow({ id: 8, name: "H", gender: 2 }),
      personRow({ id: 9, name: "I", famc: 30 }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 5 }),
      familyRow({ id: 30, husband: 1, wife: 8 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

function idOf(t: ReturnType<typeof tree>, name: string): string {
  return Object.values(t.persons).find((p) => p.name === name)!.id;
}

function person(
  id: UUID,
  name: string,
  opts: Partial<Pick<Person, "famcId" | "famsIds" | "gender">> = {},
): Person {
  return {
    id,
    name,
    gender: opts.gender ?? "unknown",
    famcId: opts.famcId,
    famsIds: opts.famsIds ?? [],
    notes: [],
    media: [],
  };
}

function family(
  id: UUID,
  husbandId: UUID | undefined,
  wifeId: UUID | undefined,
  childrenIds: UUID[],
): Family {
  return { id, husbandId, wifeId, childrenIds };
}

function manualTree(persons: Person[], families: Family[]): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "2026-08-17T00:00:00Z" },
    persons: Object.fromEntries(persons.map((p) => [p.id, p])),
    families: Object.fromEntries(families.map((f) => [f.id, f])),
    validation: {
      validatedAt: "2026-08-17T00:00:00Z",
      issues: [],
      isValid: true,
    },
  };
}

describe("analysis/influence — analyzeInfluence", () => {
  it("picks the person with the largest total descendant subtree as most influential", () => {
    const t = tree();
    const a = analyzeInfluence(t);
    expect(a.mostInfluentialAncestor?.personId).toBe(idOf(t, "A"));
    expect(a.mostInfluentialAncestor?.descendantCount).toBe(5); // C, D, F, G, I
  });

  it("picks the person with the most direct relationship edges as most connected", () => {
    const t = tree();
    const a = analyzeInfluence(t);
    expect(a.mostConnectedPerson?.personId).toBe(idOf(t, "C"));
    expect(a.mostConnectedPerson?.connectionCount).toBe(6); // 2 parents + spouse + 2 children + 1 sibling
  });

  it("breaks a repeated spouse descendant-count tie by the husbandId ownership convention, not UUID order", () => {
    const t = manualTree(
      [
        // Deliberately give the wife a lexicographically lower UUID. The old tie-break picked
        // "a-wife" by random/string id; the project convention should pick the family owner.
        person("z-husband", "Husband", {
          famsIds: ["fam-root"],
          gender: "male",
        }),
        person("a-wife", "Wife", { famsIds: ["fam-root"], gender: "female" }),
        person("child-1", "Child 1", {
          famcId: "fam-root",
          famsIds: ["fam-child"],
        }),
        person("spouse-1", "Spouse 1", { famsIds: ["fam-child"] }),
        person("grandchild-1", "Grandchild 1", { famcId: "fam-child" }),
        person("child-2", "Child 2", {
          famcId: "fam-root",
          famsIds: ["fam-child-2"],
        }),
        person("spouse-2", "Spouse 2", { famsIds: ["fam-child-2"] }),
        person("grandchild-2", "Grandchild 2", { famcId: "fam-child-2" }),
      ],
      [
        family("fam-root", "z-husband", "a-wife", ["child-1", "child-2"]),
        family("fam-child", "child-1", "spouse-1", ["grandchild-1"]),
        family("fam-child-2", "child-2", "spouse-2", ["grandchild-2"]),
      ],
    );

    const a = analyzeInfluence(t);
    expect(a.mostInfluentialAncestor).toEqual({
      personId: "z-husband",
      descendantCount: 4,
    });
  });

  it("returns undefined for both on a tree with no relationships at all", () => {
    const t = parseNodeFtt(
      buildNodeFtt([personRow({ id: 1, name: "Solo" })], []),
    ).tree;
    const a = analyzeInfluence(t);
    expect(a.mostInfluentialAncestor).toBeUndefined();
    expect(a.mostConnectedPerson).toBeUndefined();
  });
});
