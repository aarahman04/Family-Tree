import { describe, expect, it } from "vitest";
import { relationshipPhrase } from "../../src/lib/relationshipPhrase.js";
import { parseNodeFtt } from "../../../src/parser/index.js";
import { analyzeTree } from "../../../src/analysis/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../tests/helpers.js";
import type { FamilyTree } from "../../../src/models/types.js";

const id = (t: FamilyTree, n: string) => Object.values(t.persons).find((p) => p.name === n)!.id;
const famOf = (t: FamilyTree, husband: string) =>
  Object.values(t.families).find((f) => f.husbandId === id(t, husband))!.id;

/** uncle x niece, plus an ordinary marriage. */
function tree(): FamilyTree {
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
        familyRow({ id: 102, husband: 3, wife: 6 }),
      ]
    )
  ).tree;
}

describe("relationshipPhrase", () => {
  it("says a man married his niece, naming the direction", () => {
    const t = tree();
    const m = analyzeTree(t).marriages.get(famOf(t, "uncle"))!;
    expect(relationshipPhrase(t, m)).toMatch(/married their niece/i);
  });

  it("says a woman married her nephew when the elder spouse is female", () => {
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "gpa", gender: 1 }),
          personRow({ id: 2, name: "gma", gender: 2 }),
          personRow({ id: 3, name: "aunt", famc: 100, gender: 2 }),
          personRow({ id: 4, name: "mid", famc: 100, gender: 1 }),
          personRow({ id: 5, name: "midWife", gender: 2 }),
          personRow({ id: 6, name: "nephew", famc: 101, gender: 1 }),
        ],
        [
          familyRow({ id: 100, husband: 1, wife: 2 }),
          familyRow({ id: 101, husband: 4, wife: 5 }),
          familyRow({ id: 102, husband: 6, wife: 3 }),
        ]
      )
    ).tree;
    const m = analyzeTree(t).marriages.get(famOf(t, "nephew"))!;
    expect(relationshipPhrase(t, m)).toMatch(/married their nephew/i);
  });

  it("names the cousin degree rather than saying 'a relative'", () => {
    const t = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "gpa", gender: 1 }),
          personRow({ id: 2, name: "gma", gender: 2 }),
          personRow({ id: 3, name: "dadA", famc: 10, gender: 1 }),
          personRow({ id: 4, name: "dadB", famc: 10, gender: 1 }),
          personRow({ id: 5, name: "momA", gender: 2 }),
          personRow({ id: 6, name: "momB", gender: 2 }),
          personRow({ id: 7, name: "cA", famc: 20, gender: 1 }),
          personRow({ id: 8, name: "cB", famc: 30, gender: 2 }),
        ],
        [
          familyRow({ id: 10, husband: 1, wife: 2 }),
          familyRow({ id: 20, husband: 3, wife: 5 }),
          familyRow({ id: 30, husband: 4, wife: 6 }),
          familyRow({ id: 40, husband: 7, wife: 8 }),
        ]
      )
    ).tree;
    const m = analyzeTree(t).marriages.get(famOf(t, "cA"))!;
    expect(relationshipPhrase(t, m)).toMatch(/first cousin marriage/i);
  });

  it("returns nothing for an ordinary unrelated marriage, so the UI stays quiet", () => {
    const t = tree();
    expect(relationshipPhrase(t, analyzeTree(t).marriages.get(famOf(t, "mid"))!)).toBeUndefined();
  });
});
