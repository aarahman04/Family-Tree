import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFtzFile, parseNodeFtt } from "../src/parser/index.js";
import {
  computeAncestorMap,
  findCommonAncestors,
} from "../src/analysis/ancestry.js";
import {
  classifyPair,
  countIndependentLines,
} from "../src/analysis/classify.js";
import {
  type Confidence,
  ancestryCompleteness,
  classifyConfidence,
} from "../src/analysis/confidence.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(
  __dirname,
  "..",
  "Family Tree FTZ",
  "FamilyTree.ftz",
);
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

/**
 * First-cousin tree with optional dates. `dadABirth` can be omitted to model a missing date on
 * the ancestry path.
 */
function cousinTreeWithDates(opts?: { dadABirth?: number }) {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Grandpa", gender: 1, birthYear: 1900 }),
      personRow({ id: 2, name: "Grandma", gender: 2, birthYear: 1902 }),
      personRow({
        id: 3,
        name: "DadA",
        famc: 10,
        gender: 1,
        birthYear: opts?.dadABirth ?? 1925,
      }),
      personRow({ id: 4, name: "DadB", famc: 10, gender: 1, birthYear: 1927 }),
      personRow({ id: 5, name: "MomA", gender: 2, birthYear: 1926 }),
      personRow({
        id: 6,
        name: "CousinA",
        famc: 20,
        gender: 1,
        birthYear: 1950,
      }),
      personRow({ id: 7, name: "MomB", gender: 2, birthYear: 1928 }),
      personRow({
        id: 8,
        name: "CousinB",
        famc: 30,
        gender: 2,
        birthYear: 1952,
      }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 5 }),
      familyRow({ id: 30, husband: 4, wife: 7 }),
    ],
  );
  return parseNodeFtt(text).tree;
}

/** Two unrelated people; each has grandparents (deep) or not (shallow), controlled by `deep`. */
function unrelatedTree(deep: boolean) {
  const persons = [
    personRow({ id: 1, name: "A", gender: 1, famc: deep ? 10 : 0 }),
    personRow({ id: 2, name: "B", gender: 2, famc: deep ? 20 : 0 }),
  ];
  const families = [];
  if (deep) {
    persons.push(
      personRow({ id: 3, name: "AFa", gender: 1, famc: 30 }),
      personRow({ id: 4, name: "AMo", gender: 2 }),
      personRow({ id: 5, name: "AGpa", gender: 1 }),
      personRow({ id: 6, name: "AGma", gender: 2 }),
      personRow({ id: 7, name: "BFa", gender: 1, famc: 40 }),
      personRow({ id: 8, name: "BMo", gender: 2 }),
      personRow({ id: 9, name: "BGpa", gender: 1 }),
      personRow({ id: 10, name: "BGma", gender: 2 }),
    );
    families.push(
      familyRow({ id: 10, husband: 3, wife: 4 }),
      familyRow({ id: 20, husband: 7, wife: 8 }),
      familyRow({ id: 30, husband: 5, wife: 6 }),
      familyRow({ id: 40, husband: 9, wife: 10 }),
    );
  }
  return parseNodeFtt(buildNodeFtt(persons, families)).tree;
}

const uuidByName = (
  tree: ReturnType<typeof cousinTreeWithDates>,
  name: string,
) => Object.values(tree.persons).find((p) => p.name === name)!.id;

/** Compose the pieces the way marriages.ts will (CP2.4) — a helper for these tests. */
function confidenceOf(
  tree: ReturnType<typeof cousinTreeWithDates>,
  aName: string,
  bName: string,
) {
  const a = uuidByName(tree, aName);
  const b = uuidByName(tree, bName);
  const commons = findCommonAncestors(
    computeAncestorMap(tree, a),
    computeAncestorMap(tree, b),
  );
  const cls = classifyPair(commons, countIndependentLines(tree, commons));
  return classifyConfidence({
    tree,
    personA: a,
    personB: b,
    kind: cls.kind,
    closest: cls.closest,
  });
}

describe("analysis/confidence", () => {
  it("ancestryCompleteness is 1 for a fully-known pedigree and <1 when parents are missing", () => {
    const tree = cousinTreeWithDates();
    const cousinA = uuidByName(tree, "CousinA"); // both parents + both paternal grandparents known
    const grandpa = uuidByName(tree, "Grandpa"); // no recorded parents
    expect(ancestryCompleteness(tree, cousinA, 1)).toBe(1); // both parents known
    expect(ancestryCompleteness(tree, cousinA, 2)).toBeGreaterThan(0);
    expect(ancestryCompleteness(tree, cousinA, 2)).toBeLessThan(1); // maternal grandparents missing
    expect(ancestryCompleteness(tree, grandpa, 1)).toBe(0);
  });

  it("confirmed: related, full ancestry path, consistent dates", () => {
    const r = confidenceOf(cousinTreeWithDates(), "CousinA", "CousinB");
    expect(r.level).toBe<Confidence>("confirmed");
  });

  it("likely: related but a date is missing on the ancestry path", () => {
    const r = confidenceOf(
      cousinTreeWithDates({ dadABirth: 0 /* missing */ }),
      "CousinA",
      "CousinB",
    );
    expect(r.level).toBe<Confidence>("likely");
    expect(r.reasons.join(" ")).toMatch(/date/i);
  });

  it("confirmed (negative): unrelated with deep ancestry on both sides", () => {
    const tree = unrelatedTree(true);
    const r = confidenceOf(tree, "A", "B");
    expect(r.level).toBe<Confidence>("confirmed");
  });

  it("unknown: unrelated with shallow ancestry — cannot rule a link in or out", () => {
    const tree = unrelatedTree(false);
    const r = confidenceOf(tree, "A", "B");
    expect(r.level).toBe<Confidence>("unknown");
  });
});

describe.skipIf(!SAMPLE_EXISTS)(
  "analysis/confidence — real 473-person sample (D-12 evidence)",
  () => {
    it("reports the confirmed/likely/possible/unknown distribution over all couples", async () => {
      const bytes = await readFile(SAMPLE_PATH);
      const { tree } = await parseFtzFile(bytes, "FamilyTree.ftz");
      const maps = new Map<string, ReturnType<typeof computeAncestorMap>>();
      const mapOf = (id: string) => {
        let m = maps.get(id);
        if (!m) {
          m = computeAncestorMap(tree, id);
          maps.set(id, m);
        }
        return m;
      };
      const tally: Record<Confidence, number> = {
        confirmed: 0,
        likely: 0,
        possible: 0,
        unknown: 0,
      };
      let couples = 0;
      let related = 0;
      for (const fam of Object.values(tree.families)) {
        if (!fam.husbandId || !fam.wifeId) continue;
        couples++;
        const commons = findCommonAncestors(
          mapOf(fam.husbandId),
          mapOf(fam.wifeId),
        );
        const cls = classifyPair(commons, countIndependentLines(tree, commons));
        if (
          cls.kind === "cousins" ||
          cls.kind === "siblings" ||
          cls.kind === "avuncular"
        )
          related++;
        const c = classifyConfidence({
          tree,
          personA: fam.husbandId,
          personB: fam.wifeId,
          kind: cls.kind,
          closest: cls.closest,
        });
        tally[c.level]++;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[D-12] real-sample confidence distribution over ${couples} couples ` +
          `(${related} related): ${JSON.stringify(tally)}`,
      );
      expect(
        tally.confirmed + tally.likely + tally.possible + tally.unknown,
      ).toBe(couples);
      expect(related).toBeGreaterThan(0);
    });
  },
);
