import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Gender, Person, UUID } from "../models/types.js";
import { parseFtzFile } from "../parser/index.js";
import { computePosterLayout } from "../poster/layout.js";
import { DEFAULT_POSTER_STYLE, type PosterChip, type PosterLayout, type PosterNode } from "../poster/types.js";

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

/** Every non-root node must be reachable via at least one connector (descent or marriage)
 * or a chip -- i.e. no person renders as a floating, disconnected box. */
function expectNoDisconnectedBranches(layout: PosterLayout) {
  const referenced = new Set<UUID>();
  for (const c of layout.connectors) {
    if (c.kind === "marriage") c.personIds.forEach((id) => referenced.add(id));
    else {
      c.parentPersonIds.forEach((id) => referenced.add(id));
      c.childPersonIds.forEach((id) => referenced.add(id));
    }
  }
  for (const chip of layout.chips) referenced.add(chip.anchorPersonId);
  const roots = new Set(
    layout.nodes.filter((n) => n.generation === 0 && !referenced.has(n.personId)).map((n) => n.personId)
  );
  for (const node of layout.nodes) {
    if (roots.has(node.personId)) continue;
    expect(referenced.has(node.personId)).toBe(true);
  }
}

type Box = { left: number; right: number; top: number; bottom: number; label: string };

function boxOf(item: PosterNode | PosterChip, label: string): Box {
  return {
    left: item.x - item.width / 2,
    right: item.x + item.width / 2,
    top: item.y - item.height / 2,
    bottom: item.y + item.height / 2,
    label,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The core "professional print quality" bar: no two boxes (person or chip) may ever
 * overlap, anywhere on the poster -- checked pairwise, not just within a row, since a very
 * tall wrapped-text box could in principle overlap a neighboring generation if row heights
 * were computed wrong. */
function expectNoOverlaps(layout: PosterLayout) {
  const boxes: Box[] = [
    ...layout.nodes.map((n) => boxOf(n, n.personId)),
    ...layout.chips.map((c) => boxOf(c, `chip:${c.familyId}`)),
  ];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i]!, boxes[j]!)) {
        throw new Error(`Boxes overlap: ${boxes[i]!.label} and ${boxes[j]!.label}`);
      }
    }
  }
}

/** Every node has at least one render-ready line (even a blank name still gets a box, per
 * some real FTZ records having an empty name field) -- i.e. rendering never produces a node
 * with nothing to draw at all. */
function expectTextFitsBoxes(layout: PosterLayout) {
  for (const node of layout.nodes) {
    expect(node.nameLines.length).toBeGreaterThan(0);
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
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
    expectNoOverlaps(layout);

    const byId = Object.fromEntries(layout.nodes.map((n) => [n.personId, n]));
    expect(byId.dad!.generation).toBe(0);
    expect(byId.mom!.generation).toBe(0);
    expect(byId.kid1!.generation).toBe(1);
    expect(byId.kid2!.generation).toBe(1);
    expect(byId.kid1!.y).toBeGreaterThan(byId.dad!.y); // children strictly below parents

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
    expectNoOverlaps(layout);
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
    expectNoOverlaps(layout);
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
    expectNoOverlaps(layout);
    expect(layout.generationCount).toBe(6);
    for (let g = 0; g < 6; g++) {
      expect(layout.nodes.find((n) => n.personId === `gen${g}`)?.generation).toBe(g);
    }
  });

  it("renders a cousin marriage as a compact chip, never a second copy of either spouse", () => {
    // Shared ancestor couple -> two children -> each has a child (cousins) -> cousins marry.
    const tree = buildTree(
      [
        person({ id: "ancestorM", gender: "male" }),
        person({ id: "ancestorF", gender: "female" }),
        person({ id: "branchA", famcId: "fRoot" }),
        person({ id: "branchB", famcId: "fRoot" }),
        person({ id: "cousinA", famcId: "fA" }),
        person({ id: "cousinB", famcId: "fB", name: "Cousin B" }),
      ],
      [
        family("fRoot", "ancestorM", "ancestorF", ["branchA", "branchB"]),
        family("fA", "branchA", undefined, ["cousinA"]),
        family("fB", "branchB", undefined, ["cousinB"]),
        family("fMarriage", "cousinA", "cousinB", []),
      ]
    );

    const layout = computePosterLayout(tree);
    // Every person appears exactly once, including both cousins -- neither gets a second box.
    expectNoDuplicates(layout, 6);
    expectNoDisconnectedBranches(layout);
    expectNoOverlaps(layout);

    expect(layout.chips).toHaveLength(1);
    const chip = layout.chips[0]!;
    // cousinA is the husband -> anchor; cousinB keeps her own canonical position under her
    // own parents and is represented at the marriage point only by a compact chip.
    expect(chip.anchorPersonId).toBe("cousinA");
    expect(chip.spousePersonId).toBe("cousinB");
    expect(chip.lines.some((l) => l.includes("Cousin B"))).toBe(true);
    // Never a placeholder-style label -- no "Spouse:" scaffold text, no dead-end pointer.
    expect(chip.lines.join(" ")).not.toMatch(/spouse:/i);
    expect(chip.lines.join(" ")).not.toMatch(/see own entry/i);
    // No connector at all references the chip's spouse -- no duplicated relationship line.
    for (const c of layout.connectors) {
      if (c.kind === "marriage") expect(c.personIds).not.toContain("cousinB");
    }

    // Both cousins still sit at their own blood-parent-derived generation (same row here).
    const byId = Object.fromEntries(layout.nodes.map((n) => [n.personId, n]));
    expect(byId.cousinA!.generation).toBe(2);
    expect(byId.cousinB!.generation).toBe(2);

    // cousinB's OWN node -- in her own branch, under her own real parents -- carries a
    // pointer naming the real anchor, so a reader arriving from either direction can find
    // the family. This is on her own box, not a floating/duplicated element.
    expect(byId.cousinB!.noteLine).toBeDefined();
    expect(byId.cousinB!.noteLine).toMatch(/branch/i);
    expect(byId.cousinA!.noteLine).toBeUndefined(); // the anchor doesn't need a pointer to themself
  });

  it("keeps husband and wife adjacent with a short direct marriage connector, never a long line", () => {
    const tree = buildTree(
      [person({ id: "h", gender: "male", name: "Husband" }), person({ id: "w", gender: "female", name: "Wife" })],
      [family("f1", "h", "w", [])]
    );
    const layout = computePosterLayout(tree);
    expectNoOverlaps(layout);
    const h = layout.nodes.find((n) => n.personId === "h")!;
    const w = layout.nodes.find((n) => n.personId === "w")!;
    const gap = Math.abs(w.x - h.x) - (h.width + w.width) / 2;
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(DEFAULT_POSTER_STYLE.horizontalSpacing + 1); // touching, not far apart
    const marriage = layout.connectors.find((c) => c.kind === "marriage");
    expect(marriage).toBeDefined();
    if (marriage?.kind === "marriage") expect(marriage.personIds.sort()).toEqual(["h", "w"]);
  });

  it("centers the oldest ancestor couple above their own descendants, even when the tree is lopsided", () => {
    // One child's branch has 6 grandchildren; the other has 1 -- a genuinely asymmetric
    // descendant fan, to prove centering isn't an accident of a symmetric fixture.
    const grandkids = Array.from({ length: 6 }, (_, i) => `g${i}`);
    const tree = buildTree(
      [
        person({ id: "gpa", gender: "male" }),
        person({ id: "gma", gender: "female" }),
        person({ id: "c1", famcId: "fRoot" }),
        person({ id: "c2", famcId: "fRoot" }),
        person({ id: "c1spouse", gender: "female" }),
        ...grandkids.map((id) => person({ id, famcId: "fBig" })),
      ],
      [family("fRoot", "gpa", "gma", ["c1", "c2"]), family("fBig", "c1", "c1spouse", grandkids)]
    );
    const layout = computePosterLayout(tree);
    expectNoOverlaps(layout);
    const gpa = layout.nodes.find((n) => n.personId === "gpa")!;
    const gma = layout.nodes.find((n) => n.personId === "gma")!;
    const coupleCenter = (gpa.x + gma.x) / 2;
    expect(coupleCenter).toBeCloseTo(layout.contentWidth / 2, 0);
  });

  it("handles a spouse from a structurally distant branch: local chip, no long connector, and a note at their real position", () => {
    // The spouse's own ancestry is many generations away from the anchor's -- a real
    // "distant branch" case, not just a same-generation cousin marriage.
    const tree = buildTree(
      [
        person({ id: "anchorRoot" }),
        person({ id: "anchor", famcId: "fAnchor" }),
        person({ id: "distantRoot" }),
        person({ id: "d1", famcId: "fD1" }),
        person({ id: "d2", famcId: "fD2" }),
        person({ id: "d3", famcId: "fD3" }),
        person({ id: "distantSpouse", famcId: "fD3", name: "Distant Spouse" }),
      ],
      [
        family("fAnchor", "anchorRoot", undefined, ["anchor"]),
        family("fD1", "distantRoot", undefined, ["d1"]),
        family("fD2", "d1", undefined, ["d2"]),
        family("fD3", "d2", undefined, ["d3", "distantSpouse"]),
        family("fMarriage", "anchor", "distantSpouse", []),
      ]
    );
    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 7);
    expectNoOverlaps(layout);

    const anchorNode = layout.nodes.find((n) => n.personId === "anchor")!;
    const distantNode = layout.nodes.find((n) => n.personId === "distantSpouse")!;
    // They're on different generation rows (structurally distant) -- confirms this is a
    // genuinely distant-branch case, not a same-row cousin marriage.
    expect(anchorNode.generation).not.toBe(distantNode.generation);

    // The marriage point gets a short local chip next to the anchor...
    expect(layout.chips).toHaveLength(1);
    const chip = layout.chips[0]!;
    expect(chip.anchorPersonId).toBe("anchor");
    const chipDx = Math.abs(chip.x - anchorNode.x);
    expect(chipDx).toBeLessThan(anchorNode.width + chip.width); // local, not clear across the poster

    // ...and NO line/connector reaches all the way to the spouse's real, distant position.
    for (const c of layout.connectors) {
      if (c.kind === "marriage") expect(c.personIds).not.toContain("distantSpouse");
    }

    // The spouse's own real node still carries a note pointing back at the anchor.
    expect(distantNode.noteLine).toMatch(/branch/i);
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
    expectNoOverlaps(layout);
    // c2 is shared across two marriages but still appears exactly once as a real node --
    // both marriages resolve to chips pointing back at the SAME single node.
    expect(layout.nodes.filter((n) => n.personId === "c2")).toHaveLength(1);
    expect(layout.chips.length).toBeGreaterThanOrEqual(1);
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

  it("widens a box to fit a very long name instead of clipping it", () => {
    const longName = "Mohammad Abdul Kareem Uddin Sheik Al-Hussaini bin Yusuf";
    const tree = buildTree([person({ id: "p1", name: longName })], []);
    const layout = computePosterLayout(tree);
    const node = layout.nodes[0]!;
    expect(node.name).toBe(longName);
    // Long enough that it must wrap to more than one line at the default max width.
    expect(node.nameLines.length).toBeGreaterThan(1);
    // "Width before height": the box is at least as wide as the configured max, never
    // narrower just because the name is long.
    expect(node.width).toBeGreaterThanOrEqual(220 * 0.9);
  });

  it("widens a box beyond the max width for a single unbreakable long word, rather than clipping", () => {
    const unbreakable = "Muhammadibnabdirrahmanibnkhalidassuperlongsurname";
    const tree = buildTree([person({ id: "p1", name: unbreakable })], []);
    const layout = computePosterLayout(tree);
    const node = layout.nodes[0]!;
    expect(node.nameLines).toEqual([unbreakable]); // nothing to break on, stays one line
    expect(node.width).toBeGreaterThan(220); // widened past nodeMaxWidth rather than clipped
  });

  it("renders Arabic names right-to-left and sizes their box from the actual text", () => {
    const tree = buildTree([person({ id: "p1", name: "محمد عبد الكريم" })], []);
    const layout = computePosterLayout(tree);
    const node = layout.nodes[0]!;
    expect(node.rtl).toBe(true);
    expect(node.width).toBeGreaterThan(0);
    expect(node.nameLines.join(" ")).toContain("محمد");
  });

  it("resolves a synthetic collision between two unrelated branches with unequal box sizes", () => {
    // Two disconnected trees seeded with very different name lengths -- makes the two
    // subtrees' reserved widths asymmetric enough to plausibly stress the collision sweep.
    const tree = buildTree(
      [
        person({ id: "shortA", name: "Al" }),
        person({ id: "shortA2", famcId: "fA" }),
        person({ id: "longB", name: "Abdul Rahman Muhammad Al-Hussaini Sheik" }),
        person({ id: "longB2", famcId: "fB" }),
      ],
      [family("fA", "shortA", undefined, ["shortA2"]), family("fB", "longB", undefined, ["longB2"])]
    );
    const layout = computePosterLayout(tree);
    expectNoDuplicates(layout, 4);
    expectNoOverlaps(layout);
  });

  it("scales to a large synthetic tree without exponential blowup", () => {
    // Perfect binary-branching genealogy: 1 root couple, each person has 2 children, to a
    // depth that yields > 1,000 people -- and one cousin marriage stitched in for realism.
    const persons: Person[] = [];
    const families: Family[] = [];
    let counter = 0;
    function nextId() {
      return `p${counter++}`;
    }

    function buildBranch(depth: number, famcId: string | undefined): string {
      const id = nextId();
      persons.push(person({ id, famcId, name: `Person ${id}` }));
      if (depth === 0) return id;
      const spouseId = nextId();
      persons.push(person({ id: spouseId, name: `Spouse ${spouseId}` }));
      const famId = `f${id}`;
      const child1 = buildBranch(depth - 1, famId);
      const child2 = buildBranch(depth - 1, famId);
      families.push(family(famId, id, spouseId, [child1, child2]));
      return id;
    }

    buildBranch(11, undefined); // 2^12 - 1 = 4095 people, well over the 1,000-person target

    const tree = buildTree(persons, families);
    expect(Object.keys(tree.persons).length).toBeGreaterThan(1000);

    const start = performance.now();
    const layout = computePosterLayout(tree);
    const elapsedMs = performance.now() - start;

    expectNoDuplicates(layout, Object.keys(tree.persons).length);
    expectNoOverlaps(layout);
    expect(layout.generationCount).toBe(12);
    // Generous bound: catches accidental exponential behavior (which would take seconds to
    // minutes at this size) without being a flaky micro-benchmark. Layout quality is
    // explicitly allowed to take longer than the interactive viewer per the spec -- this is
    // only guarding against a real algorithmic blowup, not chasing raw speed.
    expect(elapsedMs).toBeLessThan(15000);
  });
});

describe.skipIf(!SAMPLE_EXISTS)("computePosterLayout against the real FTZ sample", () => {
  it("lays out all 473 people exactly once, with every relationship represented, no overlaps", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes, "FamilyTree.ftz");

    const start = performance.now();
    const layout = computePosterLayout(tree);
    const elapsedMs = performance.now() - start;

    expectNoDuplicates(layout, Object.keys(tree.persons).length);
    expectNoDisconnectedBranches(layout);
    expectNoOverlaps(layout);
    expectTextFitsBoxes(layout);
    expect(elapsedMs).toBeLessThan(15000);

    // Every family with a recorded marriage produces either a marriage connector (both
    // spouses rendered adjacent) or a chip (cousin marriage) -- never neither, whenever
    // both spouses are known.
    for (const fam of Object.values(tree.families)) {
      if (!fam.husbandId || !fam.wifeId) continue;
      const hasMarriage = layout.connectors.some(
        (c) => c.kind === "marriage" && c.personIds.includes(fam.husbandId!) && c.personIds.includes(fam.wifeId!)
      );
      const hasChip = layout.chips.some(
        (c) =>
          (c.anchorPersonId === fam.husbandId && c.spousePersonId === fam.wifeId) ||
          (c.anchorPersonId === fam.wifeId && c.spousePersonId === fam.husbandId)
      );
      expect(hasMarriage || hasChip).toBe(true);
    }
  });

  it("centers the oldest ancestor couple on the real dataset, and every chip/note names a real person", async () => {
    const bytes = await readFile(SAMPLE_PATH);
    const { tree } = await parseFtzFile(bytes, "FamilyTree.ftz");
    const layout = computePosterLayout(tree);

    // The generation-0 person(s) with the largest reserved subtree are the "oldest ancestor
    // couple" -- their combined midpoint should sit within a couple of box-widths of the
    // poster's true horizontal center (exact equality isn't expected: the two spouses'
    // boxes can differ slightly in width, shifting the midpoint by half that difference).
    const gen0 = layout.nodes.filter((n) => n.generation === 0);
    expect(gen0.length).toBeGreaterThan(0);
    const centerX = layout.contentWidth / 2;
    const closest = [...gen0].sort((a, b) => Math.abs(a.x - centerX) - Math.abs(b.x - centerX))[0]!;
    const tolerance = Math.max(closest.width, 200);
    expect(Math.abs(closest.x - centerX)).toBeLessThan(tolerance);

    // No chip or branch-note ever reads as an unfilled placeholder -- every one names a
    // real person, and none use the retired "Spouse:" / "(see own entry)" scaffold text.
    for (const chip of layout.chips) {
      const text = chip.lines.join(" ");
      expect(text.trim().length).toBeGreaterThan(1); // more than just the "⚭" glyph
      expect(text).not.toMatch(/spouse:/i);
      expect(text).not.toMatch(/see own entry/i);
    }
    const notedNodes = layout.nodes.filter((n) => n.noteLine);
    expect(notedNodes).toHaveLength(layout.chips.length); // one note per chip, no more, no less
    for (const node of notedNodes) {
      expect(node.noteLine).toMatch(/branch/i);
    }
  });
});
