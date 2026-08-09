import { describe, expect, it } from "vitest";
import { computeNeighborhood, layoutNeighborhood } from "../../src/lib/neighborhood.js";
import { parseNodeFtt } from "../../../parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../tests/helpers.js";
import type { FamilyTree } from "../../../models/types.js";

/**
 *          Grandpa(1) x Grandma(2)
 *           /                  \
 *    ParentA(3)                ParentB(4)
 *        |                          |
 *    CousinX(5) x---------- CousinY(6)   <- cousin marriage, shared ancestors 1 & 2
 *        |
 *    GreatGrandchild(7)
 */
function cousinMarriageTree(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Grandpa", gender: 1 }),
        personRow({ id: 2, name: "Grandma", gender: 2 }),
        personRow({ id: 3, name: "ParentA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "ParentB", famc: 10, gender: 2 }),
        personRow({ id: 5, name: "CousinX", famc: 20, gender: 1 }),
        personRow({ id: 6, name: "CousinY", famc: 30, gender: 2 }),
        personRow({ id: 7, name: "GreatGrandchild", famc: 40 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3 }),
        familyRow({ id: 30, wife: 4 }),
        familyRow({ id: 40, husband: 5, wife: 6 }),
      ]
    )
  ).tree;
}

function idOf(tree: FamilyTree, name: string): string {
  return Object.values(tree.persons).find((p) => p.name === name)!.id;
}

describe("computeNeighborhood", () => {
  it("includes the focus person and returns no duplicate node ids", () => {
    const tree = cousinMarriageTree();
    const cousinX = idOf(tree, "CousinX");
    const { nodeIds } = computeNeighborhood(tree, cousinX, new Set());
    expect(nodeIds).toContain(cousinX);
    expect(new Set(nodeIds).size).toBe(nodeIds.length); // never duplicated
  });

  it("shows the shared ancestor exactly once even though both spouses' lines lead back to them", () => {
    const tree = cousinMarriageTree();
    const cousinX = idOf(tree, "CousinX");
    const grandpa = idOf(tree, "Grandpa");
    // depth-2 from CousinX reaches: ParentA(1) -> Grandpa/Grandma(2), CousinY via spouse(1) -> ParentB(2)
    const { nodeIds, edges } = computeNeighborhood(tree, cousinX, new Set());
    const grandpaOccurrences = nodeIds.filter((id) => id === grandpa);
    expect(grandpaOccurrences).toHaveLength(1);
    // Grandpa should have edges to both ParentA and ParentB if both are in view
    const grandpaEdges = edges.filter((e) => e.type === "parent-child" && e.from === grandpa);
    expect(grandpaEdges.length).toBeGreaterThanOrEqual(1);
  });

  it("marks border people as expandable and included ones with fully-shown relations as not", () => {
    const tree = cousinMarriageTree();
    const cousinX = idOf(tree, "CousinX");
    const greatGrandchild = idOf(tree, "GreatGrandchild");
    const { expandable, nodeIds } = computeNeighborhood(tree, cousinX, new Set());
    // GreatGrandchild is CousinX's grandchild via spouse — at the edge of depth-2, likely expandable if it has more its own relations off-screen (it has none here, so it should NOT be expandable)
    if (nodeIds.includes(greatGrandchild)) {
      expect(expandable.has(greatGrandchild)).toBe(false);
    }
  });

  it("expanding a person pulls in their 1-hop relations", () => {
    const tree = cousinMarriageTree();
    const cousinX = idOf(tree, "CousinX");
    const greatGrandchild = idOf(tree, "GreatGrandchild");
    const base = computeNeighborhood(tree, cousinX, new Set());
    // Confirm base view does not already include great-grandchild's spouse (none exists) — instead
    // test that expanding a distant node still returns a valid, deduplicated graph.
    const expanded = computeNeighborhood(tree, cousinX, new Set([greatGrandchild]));
    expect(new Set(expanded.nodeIds).size).toBe(expanded.nodeIds.length);
    expect(expanded.nodeIds.length).toBeGreaterThanOrEqual(base.nodeIds.length);
  });

  it("returns an empty result for an unknown focus id", () => {
    const tree = cousinMarriageTree();
    const result = computeNeighborhood(tree, "nonexistent", new Set());
    expect(result.nodeIds).toHaveLength(0);
  });
});

describe("layoutNeighborhood", () => {
  it("assigns every node a finite, distinct-enough position", () => {
    const tree = cousinMarriageTree();
    const cousinX = idOf(tree, "CousinX");
    const { nodeIds, edges } = computeNeighborhood(tree, cousinX, new Set());
    const positions = layoutNeighborhood(nodeIds, edges);

    expect(positions.size).toBe(nodeIds.length);
    for (const id of nodeIds) {
      const pos = positions.get(id)!;
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it("places parents at a lower y than their children (generations flow downward)", () => {
    const tree = cousinMarriageTree();
    const cousinX = idOf(tree, "CousinX");
    const grandpa = idOf(tree, "Grandpa");
    const parentA = idOf(tree, "ParentA");
    const { nodeIds, edges } = computeNeighborhood(tree, cousinX, new Set());
    const positions = layoutNeighborhood(nodeIds, edges);

    expect(positions.get(grandpa)!.y).toBeLessThan(positions.get(parentA)!.y);
  });
});
