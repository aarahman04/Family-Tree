import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import type { FamilyTree, UUID } from "../src/models/types.js";
import type { MarriageAnalysis } from "../src/analysis/marriages.js";
import {
  analyzeCousinChains,
  cousinChainInfo,
} from "../src/analysis/chains.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * A two-generation lineage of families (structure only — the "is this a cousin marriage?" flags
 * are supplied synthetically, so the chain DP is tested independently of classification):
 *   famG: G1 × G2 -> H1
 *   famP: H1 × W1 -> K
 */
function lineageTree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "G1", gender: 1 }),
      personRow({ id: 2, name: "G2", gender: 2 }),
      personRow({ id: 3, name: "H1", famc: 10, gender: 1 }),
      personRow({ id: 4, name: "W1", gender: 2 }),
      personRow({ id: 5, name: "K", famc: 20, gender: 1 }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 4 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

const idByName = (t: FamilyTree, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;
const famWithHusband = (t: FamilyTree, husbandName: string) =>
  Object.values(t.families).find(
    (f) => f.husbandId === idByName(t, husbandName),
  )!.id;

/** Build a synthetic marriages map marking the named families' unions as cousin marriages. */
function marriagesMarking(
  t: FamilyTree,
  cousinFamilyIds: UUID[],
): Map<UUID, MarriageAnalysis> {
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

describe("analysis/chains", () => {
  it("chain depth 1 for a lone cousin marriage", () => {
    const t = lineageTree();
    const famP = famWithHusband(t, "H1");
    const marriages = marriagesMarking(t, [famP]); // only the parents' union
    const info = cousinChainInfo(t, idByName(t, "K"), marriages);
    expect(info.ancestralChainDepth).toBe(1);
  });

  it("chain depth 2 when the grandparents' union is ALSO a cousin marriage", () => {
    const t = lineageTree();
    const famG = famWithHusband(t, "G1");
    const famP = famWithHusband(t, "H1");
    const marriages = marriagesMarking(t, [famG, famP]);
    expect(
      cousinChainInfo(t, idByName(t, "K"), marriages).ancestralChainDepth,
    ).toBe(2);
  });

  it("chain depth 0 when the parents are not a cousin marriage", () => {
    const t = lineageTree();
    const marriages = marriagesMarking(t, []); // none
    expect(
      cousinChainInfo(t, idByName(t, "K"), marriages).ancestralChainDepth,
    ).toBe(0);
  });

  it("continuesInDescendants is true for an ancestor whose descendants marry cousins", () => {
    const t = lineageTree();
    const famP = famWithHusband(t, "H1");
    const marriages = marriagesMarking(t, [famP]);
    // G1's descendant H1 is in a cousin marriage (famP) → the pattern continues downward.
    expect(
      cousinChainInfo(t, idByName(t, "G1"), marriages).continuesInDescendants,
    ).toBe(true);
    // K has no descendants and no own union → does not continue.
    expect(
      cousinChainInfo(t, idByName(t, "K"), marriages).continuesInDescendants,
    ).toBe(false);
  });

  it("analyzeCousinChains reports the tree-wide max chain depth", () => {
    const t = lineageTree();
    const famG = famWithHusband(t, "G1");
    const famP = famWithHusband(t, "H1");
    const chains = analyzeCousinChains(t, marriagesMarking(t, [famG, famP]));
    expect(chains.maxChainDepth).toBe(2);
    expect(chains.byPerson.get(idByName(t, "K"))?.ancestralChainDepth).toBe(2);
  });
});
