import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { parseFtzFile } from "../parser/index.js";
import { computePosterLayout } from "../poster/layout.js";
import { computeStackedPosterLayout } from "../poster/layoutStacked.js";
import { computePosterPageSize } from "../poster/pageSize.js";
import { DEFAULT_POSTER_STYLE, type PosterLayout } from "../poster/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "Family Tree FTZ", "FamilyTree.ftz");
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

function person(id: UUID, name = id, famcId?: UUID): Person {
  return { id, name, gender: "unknown", notes: [], media: [], famcId, famsIds: [] };
}
function family(id: UUID, husbandId?: UUID, wifeId?: UUID, childrenIds: UUID[] = []): Family {
  return { id, husbandId, wifeId, childrenIds };
}
function buildTree(persons: Person[], families: Family[]): FamilyTree {
  const personMap: Record<UUID, Person> = {};
  for (const p of persons) personMap[p.id] = { ...p, famsIds: [] };
  const familyMap: Record<UUID, Family> = {};
  for (const f of families) {
    familyMap[f.id] = f;
    for (const spouseId of [f.husbandId, f.wifeId]) if (spouseId && personMap[spouseId]) personMap[spouseId]!.famsIds.push(f.id);
  }
  return {
    metadata: { sourceFormat: "manual", importedAt: new Date(0).toISOString() },
    persons: personMap,
    families: familyMap,
    validation: { validatedAt: new Date(0).toISOString(), issues: [], isValid: true },
  };
}

function expectNoOverlaps(layout: PosterLayout) {
  const boxes = [
    ...layout.nodes.map((n) => ({ l: n.x - n.width / 2, r: n.x + n.width / 2, t: n.y - n.height / 2, b: n.y + n.height / 2, id: n.personId })),
    ...layout.chips.map((c) => ({ l: c.x - c.width / 2, r: c.x + c.width / 2, t: c.y - c.height / 2, b: c.y + c.height / 2, id: `chip:${c.familyId}` })),
  ];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) throw new Error(`overlap ${a.id} / ${b.id}`);
    }
  }
}

/** Root with three children, each heading a sizable sub-branch -- the shape stacking exists
 * to improve (one wide row vs three stacked bands). */
function threeBranchTree(): FamilyTree {
  const persons: Person[] = [person("R", "Root")];
  const families: Family[] = [];
  const kids: UUID[] = [];
  for (const b of ["A", "B", "C"]) {
    const head = `${b}0`;
    persons.push(person(head, `Head ${b}`, "fRoot"));
    kids.push(head);
    const grand: UUID[] = [];
    for (let i = 0; i < 5; i++) {
      const g = `${b}${i + 1}`;
      persons.push(person(g, `Kid ${b}${i + 1}`, `f${b}`));
      grand.push(g);
    }
    families.push(family(`f${b}`, head, undefined, grand));
  }
  families.unshift(family("fRoot", "R", undefined, kids));
  return buildTree(persons, families);
}

describe("computeStackedPosterLayout", () => {
  it("stacks the root's branches into bands: every person once, no overlaps, and a spine", () => {
    const tree = threeBranchTree();
    const flat = computePosterLayout(tree);
    const stacked = computeStackedPosterLayout(tree);

    // Same people, each exactly once.
    expect(stacked.nodes).toHaveLength(flat.nodes.length);
    expect(new Set(stacked.nodes.map((n) => n.personId)).size).toBe(flat.nodes.length);
    expectNoOverlaps(stacked);

    // A single spine from the root down to its three branch heads.
    const spine = stacked.connectors.find((c) => c.kind === "spine");
    expect(spine).toBeDefined();
    if (spine?.kind === "spine") {
      expect(spine.fromPersonId).toBe("R");
      expect([...spine.toPersonIds].sort()).toEqual(["A0", "B0", "C0"]);
    }

    // Much more balanced than the flat strip: stacking trades width for height.
    expect(stacked.contentWidth).toBeLessThan(flat.contentWidth);
    expect(stacked.contentHeight).toBeGreaterThan(flat.contentHeight);
  });

  it("places each branch head at the top-left of its band, right next to the spine", () => {
    const tree = threeBranchTree();
    const stacked = computeStackedPosterLayout(tree);
    const spine = stacked.connectors.find((c) => c.kind === "spine");
    if (spine?.kind !== "spine") throw new Error("no spine");
    const byId = new Map(stacked.nodes.map((n) => [n.personId, n]));
    for (const headId of spine.toPersonIds) {
      const head = byId.get(headId)!;
      // Its left edge is close to the spine -> the connector stub is short, never poster-wide.
      expect(head.x - head.width / 2 - spine.spineX).toBeLessThan(80);
    }
    // The three heads sit at increasing depth (stacked bands), not on one row.
    const ys = spine.toPersonIds.map((id) => byId.get(id)!.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(50);
    expect(ys[2]! - ys[1]!).toBeGreaterThan(50);
  });

  it("degrades to the flat layout when there is nothing to stack (single lineage head)", () => {
    const tree = buildTree([person("solo")], []);
    const stacked = computeStackedPosterLayout(tree);
    expect(stacked.connectors.some((c) => c.kind === "spine")).toBe(false);
    expect(stacked.nodes).toHaveLength(1);
  });

  describe.skipIf(!SAMPLE_EXISTS)("against the real FTZ sample", () => {
    it("lays out all 473 people exactly once, no overlaps, and a much better aspect ratio", async () => {
      const { tree } = await parseFtzFile(await readFile(SAMPLE_PATH), "FamilyTree.ftz");
      const flat = computePosterLayout(tree);
      const stacked = computeStackedPosterLayout(tree);

      expect(stacked.nodes).toHaveLength(Object.keys(tree.persons).length);
      expect(new Set(stacked.nodes.map((n) => n.personId)).size).toBe(Object.keys(tree.persons).length);
      expectNoOverlaps(stacked);

      const flatPage = computePosterPageSize(flat, DEFAULT_POSTER_STYLE);
      const stackedPage = computePosterPageSize(stacked, DEFAULT_POSTER_STYLE);
      const flatRatio = flatPage.widthPt / flatPage.heightPt;
      const stackedRatio = stackedPage.widthPt / stackedPage.heightPt;
      expect(stackedRatio).toBeLessThan(flatRatio / 3); // dramatically less extreme

      // Cousin marriages still resolve to chips (reciprocal on both sides), never lost.
      expect(stacked.chips.length).toBeGreaterThan(0);
    });
  });
});
