import { describe, expect, it } from "vitest";
import { parseFamilyRow, parsePersonRow } from "../parser/rows.js";
import { familyRow, personRow } from "./helpers.js";

describe("parsePersonRow", () => {
  it("maps a well-formed row correctly", () => {
    const { row, issues } = parsePersonRow(
      personRow({
        id: 42,
        famc: 7,
        birthOrder: 2,
        nickname: "Junior",
        name: "John Smith",
        gender: 1,
        birthYear: 1990,
        birthMonth: 5,
        birthDay: 10,
        note: "Engineer",
      }).split("\t"),
      0
    );
    expect(issues).toHaveLength(0);
    expect(row.ftzId).toBe(42);
    expect(row.famcFtzId).toBe(7);
    expect(row.birthOrder).toBe(2);
    expect(row.nickname).toBe("Junior");
    expect(row.name).toBe("John Smith");
    expect(row.gender).toBe("male");
    expect(row.birth).toEqual({
      id: expect.any(String),
      type: "birth",
      date: { year: 1990, month: 5, day: 10 },
    });
    expect(row.notes).toHaveLength(1);
    expect(row.notes[0]!.text).toBe("Engineer");
  });

  it("maps gender codes: 1=male, 2=female, else unknown", () => {
    expect(parsePersonRow(personRow({ id: 1, gender: 1 }).split("\t"), 0).row.gender).toBe(
      "male"
    );
    expect(parsePersonRow(personRow({ id: 1, gender: 2 }).split("\t"), 0).row.gender).toBe(
      "female"
    );
    expect(parsePersonRow(personRow({ id: 1, gender: 0 }).split("\t"), 0).row.gender).toBe(
      "unknown"
    );
    expect(parsePersonRow(personRow({ id: 1, gender: 999 }).split("\t"), 0).row.gender).toBe(
      "unknown"
    );
  });

  it("omits birth/death events entirely when no date parts are set", () => {
    const { row } = parsePersonRow(personRow({ id: 1 }).split("\t"), 0);
    expect(row.birth).toBeUndefined();
    expect(row.death).toBeUndefined();
  });

  it("pads short rows and reports a MALFORMED_ROW warning, never dropping the record", () => {
    const fields = personRow({ id: 1, name: "Short" }).split("\t").slice(0, 10);
    const { row, issues } = parsePersonRow(fields, 0);
    expect(row.ftzId).toBe(1);
    expect(issues.some((i) => i.code === "MALFORMED_ROW" && i.severity === "warning")).toBe(
      true
    );
  });

  it("preserves extra trailing columns and reports an info-level issue", () => {
    const fields = personRow({ id: 1, name: "A", extra: ["future1", "future2"] }).split("\t");
    const { row, issues } = parsePersonRow(fields, 0);
    expect(row.raw).toHaveLength(31);
    expect(row.raw.slice(29)).toEqual(["future1", "future2"]);
    expect(issues.some((i) => i.code === "EXTRA_FIELDS_PRESERVED" && i.severity === "info")).toBe(
      true
    );
  });

  it("coerces non-numeric values in numeric fields to 0 and warns", () => {
    const fields = personRow({ id: 1 }).split("\t");
    fields[3] = "not-a-number"; // birthOrder
    const { row, issues } = parsePersonRow(fields, 0);
    expect(row.birthOrder).toBe(0);
    expect(issues.some((i) => i.code === "MALFORMED_ROW" && i.message.includes("birthOrder"))).toBe(
      true
    );
  });
});

describe("parseFamilyRow", () => {
  it("maps a well-formed row correctly", () => {
    const { row, issues } = parseFamilyRow(
      familyRow({ id: 100, husband: 1, wife: 2 }).split("\t"),
      0
    );
    expect(issues).toHaveLength(0);
    expect(row.ftzId).toBe(100);
    expect(row.husbandFtzId).toBe(1);
    expect(row.wifeFtzId).toBe(2);
  });

  it("pads short rows without dropping the record", () => {
    const fields = familyRow({ id: 100, husband: 1, wife: 2 }).split("\t").slice(0, 5);
    const { row, issues } = parseFamilyRow(fields, 0);
    expect(row.ftzId).toBe(100);
    expect(issues.some((i) => i.code === "MALFORMED_ROW")).toBe(true);
  });
});
