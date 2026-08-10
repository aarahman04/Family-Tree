import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { parseFtzFile } from "../parser/index.js";
import { computePosterLayout } from "../poster/layout.js";
import { computeBalancedPosterLayout } from "../poster/layoutBalanced.js";
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
      if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) throw new Error(`overlap ${a.id} / ${b.id}`);
    }
  }
}

/** Root with three sizable branches -- the shape recursive balancing exists to compress. */
function threeBranchTree(): FamilyTree {
  const persons: Person[] = [person("R", "Root")];
  const families: Family[] = [];
  const kids: UUID[] = [];
  for (const b of ["A", "B", "C"]) {
    const head = `${b}0`;
    persons.push(person(head, `Head ${b}`, "fRoot"));
    kids.push(head);
    const grand: UUID[] = [];
    for (let i = 0; i < 6; i++) {
      const g = `${b}${i + 1}`;
      persons.push(person(g, `Kid ${b}${i + 1}`, `f${b}`));
      grand.push(g);
    }
    families.push(family(`f${b}`, head, undefined, grand));
  }
  families.unshift(family("fRoot", "R", undefined, kids));
  return buildTree(persons, families);
}

describe("computeBalancedPosterLayout", () => {
  it("keeps every person exactly once with no overlaps, and no duplicated children", () => {
    const tree = threeBranchTree();
    const flat = computePosterLayout(tree);
    const bal = computeBalancedPosterLayout(tree);

    expect(bal.nodes).toHaveLength(flat.nodes.length);
    expect(new Set(bal.nodes.map((n) => n.personId)).size).toBe(flat.nodes.length);
    expectNoOverlaps(bal);

    const childCount = new Map<string, number>();
    for (const c of bal.connectors) if (c.kind === "descent") for (const ch of c.childPersonIds) childCount.set(ch, (childCount.get(ch) ?? 0) + 1);
    for (const [, n] of childCount) expect(n).toBe(1);
  });

  it("anchors the root couple at the top and fans branches out from it via a spine", () => {
    const tree = threeBranchTree();
    const bal = computeBalancedPosterLayout(tree);
    const byId = new Map(bal.nodes.map((n) => [n.personId, n]));
    const root = byId.get("R")!;
    // Root is at (or very near) the top of the poster.
    const minY = Math.min(...bal.nodes.map((n) => n.y - n.height / 2));
    expect(root.y - root.height / 2 - minY).toBeLessThan(root.height * 1.5);
    // Its branches descend from a spine rooted at R.
    const spine = bal.connectors.find((c) => c.kind === "spine" && c.fromPersonId === "R");
    expect(spine).toBeDefined();
    if (spine?.kind === "spine") expect([...spine.toPersonIds].sort()).toEqual(["A0", "B0", "C0"]);
  });

  it("degrades to a plain layout when there is nothing to balance", () => {
    const tree = buildTree([person("solo")], []);
    const bal = computeBalancedPosterLayout(tree);
    expect(bal.nodes).toHaveLength(1);
    expect(bal.connectors.some((c) => c.kind === "spine")).toBe(false);
  });

  describe.skipIf(!SAMPLE_EXISTS)("against the real FTZ sample", () => {
    it("balances 473 people into a hangable poster: every person once, no overlaps, aspect ratio << flat", async () => {
      const { tree } = await parseFtzFile(await readFile(SAMPLE_PATH), "FamilyTree.ftz");
      const flat = computePosterLayout(tree);
      const bal = computeBalancedPosterLayout(tree);
      const total = Object.keys(tree.persons).length;

      expect(bal.nodes).toHaveLength(total);
      expect(new Set(bal.nodes.map((n) => n.personId)).size).toBe(total);
      expectNoOverlaps(bal);

      // No child is drawn twice; no empty node or chip label.
      const childCount = new Map<string, number>();
      for (const c of bal.connectors) if (c.kind === "descent") for (const ch of c.childPersonIds) childCount.set(ch, (childCount.get(ch) ?? 0) + 1);
      for (const [, n] of childCount) expect(n).toBe(1);
      for (const node of bal.nodes) expect(node.name.trim().length).toBeGreaterThan(0);
      for (const chip of bal.chips) expect(chip.lines.join("").replace(/⚭/g, "").trim().length).toBeGreaterThan(0);

      // Reciprocal cousin chips preserved (two per cousin marriage).
      expect(bal.chips.length).toBeGreaterThan(0);

      const flatPage = computePosterPageSize(flat, DEFAULT_POSTER_STYLE);
      const balPage = computePosterPageSize(bal, DEFAULT_POSTER_STYLE);
      const flatRatio = flatPage.widthPt / flatPage.heightPt;
      const balRatio = balPage.widthPt / balPage.heightPt;
      // Dramatically less extreme -- flat is ~65:1, balanced should be a small single digit.
      expect(balRatio).toBeLessThan(flatRatio / 6);
      expect(balRatio).toBeLessThan(4);
    });
  });
});
