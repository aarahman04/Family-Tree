import { describe, expect, it } from "vitest";
import { tokenizeNodeFtt } from "../parser/tokenizer.js";
import { FtzParseError } from "../parser/errors.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

describe("tokenizeNodeFtt", () => {
  it("parses a well-formed header and partitions rows by header position", () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "A" }), personRow({ id: 2, name: "B" })],
      [familyRow({ id: 100, husband: 1, wife: 2 })],
      { anchorId: 1 }
    );
    const result = tokenizeNodeFtt(text);
    expect(result.personLines).toHaveLength(2);
    expect(result.familyLines).toHaveLength(1);
    expect(result.unrecognizedLines).toHaveLength(0);
    expect(result.anchorId).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it("throws FtzParseError on an empty file", () => {
    expect(() => tokenizeNodeFtt("")).toThrow(FtzParseError);
  });

  it("throws FtzParseError on a malformed header", () => {
    expect(() => tokenizeNodeFtt("not-a-header\nsome data")).toThrow(FtzParseError);
    expect(() => tokenizeNodeFtt("1\t2")).toThrow(FtzParseError); // only 2 fields
  });

  it("falls back to field-count grouping and warns when header counts don't add up", () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "A" }), personRow({ id: 2, name: "B" })],
      [familyRow({ id: 100, husband: 1, wife: 2 })],
      { personCountOverride: 5, familyCountOverride: 5 } // lies about counts
    );
    const result = tokenizeNodeFtt(text);
    expect(result.personLines).toHaveLength(2);
    expect(result.familyLines).toHaveLength(1);
    expect(result.issues.some((i) => i.code === "UNKNOWN_RECORD_GROUP")).toBe(true);
  });

  it("preserves rows that match neither shape when falling back, rather than dropping them", () => {
    const weirdLine = "a\tb\tc"; // 3 fields, matches neither 29 nor 12
    const text = [
      "1\t0\t1",
      personRow({ id: 1, name: "A" }),
      weirdLine,
    ].join("\n");
    const result = tokenizeNodeFtt(text);
    expect(result.unrecognizedLines).toContainEqual(["a", "b", "c"]);
    const warning = result.issues.find((i) => i.code === "UNKNOWN_RECORD_GROUP");
    expect(warning?.message).toContain("a");
  });

  it("recognizes a Person row with extra trailing columns via header-position grouping (forward compatibility)", () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "A", extra: ["future-value"] })],
      [],
      { anchorId: 1 }
    );
    const result = tokenizeNodeFtt(text);
    expect(result.personLines).toHaveLength(1);
    expect(result.personLines[0]).toHaveLength(30);
  });
});
