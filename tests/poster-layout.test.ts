import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Gender, Person, UUID } from "../models/types.js";
import { parseFtzFile } from "../parser/index.js";
import { computePosterLayout } from "../poster/layout.js";
import type { PosterLayout } from "../poster/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "Family Tree FTZ", "FamilyTree.ftz");
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

interface PersonOpts {
  id: UUID;
  name?: string;
  gender?: Gender;
  famcId?: UUID;
  birthYear?: number;
  deathYear?: number;
}

function person(opts: PersonOpts): Person {
  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    gender: opts.gender ?? "unknown",
    notes: [],
    media: [],
    famcId: opts.famcId,
    famsIds: [],
    birth: opts.birthYear ? { id: `${opts.id}-b`, type: "birth", date: { year: opts.birthYear } } : undefined,
    death: opts.deathYear ? { id: `${opts.id}-d`, type: "death", date: { year: opts.deathYear } } : undefined,
  };
}

function family(id: UUID, husbandId?: UUID, wifeId?: UUID, childrenIds: UUID[] = []): Family {
  return { id, husbandId, wifeId, childrenIds };
}

/** Wires famsIds up from the families list, mirroring what the real parser/editor guarantee
 * always holds (see docs/data-model.md) -- kept separate so test fixtures can declare
 * families by husband/wife/children only. */
function buildTree(persons: Person[], families: Family[]): FamilyTree {
  const personMap: Record<UUID, Person> = {};
  for (const p of persons) personMap[p.id] = { ...p, famsIds: [] };
  const familyMap: Record<UUID, Family> = {};
  for (const f of families) {
    familyMap[f.id] = f;
    for (const spouseId of [f.husbandId, f.wifeId]) {
      if (spouseId && personMap[spouseId]) personMap[spouseId]!.famsIds.push(f.id);
    }
  }
  return {
    metadata: { sourceFormat: "manual", importedAt: new Date(0).toISOString() },
    persons: personMap,
    families: familyMap,
    validation: { validatedAt: new Date(0).toISOString(), issues: [], isValid: true },
  };
}

function nodeIds(layout: PosterLayout): string[] {
  return layout.nodes.map((n) => n.personId);
}

function expectNoDuplicates(layout: PosterLayout, expectedCount: number) {
  const ids = nodeIds(layout);
  expect(ids).toHaveLength(expectedCount);
  expect(new Set(ids).size).toBe(expectedCount);
}

/** Every non-root node must be reachable via at least one connector (descent, marriage, or
 * cross-branch) -- i.e. no person renders as a floating, disconnected box. */
function expectNoDisconnectedBranches(layout: PosterLayout) {
  const referenced = new Set<UUID>();
  for (const c of layout.connectors) {
    if (c.kind === "marriage") c.personIds.forEach((id) => referenced.add(id));
    else if (c.kind === "cross-branch") {
      referenced.add(c.fromPersonId);
      referenced.add(c.toMarriageAnchorId);
    } else {
      c.parentPersonIds.forEach((id) => referenced.add(id));
      c.childPersonIds.forEach((id) => referenced.add(id));
    }
  }
  const roots = new Set(
    layout.nodes.filter((n) => n.generation === 0 && !referenced.has(n.personId)).map((n) => n.personId)
  );
  for (const node of layout.nodes) {
    if (roots.has(node.personId)) continue;
    expect(referenced.has(node.personId)).toBe(true);
  }
}

describe("computePosterLayout", () => {
  it("lays out a single family: parents on one row, children directly below", () => {
    const tree = buildTree(
      [
        person({ id: "dad", gender: "male" }),
        person({ id: "mom", gender: "female" }),
        person({ id: "kid1", famcId: "fam1" }),
        person({ id: "kid2", famcId: "fam1" }),
      ],
      [family("fam1", "dad", "mom", ["kid1", "kid2"])]
    );

    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 4);
    expectNoDisconnectedBranches(layout);

    const byId = Object.fromEntries(layout.nodes.map((n) => [n.personId, n]));
    expect(byId.dad!.generation).toBe(0);
    expect(byId.mom!.generation).toBe(0);
    expect(byId.kid1!.generation).toBe(1);
    expect(byId.kid2!.generation).toBe(1);

    const marriage = layout.connectors.find((c) => c.kind === "marriage");
    expect(marriage).toBeDefined();

    const descent = layout.connectors.find((c) => c.kind === "descent");
    expect(descent).toBeDefined();
    if (descent?.kind === "descent") {
      expect(descent.childPersonIds.sort()).toEqual(["kid1", "kid2"]);
    }
  });

  it("spans three generations with correct row assignment", () => {
    const tree = buildTree(
      [
        person({ id: "gpa" }),
        person({ id: "gma" }),
        person({ id: "parent", famcId: "f1" }),
        person({ id: "inlaw" }),
        person({ id: "child", famcId: "f2" }),
      ],
      [family("f1", "gpa", "gma", ["parent"]), family("f2", "parent", "inlaw", ["child"])]
    );

    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 5);
    const byId = Object.fromEntries(layout.nodes.map((n) => [n.personId, n]));
    expect(byId.gpa!.generation).toBe(0);
    expect(byId.parent!.generation).toBe(1);
    expect(byId.inlaw!.generation).toBe(1); // married-in spouse inherits their partner's row
    expect(byId.child!.generation).toBe(2);
    expect(layout.generationCount).toBe(3);
  });

  it("keeps a wide sibling group on one row with a single shared descent branch", () => {
    const kids = Array.from({ length: 8 }, (_, i) => `kid${i}`);
    const tree = buildTree(
      [person({ id: "dad" }), person({ id: "mom" }), ...kids.map((id) => person({ id, famcId: "fam1" }))],
      [family("fam1", "dad", "mom", kids)]
    );

    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 10);
    const descentConnectors = layout.connectors.filter((c) => c.kind === "descent");
    // One shared branch for the whole sibling group, never one line per child.
    expect(descentConnectors).toHaveLength(1);
    expect(descentConnectors[0]!.kind === "descent" && descentConnectors[0]!.childPersonIds).toHaveLength(8);
    for (const kid of kids) {
      expect(layout.nodes.find((n) => n.personId === kid)?.generation).toBe(1);
    }
  });

  it("handles deep ancestry (6 generations) without generation drift", () => {
    const persons: Person[] = [person({ id: "gen0" })];
    const families: Family[] = [];
    for (let g = 1; g < 6; g++) {
      persons.push(person({ id: `gen${g}`, famcId: `f${g}` }));
      families.push(family(`f${g}`, `gen${g - 1}`, undefined, [`gen${g}`]));
    }
    const tree = buildTree(persons, families);
    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 6);
    expect(layout.generationCount).toBe(6);
    for (let g = 0; g < 6; g++) {
      expect(layout.nodes.find((n) => n.personId === `gen${g}`)?.generation).toBe(g);
    }
  });

  it("renders a cousin marriage without duplicating either spouse", () => {
    // Shared ancestor couple -> two children -> each has a child (cousins) -> cousins marry.
    const tree = buildTree(
      [
        person({ id: "ancestorM", gender: "male" }),
        person({ id: "ancestorF", gender: "female" }),
        person({ id: "branchA", famcId: "fRoot" }),
        person({ id: "branchB", famcId: "fRoot" }),
        person({ id: "cousinA", famcId: "fA" }),
        person({ id: "cousinB", famcId: "fB" }),
      ],
      [
        family("fRoot", "ancestorM", "ancestorF", ["branchA", "branchB"]),
        family("fA", "branchA", undefined, ["cousinA"]),
        family("fB", "branchB", undefined, ["cousinB"]),
        family("fMarriage", "cousinA", "cousinB", []),
      ]
    );

    const layout = computePosterLayout(tree);
    // Every person appears exactly once, including both cousins.
    expectNoDuplicates(layout, 6);
    expectNoDisconnectedBranches(layout);

    const crossBranch = layout.connectors.filter((c) => c.kind === "cross-branch");
    expect(crossBranch).toHaveLength(1);
    if (crossBranch[0]?.kind === "cross-branch") {
      // cousinA is the husband -> anchor; cousinB keeps her own canonical position under
      // her own parents and gets a cross-branch connector back to the marriage point.
      expect(crossBranch[0].fromPersonId).toBe("cousinB");
      expect(crossBranch[0].toMarriageAnchorId).toBe("cousinA");
    }

    // Both cousins still sit at their own blood-parent-derived generation (same row here).
    const byId = Object.fromEntries(layout.nodes.map((n) => [n.personId, n]));
    expect(byId.cousinA!.generation).toBe(2);
    expect(byId.cousinB!.generation).toBe(2);
  });

  it("handles multiple cousin marriages sharing the same ancestor without duplication", () => {
    const tree = buildTree(
      [
        person({ id: "root" }),
        person({ id: "b1", famcId: "fRoot" }),
        person({ id: "b2", famcId: "fRoot" }),
        person({ id: "b3", famcId: "fRoot" }),
        person({ id: "c1", famcId: "f1" }),
        person({ id: "c2", famcId: "f2" }),
        person({ id: "c3", famcId: "f3" }),
      ],
      [
        family("fRoot", "root", undefined, ["b1", "b2", "b3"]),
        family("f1", "b1", undefined, ["c1"]),
        family("f2", "b2", undefined, ["c2"]),
        family("f3", "b3", undefined, ["c3"]),
        family("m1", "c1", "c2", []),
        family("m2", "c2", "c3", []),
      ]
    );

    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 7);
    const crossBranch = layout.connectors.filter((c) => c.kind === "cross-branch");
    // c2 is shared across two marriages: one where c2 is anchor's spouse (cross-branch out),
    // and appears only once as a node regardless.
    expect(crossBranch.length).toBeGreaterThanOrEqual(1);
    expect(layout.nodes.filter((n) => n.personId === "c2")).toHaveLength(1);
  });

  it("never drops a person, even from a family record missing both parents", () => {
    // Corrupted-data edge case: a family with no husbandId/wifeId (so nothing anchors it)
    // that a child still references via famcId -- must still render, not vanish.
    const tree = buildTree(
      [person({ id: "orphan", famcId: "ghostFam" }), person({ id: "normal" })],
      [family("ghostFam", undefined, undefined, ["orphan"])]
    );
    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 2);
    expect(layout.nodes.some((n) => n.personId === "orphan")).toBe(true);
  });

  it("scales to a large synthetic tree without exponential blowup", () => {
    // Perfect binary-branching genealogy: 1 root couple, each person has 2 children, to a
    // depth that yields > 5,000 people -- and one cousin marriage stitched in for realism.
    const persons: Person[] = [];
    const families: Family[] = [];
    let counter = 0;
    function nextId() {
      return `p${counter++}`;
    }

    function buildBranch(depth: number, famcId: string | undefined): string {
      const id = nextId();
      persons.push(person({ id, famcId }));
      if (depth === 0) return id;
      const spouseId = nextId();
      persons.push(person({ id: spouseId }));
      const famId = `f${id}`;
      const child1 = buildBranch(depth - 1, famId);
      const child2 = buildBranch(depth - 1, famId);
      families.push(family(famId, id, spouseId, [child1, child2]));
      return id;
    }

    buildBranch(12, undefined); // 2^13 - 1 ≈ 8191 people, well over the 5,000-person target

    const tree = buildTree(persons, families);
    expect(Object.keys(tree.persons).length).toBeGreaterThan(5000);

    const start = performance.now();
    const layout = computePosterLayout(tree);
    const elapsedMs = performance.now() - start;

    expectNoDuplicates(layout, Object.keys(tree.persons).length);
    expect(layout.generationCount).toBe(13);
    // Generous bound: catches accidental exponential behavior (which would take seconds to
    // minutes at this size) without being a flaky micro-benchmark.
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe.skipIf(!SAMPLE_EXISTS)("computePosterLayout against the real FTZ sample", () => {
  it("lays out all 473 people exactly once, with every relationship represented", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes, "FamilyTree.ftz");

    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, Object.keys(tree.persons).length);
    expectNoDisconnectedBranches(layout);

    // Every family with a recorded marriage produces either a marriage connector (both
    // spouses rendered adjacent) or a cross-branch connector (cousin marriage) -- never
    // neither, whenever both spouses are known.
    for (const fam of Object.values(tree.families)) {
      if (!fam.husbandId || !fam.wifeId) continue;
      const hasMarriage = layout.connectors.some(
        (c) => c.kind === "marriage" && c.personIds.includes(fam.husbandId!) && c.personIds.includes(fam.wifeId!)
      );
      const hasCrossBranch = layout.connectors.some(
        (c) =>
          c.kind === "cross-branch" &&
          ((c.fromPersonId === fam.husbandId && c.toMarriageAnchorId === fam.wifeId) ||
            (c.fromPersonId === fam.wifeId && c.toMarriageAnchorId === fam.husbandId))
      );
      expect(hasMarriage || hasCrossBranch).toBe(true);
    }
  });
});
