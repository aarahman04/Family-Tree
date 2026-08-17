import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../src/models/types.js";
import { computePosterLayout } from "../src/poster/layout.js";
import { computePosterPageSize } from "../src/poster/pageSize.js";
import { renderPosterSvg } from "../src/poster/renderSvg.js";
import { BADGE_COUSIN_MARRIAGE, BADGE_INCOMPLETE_RECORD, DEFAULT_POSTER_STYLE, PDF_MAX_DIMENSION_PT } from "../src/poster/types.js";

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

  it("colors a cousin-marriage chip's border and anchor connector with the per-family analytics color (CP5.2)", () => {
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
    const analytics = { byFamily: new Map([["fMarriage", { color: "#e60000" }]]) };

    const plain = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);
    const colored = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);

    // Default (no analytics): the standard chip border color, never the override.
    expect(plain).not.toContain(`stroke="#e60000"`);
    // With analytics: the chip's own rect AND its anchor connector line both pick up the color.
    const chipRectCount = (colored.match(/stroke="#e60000"/g) ?? []).length;
    expect(chipRectCount).toBe(4); // 2 chips x (1 rect + 1 anchor line) each
    expect(colored).toContain("stroke-dasharray"); // dashed-chip styling is untouched
  });

  it("leaves an unrelated family's chip at the default color when analytics only targets a different family (CP5.2)", () => {
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
    const analytics = { byFamily: new Map([["some-other-family", { color: "#e60000" }]]) };
    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);
    expect(svg).not.toContain(`stroke="#e60000"`);
    expect(svg).toContain(`stroke="${DEFAULT_POSTER_STYLE.chipBorderColor}"`);
  });

  it("draws a branch-merge glyph on a marriage connector flagged by analytics, not on a plain marriage (CP5.3)", () => {
    const tree = buildTree(
      [person("p1", { gender: "male" }), person("p2", { gender: "female" }), person("p3", { gender: "male" }), person("p4", { gender: "female" })],
      [family("fBridge", "p1", "p2", []), family("fPlain", "p3", "p4", [])]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const analytics = { byFamily: new Map([["fBridge", { className: "branch-merge" }]]) };

    const plain = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);
    const flagged = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);

    expect(plain).not.toContain('data-role="branch-merge"');
    const glyphCount = (flagged.match(/data-role="branch-merge"/g) ?? []).length;
    expect(glyphCount).toBe(1); // only fBridge is flagged, not fPlain
  });

  it("draws the branch-merge glyph via the chip's anchor connector for a REAL cousin marriage, since blood-relative marriages never produce a marriage connector (CP5.3)", () => {
    // Same fixture shape as the CP5.2 chip-coloring test: both spouses have known blood
    // parents, so layout.ts routes this family through PosterChip, never MarriageConnector.
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
    const analytics = { byFamily: new Map([["fMarriage", { className: "branch-merge" }]]) };

    const plain = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);
    const flagged = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);

    expect(plain).not.toContain('data-role="branch-merge"');
    // No "marriage" connector exists at all for this family (both spouses are blood-placed) --
    // the glyph must come from the chip path. One glyph per chip (2 chips, per the CP5.2 test).
    const glyphCount = (flagged.match(/data-role="branch-merge"/g) ?? []).length;
    expect(glyphCount).toBe(2);
  });

  it("draws no generation bands by default, even with analytics present but the flag unset (CP5.4)", () => {
    const tree = buildTree(
      [person("a1", { gender: "male" }), person("a2", { gender: "female" }), person("c1", { famcId: "f1" }), person("g1", { famcId: "f2" })],
      [family("f1", "a1", "a2", ["c1"]), family("f2", "c1", undefined, ["g1"])]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);

    expect(renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE)).not.toContain('data-role="generation-band"');
    expect(renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, { byFamily: new Map() })).not.toContain(
      'data-role="generation-band"'
    );
  });

  it("draws one band per even generation, spanning the full page width, when analytics.showGenerationBands is true (CP5.4)", () => {
    const tree = buildTree(
      [person("a1", { gender: "male" }), person("a2", { gender: "female" }), person("c1", { famcId: "f1" }), person("g1", { famcId: "f2" })],
      [family("f1", "a1", "a2", ["c1"]), family("f2", "c1", undefined, ["g1"])]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    expect(layout.generationCount).toBe(3); // generations 0,1,2 -- bands shade the even ones (0, 2)

    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, { showGenerationBands: true });
    const bandMatches = [...svg.matchAll(/<rect data-role="generation-band"[^>]*width="([\d.]+)"/g)];
    expect(bandMatches).toHaveLength(2);
    for (const m of bandMatches) expect(Number(m[1])).toBe(page.widthPt); // full page width, not per-generation
  });

  it("a generation band covers a chip taller than any node in its own row, not just the nodes (CP5.4 regression)", () => {
    // shortHusband (blood, both spouses blood -> husband anchors) is at gen 2 -- a MIDDLE shaded
    // band, so its top/bottom both come from real midpoint math (unlike gen 0, clamped to 0, or
    // the last generation, clamped to page height, either of which would hide this bug). The
    // chip hosted there (naming longWife, whose OWN blood line puts her at an unrelated gen 4)
    // is taller than any real node in gen 2's row -- nothing else in that row is long-named.
    const longName = "Alexandra Bartholomew Cassandra Dumfries Evangeline Fitzgerald Gwendolyn Hawthorne Isabella";
    const tree = buildTree(
      [
        person("rootX", { gender: "male" }),
        person("rootY", { gender: "female" }),
        person("mid", { famcId: "fRoot" }),
        person("shortHusband", { famcId: "fMid", gender: "male" }),
        person("gg1", { gender: "male" }),
        person("gg2", { gender: "female" }),
        person("w1", { famcId: "fGG" }),
        person("w2", { famcId: "fW1" }),
        person("w3", { famcId: "fW2" }),
        person("longWife", { famcId: "fW3", gender: "female", name: longName }),
      ],
      [
        family("fRoot", "rootX", "rootY", ["mid"]),
        family("fMid", "mid", undefined, ["shortHusband"]),
        family("fGG", "gg1", "gg2", ["w1"]),
        family("fW1", "w1", undefined, ["w2"]),
        family("fW2", "w2", undefined, ["w3"]),
        family("fW3", "w3", undefined, ["longWife"]),
        family("fMarriage", "shortHusband", "longWife", []),
      ]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    expect(layout.generationCount).toBe(5);

    const offsetY = DEFAULT_POSTER_STYLE.marginPt;
    function rawBoundsOf(gen: number) {
      const spans = [
        ...layout.nodes.filter((n) => n.generation === gen).map((n) => ({ top: offsetY + n.y - n.height / 2, bottom: offsetY + n.y + n.height / 2 })),
        ...layout.chips.filter((c) => c.generation === gen).map((c) => ({ top: offsetY + c.y - c.height / 2, bottom: offsetY + c.y + c.height / 2 })),
      ];
      return { top: Math.min(...spans.map((s) => s.top)), bottom: Math.max(...spans.map((s) => s.bottom)) };
    }
    const gen1 = rawBoundsOf(1);
    const gen2 = rawBoundsOf(2);
    const gen3 = rawBoundsOf(3);
    // Sanity check: the fixture actually exercises the gap this test targets (the chip, not any
    // node, drives gen 2's true lower bound).
    const gen2NodeBottoms = layout.nodes.filter((n) => n.generation === 2).map((n) => offsetY + n.y + n.height / 2);
    expect(gen2.bottom).toBeGreaterThan(Math.max(...gen2NodeBottoms));

    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, { showGenerationBands: true });
    const bands = [...svg.matchAll(/<rect data-role="generation-band" x="0" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].map((m) => ({
      top: Number(m[1]),
      bottom: Number(m[1]) + Number(m[2]),
    }));
    expect(bands).toHaveLength(3); // gens 0, 2, 4
    const gen2Band = bands[1]!; // sorted by generation ascending, gen2 is the middle one
    // The exact midpoint math renderGenerationBands should produce once chip bounds (not just
    // node bounds) feed into it -- distinguishes the fix from the nodes-only bug precisely,
    // rather than a loose bound the bug could still satisfy by accident.
    expect(gen2Band.top).toBeCloseTo((gen1.bottom + gen2.top) / 2, 5);
    expect(gen2Band.bottom).toBeCloseTo((gen2.bottom + gen3.top) / 2, 5);
  });

  it("overrides a node's card fill with analytics.byNode tint, leaving unflagged nodes at the default backgroundColor (CP5.5)", () => {
    const tree = buildTree(
      [person("dad", { gender: "male" }), person("mom", { gender: "female" }), person("kid", { famcId: "fam1" })],
      [family("fam1", "dad", "mom", ["kid"])]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const analytics = { byNode: new Map([["kid", { tint: "#ffec99" }]]) };

    const plain = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);
    const tinted = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);

    expect(plain).not.toContain(`fill="#ffec99"`);
    expect(tinted).toContain(`fill="#ffec99"`);
    // "dad"/"mom" are unflagged -- the default backgroundColor still appears on their cards
    // (rx="4" identifies a person-card rect, excluding the page-background rect which also
    // uses backgroundColor).
    expect((tinted.match(new RegExp(`rx="4" fill="${DEFAULT_POSTER_STYLE.backgroundColor}"`, "g")) ?? []).length).toBe(2);
  });

  it("renders an incomplete-record badge and a cousin-marriage badge for a node flagged via analytics.byNode.badges, and nothing for an unflagged node (CP5.6)", () => {
    const tree = buildTree(
      [person("dad", { gender: "male" }), person("mom", { gender: "female" }), person("kid", { famcId: "fam1" })],
      [family("fam1", "dad", "mom", ["kid"])]
    );
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const analytics = { byNode: new Map([["kid", { badges: [BADGE_INCOMPLETE_RECORD, BADGE_COUSIN_MARRIAGE] }]]) };

    const plain = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE);
    const badged = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);

    expect(plain).not.toContain("data-role=\"badge-");
    expect((badged.match(/data-role="badge-incomplete-record"/g) ?? []).length).toBe(1);
    expect((badged.match(/data-role="badge-cousin-marriage"/g) ?? []).length).toBe(1);
  });

  it("ignores unrecognized badge tokens rather than throwing or rendering an unknown glyph (CP5.6)", () => {
    const tree = buildTree([person("solo")], []);
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const analytics = { byNode: new Map([["solo", { badges: ["some-future-badge-type"] }]]) };

    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);
    expect(svg).not.toContain('data-role="badge-');
  });

  it("keeps a badge clear of the living-dot on an RTL photo card, where the dot is NOT mirrored (CP5.6 review)", () => {
    // The living-dot is anchored to the box's right edge unconditionally, RTL or not. Badges must
    // therefore anchor to the LEFT edge for every node, not to the RTL-mirrored "leading" edge --
    // otherwise an RTL name puts both glyphs on the identical point and the badge paints over the
    // living/deceased signal.
    const tree = buildTree([person("rtl", { name: "محمد الرحمن", gender: "male" })], []);
    const layout = computePosterLayout(tree);
    expect(layout.nodes[0]!.rtl).toBe(true); // fixture actually exercises the RTL path
    const style = { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" as const, showLivingIndicator: true };
    const page = computePosterPageSize(layout, style);
    const analytics = { byNode: new Map([["rtl", { badges: [BADGE_INCOMPLETE_RECORD] }]]) };

    const svg = renderPosterSvg(layout, page, style, undefined, analytics);
    const dotCx = Number(/data-role="living-dot" cx="([\d.]+)"/.exec(svg)![1]);
    const badgeCx = Number(/data-role="badge-incomplete-record"[\s\S]*?<circle cx="([\d.]+)"/.exec(svg)![1]);
    expect(badgeCx).not.toBeCloseTo(dotCx, 3);
    expect(badgeCx).toBeLessThan(dotCx); // badge on the left edge, dot on the right
  });

  it("treats an empty-string tint as no tint rather than emitting an invalid fill (CP5.5 review)", () => {
    // fill="" is invalid; SVG falls back to the initial value (black), painting the whole card
    // black. Mirrors this file's existing "absent OR empty href" handling for photos.
    const tree = buildTree([person("solo")], []);
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const analytics = { byNode: new Map([["solo", { tint: "" }]]) };

    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);
    expect(svg).not.toContain('fill=""');
    expect(svg).toContain(`rx="4" fill="${DEFAULT_POSTER_STYLE.backgroundColor}"`);
  });

  it("gives the cousin-marriage badge a different SHAPE from the branch-merge glyph, not just a different position (CP5.6 review, AUD-5)", () => {
    // branchMergeGlyph is a filled diamond in the same accent colour. If the badge is also a
    // filled diamond, the one glyph carries two meanings and the shape-coding goal is defeated.
    const tree = buildTree([person("solo")], []);
    const layout = computePosterLayout(tree);
    const page = computePosterPageSize(layout, DEFAULT_POSTER_STYLE);
    const analytics = { byNode: new Map([["solo", { badges: [BADGE_COUSIN_MARRIAGE] }]]) };

    const svg = renderPosterSvg(layout, page, DEFAULT_POSTER_STYLE, undefined, analytics);
    const badge = /(<g data-role="badge-cousin-marriage"[\s\S]*?<\/g>|<path data-role="badge-cousin-marriage"[\s\S]*?\/?>)/.exec(svg)![1]!;
    expect(badge).not.toMatch(/ d="M /); // not a diamond path like branchMergeGlyph
    expect((badge.match(/<circle /g) ?? []).length).toBe(2); // two interlocking rings
  });
});
