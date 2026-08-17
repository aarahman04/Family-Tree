import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../src/parser/index.js";
import type { FamilyTree } from "../src/models/types.js";
import { kinshipCoefficient } from "../src/analysis/kinship.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const id = (t: FamilyTree, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;

/** gpa/gma -> dadA & dadB (full siblings) -> cousinA & cousinB (first cousins). */
function firstCousins() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "gpa", gender: 1 }),
        personRow({ id: 2, name: "gma", gender: 2 }),
        personRow({ id: 3, name: "dadA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "dadB", famc: 10, gender: 1 }),
        personRow({ id: 5, name: "momA", gender: 2 }),
        personRow({ id: 6, name: "momB", gender: 2 }),
        personRow({ id: 7, name: "cousinA", famc: 20, gender: 1 }),
        personRow({ id: 8, name: "cousinB", famc: 30, gender: 2 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3, wife: 5 }),
        familyRow({ id: 30, husband: 4, wife: 6 }),
      ],
    ),
  ).tree;
}

describe("kinshipCoefficient (S-2)", () => {
  it("gives full siblings the textbook 1/4", () => {
    const t = firstCousins();
    expect(kinshipCoefficient(t, id(t, "dadA"), id(t, "dadB"))).toBeCloseTo(0.25, 6);
  });

  it("gives first cousins the textbook 1/16", () => {
    const t = firstCousins();
    expect(kinshipCoefficient(t, id(t, "cousinA"), id(t, "cousinB"))).toBeCloseTo(0.0625, 6);
  });

  it("gives a parent and child the textbook 1/4", () => {
    const t = firstCousins();
    expect(kinshipCoefficient(t, id(t, "gpa"), id(t, "dadA"))).toBeCloseTo(0.25, 6);
  });

  it("gives unrelated people 0", () => {
    const t = firstCousins();
    expect(kinshipCoefficient(t, id(t, "momA"), id(t, "momB"))).toBe(0);
  });

  it("sums over BOTH shared grandparents rather than counting one line", () => {
    // Half first cousins share only ONE grandparent, so their coefficient must be exactly half
    // that of full first cousins. This is what catches an implementation that stops at the
    // closest common ancestor instead of summing every independent line.
    const half = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "gpa", gender: 1 }),
          personRow({ id: 2, name: "gma1", gender: 2 }),
          personRow({ id: 9, name: "gma2", gender: 2 }),
          personRow({ id: 3, name: "dadA", famc: 10, gender: 1 }),
          personRow({ id: 4, name: "dadB", famc: 40, gender: 1 }),
          personRow({ id: 5, name: "momA", gender: 2 }),
          personRow({ id: 6, name: "momB", gender: 2 }),
          personRow({ id: 7, name: "cousinA", famc: 20, gender: 1 }),
          personRow({ id: 8, name: "cousinB", famc: 30, gender: 2 }),
        ],
        [
          familyRow({ id: 10, husband: 1, wife: 2 }),
          familyRow({ id: 40, husband: 1, wife: 9 }), // same father, different mother
          familyRow({ id: 20, husband: 3, wife: 5 }),
          familyRow({ id: 30, husband: 4, wife: 6 }),
        ],
      ),
    ).tree;

    expect(kinshipCoefficient(half, id(half, "cousinA"), id(half, "cousinB"))).toBeCloseTo(
      0.03125,
      6,
    );
  });

  it("is symmetric", () => {
    const t = firstCousins();
    const a = id(t, "cousinA");
    const b = id(t, "cousinB");
    expect(kinshipCoefficient(t, a, b)).toBe(kinshipCoefficient(t, b, a));
  });

  it("returns 0 rather than throwing for an unknown id", () => {
    const t = firstCousins();
    expect(kinshipCoefficient(t, id(t, "cousinA"), "nobody")).toBe(0);
  });
});
