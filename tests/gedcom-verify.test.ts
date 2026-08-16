import { describe, expect, it } from "vitest";
import { exportGedcom } from "../src/gedcom/export.js";
import { verifyRoundTrip } from "../src/gedcom/verify.js";
import { parseNodeFtt } from "../src/parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * The verifier is only useful if it can actually detect a wrong answer, not just agree
 * with a correct one. These tests feed it deliberately-corrupted GEDCOM text (as if the
 * exporter had a bug) and confirm each mismatch category is actually caught.
 */
describe("verifyRoundTrip — actually detects mismatches", () => {
  const tree = parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Dad", gender: 1, note: "A note" }),
        personRow({ id: 2, name: "Mom", gender: 2 }),
        personRow({ id: 3, name: "Kid", famc: 10 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    )
  ).tree;

  it("passes on a correctly generated export", () => {
    const { gedcom } = exportGedcom(tree);
    expect(verifyRoundTrip(tree, gedcom!).passed).toBe(true);
  });

  it("detects a missing INDI record", () => {
    const { gedcom } = exportGedcom(tree);
    const withoutOnePerson = gedcom!.replace(/0 @I\d+@ INDI\n(?:(?!0 @)[^\n]*\n)*/, "");
    const report = verifyRoundTrip(tree, withoutOnePerson);
    expect(report.passed).toBe(false);
    expect(report.personCountMatches).toBe(false);
  });

  it("detects a wrong HUSB/WIFE pointer in a FAM record", () => {
    const { gedcom } = exportGedcom(tree);
    // swap any HUSB xref for a bogus one
    const corrupted = gedcom!.replace(/1 HUSB @I\d+@/, "1 HUSB @I999@");
    const report = verifyRoundTrip(tree, corrupted);
    expect(report.passed).toBe(false);
    expect(report.relationshipMismatches.length).toBeGreaterThan(0);
  });

  it("detects a missing NOTE line", () => {
    const { gedcom } = exportGedcom(tree);
    const withoutNote = gedcom!.replace(/1 NOTE A note\n/, "");
    const report = verifyRoundTrip(tree, withoutNote);
    expect(report.passed).toBe(false);
    expect(report.noteCountMismatches.length).toBeGreaterThan(0);
  });

  it("detects a duplicate xref definition", () => {
    const { gedcom } = exportGedcom(tree);
    const firstIndiMatch = /0 @I\d+@ INDI/.exec(gedcom!)!;
    const duplicated = gedcom! + "\n" + firstIndiMatch[0] + "\n1 NAME Duplicate //\n";
    const report = verifyRoundTrip(tree, duplicated);
    expect(report.passed).toBe(false);
    expect(report.duplicateIndividuals.length).toBeGreaterThan(0);
  });

  it("detects a missing FAM record", () => {
    const { gedcom } = exportGedcom(tree);
    const withoutFamily = gedcom!.replace(/0 @F\d+@ FAM\n(?:(?!0 )[^\n]*\n)*/, "");
    const report = verifyRoundTrip(tree, withoutFamily);
    expect(report.passed).toBe(false);
    expect(report.familyCountMatches).toBe(false);
  });
});
