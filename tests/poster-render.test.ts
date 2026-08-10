import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { computePosterLayout } from "../poster/layout.js";
import { computePosterPageSize } from "../poster/pageSize.js";
import { renderPosterSvg } from "../poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE, PDF_MAX_DIMENSION_PT } from "../poster/types.js";

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
    expect(page.widthPt).toBeGreaterThan(1000);
    expect(page.heightPt).toBeGreaterThan(0);
    expect(page.widthIn).toBeCloseTo(page.widthPt / 72, 5);
    expect(page.widthMm).toBeCloseTo(page.widthIn * 25.4, 2);
    expect(page.pdfScale).toBe(1); // well under the PDF page-size ceiling
    expect(page.pdfWidthPt).toBeCloseTo(page.widthPt, 5);
  });

  it("scales the PDF page down when the true size exceeds the PDF format's 14,400pt limit, while SVG stays uncapped", () => {
    // A pathologically wide single generation, synthesized directly against pageSize.ts so
    // the test doesn't need to build tens of thousands of real people to cross 14,400pt.
    const layout = {
      nodes: [],
      chips: [],
      connectors: [],
      generationCount: 1,
      contentWidth: 50000,
      contentHeight: 500,
    };
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);

    expect(page.widthPt).toBeGreaterThan(PDF_MAX_DIMENSION_PT); // true size stays uncapped
    expect(page.pdfScale).toBeLessThan(1);
    expect(page.pdfWidthPt).toBeCloseTo(PDF_MAX_DIMENSION_PT, 0);
    expect(page.pdfHeightPt).toBeCloseTo(page.heightPt * page.pdfScale, 5);
  });
});

describe("renderPosterSvg", () => {
  it("produces a well-formed SVG document with every person and no unescaped markup", () => {
    const tree = buildTree(
      [
        person("dad", { name: 'A&B "Big"', gender: "male", birth: { id: "b1", type: "birth", date: { year: 1900 } } }),
        person("mom", { name: "Jane O'Neil", gender: "female" }),
        person("kid", { famcId: "fam1", name: "Kid <Smith>" }),
      ],
      [family("fam1", "dad", "mom", ["kid"])]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.trim()).toMatch(/<\/svg>$/);
    expect(svg).toContain("A&amp;B &quot;Big&quot;");
    expect(svg).not.toContain("<Smith>");
    expect(svg).toContain("Kid &lt;Smith&gt;");
    expect(svg).toContain("Jane O&apos;Neil");
    expect(svg).toContain("1900");

    // Page background + one box per person, plus a neutral edge stripe only on boxes whose
    // gender is unknown (male/female get a vector gender glyph instead of the stripe).
    const unknownCount = layout.nodes.filter((n) => n.gender !== "male" && n.gender !== "female").length;
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(1 + layout.nodes.length + unknownCount);

    // Every male/female box carries a Mars/Venus glyph, which is built around a <circle>.
    const circleCount = (svg.match(/<circle /g) ?? []).length;
    expect(circleCount).toBe(layout.nodes.length - unknownCount);
  });

  it("wraps a long name onto multiple <text> lines instead of overflowing the box", () => {
    const longName = "Mohammad Abdul Kareem Uddin Sheik Al-Hussaini bin Yusuf";
    const tree = buildTree([person("p1", { name: longName })], []);
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);

    const node = layout.nodes[0]!;
    expect(node.nameLines.length).toBeGreaterThan(1);
    for (const line of node.nameLines) {
      expect(svg).toContain(`>${line}</text>`);
    }
  });

  it("renders a cousin-marriage chip distinctly from a normal marriage line, with no line to the spouse's real node", () => {
    const tree = buildTree(
      [
        person("ancestorM", { gender: "male" }),
        person("ancestorF", { gender: "female" }),
        person("branchA", { famcId: "fRoot" }),
        person("branchB", { famcId: "fRoot" }),
        person("cousinA", { famcId: "fA" }),
        person("cousinB", { famcId: "fB", name: "Cousin Bee" }),
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

    // Two chips: one beside cousinA naming cousinB, and the reciprocal one beside cousinB
    // naming cousinA -- so each spouse's home reads as married.
    expect(layout.chips).toHaveLength(2);
    expect(svg).toContain(`stroke="${DEFAULT_POSTER_STYLE.chipBorderColor}"`);
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain("⚭ Cousin Bee"); // real name, not a "Spouse:" / "(see own entry)" placeholder
    expect(svg).toContain("⚭ cousinA"); // reciprocal chip beside cousinB names her husband
    expect(svg).not.toMatch(/spouse:/i);
    expect(svg).not.toMatch(/see own entry/i);

    // cousinB's own node (under her real parents) still renders too -- exactly once -- and
    // carries a note pointing back at cousinA's branch, styled distinctly (italic).
    const cousinBBoxes = (svg.match(/Cousin Bee/g) ?? []).length;
    expect(cousinBBoxes).toBe(2); // her own node's name, plus the chip naming her
    expect(svg).toContain("children shown in cousinA&apos;s branch");
    expect(svg).toMatch(/font-style="italic"[^>]*>children shown in/);
  });

  it("keeps the SVG at the true uncapped size even when the PDF page would need to scale down", () => {
    const tree = buildTree([person("p1")], []);
    const layout = computePosterLayout(tree);
    const bigPage = computePosterPageSize(
      { ...layout, contentWidth: 50000, contentHeight: 500 },
      DEFAULT_POSTER_STYLE
    );
    const svg = renderPosterSvg(layout, bigPage, DEFAULT_POSTER_STYLE);
    expect(svg).toContain(`width="${bigPage.widthPt}"`);
  });
});
