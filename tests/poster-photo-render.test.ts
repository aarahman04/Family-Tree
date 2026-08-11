import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { computeBalancedPosterLayout } from "../poster/layoutBalanced.js";
import { computePosterPageSize } from "../poster/pageSize.js";
import { renderPosterSvg } from "../poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE, type PhotoShape } from "../poster/types.js";

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

function makeTree(): FamilyTree {
  return buildTree([person("p1", { name: "Ahmed Rahman" })], []);
}

function setup(styleOverrides = {}) {
  const tree = makeTree(); // a small deterministic tree with at least one person id "p1"
  const style = { ...DEFAULT_POSTER_STYLE, ...styleOverrides };
  const layout = computeBalancedPosterLayout(tree, style);
  const page = computePosterPageSize(layout, style);
  return { tree, style, layout, page };
}

describe("renderPosterSvg photo cards", () => {
  it("compact output has no <image> and no clipPath (regression)", () => {
    const { layout, page, style } = setup();
    const svg = renderPosterSvg(layout, page, style);
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("clipPath");
  });

  it("photoCards emits an <image> when a href is supplied", () => {
    const { layout, page, style } = setup({ displayMode: "photoCards" });
    const id = layout.nodes[0]!.personId;
    const photos = new Map([[id, "data:image/webp;base64,ZZZ"]]);
    const svg = renderPosterSvg(layout, page, style, photos);
    expect(svg).toContain("<image");
    expect(svg).toContain("data:image/webp;base64,ZZZ");
    expect(svg).toContain("Photo of "); // <title> alt text
  });

  it("photoCards emits a placeholder (no <image>) when no href is supplied", () => {
    const { layout, page, style } = setup({ displayMode: "photoCards" });
    const svg = renderPosterSvg(layout, page, style, new Map());
    expect(svg).not.toContain("<image");
    // Placeholder <title> names the person for screen-reader parity with a real photo (AUD-5).
    expect(svg).toContain("No photo of Ahmed Rahman");
  });

  it("falls back to the placeholder for an empty href — never fails on a bad photo", () => {
    const { layout, page, style } = setup({ displayMode: "photoCards" });
    const id = layout.nodes[0]!.personId;
    const svg = renderPosterSvg(layout, page, style, new Map([[id, ""]]));
    expect(svg).not.toContain("<image");
    expect(svg).toContain("No photo of ");
  });

  it.each(["square", "rounded", "circle"] as PhotoShape[])(
    "placeholder renders for photoShape=%s",
    (photoShape) => {
      const { layout, page, style } = setup({ displayMode: "photoCards", photoShape });
      const svg = renderPosterSvg(layout, page, style, new Map());
      expect(svg).toContain("No photo of ");
      if (photoShape === "circle") expect(svg).toContain("<circle");
    }
  );

  it("shows a living dot only when showLivingIndicator is on", () => {
    const off = setup({ displayMode: "photoCards" });
    const on = setup({ displayMode: "photoCards", showLivingIndicator: true });
    const svgOff = renderPosterSvg(off.layout, off.page, off.style, new Map());
    const svgOn = renderPosterSvg(on.layout, on.page, on.style, new Map());
    expect(svgOn).toContain('data-role="living-dot"');
    expect(svgOff).not.toContain('data-role="living-dot"');
  });
});

describe("renderPosterSvg photo cards — branch-note cross-reference (AUD-2)", () => {
  // Shared ancestor couple -> two branches -> a cousin in each -> cousins marry. The non-anchor
  // spouse's own box carries a "children shown in <anchor>'s branch" note (poster/layout.ts).
  function cousinMarriageTree(): FamilyTree {
    return buildTree(
      [
        person("ancestorM", { gender: "male" }),
        person("ancestorF", { gender: "female" }),
        person("branchA", { famcId: "fRoot" }),
        person("branchB", { famcId: "fRoot" }),
        person("cousinA", { famcId: "fA", name: "Cousin A" }),
        person("cousinB", { famcId: "fB", name: "Cousin B" }),
      ],
      [
        family("fRoot", "ancestorM", "ancestorF", ["branchA", "branchB"]),
        family("fA", "branchA", undefined, ["cousinA"]),
        family("fB", "branchB", undefined, ["cousinB"]),
        family("fMarriage", "cousinA", "cousinB", []),
      ]
    );
  }

  function svgFor(displayMode: "compact" | "photoCards"): string {
    const tree = cousinMarriageTree();
    const style = { ...DEFAULT_POSTER_STYLE, displayMode };
    const layout = computeBalancedPosterLayout(tree, style);
    const page = computePosterPageSize(layout, style);
    return renderPosterSvg(layout, page, style);
  }

  it("compact renders the branch-note (control — proves the topology produces one)", () => {
    expect(svgFor("compact")).toContain("children shown in");
  });

  it("photoCards also renders the branch-note (regression: renderPhotoCard dropped it)", () => {
    expect(svgFor("photoCards")).toContain("children shown in");
  });
});

describe("renderPosterSvg RTL gender glyph + text nudge (AUD-4)", () => {
  // The card outline is the rect carrying stroke-width (the page background rect emitted first has
  // none), so this targets the node box, not the page.
  const cardCenterX = (svg: string) => {
    const m = svg.match(/<rect x="([-\d.]+)"[^>]*width="([-\d.]+)"[^>]*stroke-width=/)!;
    return Number(m[1]) + Number(m[2]) / 2;
  };
  // In compact mode the only <circle> is the gender glyph (no photo, no living dot).
  const glyphCx = (svg: string) => Number(svg.match(/<circle cx="([-\d.]+)"/)![1]);
  const nameTextX = (svg: string, name: string) =>
    Number(svg.match(new RegExp(`<text x="([-\\d.]+)"[^>]*>${name}</text>`))![1]);

  function svgFor(name: string) {
    const tree = buildTree([person("p1", { name, gender: "male" })], []);
    const style = { ...DEFAULT_POSTER_STYLE }; // compact
    const layout = computeBalancedPosterLayout(tree, style);
    const page = computePosterPageSize(layout, style);
    return renderPosterSvg(layout, page, style);
  }

  it("keeps the gender glyph on the leading (left) edge for an LTR name", () => {
    const svg = svgFor("Ahmed");
    expect(glyphCx(svg)).toBeLessThan(cardCenterX(svg));
  });

  it("mirrors the gender glyph to the trailing (right) edge for an RTL name", () => {
    const svg = svgFor("أحمد");
    expect(glyphCx(svg)).toBeGreaterThan(cardCenterX(svg));
  });

  it("mirrors the compact text nudge to match the glyph side", () => {
    const ltr = svgFor("Ahmed");
    const rtl = svgFor("أحمد");
    expect(nameTextX(ltr, "Ahmed")).toBeGreaterThan(cardCenterX(ltr)); // nudged right (cx + 2)
    expect(nameTextX(rtl, "أحمد")).toBeLessThan(cardCenterX(rtl)); // nudged left (cx - 2)
  });
});

describe("renderPosterSvg living indicator shape + label (AUD-5)", () => {
  function svgFor(deceased: boolean) {
    const p = deceased
      ? person("p1", { name: "Ahmed", death: { id: "d", type: "death", date: { year: 1900 } } })
      : person("p1", { name: "Ahmed" });
    const style = { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" as const, showLivingIndicator: true };
    const layout = computeBalancedPosterLayout(buildTree([p], []), style);
    const page = computePosterPageSize(layout, style);
    return renderPosterSvg(layout, page, style, new Map());
  }

  it("labels a living person's dot and fills it (solid disc)", () => {
    const svg = svgFor(false);
    expect(svg).toContain("<title>Living</title>");
    expect(svg).toMatch(/data-role="living-dot"[^>]*fill="#16a34a"/);
  });

  it("labels a deceased person's dot and draws it hollow (ring — not hue-only)", () => {
    const svg = svgFor(true);
    expect(svg).toContain("<title>Deceased</title>");
    expect(svg).toMatch(/data-role="living-dot"[^>]*fill="none"/);
  });
});
