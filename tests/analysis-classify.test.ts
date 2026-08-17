import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import type { CommonAncestor } from "../src/analysis/ancestry.js";
import {
  computeAncestorMap,
  findCommonAncestors,
} from "../src/analysis/ancestry.js";
import {
  classifyPair,
  countIndependentLines,
} from "../src/analysis/classify.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/** Shorthand for a synthetic common-ancestor record (classifyPair is pure — no tree needed). */
const ca = (distA: number, distB: number): CommonAncestor => ({
  ancestorId: "x",
  distA,
  distB,
});

describe("analysis/classify — classifyPair (pure)", () => {
  it("classifies first cousins (2,2) as cousin degree 1, no removal", () => {
    const r = classifyPair([ca(2, 2)], 1);
    expect(r).toMatchObject({ kind: "cousins", cousinDegree: 1, removal: 0 });
    expect(r.label).toBe("First cousins");
  });

  it("classifies (2,3) as first cousins once removed", () => {
    const r = classifyPair([ca(2, 3)], 1);
    expect(r).toMatchObject({ kind: "cousins", cousinDegree: 1, removal: 1 });
    expect(r.label).toBe("First cousins once removed");
  });

  it("classifies (3,3) as second cousins", () => {
    expect(classifyPair([ca(3, 3)], 1).label).toBe("Second cousins");
  });

  it("classifies (1,1) as siblings and (1,2) as avuncular", () => {
    expect(classifyPair([ca(1, 1)], 1).kind).toBe("siblings");
    expect(classifyPair([ca(1, 2)], 1).kind).toBe("avuncular");
  });

  it("names cousin degrees beyond the third instead of collapsing them (D-19, supersedes D-1's label)", () => {
    // D-1 originally collapsed everything past third cousins to "Distant cousins", which hides
    // exactly the distinction a user tracing repeated cousin marriages is looking for. The
    // DEPTH_CAP half of D-1 still stands; only the label collapse is replaced.
    expect(classifyPair([ca(5, 5)], 1).label).toBe("Fourth cousins");
    expect(classifyPair([ca(6, 6)], 1).label).toBe("Fifth cousins");
    expect(classifyPair([ca(7, 7)], 1).label).toBe("Sixth cousins");
  });

  it("falls back to a numeric ordinal once the words run out", () => {
    expect(classifyPair([ca(9, 9)], 1).label).toBe("8th cousins");
  });

  it("keeps the removal suffix on a deep degree", () => {
    expect(classifyPair([ca(5, 6)], 1).label).toBe("Fourth cousins once removed");
  });

  it("labels multiple independent lines as Double/Triple", () => {
    expect(classifyPair([ca(2, 2)], 2).label).toBe("Double first cousins");
    expect(classifyPair([ca(2, 2)], 3).label).toBe("Triple first cousins");
  });

  it("picks the CLOSEST common ancestor when several exist", () => {
    // Related both as second cousins (3,3) and, more closely, first cousins (2,2).
    const r = classifyPair([ca(3, 3), ca(2, 2)], 1);
    expect(r.label).toBe("First cousins");
    expect(r.closest).toMatchObject({ distA: 2, distB: 2 });
  });

  it("returns 'unrelated' for no shared ancestor", () => {
    const r = classifyPair([], 0);
    expect(r.kind).toBe("unrelated");
    expect(r.closest).toBeNull();
  });
});

/**
 * Double-first-cousin tree (two brothers marry two sisters):
 *   gpaX(1) x gmaX(2) -> broA(5), broB(6)     [fam 10]
 *   gpaY(3) x gmaY(4) -> sisA(7), sisB(8)     [fam 20]
 *   broA(5) x sisA(7) -> childA(9)            [fam 30]
 *   broB(6) x sisB(8) -> childB(10)           [fam 40]
 *   childA(9) x childB(10) -> (double first cousins)   [fam 50]
 */
function doubleCousinTree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "GpaX", gender: 1 }),
      personRow({ id: 2, name: "GmaX", gender: 2 }),
      personRow({ id: 3, name: "GpaY", gender: 1 }),
      personRow({ id: 4, name: "GmaY", gender: 2 }),
      personRow({ id: 5, name: "BroA", famc: 10, gender: 1 }),
      personRow({ id: 6, name: "BroB", famc: 10, gender: 1 }),
      personRow({ id: 7, name: "SisA", famc: 20, gender: 2 }),
      personRow({ id: 8, name: "SisB", famc: 20, gender: 2 }),
      personRow({ id: 9, name: "ChildA", famc: 30, gender: 1 }),
      personRow({ id: 10, name: "ChildB", famc: 40, gender: 2 }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 4 }),
      familyRow({ id: 30, husband: 5, wife: 7 }),
      familyRow({ id: 40, husband: 6, wife: 8 }),
      familyRow({ id: 50, husband: 9, wife: 10 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

/** Single-couple first-cousin tree (reused shape from ancestry test). */
function firstCousinTree() {
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
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 5 }),
      familyRow({ id: 30, husband: 4, wife: 7 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

const uuidByName = (tree: ReturnType<typeof firstCousinTree>, name: string) =>
  Object.values(tree.persons).find((p) => p.name === name)!.id;

describe("analysis/classify — countIndependentLines (needs tree)", () => {
  it("counts one line for a single shared grandparent couple", () => {
    const tree = firstCousinTree();
    const commons = findCommonAncestors(
      computeAncestorMap(tree, uuidByName(tree, "CousinA")),
      computeAncestorMap(tree, uuidByName(tree, "CousinB")),
    );
    expect(countIndependentLines(tree, commons)).toBe(1);
  });

  it("counts two independent lines for double first cousins", () => {
    const tree = doubleCousinTree();
    const commons = findCommonAncestors(
      computeAncestorMap(tree, uuidByName(tree, "ChildA")),
      computeAncestorMap(tree, uuidByName(tree, "ChildB")),
    );
    expect(countIndependentLines(tree, commons)).toBe(2);
    expect(
      classifyPair(commons, countIndependentLines(tree, commons)).label,
    ).toBe("Double first cousins");
  });
});

describe("classifyPair — half vs full siblings", () => {
  it("calls two people sharing BOTH parents full siblings", () => {
    expect(classifyPair([ca(1, 1), ca(1, 1)], 1, 2).label).toBe("Siblings");
    expect(classifyPair([ca(1, 1), ca(1, 1)], 1, 2).kind).toBe("siblings");
  });

  it("calls two people sharing ONE parent half-siblings", () => {
    // Half-siblings are a materially different relationship — half the shared ancestry — and the
    // old classifier reported both as plain "Siblings".
    const r = classifyPair([ca(1, 1)], 1, 1);
    expect(r.kind).toBe("half-siblings");
    expect(r.label).toBe("Half-siblings");
  });

  it("defaults to full siblings when the shared-parent count is not supplied", () => {
    // Callers without the tree to hand keep the previous behaviour rather than guessing "half".
    expect(classifyPair([ca(1, 1)], 1).kind).toBe("siblings");
  });
});
