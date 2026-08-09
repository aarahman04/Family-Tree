import { describe, expect, it } from "vitest";
import { GedcomWriter } from "../gedcom/writer.js";
import { formatGedcomDate } from "../gedcom/date.js";

describe("GedcomWriter", () => {
  it("splits embedded newlines into CONT lines", () => {
    const w = new GedcomWriter();
    w.line(1, "NOTE", "First line\nSecond line\nThird line");
    const text = w.toString();
    expect(text).toBe("1 NOTE First line\n2 CONT Second line\n2 CONT Third line\n");
  });

  it("wraps overlong values into CONC continuation lines", () => {
    const w = new GedcomWriter();
    const longValue = "x".repeat(450);
    w.line(1, "NOTE", longValue);
    const lines = w.toString().trim().split("\n");
    expect(lines[0]).toBe(`1 NOTE ${"x".repeat(200)}`);
    expect(lines[1]).toBe(`2 CONC ${"x".repeat(200)}`);
    expect(lines[2]).toBe(`2 CONC ${"x".repeat(50)}`);
  });

  it("emits a bare level+tag line when value is empty/undefined", () => {
    const w = new GedcomWriter();
    w.line(1, "BIRT");
    expect(w.toString()).toBe("1 BIRT\n");
  });

  it("emits level+xref+tag lines", () => {
    const w = new GedcomWriter();
    w.lineWithXref(0, "@I1@", "INDI");
    expect(w.toString()).toBe("0 @I1@ INDI\n");
  });
});

describe("formatGedcomDate", () => {
  it("formats full dates", () => {
    expect(formatGedcomDate({ year: 1990, month: 5, day: 3 })).toBe("03 MAY 1990");
  });
  it("formats year+month", () => {
    expect(formatGedcomDate({ year: 1990, month: 12 })).toBe("DEC 1990");
  });
  it("formats year only", () => {
    expect(formatGedcomDate({ year: 1990 })).toBe("1990");
  });
  it("returns undefined when year is missing (unformattable)", () => {
    expect(formatGedcomDate({ month: 5, day: 3 })).toBeUndefined();
    expect(formatGedcomDate(undefined)).toBeUndefined();
  });
});
