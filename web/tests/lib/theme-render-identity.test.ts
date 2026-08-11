import { afterEach, describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../../../models/types.js";
import { computeBalancedPosterLayout } from "../../../poster/layoutBalanced.js";
import { computePosterPageSize } from "../../../poster/pageSize.js";
import { renderPosterSvg } from "../../../poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE } from "../../../poster/types.js";
import { applyTheme } from "../../src/lib/theme.js";

// The load-bearing dark-mode invariant: the poster renderer is theme-blind. It takes no theme
// argument and reads no DOM, so SVG/PDF export must be byte-identical whether the shell is light
// or dark. If this ever fails, dark mode has leaked into the renderer and export is compromised.
function tree(): FamilyTree {
  const persons: Record<UUID, Person> = {
    r: { id: "r", name: "Root", gender: "male", notes: [], media: [], famsIds: ["f"], photo: { thumb: "data:image/webp;base64,TT" } },
    k: { id: "k", name: "Kid", gender: "female", notes: [], media: [], famcId: "f", famsIds: [] },
  };
  const families: Record<UUID, Family> = { f: { id: "f", husbandId: "r", childrenIds: ["k"] } };
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons,
    families,
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

describe("dark mode never reaches the poster renderer (export identity)", () => {
  afterEach(() => applyTheme("light"));

  const style = { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" as const, showLivingIndicator: true };
  const layout = computeBalancedPosterLayout(tree(), style);
  const page = computePosterPageSize(layout, style);
  const photos = new Map<UUID, string>([["r", "data:image/webp;base64,TT"]]);

  it("renders identical SVG whether the shell is light or dark", () => {
    applyTheme("light");
    const light = renderPosterSvg(layout, page, style, photos);
    applyTheme("dark");
    const dark = renderPosterSvg(layout, page, style, photos);
    expect(dark).toBe(light);
    // And the poster is on its own paper palette, not the theme's.
    expect(light).toContain(style.backgroundColor);
  });
});
