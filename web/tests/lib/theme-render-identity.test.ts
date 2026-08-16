import { afterEach, describe, expect, it, vi } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../../../src/models/types.js";
import { computeBalancedPosterLayout } from "../../../src/poster/layoutBalanced.js";
import { computePosterPageSize } from "../../../src/poster/pageSize.js";
import { renderPosterSvg } from "../../../src/poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE } from "../../../src/poster/types.js";
import { applyTheme } from "../../src/lib/theme.js";

// The load-bearing dark-mode invariant: the poster renderer is theme-blind. It takes no theme
// argument and reads no DOM, so SVG/PDF export must be byte-identical whether the shell is light
// or dark. If this ever fails, dark mode has leaked into the renderer and export is compromised.
function tree(): FamilyTree {
  const persons: Record<UUID, Person> = {
    r: {
      id: "r",
      name: "Root",
      gender: "male",
      notes: [],
      media: [],
      famsIds: ["f"],
      photo: { thumb: "data:image/webp;base64,TT" },
    },
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

  const style = {
    ...DEFAULT_POSTER_STYLE,
    displayMode: "photoCards" as const,
    showLivingIndicator: true,
  };
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

// The second half of the same invariant. The shell is becoming responsive (breakpoint classes,
// a viewport-seeded sidebar, overlay menus), and every one of those changes is a chance for a
// window dimension to leak into the export path. The renderer reads no DOM today; this pins that
// down so a future `innerWidth`/`matchMedia`/`getBoundingClientRect` read in the layout or sizing
// step fails here instead of silently making exports depend on the window they were made from.
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

/** Drives every channel a responsive implementation could plausibly read the viewport from. */
function withViewport<T>(width: number, height: number, fn: () => T): T {
  const realRect = Element.prototype.getBoundingClientRect;
  const realMatchMedia = window.matchMedia;
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
  // A minimal but honest matchMedia: `(min-width: Npx)` / `(max-width: Npx)` resolve against the
  // simulated width, so Tailwind-style breakpoint probes return different answers per viewport.
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    let matches = false;
    if (min) matches = width >= Number(min[1]);
    else if (max) matches = width <= Number(max[1]);
    return {
      matches,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
      onchange: null,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
  try {
    return fn();
  } finally {
    Element.prototype.getBoundingClientRect = realRect;
    window.matchMedia = realMatchMedia;
    vi.unstubAllGlobals();
  }
}

describe("viewport never reaches the poster renderer (export identity)", () => {
  afterEach(() => applyTheme("light"));

  const style = {
    ...DEFAULT_POSTER_STYLE,
    displayMode: "photoCards" as const,
    showLivingIndicator: true,
  };
  const photos = new Map<UUID, string>([["r", "data:image/webp;base64,TT"]]);

  // Deliberately re-runs the WHOLE pipeline (layout -> page size -> render) per viewport, not just
  // renderPosterSvg: a responsive leak would most plausibly enter via layout or page sizing.
  function exportAt(width: number, height: number): string {
    return withViewport(width, height, () => {
      const layout = computeBalancedPosterLayout(tree(), style);
      const page = computePosterPageSize(layout, style);
      return renderPosterSvg(layout, page, style, photos);
    });
  }

  it("renders identical SVG at every viewport width", () => {
    const [first, ...rest] = VIEWPORTS.map((vp) => ({
      name: vp.name,
      svg: exportAt(vp.width, vp.height),
    }));
    for (const other of rest) {
      expect(other.svg, `${other.name} export differs from ${first!.name}`).toBe(first!.svg);
    }
  });

  it("renders identical SVG across every theme x viewport combination", () => {
    const baseline = exportAt(1280, 900);
    for (const theme of ["light", "dark"] as const) {
      for (const vp of VIEWPORTS) {
        applyTheme(theme);
        expect(exportAt(vp.width, vp.height), `${theme} @ ${vp.name} differs from baseline`).toBe(
          baseline
        );
      }
    }
  });
});
