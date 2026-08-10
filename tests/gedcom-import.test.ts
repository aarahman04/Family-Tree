import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exportGedcom } from "../gedcom/export.js";
import { importGedcom, parseGedcomDate } from "../gedcom/import.js";
import { GedcomImportError } from "../gedcom/errors.js";
import { parseFtzFile } from "../parser/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FTZ_SAMPLE = path.join(__dirname, "..", "Family Tree FTZ", "FamilyTree.ftz");
const GED_SAMPLE = path.join(__dirname, "..", "samples", "family.ged");

const MINIMAL = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ahmed /Khan/
2 NICK Bao
1 SEX M
1 BIRT
2 DATE 12 JAN 1950
2 PLAC Hyderabad
1 DEAT
2 DATE 2010
1 FAMS @F1@
1 NOTE A short life note.
0 @I2@ INDI
1 NAME Zainab //
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Baby /Khan/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1975
0 TRLR
`;

describe("importGedcom", () => {
  it("imports individuals, families, names, dates, gender, notes and relationships", () => {
    const { tree } = importGedcom(MINIMAL, "family.ged");
    expect(tree.metadata.sourceFormat).toBe("gedcom");
    expect(Object.keys(tree.persons)).toHaveLength(3);
    expect(Object.keys(tree.families)).toHaveLength(1);

    const people = Object.values(tree.persons);
    const ahmed = people.find((p) => p.name === "Ahmed Khan")!;
    expect(ahmed).toBeDefined();
    expect(ahmed.nickname).toBe("Bao");
    expect(ahmed.gender).toBe("male");
    expect(ahmed.birth?.date).toEqual({ year: 1950, month: 1, day: 12 });
    expect(ahmed.birth?.place).toBe("Hyderabad");
    expect(ahmed.death?.date).toEqual({ year: 2010 });
    expect(ahmed.notes.map((n) => n.text)).toEqual(["A short life note."]);

    // "Zainab //" -> empty surname collapses to just the given name.
    expect(people.some((p) => p.name === "Zainab")).toBe(true);

    const fam = Object.values(tree.families)[0]!;
    expect(fam.husbandId).toBe(ahmed.id);
    expect(fam.marriage?.date).toEqual({ year: 1975 });
    const baby = people.find((p) => p.name === "Baby Khan")!;
    expect(fam.childrenIds).toContain(baby.id);
    // INDI<->FAM links re-derived from the FAM record.
    expect(baby.famcId).toBe(fam.id);
    expect(ahmed.famsIds).toContain(fam.id);
  });

  it("parses date qualifiers down to the parts it can find", () => {
    expect(parseGedcomDate("ABT 1990")).toEqual({ year: 1990 });
    expect(parseGedcomDate("BEF 3 MAR 1900")).toEqual({ year: 1900, month: 3, day: 3 });
    expect(parseGedcomDate("BET 1980 AND 1985")).toEqual({ year: 1980 });
    expect(parseGedcomDate("unknown")).toBeUndefined();
  });

  it("throws a clear error when the file has no individuals", () => {
    expect(() => importGedcom("0 HEAD\n1 CHAR UTF-8\n0 TRLR\n")).toThrow(GedcomImportError);
    expect(() => importGedcom("")).toThrow(GedcomImportError);
  });

  it("round-trips a real tree: export to GEDCOM, re-import, and preserve counts + relationships", async () => {
    if (!existsSync(FTZ_SAMPLE)) return;
    const { tree } = await parseFtzFile(await readFile(FTZ_SAMPLE), "FamilyTree.ftz");
    const exported = exportGedcom(tree, { sourceFileName: "FamilyTree.ftz" });
    expect(exported.rejected).toBe(false);

    const { tree: reimported } = importGedcom(exported.gedcom!, "family.ged");
    expect(Object.keys(reimported.persons)).toHaveLength(Object.keys(tree.persons).length);
    expect(Object.keys(reimported.families)).toHaveLength(Object.keys(tree.families).length);

    // Every marriage (husband+wife pair) survives the round-trip.
    const sourcePairs = Object.values(tree.families).filter((f) => f.husbandId && f.wifeId).length;
    const reimportedPairs = Object.values(reimported.families).filter((f) => f.husbandId && f.wifeId).length;
    expect(reimportedPairs).toBe(sourcePairs);

    // Parent/child edges are preserved in aggregate.
    const sourceChildEdges = Object.values(tree.families).reduce((s, f) => s + f.childrenIds.length, 0);
    const reimportedChildEdges = Object.values(reimported.families).reduce((s, f) => s + f.childrenIds.length, 0);
    expect(reimportedChildEdges).toBe(sourceChildEdges);
  });

  it("imports the checked-in sample GEDCOM if present", async () => {
    if (!existsSync(GED_SAMPLE)) return;
    const { tree } = importGedcom(await readFile(GED_SAMPLE, "utf-8"), "family.ged");
    expect(Object.keys(tree.persons).length).toBeGreaterThan(0);
    // Names actually come through (not all blank).
    expect(Object.values(tree.persons).some((p) => p.name.trim().length > 0)).toBe(true);
  });
});
