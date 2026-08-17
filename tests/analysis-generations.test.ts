import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import type { FamilyTree, UUID } from "../src/models/types.js";
import type { MarriageAnalysis } from "../src/analysis/marriages.js";
import {
  analyzeGenerations,
  computeGenerations,
} from "../src/analysis/generations.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const id = (t: FamilyTree, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;
const famOf = (t: FamilyTree, husbandName: string) =>
  Object.values(t.families).find((f) => f.husbandId === id(t, husbandName))!.id;

/** gpa+gma (gen 0) -> dadA+momA (gen 1) -> kid (gen 2), with a marriage in each generation. */
function threeGen() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "gpa", gender: 1 }),
        personRow({ id: 2, name: "gma", gender: 2 }),
        personRow({ id: 3, name: "dadA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "momA", gender: 2 }),
        personRow({ id: 5, name: "kid", famc: 20, gender: 1 }),
        personRow({ id: 6, name: "kidSpouse", gender: 2 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3, wife: 4 }),
        familyRow({ id: 30, husband: 5, wife: 6 }),
      ],
    ),
  ).tree;
}

function marriagesMarking(t: FamilyTree, cousinFamilyIds: UUID[]) {
  const set = new Set(cousinFamilyIds);
  const out = new Map<UUID, MarriageAnalysis>();
  for (const fam of Object.values(t.families)) {
    if (!fam.husbandId || !fam.wifeId) continue;
    const isCousin = set.has(fam.id);
    out.set(fam.id, {
      familyId: fam.id,
      husbandId: fam.husbandId,
      wifeId: fam.wifeId,
      isCousinMarriage: isCousin,
      sharesCommonAncestor: isCousin,
      relation: {
        kind: isCousin ? "cousins" : "unrelated",
        lines: isCousin ? 1 : 0,
        closest: null,
        label: isCousin ? "First cousins" : "No shared ancestor",
      },
      confidence: { level: "likely", reasons: [] },
    });
  }
  return out;
}

describe("computeGenerations", () => {
  it("numbers from 0 at people with no recorded parents", () => {
    const t = threeGen();
    const g = computeGenerations(t);
    expect(g.get(id(t, "gpa"))).toBe(0);
    expect(g.get(id(t, "dadA"))).toBe(1);
    expect(g.get(id(t, "kid"))).toBe(2);
  });

  it("survives a parent cycle in malformed data instead of hanging", () => {
    const t = threeGen();
    // Make gpa a child of his own grandson — a loop no real tree should have.
    const cyclic: FamilyTree = {
      ...t,
      persons: {
        ...t.persons,
        [id(t, "gpa")]: { ...t.persons[id(t, "gpa")]!, famcId: "fam30" },
      },
      families: {
        ...t.families,
        fam30: {
          id: "fam30",
          husbandId: id(t, "kid"),
          childrenIds: [id(t, "gpa")],
        },
      },
    };
    expect(() => computeGenerations(cyclic)).not.toThrow();
  });
});

describe("analyzeGenerations (S-3)", () => {
  it("counts marriages and cousin marriages per generation", () => {
    const t = threeGen();
    // Mark the middle generation's union as the cousin marriage.
    const stats = analyzeGenerations(t, marriagesMarking(t, [famOf(t, "dadA")]));

    const byGen = new Map(stats.perGeneration.map((g) => [g.generation, g]));
    expect(byGen.get(0)?.marriages).toBe(1);
    expect(byGen.get(1)?.marriages).toBe(1);
    expect(byGen.get(1)?.cousinMarriages).toBe(1);
    expect(byGen.get(0)?.cousinMarriages).toBe(0);
  });

  it("places a marriage in the DEEPEST spouse's generation, so a couple is counted once", () => {
    // kid (gen 2) marries kidSpouse (gen 0, no recorded parents). Counting per-spouse would
    // record the union twice; it belongs to one generation — the deeper spouse's.
    const t = threeGen();
    const stats = analyzeGenerations(t, marriagesMarking(t, []));
    const total = stats.perGeneration.reduce((s, g) => s + g.marriages, 0);
    expect(total).toBe(3);
  });

  it("names the generation with the most marriages and the most cousin marriages", () => {
    const t = threeGen();
    const stats = analyzeGenerations(t, marriagesMarking(t, [famOf(t, "dadA")]));
    expect(stats.mostCousinMarriages?.generation).toBe(1);
    expect(stats.mostMarriages).toBeDefined();
  });

  it("reports people per generation", () => {
    const t = threeGen();
    const stats = analyzeGenerations(t, marriagesMarking(t, []));
    const byGen = new Map(stats.perGeneration.map((g) => [g.generation, g]));
    expect(byGen.get(0)?.people).toBe(4); // gpa, gma, momA, kidSpouse — all parentless
    expect(byGen.get(2)?.people).toBe(1); // kid
  });

  it("returns nothing to highlight for a tree with no marriages", () => {
    const t = parseNodeFtt(
      buildNodeFtt([personRow({ id: 1, name: "solo", gender: 1 })], []),
    ).tree;
    const stats = analyzeGenerations(t, new Map());
    expect(stats.mostMarriages).toBeUndefined();
    expect(stats.mostCousinMarriages).toBeUndefined();
  });
});
