import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import { analyzeCompleteness } from "../src/analysis/completeness.js";
import { ancestryCompleteness } from "../src/analysis/confidence.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/** Child has both parents recorded; Parent1/Parent2 have no recorded parents of their own. */
function tree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Parent1", gender: 1 }),
      personRow({ id: 2, name: "Parent2", gender: 2 }),
      personRow({ id: 3, name: "Child", famc: 10 }),
    ],
    [familyRow({ id: 10, husband: 1, wife: 2 })],
  );
  return parseNodeFtt(text).tree;
}

function idOf(t: ReturnType<typeof tree>, name: string): string {
  return Object.values(t.persons).find((p) => p.name === name)!.id;
}

describe("analysis/completeness — analyzeCompleteness", () => {
  it("matches ancestryCompleteness per person, reused not reimplemented", () => {
    const t = tree();
    const a = analyzeCompleteness(t, 1);
    expect(a.byPerson.get(idOf(t, "Child"))).toBe(ancestryCompleteness(t, idOf(t, "Child"), 1));
    expect(a.byPerson.get(idOf(t, "Parent1"))).toBe(ancestryCompleteness(t, idOf(t, "Parent1"), 1));
  });

  it("Child (both parents known) scores 1.0 at depth 1; Parent1/Parent2 (no recorded parents) score 0", () => {
    const t = tree();
    const a = analyzeCompleteness(t, 1);
    expect(a.byPerson.get(idOf(t, "Child"))).toBe(1);
    expect(a.byPerson.get(idOf(t, "Parent1"))).toBe(0);
    expect(a.byPerson.get(idOf(t, "Parent2"))).toBe(0);
  });

  it("averages per-person scores across the whole tree", () => {
    const t = tree();
    const a = analyzeCompleteness(t, 1);
    expect(a.treeAverage).toBeCloseTo((1 + 0 + 0) / 3, 10);
  });

  it("is 0 for a tree with no people", () => {
    const t = parseNodeFtt(buildNodeFtt([], [])).tree;
    const a = analyzeCompleteness(t, 1);
    expect(a.treeAverage).toBe(0);
    expect(a.byPerson.size).toBe(0);
  });
});
