import { describe, expect, it } from "vitest";
import type { Event, Family, FamilyTree, Gender, Person, UUID } from "../../../models/types.js";
import { computeTreeInsights } from "../../src/lib/insights.js";

function ev(id: string, type: Event["type"], year: number): Event {
  return { id, type, date: { year } };
}
function P(id: string, name: string, gender: Gender, opts: Partial<Person> = {}): Person {
  return { id, name, gender, notes: [], media: [], famsIds: [], ...opts };
}
function tree(persons: Person[], families: Family[]): FamilyTree {
  const p: Record<UUID, Person> = {};
  for (const person of persons) p[person.id] = person;
  const f: Record<UUID, Family> = {};
  for (const fam of families) f[fam.id] = fam;
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons: p,
    families: f,
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

// A three-generation family with known and unknown data, used across the assertions below.
function sampleTree(): FamilyTree {
  return tree(
    [
      P("gpa", "John Smith", "male", {
        birth: ev("gpa-b", "birth", 1900),
        death: ev("gpa-d", "death", 1970),
      }),
      P("gma", "Mary Smith", "female", { birth: ev("gma-b", "birth", 1905) }),
      P("dad", "Bob Smith", "male", { birth: ev("dad-b", "birth", 1930), famcId: "f1" }),
      P("mom", "Mary Jones", "female"),
      P("kid", "Tom Smith", "male", { birth: ev("kid-b", "birth", 1960), famcId: "f2" }),
      P("kid2", "Sara Smith", "female", { famcId: "f2" }),
    ],
    [
      { id: "f1", husbandId: "gpa", wifeId: "gma", childrenIds: ["dad"] },
      { id: "f2", husbandId: "dad", wifeId: "mom", childrenIds: ["kid", "kid2"] },
    ]
  );
}

describe("computeTreeInsights", () => {
  const NOW = 2000;

  it("counts members, genders, and living/deceased", () => {
    const i = computeTreeInsights(sampleTree(), NOW);
    expect(i.totalMembers).toBe(6);
    expect(i.maleCount).toBe(3);
    expect(i.femaleCount).toBe(3);
    expect(i.unknownCount).toBe(0);
    expect(i.malePercent).toBe(50);
    expect(i.femalePercent).toBe(50);
    // John Smith has a death record; everyone else is presumed living at NOW=2000.
    expect(i.deceasedCount).toBe(1);
    expect(i.livingCount).toBe(5);
  });

  it("computes generations and family structure", () => {
    const i = computeTreeInsights(sampleTree(), NOW);
    expect(i.generationCount).toBe(3);
    expect(i.largestGeneration).toEqual({ generation: 0, count: 3 });
    expect(i.familyCount).toBe(2);
    expect(i.marriageCount).toBe(2);
    expect(i.averageChildrenPerFamily).toBe(1.5);
    expect(i.largestFamily).toEqual({ parents: "Bob Smith & Mary Jones", childCount: 2 });
    expect(i.disconnectedGroups).toBe(1);
  });

  it("estimates the earliest year and span from known births + generation depth", () => {
    const i = computeTreeInsights(sampleTree(), NOW);
    expect(i.estimatedEarliestYear).toBe(1900);
    expect(i.estimatedEarliestDecade).toBe(1900);
    expect(i.latestKnownYear).toBe(1970);
    expect(i.estimatedSpanYears).toBe(70);
  });

  it("extrapolates earliest year when only a deep descendant has a birth year", () => {
    // g0 -> g1 -> g2, only the g2 person has a known birth year (1980).
    const t = tree(
      [
        P("a", "A", "male"),
        P("b", "B", "male", { famcId: "fa" }),
        P("c", "C", "male", { birth: ev("c-b", "birth", 1980), famcId: "fb" }),
      ],
      [
        { id: "fa", husbandId: "a", wifeId: undefined, childrenIds: ["b"] },
        { id: "fb", husbandId: "b", wifeId: undefined, childrenIds: ["c"] },
      ]
    );
    const i = computeTreeInsights(t, 2000);
    // c is generation 2, so the founder is estimated at 1980 - 2*30 = 1920.
    expect(i.estimatedEarliestYear).toBe(1920);
    expect(i.estimatedEarliestDecade).toBe(1920);
  });

  it("computes lifespan and living-age extremes", () => {
    const i = computeTreeInsights(sampleTree(), NOW);
    expect(i.averageLifespan).toBe(70); // only John Smith has both birth+death (1900–1970)
    expect(i.longestLived).toEqual({ name: "John Smith", years: 70 });
    expect(i.oldestLiving).toEqual({ name: "Mary Smith", age: 95 }); // b1905 at NOW=2000
    expect(i.youngestLiving).toEqual({ name: "Tom Smith", age: 40 }); // b1960 at NOW=2000
  });

  it("finds the most common surname and first name", () => {
    const i = computeTreeInsights(sampleTree(), NOW);
    expect(i.mostCommonSurname).toEqual({ name: "Smith", count: 5 });
    expect(i.mostCommonFirstName).toEqual({ name: "Mary", count: 2 });
  });

  it("handles an empty tree without throwing", () => {
    const i = computeTreeInsights(tree([], []), NOW);
    expect(i.totalMembers).toBe(0);
    expect(i.generationCount).toBe(0);
    expect(i.averageChildrenPerFamily).toBe(0);
    expect(i.disconnectedGroups).toBe(0);
    expect(i.estimatedEarliestYear).toBeUndefined();
    expect(i.averageLifespan).toBeUndefined();
    expect(i.mostCommonSurname).toBeUndefined();
  });
});
