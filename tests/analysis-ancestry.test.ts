import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import {
  DEPTH_CAP,
  ancestorPaths,
  computeAncestorMap,
  findCommonAncestors,
  isDirectLineage,
} from "../src/analysis/ancestry.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * First-cousin-marriage tree:
 *   grandpa(1) x grandma(2) -> dadA(3), dadB(4)        [fam 10]
 *   dadA(3)   x momA(5)     -> cousinA(6)              [fam 20]
 *   dadB(4)   x momB(7)     -> cousinB(8)              [fam 30]
 *   cousinA(6) x cousinB(8) -> kid(9)                  [fam 40]  (first cousins marry)
 */
function firstCousinTree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Grandpa", gender: 1 }),
      personRow({ id: 2, name: "Grandma", gender: 2 }),
      personRow({ id: 3, name: "DadA", famc: 10, birthOrder: 0, gender: 1 }),
      personRow({ id: 4, name: "DadB", famc: 10, birthOrder: 1, gender: 1 }),
      personRow({ id: 5, name: "MomA", gender: 2 }),
      personRow({ id: 6, name: "CousinA", famc: 20, gender: 1 }),
      personRow({ id: 7, name: "MomB", gender: 2 }),
      personRow({ id: 8, name: "CousinB", famc: 30, gender: 2 }),
      personRow({ id: 9, name: "Kid", famc: 40 }),
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

function uuidByName(tree: ReturnType<typeof firstCousinTree>, name: string) {
  return Object.values(tree.persons).find((p) => p.name === name)!.id;
}

/** Self-parent cycle: person 1 is the husband of the family they are a child of. */
function selfParentTree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Loop", famc: 10, gender: 1 }),
      personRow({ id: 2, name: "Other", gender: 2 }),
    ],
    [familyRow({ id: 10, husband: 1, wife: 2 })],
  );
  return parseNodeFtt(text).tree;
}

describe("analysis/ancestry", () => {
  it("computes ancestor distances (parent=1, grandparent=2)", () => {
    const tree = firstCousinTree();
    const cousinA = uuidByName(tree, "CousinA");
    const map = computeAncestorMap(tree, cousinA);
    const dist = (name: string) => map.get(uuidByName(tree, name))?.minDistance;
    expect(dist("DadA")).toBe(1);
    expect(dist("MomA")).toBe(1);
    expect(dist("Grandpa")).toBe(2);
    expect(dist("Grandma")).toBe(2);
    // Not an ancestor of CousinA:
    expect(map.has(uuidByName(tree, "CousinB"))).toBe(false);
    // The person themselves is never their own ancestor:
    expect(map.has(cousinA)).toBe(false);
  });

  it("finds the shared grandparents of two first cousins with both distances", () => {
    const tree = firstCousinTree();
    const a = computeAncestorMap(tree, uuidByName(tree, "CousinA"));
    const b = computeAncestorMap(tree, uuidByName(tree, "CousinB"));
    const commons = findCommonAncestors(a, b);
    const byName = new Map(
      commons.map((c) => [tree.persons[c.ancestorId]!.name, c]),
    );
    expect([...byName.keys()].sort()).toEqual(["Grandma", "Grandpa"]);
    expect(byName.get("Grandpa")).toMatchObject({ distA: 2, distB: 2 });
    expect(byName.get("Grandma")).toMatchObject({ distA: 2, distB: 2 });
  });

  it("distinguishes direct lineage from a collateral (cousin) relationship", () => {
    const tree = firstCousinTree();
    const cousinA = uuidByName(tree, "CousinA");
    const dadA = uuidByName(tree, "DadA");
    const cousinB = uuidByName(tree, "CousinB");
    const mapA = computeAncestorMap(tree, cousinA);
    const mapDad = computeAncestorMap(tree, dadA);
    const mapB = computeAncestorMap(tree, cousinB);
    expect(isDirectLineage(cousinA, dadA, mapA, mapDad)).toBe(true); // dadA is an ancestor of cousinA
    expect(isDirectLineage(cousinA, cousinB, mapA, mapB)).toBe(false); // collateral, not lineage
  });

  it("returns the ancestry path from a person up to a common ancestor", () => {
    const tree = firstCousinTree();
    const cousinA = uuidByName(tree, "CousinA");
    const grandpa = uuidByName(tree, "Grandpa");
    const paths = ancestorPaths(tree, cousinA, grandpa);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.map((id) => tree.persons[id]!.name)).toEqual([
      "CousinA",
      "DadA",
      "Grandpa",
    ]);
  });

  it("terminates on a self-parent cycle instead of looping forever", () => {
    const tree = selfParentTree();
    const loop = uuidByName(tree, "Loop");
    const map = computeAncestorMap(tree, loop);
    expect(map.has(loop)).toBe(false); // never records itself as its own ancestor
    expect(map.has(uuidByName(tree, "Other"))).toBe(true);
  });

  it("respects the depth cap", () => {
    const tree = firstCousinTree();
    const cousinA = uuidByName(tree, "CousinA");
    const shallow = computeAncestorMap(tree, cousinA, 1);
    expect(shallow.has(uuidByName(tree, "DadA"))).toBe(true); // depth 1
    expect(shallow.has(uuidByName(tree, "Grandpa"))).toBe(false); // depth 2, beyond cap
    expect(DEPTH_CAP).toBe(15);
  });
});
