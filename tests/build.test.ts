import { describe, expect, it } from "vitest";
import { buildTree } from "../src/parser/build.js";
import { parseFamilyRow, parsePersonRow } from "../src/parser/rows.js";
import { familyRow, personRow } from "./helpers.js";

function build(persons: string[], families: string[]) {
  const personRows = persons.map((f, i) => parsePersonRow(f.split("\t"), i).row);
  const familyRows = families.map((f, i) => parseFamilyRow(f.split("\t"), i).row);
  return buildTree(personRows, familyRows);
}

describe("buildTree", () => {
  it("wires famcId, husbandId/wifeId, famsIds, and childrenIds (ordered by birth order)", () => {
    const result = build(
      [
        personRow({ id: 1, name: "Dad" }),
        personRow({ id: 2, name: "Mom" }),
        personRow({ id: 3, name: "Kid B", famc: 100, birthOrder: 1 }),
        personRow({ id: 4, name: "Kid A", famc: 100, birthOrder: 0 }),
      ],
      [familyRow({ id: 100, husband: 1, wife: 2 })]
    );
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    const familyUuid = Object.keys(result.families)[0]!;
    const family = result.families[familyUuid]!;
    const dadUuid = Object.values(result.persons).find((p) => p.name === "Dad")!.id;
    const momUuid = Object.values(result.persons).find((p) => p.name === "Mom")!.id;
    const kidAUuid = Object.values(result.persons).find((p) => p.name === "Kid A")!.id;
    const kidBUuid = Object.values(result.persons).find((p) => p.name === "Kid B")!.id;

    expect(family.husbandId).toBe(dadUuid);
    expect(family.wifeId).toBe(momUuid);
    expect(family.childrenIds).toEqual([kidAUuid, kidBUuid]); // birth order 0 before 1
    expect(result.persons[dadUuid]!.famsIds).toEqual([familyUuid]);
    expect(result.persons[kidAUuid]!.famcId).toBe(familyUuid);
  });

  it("keeps every row as its own record on duplicate Person ftzId, wiring only the first as canonical", () => {
    const result = build(
      [
        personRow({ id: 1, name: "First Row" }),
        personRow({ id: 1, name: "Duplicate Row" }),
        personRow({ id: 2, name: "Child", famc: 100 }),
      ],
      [familyRow({ id: 100, husband: 1 })]
    );
    // both rows preserved as distinct Person objects
    expect(Object.values(result.persons).filter((p) => p.ftzId === 1)).toHaveLength(2);
    const dupIssue = result.issues.find((i) => i.code === "DUPLICATE_PERSON_ID");
    expect(dupIssue?.severity).toBe("error");
    expect(dupIssue?.relatedIds).toHaveLength(2);

    // only the first occurrence is wired in as the family's husband
    const firstRowUuid = Object.values(result.persons).find((p) => p.name === "First Row")!.id;
    const family = Object.values(result.families)[0]!;
    expect(family.husbandId).toBe(firstRowUuid);
  });

  it("flags a broken FAMC reference without dropping the person", () => {
    const result = build([personRow({ id: 1, name: "Orphan", famc: 999 })], []);
    const person = Object.values(result.persons)[0]!;
    expect(person.famcId).toBeUndefined();
    expect(
      result.issues.some((i) => i.code === "BROKEN_FAMC" && i.severity === "error")
    ).toBe(true);
  });

  it("does not flag famc=0 as broken (legitimate 'no recorded parents' sentinel)", () => {
    const result = build([personRow({ id: 1, name: "Root", famc: 0 })], []);
    expect(result.issues.some((i) => i.code === "BROKEN_FAMC")).toBe(false);
  });

  it("flags a broken spouse reference without dropping the family", () => {
    const result = build([], [familyRow({ id: 100, husband: 999, wife: 0 })]);
    const family = Object.values(result.families)[0]!;
    expect(family.husbandId).toBeUndefined();
    expect(
      result.issues.some((i) => i.code === "BROKEN_SPOUSE_REF" && i.severity === "error")
    ).toBe(true);
  });

  it("flags an ID namespace collision when a Person and Family share an ftzId", () => {
    const result = build([personRow({ id: 500, name: "A" })], [familyRow({ id: 500 })]);
    expect(result.issues.some((i) => i.code === "ID_NAMESPACE_COLLISION")).toBe(true);
  });
});
