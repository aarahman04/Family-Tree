import { describe, expect, it } from "vitest";
import { GedcomWriter } from "../src/gedcom/writer.js";
import { formatGedcomDate } from "../src/gedcom/date.js";

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

describe("GedcomWriter — CONC chunking never splits a UTF-16 surrogate pair", () => {
  // Most emoji and some rare CJK/math characters are stored as a "surrogate pair" -- two
  // 16-bit code units -- in JS's UTF-16 strings. A naive slice() at a fixed offset can cut
  // between the two, leaving a lone/invalid surrogate on each side of the line break. These
  // tests build values where a supplementary character sits at every offset around the 200-
  // char chunk boundary and verify no line ever contains a lone surrogate, and that
  // reassembling every emitted line's value reproduces the original text exactly.

  function hasLoneSurrogate(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = s.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        i++; // consumed as part of a valid pair
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return true; // low surrogate with no preceding high surrogate
      }
    }
    return false;
  }

  /** Reassembles a NOTE line + its CONC/CONT continuations back into the original value. */
  function reassemble(gedcomText: string): string {
    const lines = gedcomText.trim().split("\n");
    return lines
      .map((l) => l.replace(/^\d+ (NOTE|CONC) ?/, "").replace(/^\d+ CONT ?/, "\n"))
      .join("");
  }

  const SUPPLEMENTARY_CHARS = [
    ["🎉", "party popper emoji"],
    ["𝕏", "mathematical double-struck X (U+1D54F)"],
    ["😀🎊", "two consecutive supplementary characters"],
  ] as const;

  for (const [char, label] of SUPPLEMENTARY_CHARS) {
    describe(`with ${label}`, () => {
      // Place the character at every offset in a window around the chunk boundary (200) --
      // this is what "at every chunk boundary" means in practice: the boundary itself moves
      // by 1 for each extra code unit consumed before it, so sweeping a window guarantees at
      // least one case lands exactly between a pair's two halves (which is what originally
      // reproduced the bug), without hard-coding that exact offset as a magic number.
      for (let offset = 195; offset <= 205; offset++) {
        it(`does not corrupt a value with the character at offset ${offset}`, () => {
          const value = "a".repeat(offset) + char + "b".repeat(30);
          const w = new GedcomWriter();
          w.line(1, "NOTE", value);
          const text = w.toString();

          expect(hasLoneSurrogate(text)).toBe(false);
          expect(reassemble(text)).toBe(value);
        });
      }
    });
  }

  it("keeps a full multi-code-unit character intact on one side of the split, never straddling it", () => {
    // Deterministic, human-readable version of the sweep above, pinned at the exact offset
    // that reproduced the original bug report.
    const value = "a".repeat(199) + "🎉" + "b".repeat(20);
    const w = new GedcomWriter();
    w.line(1, "NOTE", value);
    const lines = w.toString().trim().split("\n");

    expect(lines[0]).toBe(`1 NOTE ${"a".repeat(199)}`);
    expect(lines[1]).toBe(`2 CONC 🎉${"b".repeat(20)}`);
  });

  it("handles a supplementary character immediately followed by another exactly at the boundary", () => {
    const value = "a".repeat(199) + "🎉😀" + "b".repeat(20);
    const w = new GedcomWriter();
    w.line(1, "NOTE", value);
    const text = w.toString();
    expect(hasLoneSurrogate(text)).toBe(false);
    expect(reassemble(text)).toBe(value);
  });
});
