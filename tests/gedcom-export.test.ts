import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../parser/index.js";
import { exportGedcom } from "../gedcom/export.js";
import { verifyRoundTrip } from "../gedcom/verify.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";
import type { FamilyTree } from "../models/types.js";

function treeFrom(persons: string[], families: string[] = []): FamilyTree {
  return parseNodeFtt(buildNodeFtt(persons, families)).tree;
}

/**
 * Xref allocation is sorted by UUID, not by ftzId — look records up by their REFN (ftzId)
 * instead of assuming a fixed @I1@/@I2@ order. The inner (?!0 @) lookahead stops the lazy
 * match from crossing into the next record if this one doesn't contain the REFN we want.
 */
function xrefForFtzId(gedcom: string, ftzId: number): string {
  const match = new RegExp(
    `0 (@[^@]+@) (?:INDI|FAM)\\n(?:(?!0 @)[^\\n]*\\n)*?1 REFN ${ftzId}\\b`
  ).exec(gedcom);
  if (!match) throw new Error(`No record with REFN ${ftzId} found`);
  return match[1]!;
}

describe("exportGedcom — structure", () => {
  it("exports a single individual with a valid HEAD/INDI/TRLR skeleton", () => {
    const tree = treeFrom([personRow({ id: 1, name: "Solo Person", gender: 1 })]);
    const result = exportGedcom(tree);
    expect(result.rejected).toBe(false);
    const ged = result.gedcom!;
    expect(ged).toMatch(/^0 HEAD\n/);
    expect(ged).toContain("1 GEDC\n2 VERS 5.5.1");
    expect(ged).toContain("1 CHAR UTF-8");
    expect(ged).toMatch(/0 @I1@ INDI\n1 NAME Solo /);
    expect(ged).toContain("1 SEX M");
    expect(ged.trim().endsWith("0 TRLR")).toBe(true);
  });

  it("exports a nuclear family with correct HUSB/WIFE/CHIL and FAMC/FAMS linkage", () => {
    const tree = treeFrom(
      [
        personRow({ id: 1, name: "Dad", gender: 1 }),
        personRow({ id: 2, name: "Mom", gender: 2 }),
        personRow({ id: 3, name: "Kid", famc: 10 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    );
    const result = exportGedcom(tree);
    expect(result.rejected).toBe(false);
    const ged = result.gedcom!;

    const dadXref = xrefForFtzId(ged, 1);
    const momXref = xrefForFtzId(ged, 2);
    const kidXref = xrefForFtzId(ged, 3);
    const famXref = xrefForFtzId(ged, 10);

    expect(ged).toContain(`0 ${famXref} FAM`);
    expect(ged).toMatch(new RegExp(`1 HUSB ${dadXref}`));
    expect(ged).toMatch(new RegExp(`1 WIFE ${momXref}`));
    expect(ged).toMatch(new RegExp(`1 CHIL ${kidXref}`));
    expect(ged).toMatch(new RegExp(`1 FAMC ${famXref}`));

    const report = verifyRoundTrip(tree, ged);
    expect(report.passed).toBe(true);
  });

  it("handles missing dates (no BIRT/DEAT emitted) without error", () => {
    const tree = treeFrom([personRow({ id: 1, name: "No Dates" })]);
    const result = exportGedcom(tree);
    expect(result.gedcom).not.toContain("BIRT");
    expect(result.gedcom).not.toContain("DEAT");
  });

  it("maps unknown gender to SEX U", () => {
    const tree = treeFrom([personRow({ id: 1, name: "Unknown Gender", gender: 0 })]);
    const result = exportGedcom(tree);
    expect(result.gedcom).toContain("1 SEX U");
  });

  it("emits no NOTE lines for a person with empty notes", () => {
    const tree = treeFrom([personRow({ id: 1, name: "No Notes" })]);
    const result = exportGedcom(tree);
    const indiBlock = result.gedcom!.split("0 @I1@ INDI")[1]!.split("0 TRLR")[0]!;
    expect(indiBlock).not.toContain("NOTE");
  });

  it("preserves notes and links them to the correct individual (multi-person)", () => {
    const tree = treeFrom([
      personRow({ id: 1, name: "Has Note", note: "Engineer" }),
      personRow({ id: 2, name: "No Note" }),
    ]);
    const result = exportGedcom(tree);
    const ged = result.gedcom!;
    const hasNoteXref = xrefForFtzId(ged, 1);
    const noNoteXref = xrefForFtzId(ged, 2);
    const hasNoteBlock = ged.split(`0 ${hasNoteXref} INDI`)[1]!.split(/0 @/)[0]!;
    const noNoteBlock = ged.split(`0 ${noNoteXref} INDI`)[1]!.split(/0 @/)[0]!;
    expect(hasNoteBlock).toContain("1 NOTE Engineer");
    expect(noNoteBlock).not.toContain("1 NOTE");
    const report = verifyRoundTrip(tree, ged);
    expect(report.noteCountMismatches).toHaveLength(0);
  });
});

describe("exportGedcom — complex relationships", () => {
  it("supports multiple generations", () => {
    const tree = treeFrom(
      [
        personRow({ id: 1, name: "Grandpa", gender: 1 }),
        personRow({ id: 2, name: "Grandma", gender: 2 }),
        personRow({ id: 3, name: "Parent", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "Child", famc: 20 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 }), familyRow({ id: 20, husband: 3 })]
    );
    const result = exportGedcom(tree);
    const report = verifyRoundTrip(tree, result.gedcom!);
    expect(report.passed).toBe(true);
  });

  it("supports cousin marriage / shared ancestors without duplicating the shared ancestor INDI", () => {
    const tree = treeFrom(
      [
        personRow({ id: 1, name: "Grandpa", gender: 1 }),
        personRow({ id: 2, name: "Grandma", gender: 2 }),
        personRow({ id: 3, name: "ParentA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "ParentB", famc: 10, gender: 2 }),
        personRow({ id: 5, name: "CousinX", famc: 20, gender: 1 }),
        personRow({ id: 6, name: "CousinY", famc: 30, gender: 2 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3 }),
        familyRow({ id: 30, wife: 4 }),
        familyRow({ id: 40, husband: 5, wife: 6 }),
      ]
    );
    const result = exportGedcom(tree);
    expect(result.rejected).toBe(false);
    // grandpa's INDI record must appear exactly once
    const grandpaOccurrences = (result.gedcom!.match(/1 NAME Grandpa/g) ?? []).length;
    expect(grandpaOccurrences).toBe(1);

    const report = verifyRoundTrip(tree, result.gedcom!);
    expect(report.passed).toBe(true);
    expect(report.cousinMarriageCountSource).toBe(1);
    expect(report.cousinMarriagesMatch).toBe(true);
  });

  it("supports a synthetic multiple-spouse dataset", () => {
    const tree = treeFrom(
      [
        personRow({ id: 1, name: "Husband", gender: 1 }),
        personRow({ id: 2, name: "Wife1", gender: 2 }),
        personRow({ id: 3, name: "Wife2", gender: 2 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 }), familyRow({ id: 20, husband: 1, wife: 3 })]
    );
    const result = exportGedcom(tree);
    const famsCount = (result.gedcom!.match(/1 FAMS/g) ?? []).length;
    expect(famsCount).toBe(4); // husband x2 (one per marriage) + each wife x1
    const report = verifyRoundTrip(tree, result.gedcom!);
    expect(report.passed).toBe(true);
  });

  it("handles a large family tree without error", () => {
    const persons: string[] = [];
    const families: string[] = [];
    let id = 1;
    const founderH = id++;
    const founderW = id++;
    persons.push(personRow({ id: founderH, name: `P${founderH}`, gender: 1 }));
    persons.push(personRow({ id: founderW, name: `P${founderW}`, gender: 2 }));
    let famId = 1000;
    families.push(familyRow({ id: famId, husband: founderH, wife: founderW }));
    let couples = [famId++];
    for (let gen = 0; gen < 6; gen++) {
      const next: number[] = [];
      for (const fam of couples) {
        for (let c = 0; c < 3; c++) {
          const childId = id++;
          const gender = c % 2 === 0 ? 1 : 2;
          persons.push(personRow({ id: childId, name: `P${childId}`, famc: fam, birthOrder: c, gender }));
          if (gender === 1) {
            const spouseId = id++;
            persons.push(personRow({ id: spouseId, name: `P${spouseId}`, gender: 2 }));
            families.push(familyRow({ id: famId, husband: childId, wife: spouseId }));
            next.push(famId++);
          }
        }
      }
      couples = next;
      if (couples.length === 0) break;
    }
    const tree = treeFrom(persons, families);
    expect(Object.keys(tree.persons).length).toBeGreaterThan(300);
    const result = exportGedcom(tree);
    expect(result.rejected).toBe(false);
    const report = verifyRoundTrip(tree, result.gedcom!);
    expect(report.passed).toBe(true);
  });
});

describe("exportGedcom — validation and rejection", () => {
  it("rejects export when the internal model is structurally broken (dangling xref)", () => {
    const tree = treeFrom([personRow({ id: 1, name: "A" })]);
    // Manually corrupt the model beyond what the parser would ever produce.
    const personId = Object.keys(tree.persons)[0]!;
    tree.persons[personId]!.famcId = "nonexistent-uuid";

    const result = exportGedcom(tree);
    expect(result.rejected).toBe(true);
    expect(result.issues.some((i) => i.code === "DANGLING_XREF")).toBe(true);
    expect(result.gedcom).toBeUndefined();
  });

  it("rejects export on a dangling family-side reference (husband/wife/child pointing nowhere)", () => {
    const tree = treeFrom(
      [personRow({ id: 1, name: "A", gender: 1 }), personRow({ id: 2, name: "B", famc: 10 })],
      [familyRow({ id: 10, husband: 1 })]
    );
    const familyId = Object.keys(tree.families)[0]!;
    tree.families[familyId]!.wifeId = "nonexistent-uuid";
    const result1 = exportGedcom(tree);
    expect(result1.rejected).toBe(true);

    const tree2 = treeFrom(
      [personRow({ id: 1, name: "A", gender: 1 }), personRow({ id: 2, name: "B", famc: 10 })],
      [familyRow({ id: 10, husband: 1 })]
    );
    const familyId2 = Object.keys(tree2.families)[0]!;
    tree2.families[familyId2]!.childrenIds.push("nonexistent-uuid");
    const result2 = exportGedcom(tree2);
    expect(result2.rejected).toBe(true);

    const tree3 = treeFrom([personRow({ id: 1, name: "A" })]);
    const personId3 = Object.keys(tree3.persons)[0]!;
    tree3.persons[personId3]!.famsIds.push("nonexistent-uuid");
    const result3 = exportGedcom(tree3);
    expect(result3.rejected).toBe(true);
  });

  it("warns on an unmapped-but-populated Family column without rejecting", () => {
    const tree = treeFrom(
      [personRow({ id: 1, name: "A", gender: 1 })],
      [familyRow({ id: 10, husband: 1 })]
    );
    const familyId = Object.keys(tree.families)[0]!;
    tree.families[familyId]!.raw![1] = "surprise";
    const result = exportGedcom(tree);
    expect(result.rejected).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === "UNMAPPED_FIELD_POPULATED" && i.relatedIds.includes(familyId)
      )
    ).toBe(true);
  });

  it("rejects export when the source tree has unresolved error-severity issues, unless forced", () => {
    const tree = treeFrom(
      [personRow({ id: 1, name: "Self" })],
      [familyRow({ id: 10, husband: 1, wife: 1 })] // self-marriage -> error-severity issue
    );
    expect(tree.validation.issues.some((i) => i.severity === "error")).toBe(true);

    const blocked = exportGedcom(tree);
    expect(blocked.rejected).toBe(true);
    expect(blocked.rejectionReason).toContain("force");

    const forced = exportGedcom(tree, { force: true });
    expect(forced.rejected).toBe(false);
    expect(forced.gedcom).toBeDefined();
  });

  it("warns (but does not reject) when a genuinely unmapped-but-populated column is found", () => {
    const tree = treeFrom([personRow({ id: 1, name: "A" })]);
    const personId = Object.keys(tree.persons)[0]!;
    // column 2 (0-based index 1) has no GEDCOM mapping
    tree.persons[personId]!.raw![1] = "surprise-value";

    const result = exportGedcom(tree);
    expect(result.rejected).toBe(false);
    expect(result.issues.some((i) => i.code === "UNMAPPED_FIELD_POPULATED")).toBe(true);
  });
});
