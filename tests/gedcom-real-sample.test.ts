import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFtzFile } from "../src/parser/index.js";
import { exportGedcom } from "../src/gedcom/export.js";
import { verifyRoundTrip } from "../src/gedcom/verify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "Family Tree FTZ", "FamilyTree.ftz");
// Real personal family data — gitignored, not present in CI. See CONTRIBUTING.md.
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

describe.skipIf(!SAMPLE_EXISTS)("GEDCOM export — real FTZ sample (Milestone 4 completion criteria)", () => {
  it("exports successfully with matching counts and zero relationship mismatches", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes, "FamilyTree.ftz");
    expect(tree.validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    const result = exportGedcom(tree, { sourceFileName: "FamilyTree.ftz" });
    expect(result.rejected).toBe(false);
    const ged = result.gedcom!;

    expect(ged).toMatch(/^0 HEAD/);
    expect(ged.trim().endsWith("0 TRLR")).toBe(true);
    expect((ged.match(/^0 @I\d+@ INDI$/gm) ?? [])).toHaveLength(473);
    expect((ged.match(/^0 @F\d+@ FAM$/gm) ?? [])).toHaveLength(136);

    const report = verifyRoundTrip(tree, ged);
    expect(report.personCountMatches).toBe(true);
    expect(report.familyCountMatches).toBe(true);
    expect(report.relationshipMismatches).toHaveLength(0);
    expect(report.noteCountMismatches).toHaveLength(0);
    expect(report.duplicateIndividuals).toHaveLength(0);
    expect(report.cousinMarriagesMatch).toBe(true);
    expect(report.cousinMarriageCountSource).toBe(31);
    expect(report.passed).toBe(true);
  });

  it("produces no unmapped-but-populated field warnings for the real sample (all reserved columns are empty)", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes);
    const result = exportGedcom(tree);
    expect(result.issues.filter((i) => i.code === "UNMAPPED_FIELD_POPULATED")).toHaveLength(0);
  });
});
