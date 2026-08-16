import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import {
  analyzePedigreeCollapse,
  pedigreeCollapseScore,
} from "../src/analysis/pedigree.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * Grandpa/Grandma -> DadA/DadB (siblings) -> CousinA x CousinB (first cousins) -> GrandchildAB,
 * plus a second, unrelated leaf ("Stranger") with no known ancestry at all -- so the tree-level
 * average (D-5) mixes a real collapse score with a zero score.
 */
function tree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Grandpa", gender: 1 }),
      personRow({ id: 2, name: "Grandma", gender: 2 }),
      personRow({ id: 3, name: "DadA", famc: 10, gender: 1 }),
      personRow({ id: 4, name: "DadB", famc: 10, gender: 1 }),
      personRow({ id: 5, name: "MomA", gender: 2 }),
      personRow({ id: 6, name: "CousinA", famc: 20, gender: 1 }),
      personRow({ id: 7, name: "MomB", gender: 2 }),
      personRow({ id: 8, name: "CousinB", famc: 30, gender: 2 }),
      personRow({ id: 9, name: "GrandchildAB", famc: 40 }),
      personRow({ id: 10, name: "Stranger" }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 5 }),
      familyRow({ id: 30, husband: 4, wife: 7 }),
      familyRow({ id: 40, husband: 6, wife: 8 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

function idOf(t: ReturnType<typeof tree>, name: string): string {
  return Object.values(t.persons).find((p) => p.name === name)!.id;
}

describe("analysis/pedigree — pedigreeCollapseScore", () => {
  it("is 0 for a person with no recorded ancestry", () => {
    const t = tree();
    expect(pedigreeCollapseScore(t, idOf(t, "Stranger"))).toBe(0);
  });

  it("is 0 for a person whose ancestors are all distinct (no shared lines)", () => {
    const t = tree();
    // DadA's known ancestors (Grandpa, Grandma) fill exactly 2 slots with 2 distinct people.
    expect(pedigreeCollapseScore(t, idOf(t, "DadA"))).toBe(0);
  });

  it("is >0 for the child of a first-cousin marriage (shared great-grandparents)", () => {
    const t = tree();
    // 10 filled slots (2 parents + 4 grandparents + 4 great-grandparent instances) but only
    // 8 distinct people (Grandpa/Grandma each fill 2 slots) => 1 - 8/10 = 0.2.
    expect(pedigreeCollapseScore(t, idOf(t, "GrandchildAB"), 3)).toBeCloseTo(
      0.2,
      10,
    );
  });
});

describe("analysis/pedigree — analyzePedigreeCollapse (tree-level, D-5)", () => {
  it("averages the per-person score over the terminal (no-children) generation only", () => {
    const t = tree();
    const a = analyzePedigreeCollapse(t, 3);
    // Terminal generation = people with no recorded children = GrandchildAB (0.2) + Stranger (0).
    // Everyone else (Grandpa..CousinB) has at least one child, so is excluded from the average.
    expect(a.treeScore).toBeCloseTo(0.1, 10);
    expect(a.byPerson.get(idOf(t, "GrandchildAB"))).toBeCloseTo(0.2, 10);
    expect(a.byPerson.get(idOf(t, "Stranger"))).toBe(0);
  });

  it("is 0 for a tree with no terminal generation members scoring above 0", () => {
    const t = parseNodeFtt(
      buildNodeFtt([personRow({ id: 1, name: "Solo" })], []),
    ).tree;
    const a = analyzePedigreeCollapse(t);
    expect(a.treeScore).toBe(0);
  });
});
