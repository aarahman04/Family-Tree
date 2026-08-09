import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { computePosterLayout } from "../poster/layout.js";
import { computePosterPageSize } from "../poster/pageSize.js";
import { renderPosterSvg } from "../poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE } from "../poster/types.js";

function person(id: UUID, opts: Partial<Person> = {}): Person {
  return { id, name: id, gender: "unknown", notes: [], media: [], famsIds: [], ...opts };
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

describe("computePosterPageSize", () => {
  it("auto-sizes a single page to fit the whole tree, no presets or tiling", () => {
    const kids = Array.from({ length: 12 }, (_, i) => `kid${i}`);
    const tree = buildTree(
      [person("dad", { gender: "male" }), person("mom", { gender: "female" }), ...kids.map((id) => person(id, { famcId: "fam1" }))],
      [family("fam1", "dad", "mom", kids)]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);

    // Wide sibling group -> wide page, exactly as wide as the content needs (not clamped to
    // an A4/Letter preset), matching the confirmed "print as wide as it goes" scope.
    expect(page.widthPt).toBeGreaterThan(1500);
    expect(page.heightPt).toBeGreaterThan(0);
    expect(page.widthIn).toBeCloseTo(page.widthPt / 72, 5);
  });
});

describe("renderPosterSvg", () => {
  it("produces a well-formed SVG document with every person and no unescaped markup", () => {
    const tree = buildTree(
      [
        person("dad", { name: "A & B \"Big\" <Smith>", gender: "male", birth: { id: "b1", type: "birth", date: { year: 1900 } } }),
        person("mom", { name: "Jane O'Neil", gender: "female" }),
        person("kid", { famcId: "fam1", name: "Kid Smith" }),
      ],
      [family("fam1", "dad", "mom", ["kid"])]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.trim()).toMatch(/<\/svg>$/);
    expect(svg).toContain("A &amp; B &quot;Big&quot; &lt;Smith&gt;");
    expect(svg).not.toContain("<Smith>");
    expect(svg).toContain("Jane O&apos;Neil");
    expect(svg).toContain("Kid Smith");
    expect(svg).toContain("1900");

    // One box per person.
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    // background rect + (box rect + gender-indicator rect) per person
    expect(rectCount).toBe(1 + layout.nodes.length * 2);
  });

  it("styles a cross-branch (cousin marriage) connector distinctly from a normal marriage line", () => {
    const tree = buildTree(
      [
        person("ancestorM", { gender: "male" }),
        person("ancestorF", { gender: "female" }),
        person("branchA", { famcId: "fRoot" }),
        person("branchB", { famcId: "fRoot" }),
        person("cousinA", { famcId: "fA" }),
        person("cousinB", { famcId: "fB" }),
      ],
      [
        family("fRoot", "ancestorM", "ancestorF", ["branchA", "branchB"]),
        family("fA", "branchA", undefined, ["cousinA"]),
        family("fB", "branchB", undefined, ["cousinB"]),
        family("fMarriage", "cousinA", "cousinB", []),
      ]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);

    expect(svg).toContain(`stroke="${DEFAULT_POSTER_STYLE.crossBranchColor}"`);
    expect(svg).toContain("stroke-dasharray");
  });
});
