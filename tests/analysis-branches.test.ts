import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import { analyzeBranches } from "../src/analysis/branches.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * Founder x FounderSpouse (FounderSpouse has her own recorded parents, so she isn't a competing
 * root candidate) -> BranchA / BranchB -> A1 / B1 -> A1 x B1 (a cross-branch marriage) -> Bridge1,
 * a shared descendant of BOTH branches. Plus a fully isolated "Loner" in a second component.
 */
function tree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Founder", gender: 1 }),
      personRow({ id: 2, name: "FounderSpouse", famc: 15, gender: 2 }),
      personRow({ id: 3, name: "FounderSpouseDad", gender: 1 }),
      personRow({ id: 4, name: "FounderSpouseMom", gender: 2 }),
      personRow({ id: 5, name: "BranchA", famc: 10, gender: 1 }),
      personRow({ id: 6, name: "BranchB", famc: 10, gender: 1 }),
      personRow({ id: 7, name: "SpouseA", gender: 2 }),
      personRow({ id: 8, name: "SpouseB", gender: 2 }),
      personRow({ id: 9, name: "A1", famc: 20, gender: 1 }),
      personRow({ id: 10, name: "B1", famc: 30, gender: 2 }),
      personRow({ id: 11, name: "Bridge1", famc: 40 }),
      personRow({ id: 12, name: "Loner" }),
    ],
    [
      familyRow({ id: 15, husband: 3, wife: 4 }),
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 5, wife: 7 }),
      familyRow({ id: 30, husband: 6, wife: 8 }),
      familyRow({ id: 40, husband: 9, wife: 10 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

function idOf(t: ReturnType<typeof tree>, name: string): string {
  return Object.values(t.persons).find((p) => p.name === name)!.id;
}

describe("analysis/branches — analyzeBranches", () => {
  it("picks the most-descended root candidate in the biggest component as the primary anchor", () => {
    const t = tree();
    expect(analyzeBranches(t).primaryRootId).toBe(idOf(t, "Founder"));
  });

  it("keeps anchor ownership across a daughter/wife-mediated descent chain", () => {
    const text = buildNodeFtt(
      [
        personRow({ id: 1, name: "Founder", gender: 1 }),
        personRow({ id: 2, name: "FounderSpouse", gender: 2 }),
        personRow({ id: 3, name: "Daughter", famc: 10, gender: 2 }),
        personRow({ id: 4, name: "YoungerChild", famc: 10 }),
        personRow({ id: 5, name: "SonInLaw", famc: 20, gender: 1 }),
        personRow({ id: 6, name: "InLawFather", gender: 1 }),
        personRow({ id: 7, name: "InLawMother", gender: 2 }),
        personRow({ id: 8, name: "Grandchild", famc: 30 }),
        personRow({ id: 9, name: "GreatGrandchild", famc: 40 }),
        personRow({ id: 10, name: "GrandchildSpouse", gender: 2 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 6, wife: 7 }),
        familyRow({ id: 30, husband: 5, wife: 3 }),
        familyRow({ id: 40, husband: 8, wife: 10 }),
      ],
    );
    const t = parseNodeFtt(text).tree;

    expect(analyzeBranches(t).primaryRootId).toBe(idOf(t, "Founder"));
  });

  it("builds one branch per direct child of the primary anchor, with descendant/depth stats", () => {
    const t = tree();
    const a = analyzeBranches(t);
    expect(a.branches).toHaveLength(2);
    const byRoot = new Map(a.branches.map((b) => [b.rootPersonId, b]));
    const branchA = byRoot.get(idOf(t, "BranchA"))!;
    const branchB = byRoot.get(idOf(t, "BranchB"))!;
    expect(branchA.descendantCount).toBe(2); // A1, Bridge1
    expect(branchA.livingDescendantCount).toBe(2); // no death/overage data in this fixture
    expect(branchA.depth).toBe(2);
    expect(branchB.descendantCount).toBe(2); // B1, Bridge1
    expect(branchB.depth).toBe(2);
  });

  it("detects the shared descendant as a branch overlap and rolls it into overlapPercent", () => {
    const t = tree();
    const a = analyzeBranches(t);
    expect(a.overlaps).toHaveLength(1);
    expect(a.overlaps[0]!.sharedDescendantIds).toEqual([idOf(t, "Bridge1")]);
    // 2 branches of size 3 (root+2 descendants) share 1 person: union=5, sum=6 => 20%.
    expect(a.overlapPercent).toBe(20);
  });

  it("records the cross-branch marriage as a marriage bridge", () => {
    const t = tree();
    const a = analyzeBranches(t);
    expect(a.marriageBridges).toHaveLength(1);
    const bridge = a.marriageBridges[0]!;
    expect(new Set([bridge.branchA, bridge.branchB])).toEqual(
      new Set([idOf(t, "BranchA"), idOf(t, "BranchB")]),
    );
    // Both branches should reflect the bridge in their count.
    const byRoot = new Map(a.branches.map((b) => [b.rootPersonId, b]));
    expect(byRoot.get(idOf(t, "BranchA"))!.bridgeCount).toBe(1);
    expect(byRoot.get(idOf(t, "BranchB"))!.bridgeCount).toBe(1);
  });

  it("does not treat an in-branch marriage to an outside (unrelated) spouse as a bridge", () => {
    const t = tree();
    const a = analyzeBranches(t);
    // BranchA x SpouseA and BranchB x SpouseB are not cross-branch marriages: the outside spouse
    // never appears in any branch's own descendant set.
    const familyIds = a.marriageBridges.map((b) => b.familyId);
    expect(familyIds).not.toContain("20");
    expect(familyIds).not.toContain("30");
  });

  it("gives an isolated person their own component with no branches, and doesn't crash", () => {
    const t = tree();
    const a = analyzeBranches(t);
    const loner = idOf(t, "Loner");
    expect(a.primaryRootId).not.toBe(loner);
    expect(a.branches.some((b) => b.rootPersonId === loner)).toBe(false);
  });
});
