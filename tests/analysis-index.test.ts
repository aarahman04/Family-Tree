import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFtzFile, parseNodeFtt } from "../src/parser/index.js";
import { analyzeTree } from "../src/analysis/index.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(
  __dirname,
  "..",
  "Family Tree FTZ",
  "FamilyTree.ftz",
);
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

/** One first-cousin marriage (CousinA×CousinB) and one unrelated marriage (DadA×MomA). */
function tree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Grandpa", gender: 1 }),
      personRow({ id: 2, name: "Grandma", gender: 2 }),
      personRow({ id: 3, name: "DadA", famc: 10, gender: 1 }),
      personRow({ id: 4, name: "DadB", famc: 10, gender: 1 }),
      personRow({ id: 5, name: "MomA", gender: 2 }),
      personRow({ id: 6, name: "CousinA", famc: 20, gender: 1 }),
      personRow({ id: 7, name: "MomB", gender: 2 }),
      personRow({ id: 8, name: "CousinB", famc: 30, gender: 2 }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 5 }),
      familyRow({ id: 30, husband: 4, wife: 7 }),
      familyRow({ id: 40, husband: 6, wife: 8 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

describe("analysis/index — analyzeTree", () => {
  it("aggregates marriages, cousin count, and summary", () => {
    const a = analyzeTree(tree());
    expect(a.summary.totalMarriages).toBe(4);
    expect(a.summary.cousinMarriageCount).toBe(1);
    expect(a.cousinMarriages[0]!.relation.label).toBe("First cousins");
    expect(a.summary.cousinMarriagePercent).toBe(25); // 1 of 4
    expect(a.chains.maxChainDepth).toBe(1);
    const totalByConfidence = Object.values(a.summary.byConfidence).reduce(
      (s, x) => s + x,
      0,
    );
    expect(totalByConfidence).toBe(a.summary.totalMarriages);
    // No pedigree collapse in this fixture (no ancestor is reachable via two different slots).
    expect(a.pedigree.treeScore).toBe(0);
    expect(a.summary.pedigreeCollapsePercent).toBe(0);
    // Grandpa is the primary anchor; CousinA's family is the bridge that creates the overlap.
    expect(a.branches.primaryRootId).toBeDefined();
    expect(a.summary.branchOverlapPercent).toBe(a.branches.overlapPercent);
  });
});

describe.skipIf(!SAMPLE_EXISTS)(
  "analysis/index — D-6 benchmark (real 473-person sample)",
  () => {
    it("reports analyzeTree() wall-clock to decide sync-vs-worker", async () => {
      const bytes = await readFile(SAMPLE_PATH);
      const { tree: t } = await parseFtzFile(bytes, "FamilyTree.ftz");
      // Warm once (JIT / lazy structures), then take the median of several runs.
      analyzeTree(t);
      const runs = 7;
      const times: number[] = [];
      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        const a = analyzeTree(t);
        times.push(performance.now() - start);
        expect(a.summary.totalMarriages).toBeGreaterThan(0);
      }
      times.sort((x, y) => x - y);
      const median = times[Math.floor(runs / 2)]!;
      // eslint-disable-next-line no-console
      console.log(
        `[D-6] analyzeTree() on 473-person sample: median ${median.toFixed(2)}ms over ${runs} runs ` +
          `(min ${times[0]!.toFixed(2)}ms, max ${times[runs - 1]!.toFixed(2)}ms)`,
      );
      // Generous guard against accidental algorithmic blow-up (not a tight perf assertion).
      expect(median).toBeLessThan(2000);
    });
  },
);
