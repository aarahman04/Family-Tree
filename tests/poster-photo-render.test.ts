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
    expect(svg).toContain("No photo available");
  });

  it("falls back to the placeholder for an empty href — never fails on a bad photo", () => {
    const { layout, page, style } = setup({ displayMode: "photoCards" });
    const id = layout.nodes[0]!.personId;
    const svg = renderPosterSvg(layout, page, style, new Map([[id, ""]]));
    expect(svg).not.toContain("<image");
    expect(svg).toContain("No photo available");
  });

  it.each(["square", "rounded", "circle"] as PhotoShape[])(
    "placeholder renders for photoShape=%s",
    (photoShape) => {
      const { layout, page, style } = setup({ displayMode: "photoCards", photoShape });
      const svg = renderPosterSvg(layout, page, style, new Map());
      expect(svg).toContain("No photo available");
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
