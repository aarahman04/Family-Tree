import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFtzFile } from "../src/parser/index.js";
import { getRelationships } from "../src/parser/relationships.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "Family Tree FTZ", "FamilyTree.ftz");
// This is a real person's real family data — gitignored, never committed (see
// CONTRIBUTING.md). CI has no copy, so these tests skip gracefully rather than fail.
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

/** Ancestor set walked up to a generous depth, mirroring validation-report.md's methodology. */
function ancestorsOf(tree: Awaited<ReturnType<typeof parseFtzFile>>["tree"], personId: string) {
  const result = new Set<string>();
  let frontier = [personId];
  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const rel = getRelationships(tree, id);
      for (const parent of [rel.father, rel.mother]) {
        if (parent && !result.has(parent)) {
          result.add(parent);
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  return result;
}

describe.skipIf(!SAMPLE_EXISTS)("real sample FTZ (Milestone 3 completion criteria)", () => {
  it("loads the provided FTZ sample successfully", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree, validation } = await parseFtzFile(bytes, "FamilyTree.ftz");

    // ✓ every person exists exactly once
    expect(Object.keys(tree.persons)).toHaveLength(473);
    expect(Object.keys(tree.families)).toHaveLength(136);

    // ✓ validation engine reports no unexpected errors
    const errors = validation.issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(0);

    // header metadata
    expect(tree.metadata.ftzAnchorId).toBe(826685);
    expect(Object.values(tree.persons).some((p) => p.ftzId === 826685)).toBe(true);
  });

  it("reconstructs relationships correctly for the founding couple", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes);
    const founder = Object.values(tree.persons).find((p) => p.ftzId === 658204)!;
    const rel = getRelationships(tree, founder.id);
    expect(rel.father).toBeUndefined();
    expect(rel.spouses).toHaveLength(1);
    expect(rel.children).toHaveLength(3);
    expect(rel.grandchildren.length).toBeGreaterThan(0);
  });

  it("detects the same cousin-marriage rate found during Milestone 2 validation (31 families)", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes);

    let cousinMarriages = 0;
    for (const family of Object.values(tree.families)) {
      if (!family.husbandId || !family.wifeId) continue;
      const husbandAncestors = ancestorsOf(tree, family.husbandId);
      const wifeAncestors = ancestorsOf(tree, family.wifeId);
      const shared = [...husbandAncestors].some((a) => wifeAncestors.has(a));
      if (shared) cousinMarriages++;
    }
    expect(cousinMarriages).toBe(31);
  });

  it("preserves every original field, including still-unknown columns, via raw passthrough", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes);
    for (const person of Object.values(tree.persons)) {
      expect(person.raw).toHaveLength(29);
    }
    for (const family of Object.values(tree.families)) {
      expect(family.raw).toHaveLength(12);
    }
  });
});
