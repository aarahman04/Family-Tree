import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFtzFile, parseNodeFtt } from "../src/parser/index.js";
import { exportGedcom } from "../src/gedcom/export.js";
import { verifyRoundTrip } from "../src/gedcom/verify.js";
import {
  classifyAllMarriages,
  classifyMarriage,
  parentsRelated,
} from "../src/analysis/marriages.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(
  __dirname,
  "..",
  "Family Tree FTZ",
  "FamilyTree.ftz",
);
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

/** First cousins CousinA(6) × CousinB(8) → Kid(9); plus an unrelated couple DadA(3) × MomA(5). */
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
      personRow({ id: 9, name: "Kid", famc: 40 }),
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

const idByName = (t: ReturnType<typeof tree>, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;
const famOf = (t: ReturnType<typeof tree>, husbandName: string) =>
  Object.values(t.families).find(
    (f) => f.husbandId === idByName(t, husbandName),
  )!.id;

describe("analysis/marriages", () => {
  it("classifies a first-cousin marriage", () => {
    const t = tree();
    const m = classifyMarriage(t, famOf(t, "CousinA"))!;
    expect(m.isCousinMarriage).toBe(true);
    expect(m.sharesCommonAncestor).toBe(true);
    expect(m.relation.label).toBe("First cousins");
  });

  it("classifies an unrelated marriage as not consanguineous", () => {
    const t = tree();
    const m = classifyMarriage(t, famOf(t, "DadA"))!; // DadA × MomA — no shared ancestor
    expect(m.isCousinMarriage).toBe(false);
    expect(m.sharesCommonAncestor).toBe(false);
  });

  it("returns undefined for a family missing a spouse", () => {
    const t = tree();
    // Family 10 has both; fabricate the check via a single-parent scenario instead:
    const single = parseNodeFtt(
      buildNodeFtt(
        [personRow({ id: 1, name: "Solo", gender: 1 })],
        [familyRow({ id: 10, husband: 1 })],
      ),
    ).tree;
    const famId = Object.keys(single.families)[0]!;
    expect(classifyMarriage(single, famId)).toBeUndefined();
  });

  it("detects that a person's parents are first cousins", () => {
    const t = tree();
    const pr = parentsRelated(t, idByName(t, "Kid"))!;
    expect(pr.related).toBe(true);
    expect(pr.relation.label).toBe("First cousins");
  });

  it("returns undefined parentsRelated when a parent is unknown", () => {
    const t = tree();
    expect(parentsRelated(t, idByName(t, "Grandpa"))).toBeUndefined();
  });

  it("classifyAllMarriages includes the cousin marriage and skips single-parent families", () => {
    const t = tree();
    const all = classifyAllMarriages(t);
    expect(all.has(famOf(t, "CousinA"))).toBe(true);
    // Every entry is a real couple:
    for (const m of all.values()) {
      expect(t.families[m.familyId]!.husbandId).toBeTruthy();
      expect(t.families[m.familyId]!.wifeId).toBeTruthy();
    }
  });
});

describe.skipIf(!SAMPLE_EXISTS)(
  "analysis/marriages — golden agreement vs verify.ts (CP2.4)",
  () => {
    it("shares-common-ancestor count matches verify.ts's independent ftzId-based count", async () => {
      const bytes = await readFile(SAMPLE_PATH);
      const { tree: t } = await parseFtzFile(bytes, "FamilyTree.ftz");

      // Oracle: verify.ts's ftzId-based ancestor-set intersection (different keyspace + code path).
      const ged = exportGedcom(t);
      expect(ged.gedcom).toBeTruthy();
      const oracle = verifyRoundTrip(t, ged.gedcom!).cousinMarriageCountSource;

      // Mine: UUID-based analysis module.
      const mine = [...classifyAllMarriages(t).values()].filter(
        (m) => m.sharesCommonAncestor,
      ).length;

      // eslint-disable-next-line no-console
      console.log(
        `[CP2.4] golden agreement — analysis: ${mine}, verify.ts oracle: ${oracle}`,
      );
      expect(mine).toBe(oracle);
    });
  },
);
