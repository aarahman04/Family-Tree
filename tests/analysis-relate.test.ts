import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import type { FamilyTree } from "../src/models/types.js";
import { relatePair } from "../src/analysis/marriages.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const id = (t: FamilyTree, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;

/**
 * gpa+gma -> dadA, dadB, aunt
 *   dadA+momA -> cousinA, cousinA2
 *   dadB+momB -> cousinB -> secondCousinChild
 * Gives every classification the calculator has to name.
 */
function family() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "gpa", gender: 1 }),
        personRow({ id: 2, name: "gma", gender: 2 }),
        personRow({ id: 3, name: "dadA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "dadB", famc: 10, gender: 1 }),
        personRow({ id: 5, name: "aunt", famc: 10, gender: 2 }),
        personRow({ id: 6, name: "momA", gender: 2 }),
        personRow({ id: 7, name: "momB", gender: 2 }),
        personRow({ id: 8, name: "cousinA", famc: 20, gender: 1 }),
        personRow({ id: 9, name: "cousinA2", famc: 20, gender: 2 }),
        personRow({ id: 10, name: "cousinB", famc: 30, gender: 1 }),
        personRow({ id: 11, name: "cousinBWife", gender: 2 }),
        personRow({ id: 12, name: "secondCousinChild", famc: 40, gender: 1 }),
        personRow({ id: 13, name: "stranger", gender: 1 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3, wife: 6 }),
        familyRow({ id: 30, husband: 4, wife: 7 }),
        familyRow({ id: 40, husband: 10, wife: 11 }),
      ],
    ),
  ).tree;
}

describe("relatePair (S-1)", () => {
  it("names a direct ancestor/descendant line", () => {
    const t = family();
    const r = relatePair(t, id(t, "gpa"), id(t, "cousinA"));
    expect(r.relation.kind).toBe("direct-lineage");
  });

  it("names full siblings", () => {
    const t = family();
    expect(relatePair(t, id(t, "dadA"), id(t, "dadB")).relation.kind).toBe("siblings");
  });

  it("names an aunt/uncle to niece/nephew link", () => {
    const t = family();
    expect(relatePair(t, id(t, "aunt"), id(t, "cousinA")).relation.kind).toBe("avuncular");
  });

  it("names first cousins", () => {
    const t = family();
    const r = relatePair(t, id(t, "cousinA"), id(t, "cousinB"));
    expect(r.relation.kind).toBe("cousins");
    expect(r.relation.cousinDegree).toBe(1);
    expect(r.relation.removal ?? 0).toBe(0);
    expect(r.relation.label).toMatch(/first cousins/i);
  });

  it("names first cousins once removed", () => {
    const t = family();
    const r = relatePair(t, id(t, "cousinA"), id(t, "secondCousinChild"));
    expect(r.relation.kind).toBe("cousins");
    expect(r.relation.cousinDegree).toBe(1);
    expect(r.relation.removal).toBe(1);
    expect(r.relation.label).toMatch(/once removed/i);
  });

  it("names unrelated people, and does not invent a shared ancestor", () => {
    const t = family();
    const r = relatePair(t, id(t, "cousinA"), id(t, "stranger"));
    expect(r.relation.kind).toBe("unrelated");
    expect(r.commonAncestors).toHaveLength(0);
    expect(r.sharesCommonAncestor).toBe(false);
  });

  it("is symmetric — the order of the two people cannot change the answer", () => {
    const t = family();
    const ab = relatePair(t, id(t, "cousinA"), id(t, "cousinB"));
    const ba = relatePair(t, id(t, "cousinB"), id(t, "cousinA"));
    expect(ba.relation.kind).toBe(ab.relation.kind);
    expect(ba.relation.label).toBe(ab.relation.label);
  });

  it("returns 'self' rather than claiming a person is related to themselves", () => {
    const t = family();
    expect(relatePair(t, id(t, "cousinA"), id(t, "cousinA")).relation.kind).toBe("direct-lineage");
  });

  it("prefers the CLOSEST shared ancestor", () => {
    const t = family();
    const r = relatePair(t, id(t, "cousinA"), id(t, "cousinB"));
    // Both grandparents are shared, so two ancestors are found...
    expect(r.commonAncestors).toHaveLength(2);
    // ...and the governing one sits at distance 2 from each side.
    expect(r.relation.closest?.distA).toBe(2);
    expect(r.relation.closest?.distB).toBe(2);
  });

  it("counts a shared COUPLE as one line, not two (D-3)", () => {
    const t = family();
    const r = relatePair(t, id(t, "cousinA"), id(t, "cousinB"));
    // Full first cousins descend from one grandparent COUPLE. That is a single ancestral line,
    // even though two individual ancestors are shared -- the distinction that separates ordinary
    // first cousins from double first cousins, who descend from two unrelated couples.
    expect(r.relation.lines).toBe(1);
    expect(r.multiplePaths).toBe(false);
  });

  it("reports no line at all for unrelated people", () => {
    const t = family();
    const single = relatePair(t, id(t, "cousinA"), id(t, "stranger"));
    expect(single.multiplePaths).toBe(false);
    expect(single.relation.lines).toBe(0);
  });

  it("carries a confidence level and its reasons", () => {
    const t = family();
    const r = relatePair(t, id(t, "cousinA"), id(t, "cousinB"));
    expect(["confirmed", "likely", "possible", "unknown"]).toContain(r.confidence.level);
    expect(Array.isArray(r.confidence.reasons)).toBe(true);
  });

  it("returns an unrelated result rather than throwing for an unknown id", () => {
    const t = family();
    expect(relatePair(t, id(t, "cousinA"), "nobody").relation.kind).toBe("unrelated");
  });
});
