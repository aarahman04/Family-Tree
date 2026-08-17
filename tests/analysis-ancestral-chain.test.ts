import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import type { FamilyTree } from "../src/models/types.js";
import { classifyAllMarriages } from "../src/analysis/marriages.js";
import {
  ancestralCousinMarriages,
  cousinMarriageBreakdown,
} from "../src/analysis/ancestralChain.js";
import { analyzeCousinChains } from "../src/analysis/chains.js";
import { analyzeBranches } from "../src/analysis/branches.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const id = (t: FamilyTree, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;

/**
 * Three stacked cousin marriages, so the walk has to keep going past the first one it finds:
 *
 *   R1 x R2 -> A1, A2                       (great-grandparent couple)
 *   A1 -> B1, B3   |   A2 -> B2             (B1 & B2 are first cousins)
 *   B1 x B2 -> C1          <- cousin marriage, 1 generation up from D1's parents
 *   B3 -> C2               (C1 & C2 are first cousins)
 *   C1 x C2 -> D1          <- cousin marriage, D1's own parents
 */
function stackedChain(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "R1", gender: 1 }),
        personRow({ id: 2, name: "R2", gender: 2 }),
        personRow({ id: 3, name: "A1", famc: 100, gender: 1 }),
        personRow({ id: 4, name: "A2", famc: 100, gender: 2 }),
        personRow({ id: 5, name: "A1W", gender: 2 }),
        personRow({ id: 6, name: "A2H", gender: 1 }),
        personRow({ id: 7, name: "B1", famc: 101, gender: 1 }),
        personRow({ id: 8, name: "B3", famc: 101, gender: 1 }),
        personRow({ id: 9, name: "B2", famc: 102, gender: 2 }),
        personRow({ id: 10, name: "B3W", gender: 2 }),
        personRow({ id: 11, name: "C1", famc: 103, gender: 1 }),
        personRow({ id: 12, name: "C2", famc: 104, gender: 2 }),
        personRow({ id: 13, name: "D1", famc: 105, gender: 1 }),
      ],
      [
        familyRow({ id: 100, husband: 1, wife: 2 }),
        familyRow({ id: 101, husband: 3, wife: 5 }),
        familyRow({ id: 102, husband: 6, wife: 4 }),
        familyRow({ id: 103, husband: 7, wife: 9 }), // B1 x B2 — cousin marriage
        familyRow({ id: 104, husband: 8, wife: 10 }),
        familyRow({ id: 105, husband: 11, wife: 12 }), // C1 x C2 — cousin marriage
      ],
    ),
  ).tree;
}

function chainFor(t: FamilyTree, name: string) {
  return ancestralCousinMarriages(t, id(t, name), classifyAllMarriages(t));
}

describe("ancestralCousinMarriages", () => {
  it("does NOT stop at the parents — it reports every cousin marriage further up the line", () => {
    const chain = chainFor(stackedChain(), "D1");
    expect(chain).toHaveLength(2);
  });

  it("orders the links closest-first, with how many generations up each sits", () => {
    const t = stackedChain();
    const chain = chainFor(t, "D1");

    expect(chain[0]!.generationsUp).toBe(1); // D1's own parents
    expect(chain[0]!.husbandId).toBe(id(t, "C1"));
    expect(chain[1]!.generationsUp).toBe(2); // the grandparents' union
    expect(chain[1]!.husbandId).toBe(id(t, "B1"));
  });

  it("carries the classification, common ancestor and confidence for each link", () => {
    const chain = chainFor(stackedChain(), "D1");
    for (const link of chain) {
      expect(link.relation.kind).toBe("cousins");
      expect(link.relation.cousinDegree).toBeGreaterThanOrEqual(1);
      expect(link.relation.closest).not.toBeNull();
      expect(["confirmed", "likely", "possible", "unknown"]).toContain(link.confidence.level);
    }
  });

  it("reports nothing for a person with no cousin marriage anywhere above them", () => {
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "dad", gender: 1 }),
          personRow({ id: 2, name: "mom", gender: 2 }),
          personRow({ id: 3, name: "kid", famc: 10, gender: 1 }),
        ],
        [familyRow({ id: 10, husband: 1, wife: 2 })],
      ),
    ).tree;
    expect(chainFor(t, "kid")).toEqual([]);
  });

  it("counts a shared ancestral couple once, even though both spouses lead back to it", () => {
    // Walking up through BOTH parents reaches the same ancestral union by two routes. It is one
    // marriage and must appear once — otherwise every generation would inflate the chain.
    const chain = chainFor(stackedChain(), "D1");
    const familyIds = chain.map((link) => link.familyId);
    expect(new Set(familyIds).size).toBe(familyIds.length);
  });

  it("survives a parent cycle in malformed data instead of hanging", () => {
    const t = stackedChain();
    const cyclic: FamilyTree = {
      ...t,
      persons: {
        ...t.persons,
        [id(t, "R1")]: { ...t.persons[id(t, "R1")]!, famcId: "loop" },
      },
      families: {
        ...t.families,
        loop: { id: "loop", husbandId: id(t, "D1"), childrenIds: [id(t, "R1")] },
      },
    };
    expect(() => ancestralCousinMarriages(cyclic, id(t, "D1"), classifyAllMarriages(cyclic))).not.toThrow();
  });

  it("reports the deepest generation the pattern reaches", () => {
    const t = stackedChain();
    const chain = chainFor(t, "D1");
    expect(Math.max(...chain.map((l) => l.generationsUp))).toBe(2);
  });
});

describe("cousinMarriageBreakdown", () => {
  it("counts marriages by cousin degree and by removal", () => {
    const t = stackedChain();
    const b = cousinMarriageBreakdown(
      t,
      classifyAllMarriages(t),
      analyzeCousinChains(t, classifyAllMarriages(t)),
      analyzeBranches(t),
    );

    expect(b.byDegree[1]).toBe(2); // both stacked links are first-cousin marriages
    expect(b.byDegree[2] ?? 0).toBe(0);
    expect(b.onceRemoved).toBe(0);
    expect(b.total).toBe(2);
  });

  it("counts how many multi-generation chains exist and how deep the deepest runs", () => {
    const t = stackedChain();
    const marriages = classifyAllMarriages(t);
    const b = cousinMarriageBreakdown(t, marriages, analyzeCousinChains(t, marriages), analyzeBranches(t));

    expect(b.deepestChain).toBe(2);
    expect(b.multiGenerationChains).toBe(1);
    expect(b.generationsSpanned).toBeGreaterThanOrEqual(2);
  });

  it("reports zero everywhere for a tree with no cousin marriages", () => {
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "dad", gender: 1 }),
          personRow({ id: 2, name: "mom", gender: 2 }),
        ],
        [familyRow({ id: 10, husband: 1, wife: 2 })],
      ),
    ).tree;
    const marriages = classifyAllMarriages(t);
    const b = cousinMarriageBreakdown(t, marriages, analyzeCousinChains(t, marriages), analyzeBranches(t));

    expect(b.total).toBe(0);
    expect(b.deepestChain).toBe(0);
    expect(b.multiGenerationChains).toBe(0);
    expect(b.branchesWithRepeats).toBe(0);
  });
});

/** An uncle marrying his niece: gpa/gma -> uncle & mid; mid -> niece; uncle x niece. */
function avuncularMarriage(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "gpa", gender: 1 }),
        personRow({ id: 2, name: "gma", gender: 2 }),
        personRow({ id: 3, name: "uncle", famc: 100, gender: 1 }),
        personRow({ id: 4, name: "mid", famc: 100, gender: 1 }),
        personRow({ id: 5, name: "midWife", gender: 2 }),
        personRow({ id: 6, name: "niece", famc: 101, gender: 2 }),
      ],
      [
        familyRow({ id: 100, husband: 1, wife: 2 }),
        familyRow({ id: 101, husband: 4, wife: 5 }),
        familyRow({ id: 102, husband: 3, wife: 6 }), // uncle x niece
      ]
    )
  ).tree;
}

describe("cousinMarriageBreakdown — avuncular marriages", () => {
  it("counts a marriage to a niece separately from cousin marriages", () => {
    const t = avuncularMarriage();
    const marriages = classifyAllMarriages(t);
    const b = cousinMarriageBreakdown(t, marriages, analyzeCousinChains(t, marriages), analyzeBranches(t));

    expect(b.total).toBe(0); // it is not a cousin marriage
    expect(b.avuncularTotal).toBe(1);
    // The elder is male, so this is an uncle marrying his niece — not an aunt/nephew union.
    expect(b.uncleNiece).toBe(1);
    expect(b.auntNephew).toBe(0);
  });

  it("reports zero avuncular marriages when there are none", () => {
    const t = stackedChain();
    const marriages = classifyAllMarriages(t);
    const b = cousinMarriageBreakdown(t, marriages, analyzeCousinChains(t, marriages), analyzeBranches(t));
    expect(b.avuncularTotal).toBe(0);
  });
});
