import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFtzFile } from "../src/parser/index.js";
import { analyzeTree } from "../src/analysis/index.js";
import { analyzeTimeline } from "../src/analysis/timeline.js";
import { isPresumedLiving } from "../src/models/living.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(__dirname, "..", "Family Tree FTZ", "FamilyTree.ftz");

/**
 * Evidence + regression guard against the real 473-person tree, in the spirit of the D-12 and
 * CP2.6 reports: the numbers are printed so a reader can see what the analysis actually says
 * about real data, and the load-bearing ones are asserted so they cannot drift silently.
 * skipIf-gated — the sample is gitignored personal data and absent from CI.
 */
describe.skipIf(!existsSync(SAMPLE))("real 473-person sample — evidence", () => {
  it("reports the analysis and holds its known invariants", async () => {
    const bytes = await readFile(SAMPLE);
    const { tree } = await parseFtzFile(new Uint8Array(bytes).buffer as ArrayBuffer);
    const NOW = 2026;
    const t = analyzeTimeline(tree, NOW);
    const a = analyzeTree(tree, NOW);
    const people = Object.values(tree.persons);
    const living = people.filter((p) =>
      isPresumedLiving(p, NOW, t.birthYears.get(p.id)?.year)
    ).length;
    const estimatedOnly = people.filter(
      (p) => p.birth?.date?.year === undefined && t.birthYears.has(p.id)
    ).length;
    const unreachable = people.length - t.birthYears.size;

    console.log(`
=== REAL TREE EVIDENCE (now=${NOW}) ===
people                     ${people.length}
families                   ${Object.keys(tree.families).length}
generations                ${a.branches.branches.length} branches

-- timeline --
median generation gap      ${t.generationGap} years  (from ${t.gapSampleSize} parent-child pairs)
gap was assumed?           ${t.gapIsFallback}
recorded birth years       ${t.recordedBirthCount} / ${t.totalPeople}
estimated birth years      ${estimatedOnly}
no date reachable at all   ${unreachable}
earliest birth (est.)      ${t.earliestBirthYear}  range ${t.earliestBirthRange?.from}-${t.earliestBirthRange?.to}
tree reaches back          ${t.treeAgeYears} years  range ${t.treeAgeRange?.min}-${t.treeAgeRange?.max}
confidence                 ${t.confidence}

-- living/deceased @ cap 100 --
presumed living            ${living}
presumed deceased          ${people.length - living}

-- cousin marriage breakdown --
by degree                  ${JSON.stringify(a.cousinBreakdown.byDegree)}
once-removed or more       ${a.cousinBreakdown.onceRemoved}
multi-generation chains    ${a.cousinBreakdown.multiGenerationChains}
branches repeating         ${a.cousinBreakdown.branchesWithRepeats}
pattern spans              ${a.cousinBreakdown.generationsSpanned} generations
deepest chain              ${a.cousinBreakdown.deepestChain}

-- relationships --
total marriages            ${a.summary.totalMarriages}
cousin marriages           ${a.summary.cousinMarriageCount} (${a.summary.cousinMarriagePercent}%)
consanguineous             ${a.summary.consanguineousCount}
max cousin-marriage chain  ${a.summary.maxChainDepth} generations
confidence distribution    ${JSON.stringify(a.summary.byConfidence)}
pedigree collapse          ${a.summary.pedigreeCollapsePercent}%
completeness               ${a.summary.completenessPercent}%
incomplete records         ${a.summary.incompleteRecordCount}
duplicate suspects         ${a.summary.duplicateSuspectCount}
isolated records           ${a.summary.isolatedRecordCount}
`);

    // --- invariants, so these cannot drift unnoticed ---
    // Golden agreement established at CP2.4 against verify.ts's independent ftzId-based count.
    expect(a.summary.cousinMarriageCount).toBe(31);
    expect(a.summary.totalMarriages).toBe(136);
    expect(people.length).toBe(473);
    // The tree is almost entirely undated, which is what a real genealogy file looks like. The
    // timeline must therefore report LOW confidence and an ASSUMED gap rather than flattering
    // itself with a median taken over 3 parent-child pairs.
    expect(t.recordedBirthCount).toBeLessThan(people.length * 0.05);
    expect(t.gapIsFallback).toBe(true);
    expect(t.confidence).toBe("low");
    // Every person still gets an estimated birth year, so nobody is unclassifiable.
    expect(unreachable).toBe(0);
    // The chain depth the user cares about is real, not a rounding artefact.
    expect(a.summary.maxChainDepth).toBeGreaterThanOrEqual(3);
  });
});
