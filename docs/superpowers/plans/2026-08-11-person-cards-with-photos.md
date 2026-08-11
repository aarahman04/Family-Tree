# Person Cards with Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-person photos and three configurable card display modes (Minimal / Compact / Photo Cards) to the shared poster renderer, without changing the layout/positioning engine.

**Architecture:** All photo work lands in two shared-engine files — box *sizing* (`poster/boxSizing.ts`) and the *node renderer* (`poster/renderSvg.ts`) — plus small web-layer additions for image processing, preferences, and UI. Photos ride into the single SVG string as `<image href="…">` so editor/SVG/PDF stay identical and self-contained. Photo bytes are passed to the renderer as an opaque `Map<personId, href>` (never stored on `PosterNode`), and layout is memoized on a structural key that excludes photo bytes — so a photo edit re-renders the SVG only, never re-runs layout.

**Tech Stack:** TypeScript, React 18, Vite, Vitest (+ @testing-library/react, jsdom) for `web`; plain Vitest for the root `poster/`/`models/`/`editor/` packages. Browser Canvas API for image processing (no new dependencies).

## Global Constraints

- **Backwards compatibility:** `displayMode` defaults to `"compact"` and `renderPosterSvg`'s new `photos` param is optional. With these defaults, `computePersonBox` and `renderPosterSvg` MUST produce byte-for-byte identical output to today. Every existing test in `tests/` and `web/tests/` must stay green without modification.
- **No layout-engine changes:** `poster/layout.ts` node *placement* and `poster/layoutBalanced.ts` are not modified except to populate the new derived `PosterNode.living` field. Positioning math is untouched.
- **Renderer stays storage-agnostic:** `renderPosterSvg` receives only opaque href strings — no knowledge of data URIs, blobs, or files. Only `web/src/lib/resolvePhoto.ts` knows photos are data URIs today.
- **A photo never breaks rendering (refinement 3):** the renderer must never throw because of a photo. An absent OR empty href renders the placeholder. Corrupt/undecodable/unsupported files are rejected during processing (Task 5) so they are never stored, and the inspector falls back to the placeholder with an error message.
- **Photo size is capped (refinement 2):** the photo is a square capped at `PHOTO_MAX_PT` (~88pt ≈ 88–96px at export scale), centered at the top of the card — never full card width. It scales down for narrow cards. This keeps names readable, cards compact, and leaves vertical room for a future Detailed mode.
- **Year line (refinement 1):** every mode that shows a year uses the existing `yearLineFor()` — `1974–` living, `1974–2022` deceased, existing behavior when unknown. No second formatter. **Minimal** shows the name only (no year) by design; the living/deceased dot is the extra visual cue on photo cards.
- **Memory (refinement 5):** the editor/preview build only the `thumb` (160px) photo map and the hover preview uses the `thumb`; the `print` (640px) map is built **only** when an export explicitly requests High quality, and is not retained afterward.
- **Export consistency (refinement 4):** editor, SVG, and PDF all render from the single `renderPosterSvg` string, so a given `(displayMode, photoShape, photos)` looks identical across all three surfaces. The final verification asserts this.
- **No new npm dependencies.** Image processing uses the browser Canvas API only.
- **ESM import paths:** this repo imports with explicit `.js` extensions (e.g. `../../models/types.js`) even from `.ts`/`.tsx`. Match that in every new/edited import.
- **Photo formats accepted:** `image/png`, `image/jpeg`, `image/webp`. Encoded output: WebP, two sizes — `thumb` 160px, `print` 640px.
- **Commit style:** end each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Test commands:** root packages → `npm test` (runs `vitest run` from repo root). Web → `npm test --workspace web`. Typecheck → `npm run typecheck` (root) and `npm run typecheck --workspace web`.

---

### Task 1: Data model & appearance style types

**Files:**
- Modify: `models/types.ts` (add `PersonPhoto`; add `Person.photo`)
- Modify: `poster/types.ts` (add `DisplayMode`, `PhotoShape`; extend `PosterStyleOptions`, `PosterNode`; extend `DEFAULT_POSTER_STYLE`)
- Test: `tests/person-photo-model.test.ts`

**Interfaces:**
- Produces:
  - `interface PersonPhoto { thumb: string; print: string; alt?: string }`
  - `Person.photo?: PersonPhoto`
  - `type DisplayMode = "minimal" | "compact" | "photoCards"`
  - `type PhotoShape = "square" | "rounded" | "circle"`
  - `PosterStyleOptions.displayMode: DisplayMode`, `.photoShape: PhotoShape`, `.showLivingIndicator: boolean`
  - `PosterNode.living?: boolean`
  - `DEFAULT_POSTER_STYLE` gains `displayMode: "compact"`, `photoShape: "rounded"`, `showLivingIndicator: false`

- [ ] **Step 1: Write the failing test**

Create `tests/person-photo-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_POSTER_STYLE } from "../poster/types.js";
import type { PersonPhoto } from "../models/types.js";

describe("person photo model + appearance defaults", () => {
  it("DEFAULT_POSTER_STYLE keeps compact defaults for backwards compatibility", () => {
    expect(DEFAULT_POSTER_STYLE.displayMode).toBe("compact");
    expect(DEFAULT_POSTER_STYLE.photoShape).toBe("rounded");
    expect(DEFAULT_POSTER_STYLE.showLivingIndicator).toBe(false);
  });

  it("PersonPhoto carries two sizes and optional alt", () => {
    const photo: PersonPhoto = { thumb: "data:image/webp;base64,AAA", print: "data:image/webp;base64,BBB" };
    expect(photo.thumb).toContain("webp");
    expect(photo.print).toContain("webp");
    expect(photo.alt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/person-photo-model.test.ts`
Expected: FAIL — `displayMode` does not exist on `DEFAULT_POSTER_STYLE`.

- [ ] **Step 3: Implement the model + type changes**

In `models/types.ts`, add above `Person`:

```ts
export interface PersonPhoto {
  /** ~160px WebP data URI — the image the renderer embeds by default. */
  thumb: string;
  /** ~640px WebP data URI — used by the "High quality" export option. */
  print: string;
  /** Optional caption; UI defaults it to "Photo of {name}". */
  alt?: string;
}
```

In `Person`, add after `media: MediaRef[];`:

```ts
  photo?: PersonPhoto;
```

In `poster/types.ts`, add near the top (after imports):

```ts
export type DisplayMode = "minimal" | "compact" | "photoCards";
export type PhotoShape = "square" | "rounded" | "circle";
```

In `PosterNode`, add:

```ts
  /** True when no death year is recorded. Derived, does not affect geometry. */
  living?: boolean;
```

In `PosterStyleOptions`, add:

```ts
  /** Card style. "compact" reproduces the original box exactly. */
  displayMode: DisplayMode;
  /** Clip shape applied to photos and photo placeholders. */
  photoShape: PhotoShape;
  /** Show a small living/deceased status dot on photo cards. */
  showLivingIndicator: boolean;
```

In `DEFAULT_POSTER_STYLE`, add:

```ts
  displayMode: "compact",
  photoShape: "rounded",
  showLivingIndicator: false,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/person-photo-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm nothing else broke + typecheck**

Run: `npm test && npm run typecheck`
Expected: all existing tests still PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add models/types.ts poster/types.ts tests/person-photo-model.test.ts
git commit -m "feat(model): add PersonPhoto + display-mode/photo-shape style options

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Box sizing for display modes

**Files:**
- Modify: `poster/boxSizing.ts` (branch `computePersonBox` on `style.displayMode`; export `photoAreaHeight`, `CARD_DIVIDER_GAP`)
- Test: `tests/box-sizing-modes.test.ts`

**Interfaces:**
- Consumes: `PosterStyleOptions.displayMode` (Task 1).
- Produces:
  - `export const CARD_DIVIDER_GAP = 6`, `export const PHOTO_TOP_PAD = 8`, `export const PHOTO_MAX_PT = 88`
  - `export function photoAreaHeight(width: number, style: PosterStyleOptions): number` — returns the **capped** square photo side (`min(PHOTO_MAX_PT, width - PHOTO_TOP_PAD*2)`) when `displayMode === "photoCards"`, else `0`. Single source of truth for the square photo slot, reused verbatim by the renderer (Task 3) so the reserved space and the drawn photo always match.
  - `computePersonBox(...)` unchanged signature; behavior branches by mode.

- [ ] **Step 1: Write the failing test**

Create `tests/box-sizing-modes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computePersonBox, photoAreaHeight } from "../poster/boxSizing.js";
import { DEFAULT_POSTER_STYLE } from "../poster/types.js";

const compact = DEFAULT_POSTER_STYLE;
const photoCards = { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" as const };
const minimal = { ...DEFAULT_POSTER_STYLE, displayMode: "minimal" as const };

describe("computePersonBox display modes", () => {
  it("compact output is unchanged (regression guard)", () => {
    const box = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
    // Height equals the original compact formula: floored at nodeMinHeight.
    expect(box.height).toBeGreaterThanOrEqual(compact.nodeMinHeight);
    expect(photoAreaHeight(box.width, compact)).toBe(0);
  });

  it("photoCards reserves a capped square photo slot (not full card width)", () => {
    const box = computePersonBox("Ahmed Rahman", "1974–2022", undefined, photoCards);
    const compactBox = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
    const side = photoAreaHeight(box.width, photoCards);
    expect(side).toBeGreaterThan(0);
    expect(side).toBeLessThanOrEqual(88); // PHOTO_MAX_PT — never full width
    // Photo card is taller than compact, but the photo does not dominate (capped, not full width).
    expect(box.height).toBeGreaterThan(compactBox.height);
    expect(box.height).toBeLessThan(compactBox.height + box.width);
  });

  it("minimal omits the year line height (shorter than compact)", () => {
    const withYear = computePersonBox("Ahmed Rahman", "1974–2022", undefined, minimal);
    const compactBox = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
    expect(withYear.height).toBeLessThan(compactBox.height);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box-sizing-modes.test.ts`
Expected: FAIL — `photoAreaHeight` is not exported.

- [ ] **Step 3: Implement the mode branches**

In `poster/boxSizing.ts`, add after the existing top-of-file constants (`NOTE_FONT_RATIO`):

```ts
/** Gap between the photo and the text block on a photo card. */
export const CARD_DIVIDER_GAP = 6; // pt
/** Space above the photo, inside the card's top edge. */
export const PHOTO_TOP_PAD = 8; // pt
/** A photo never exceeds this square side, so cards stay compact and names readable even on
 * wide boxes — the photo scales down for narrow cards but is capped here (refinement 2). */
export const PHOTO_MAX_PT = 88; // pt

/** The square photo side for a card of the given width: capped at PHOTO_MAX_PT, shrinking
 * proportionally for narrow cards, and 0 unless in photoCards mode. Depends only on style +
 * width — never on whether a person has a photo — so adding/removing a photo never changes
 * geometry. Reused verbatim by renderSvg.ts so the reserved slot and the drawn photo match. */
export function photoAreaHeight(width: number, style: PosterStyleOptions): number {
  if (style.displayMode !== "photoCards") return 0;
  // Math.max(0, …) so the slot can never go negative for a pathologically narrow card. This
  // does NOT rely on nodeMinWidth (a config value, not a proven invariant) staying ≥ 16.
  return Math.max(0, Math.min(PHOTO_MAX_PT, width - PHOTO_TOP_PAD * 2));
}
```

Replace the height computation block in `computePersonBox` (the `const height = Math.max(...)` at the end) with:

```ts
  const showYear = style.displayMode !== "minimal" && !!yearText;
  const yearLineHeight = showYear ? style.yearFontSize * LINE_HEIGHT_RATIO : 0;
  const noteLineHeight = noteLine ? noteFontSize * LINE_HEIGHT_RATIO : 0;
  const textHeight = PADDING_Y * 2 + lines.length * nameLineHeight + yearLineHeight + noteLineHeight;

  let height: number;
  if (style.displayMode === "photoCards") {
    height = PHOTO_TOP_PAD + photoAreaHeight(width, style) + CARD_DIVIDER_GAP + Math.max(style.nodeMinHeight * 0.7, textHeight);
  } else if (style.displayMode === "minimal") {
    height = Math.max(style.nodeMinHeight * 0.6, textHeight);
  } else {
    height = Math.max(style.nodeMinHeight, textHeight);
  }
```

(Delete the old `const yearLineHeight = yearText ? ...`, `const noteLineHeight = ...`, and `const height = Math.max(...)` lines they replace — the new block defines them.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/box-sizing-modes.test.ts`
Expected: PASS.

- [ ] **Step 5: Regression — full root suite**

Run: `npm test`
Expected: all existing poster tests (`tests/poster-*.test.ts`) still PASS (compact path is byte-for-byte identical).

- [ ] **Step 6: Commit**

```bash
git add poster/boxSizing.ts tests/box-sizing-modes.test.ts
git commit -m "feat(poster): size boxes per display mode; reserve square photo slot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Node renderer — display modes, photos, placeholder, shapes, living dot

**Files:**
- Modify: `poster/renderSvg.ts` (`renderNode` branches on mode; add optional `photos` param to `renderPosterSvg`; add shape clip, placeholder, living dot, extension hook)
- Modify: `poster/layout.ts:381` (populate `living` on each node)
- Test: `tests/poster-photo-render.test.ts`

**Interfaces:**
- Consumes: `photoAreaHeight` + `CARD_DIVIDER_GAP` + `PHOTO_TOP_PAD` (Task 2); `PosterStyleOptions.displayMode/photoShape/showLivingIndicator`, `PosterNode.living` (Task 1).
- Produces: `renderPosterSvg(layout, page, style, photos?: ReadonlyMap<UUID, string>): string`. Photo cards emit `<image href>` when a href is supplied for that personId, otherwise a styled placeholder; both clipped to `photoShape`.

**Part A — finalize Task 2's sizing contract (do this FIRST, as its own commit `refactor(poster): clamp photo slot + pin compact sizing`). Touches `poster/boxSizing.ts` + `tests/box-sizing-modes.test.ts`.**

- [ ] **A1: Clamp `photoAreaHeight`** so it can never return a negative slot (the `Math.max(0, …)` shown in Task 2's snippet). Add a short `//` comment naming that this does NOT rely on `nodeMinWidth ≥ 16`.
- [ ] **A2: Tighten the two loose tests** in `tests/box-sizing-modes.test.ts`:
  - Cap boundary — assert exact values: `expect(photoAreaHeight(104, photoCards)).toBe(88)` and `expect(photoAreaHeight(103, photoCards)).toBe(87)`, and `expect(photoAreaHeight(10, photoCards)).toBe(0)` (clamp).
  - Minimal delta — use a name long enough to wrap to **2 lines** under `nodeMaxWidth` (e.g. `"Alexander Maximilian Featherstonehaugh Wetherby"`) so NEITHER the compact `nodeMinHeight` floor NOR the minimal `nodeMinHeight*0.6` floor binds, then assert the exact dropped-year delta:
    ```ts
    const name = "Alexander Maximilian Featherstonehaugh Wetherby";
    const c = computePersonBox(name, "1974–2022", undefined, compact);
    const m = computePersonBox(name, "1974–2022", undefined, minimal);
    expect(c.lines.length).toBeGreaterThanOrEqual(2); // guard: floors don't bind
    expect(c.height - m.height).toBeCloseTo(DEFAULT_POSTER_STYLE.yearFontSize * 1.25, 5);
    ```
- [ ] **A3: Pin compact output** with a characterization test that locks the EXACT current numeric width and height for a fixed input under the default (compact) style — capture the current values by running the function once and hard-coding them, so any future refactor that changes compact geometry fails loudly:
    ```ts
    it("compact box dimensions are pinned (characterization guard)", () => {
      const box = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
      // Values captured from the current heuristic measurer — DO NOT recompute to match a
      // change; a diff here means compact geometry moved and must be justified.
      expect(box.width).toBeCloseTo(/* CAPTURE the current value */ 0, 3);
      expect(box.height).toBeCloseTo(/* CAPTURE the current value */ 0, 3);
    });
    ```
  Replace the two `0` placeholders with the actual values you observe (log them once, then hard-code). Commit Part A, run the full suite green, THEN start Part B.

- [ ] **Step 1: Write the failing tests**

Create `tests/poster-photo-render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeBalancedPosterLayout } from "../poster/layoutBalanced.js";
import { computePosterPageSize } from "../poster/pageSize.js";
import { renderPosterSvg } from "../poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE, type PhotoShape } from "../poster/types.js";
import { makeTree } from "./helpers.js"; // existing helper builder

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
    const id = layout.nodes[0].personId;
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
    const id = layout.nodes[0].personId;
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
```

> Note: if `tests/helpers.ts` lacks a `makeTree` export, use the same tree-construction approach the neighboring `tests/poster-render.test.ts` uses (read it first) and adapt these assertions to whatever person id it produces.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/poster-photo-render.test.ts`
Expected: FAIL — photoCards branch not implemented; `renderPosterSvg` ignores a 4th arg.

- [ ] **Step 3: Populate `living` in the layout**

In `poster/layout.ts`, at the node object literal that sets `yearLine: yearLineFor(person)` (around line 381), add a sibling field:

```ts
      living: !person?.death?.date?.year,
```

- [ ] **Step 4: Implement the renderer branches**

In `poster/renderSvg.ts`:

1. Import the shared slot helpers at the top:

```ts
import { photoAreaHeight, CARD_DIVIDER_GAP, PHOTO_TOP_PAD } from "./boxSizing.js";
```

2. Add helpers above `renderNode`:

```ts
/** Clip-path def + the attribute to apply it, for a square/rounded/circle photo slot at
 * (x,y) sized `side`×`side`. Returns {def, attr}; `id` must be unique per node. */
function photoClip(id: string, x: number, y: number, side: number, shape: "square" | "rounded" | "circle"): { def: string; attr: string } {
  let inner: string;
  if (shape === "circle") {
    inner = `<circle cx="${num(x + side / 2)}" cy="${num(y + side / 2)}" r="${num(side / 2)}"/>`;
  } else {
    const rx = shape === "rounded" ? Math.min(10, side * 0.12) : 0;
    inner = `<rect x="${num(x)}" y="${num(y)}" width="${num(side)}" height="${num(side)}" rx="${num(rx)}"/>`;
  }
  return { def: `<clipPath id="${id}">${inner}</clipPath>`, attr: `clip-path="url(#${id})"` };
}

/** A polished neutral placeholder: subtle gray fill + a simple head-and-shoulders silhouette,
 * clipped to the same shape as real photos. Never an empty white box. */
function photoPlaceholder(x: number, y: number, side: number, clipAttr: string, name: string): string {
  const cx = x + side / 2;
  const headR = side * 0.17;
  const headCy = y + side * 0.4;
  const shoulderR = side * 0.34;
  const shoulderCy = y + side * 0.95;
  return (
    `<g ${clipAttr} role="img"><title>No photo available</title>` +
    `<rect x="${num(x)}" y="${num(y)}" width="${num(side)}" height="${num(side)}" fill="#e2e8f0"/>` +
    `<circle cx="${num(cx)}" cy="${num(headCy)}" r="${num(headR)}" fill="#cbd5e1"/>` +
    `<circle cx="${num(cx)}" cy="${num(shoulderCy)}" r="${num(shoulderR)}" fill="#cbd5e1"/>` +
    `</g>`
  );
}

// ─── CARD EXTENSION POINT (refinement 6) ───────────────────────────────────────
/** Future optional card elements render here, BELOW the name/year block, without any change
 * to the photo/name geometry above. Intended for the future "detailed" mode:
 *   • Occupation   • Country   • Verification badge   • Notes indicator   • Document count
 * Return additional SVG strings when implementing them. Intentionally a no-op today — this is
 * the single, documented place to grow the card so nothing above needs a redesign. */
function renderCardExtras(_node: PosterNode, _style: PosterStyleOptions): string {
  return "";
}
// ────────────────────────────────────────────────────────────────────────────────
```

3. Refactor `renderNode`. Keep the **compact** path byte-for-byte identical (move the current body into a `compact` branch). New shape:

```ts
function renderNode(node: PosterNode, offsetX: number, offsetY: number, style: PosterStyleOptions, photoHref?: string): string {
  if (style.displayMode === "photoCards") return renderPhotoCard(node, offsetX, offsetY, style, photoHref);
  if (style.displayMode === "minimal") return renderMinimalNode(node, offsetX, offsetY, style);
  return renderCompactNode(node, offsetX, offsetY, style); // the original renderNode body, unchanged
}
```

- `renderCompactNode`: paste the **current** `renderNode` body verbatim (rect + gender glyph/stripe + name lines + year + note). Do not alter it.
- `renderMinimalNode`: rect (rx=4) + centered name lines only (reuse the name-line loop from compact, centered vertically; no gender glyph, no year, no note).
- `renderPhotoCard`:

```ts
function renderPhotoCard(node: PosterNode, offsetX: number, offsetY: number, style: PosterStyleOptions, photoHref?: string): string {
  const cx = offsetX + node.x;
  const cyTop = offsetY + node.y - node.height / 2;
  const x = cx - node.width / 2;
  const side = photoAreaHeight(node.width, style); // capped square side (refinement 2)
  const photoX = cx - side / 2;                    // centered horizontally, not full-bleed
  const photoY = cyTop + PHOTO_TOP_PAD;
  const cardBottom = cyTop + node.height;
  const parts: string[] = [];

  // Card outline.
  parts.push(
    `<rect x="${num(x)}" y="${num(cyTop)}" width="${num(node.width)}" height="${num(node.height)}" rx="6" fill="${style.backgroundColor}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );

  // Photo (image or placeholder), clipped to the chosen shape. An absent OR empty href always
  // falls back to the placeholder, so a missing/failed photo can never break rendering
  // (refinement 3). The renderer builds strings only and never throws on a photo.
  //
  // EQUAL-SIZE SHAPES: the pre-cropped square thumbnail FILLS the full `side`×`side` square for
  // every photoShape (`slice` = scale-to-fit; square→square, so NO second crop and no aspect
  // logic here — that lives only in Task 5's ingestion). Only the clip differs. The circle uses
  // r = side/2 (inscribed); it is intentionally NOT enlarged beyond the square — doing so would
  // overflow the reserved slot and break the fixed photo footprint. The face therefore renders
  // at the same scale in all three shapes; the circle just omits the corners.
  const clip = photoClip(`ph-${node.personId}`, photoX, photoY, side, style.photoShape);
  parts.push(clip.def);
  if (photoHref) {
    parts.push(
      `<image href="${escapeXml(photoHref)}" x="${num(photoX)}" y="${num(photoY)}" width="${num(side)}" height="${num(side)}" preserveAspectRatio="xMidYMid slice" ${clip.attr}><title>Photo of ${escapeXml(node.name)}</title></image>`
    );
  } else {
    parts.push(photoPlaceholder(photoX, photoY, side, clip.attr, node.name));
  }

  // Divider under the photo.
  const dividerY = photoY + side + PHOTO_TOP_PAD / 2;
  parts.push(
    `<line x1="${num(x)}" y1="${num(dividerY)}" x2="${num(x + node.width)}" y2="${num(dividerY)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );

  // Gender glyph in the text region's top-left (reuse existing genderIcon).
  const textTop = dividerY + CARD_DIVIDER_GAP;
  if (node.gender === "male" || node.gender === "female") {
    parts.push(genderIcon(node.gender, x, textTop - 2, style));
  }

  // Name + year, centered in the lower text region.
  const nameLineHeight = style.nameFontSize * 1.25;
  const yearH = node.yearLine ? style.yearFontSize * 1.25 : 0;
  const totalTextHeight = node.nameLines.length * nameLineHeight + yearH;
  const regionCenter = textTop + (cardBottom - textTop) / 2;
  let lineY = regionCenter - totalTextHeight / 2 + nameLineHeight / 2;
  for (const line of node.nameLines) {
    parts.push(textLine(cx, lineY, line, style.nameFontSize, style.textColor, style.fontFamily, node.rtl));
    lineY += nameLineHeight;
  }
  if (node.yearLine) {
    parts.push(textLine(cx, lineY, node.yearLine, style.yearFontSize, style.textColor, style.fontFamily, false));
  }

  // Optional living/deceased dot, bottom-right.
  if (style.showLivingIndicator) {
    const dotColor = node.living ? "#16a34a" : "#9ca3af";
    parts.push(
      `<circle data-role="living-dot" cx="${num(x + node.width - 8)}" cy="${num(cardBottom - 8)}" r="3.2" fill="${dotColor}"/>`
    );
  }

  parts.push(renderCardExtras(node, style));
  return parts.join("");
}
```

4. Change `renderPosterSvg`'s signature and the node loop:

```ts
export function renderPosterSvg(
  layout: PosterLayout,
  page: PosterPageSize,
  style: PosterStyleOptions,
  photos?: ReadonlyMap<UUID, string>,
): string {
```

and where nodes are drawn (the `for (const node of layout.nodes)` loop near the end):

```ts
  for (const node of layout.nodes) {
    svgParts.push(renderNode(node, offsetX, offsetY, style, photos?.get(node.personId)));
  }
```

Add `UUID` to the type import at the top if not already present:

```ts
import type { PosterChip, PosterLayout, PosterNode, PosterPageSize, PosterStyleOptions, UUID } from "./types.js";
```

(If `UUID` is not re-exported from `poster/types.ts`, import it from `../models/types.js` instead.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/poster-photo-render.test.ts`
Expected: PASS.

- [ ] **Step 6: Regression — full root suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: existing `tests/poster-render.test.ts` (compact) still PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add poster/renderSvg.ts poster/layout.ts tests/poster-photo-render.test.ts
git commit -m "feat(poster): render photo cards, minimal mode, placeholder, shapes, living dot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Structural layout memo key

**Files:**
- Create: `poster/layoutKey.ts`
- Test: `tests/layout-key.test.ts`

**Interfaces:**
- Consumes: `FamilyTree` (`models/types.js`), `PosterStyleOptions` (`poster/types.js`).
- Produces: `export function posterLayoutKey(tree: FamilyTree, style: PosterStyleOptions): string` — a compact signature of every layout-affecting input (person ids/names/birth+death years/gender/famc/fams, family memberships, and the sizing-relevant style fields incl. `displayMode`, `photoShape`, `showLivingIndicator`), **excluding `person.photo`**. Consumed by Task 10 to memoize layout so photo edits don't recompute it.

- [ ] **Step 1: Write the failing test**

Create `tests/layout-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { posterLayoutKey } from "../poster/layoutKey.js";
import { DEFAULT_POSTER_STYLE } from "../poster/types.js";
import type { FamilyTree } from "../models/types.js";

function tree(): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "t" },
    persons: {
      p1: { id: "p1", name: "Ann", gender: "female", notes: [], media: [], famsIds: [], birth: { id: "b", type: "birth", date: { year: 1950 } } },
    },
    families: {},
    validation: { validatedAt: "t", issues: [], isValid: true },
  };
}

describe("posterLayoutKey", () => {
  it("is unchanged when only a photo is added/changed", () => {
    const a = tree();
    const b = tree();
    b.persons.p1.photo = { thumb: "data:image/webp;base64,X", print: "data:image/webp;base64,Y" };
    expect(posterLayoutKey(b, DEFAULT_POSTER_STYLE)).toBe(posterLayoutKey(a, DEFAULT_POSTER_STYLE));
  });

  it("changes when a name changes", () => {
    const a = tree();
    const b = tree();
    b.persons.p1.name = "Anne";
    expect(posterLayoutKey(b, DEFAULT_POSTER_STYLE)).not.toBe(posterLayoutKey(a, DEFAULT_POSTER_STYLE));
  });

  it("changes when the display mode changes", () => {
    const a = tree();
    expect(posterLayoutKey(a, { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" })).not.toBe(
      posterLayoutKey(a, DEFAULT_POSTER_STYLE)
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layout-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `poster/layoutKey.ts`:

```ts
import type { FamilyTree } from "../models/types.js";
import type { PosterStyleOptions } from "./types.js";

/**
 * A compact signature of everything that affects box sizing and node placement — but NOT
 * photo bytes. Two trees that differ only in a `person.photo` produce the same key, so the
 * editor can memoize the (expensive) layout across photo edits and only regenerate the SVG.
 * Display-mode / shape / sizing style changes DO change the key (geometry genuinely changes).
 */
export function posterLayoutKey(tree: FamilyTree, style: PosterStyleOptions): string {
  const parts: string[] = [
    // Sizing- and mode-relevant style only.
    style.displayMode,
    style.photoShape,
    String(style.showLivingIndicator),
    String(style.nameFontSize),
    String(style.yearFontSize),
    String(style.nodeMinWidth),
    String(style.nodeMaxWidth),
    String(style.nodeMinHeight),
    String(style.horizontalSpacing),
    String(style.generationSpacing),
    style.fontFamily,
  ];
  for (const id of Object.keys(tree.persons).sort()) {
    const p = tree.persons[id];
    parts.push(
      [
        id,
        p.name,
        p.nickname ?? "",
        p.gender,
        p.birth?.date?.year ?? "",
        p.death?.date?.year ?? "",
        p.famcId ?? "",
        p.famsIds.join(","),
      ].join("|")
    );
  }
  for (const id of Object.keys(tree.families).sort()) {
    const f = tree.families[id];
    parts.push([id, f.husbandId ?? "", f.wifeId ?? "", f.childrenIds.join(",")].join("|"));
  }
  return parts.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/layout-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add poster/layoutKey.ts tests/layout-key.test.ts
git commit -m "feat(poster): structural layout key that excludes photo bytes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Image processing (crop + WebP thumbnails)

**Files:**
- Create: `web/src/lib/photo.ts`
- Test: `web/tests/lib/photo.test.ts`

**Interfaces:**
- Produces:
  - `export const ACCEPTED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const`
  - `export const MAX_PHOTO_BYTES = 20 * 1024 * 1024`
  - `export function isAcceptedPhotoType(type: string): boolean`
  - `export interface FaceBox { x: number; y: number; width: number; height: number }`
  - `export function computeSquareCrop(width: number, height: number, face?: FaceBox): { sx: number; sy: number; size: number }`
  - `export async function processImageFile(file: File): Promise<PersonPhoto>` (throws `Error` on unsupported type / oversize)

- [ ] **Step 1: Write the failing tests** (pure functions + validation only — canvas encode needs a browser, so it is not asserted here)

Create `web/tests/lib/photo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeSquareCrop, isAcceptedPhotoType, processImageFile } from "../../src/lib/photo.js";

describe("computeSquareCrop", () => {
  it("center-crops a landscape image to the shorter side", () => {
    expect(computeSquareCrop(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });
  it("center-crops a portrait image", () => {
    expect(computeSquareCrop(100, 200)).toEqual({ sx: 0, sy: 50, size: 100 });
  });
  it("returns the whole frame for an already-square image", () => {
    expect(computeSquareCrop(120, 120)).toEqual({ sx: 0, sy: 0, size: 120 });
  });
  it("centers on a provided face box, clamped within bounds", () => {
    // Face near the top; crop should shift up but never below y=0.
    const c = computeSquareCrop(200, 200, { x: 80, y: 5, width: 40, height: 40 });
    expect(c.size).toBe(200);
    expect(c.sy).toBe(0);
  });
});

describe("isAcceptedPhotoType", () => {
  it("accepts png/jpeg/webp and rejects others", () => {
    expect(isAcceptedPhotoType("image/png")).toBe(true);
    expect(isAcceptedPhotoType("image/jpeg")).toBe(true);
    expect(isAcceptedPhotoType("image/webp")).toBe(true);
    expect(isAcceptedPhotoType("image/gif")).toBe(false);
    expect(isAcceptedPhotoType("application/pdf")).toBe(false);
  });
});

describe("processImageFile validation", () => {
  it("rejects an unsupported type before any canvas work", async () => {
    const file = new File(["x"], "a.gif", { type: "image/gif" });
    await expect(processImageFile(file)).rejects.toThrow(/unsupported/i);
  });

  it("rejects a corrupt/undecodable image (caller falls back to placeholder)", async () => {
    // jsdom has no createImageBitmap; stub it to reject, simulating a corrupt file.
    const g = globalThis as unknown as { createImageBitmap?: unknown };
    const prev = g.createImageBitmap;
    g.createImageBitmap = () => Promise.reject(new Error("decode failed"));
    try {
      const file = new File(["not-a-real-png"], "a.png", { type: "image/png" });
      await expect(processImageFile(file)).rejects.toThrow();
    } finally {
      g.createImageBitmap = prev;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace web -- lib/photo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/lib/photo.ts`:

```ts
import type { PersonPhoto } from "../../../models/types.js";

export const ACCEPTED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const THUMB_SIZE = 160;
const PRINT_SIZE = 640;
const THUMB_QUALITY = 0.82;
const PRINT_QUALITY = 0.85;

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isAcceptedPhotoType(type: string): boolean {
  return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(type);
}

/** The largest centered square crop. If a face box is given, center the square on the face
 * center instead, clamped so it never leaves the image. Pure — no canvas, so it is unit-tested. */
export function computeSquareCrop(width: number, height: number, face?: FaceBox): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  let sx = (width - size) / 2;
  let sy = (height - size) / 2;
  if (face) {
    const fcx = face.x + face.width / 2;
    const fcy = face.y + face.height / 2;
    sx = Math.min(Math.max(0, fcx - size / 2), width - size);
    sy = Math.min(Math.max(0, fcy - size / 2), height - size);
  }
  return { sx, sy, size };
}

/** Best-effort face box via the experimental FaceDetector (Chromium). Returns undefined when
 * unavailable or on any error, so callers fall back to a center crop. */
async function detectFace(bitmap: ImageBitmap): Promise<FaceBox | undefined> {
  const FD = (globalThis as unknown as { FaceDetector?: new () => { detect(src: ImageBitmap): Promise<Array<{ boundingBox: FaceBox }>> } }).FaceDetector;
  if (!FD) return undefined;
  try {
    const faces = await new FD().detect(bitmap);
    return faces[0]?.boundingBox;
  } catch {
    return undefined;
  }
}

async function encodeSquare(bitmap: ImageBitmap, crop: { sx: number; sy: number; size: number }, out: number, quality: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.size, crop.size, 0, 0, out, out);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("Image encoding failed");
  return await blobToDataUri(blob);
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image data"));
    reader.readAsDataURL(blob);
  });
}

/** Validate → decode → square-crop (face-centered if possible) → encode two WebP sizes.
 * The original is never retained. Throws on unsupported type, oversize input, OR a
 * corrupt/undecodable image (createImageBitmap rejects). Callers (the inspector) catch and
 * fall back to the placeholder, so a bad file is never stored and never reaches the renderer
 * (refinement 3). */
export async function processImageFile(file: File): Promise<PersonPhoto> {
  if (!isAcceptedPhotoType(file.type)) {
    throw new Error("Unsupported image type — please use PNG, JPEG, or WebP.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Image is too large — please use a file under 20 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const face = await detectFace(bitmap);
    const crop = computeSquareCrop(bitmap.width, bitmap.height, face);
    const thumb = await encodeSquare(bitmap, crop, THUMB_SIZE, THUMB_QUALITY);
    const print = await encodeSquare(bitmap, crop, PRINT_SIZE, PRINT_QUALITY);
    return { thumb, print };
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace web -- lib/photo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/photo.ts web/tests/lib/photo.test.ts
git commit -m "feat(web): client-side square crop + WebP thumbnail generation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Photo accessor + render-map builder (the only data-URI-aware layer)

**Files:**
- Create: `web/src/lib/resolvePhoto.ts`
- Test: `web/tests/lib/resolvePhoto.test.ts`

**Interfaces:**
- Consumes: `Person`, `FamilyTree`, `UUID` (`models/types.js`).
- Produces:
  - `export type PhotoQuality = "thumb" | "print"`
  - `export function photoAlt(person: Person): string` → `person.photo?.alt ?? "Photo of {name}"`
  - `export function resolvePhoto(person: Person, quality: PhotoQuality): string | undefined`
  - `export function buildPhotoMap(tree: FamilyTree, quality: PhotoQuality): Map<UUID, string>` — the `photos` map passed to `renderPosterSvg`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/lib/resolvePhoto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPhotoMap, photoAlt, resolvePhoto } from "../../src/lib/resolvePhoto.js";
import type { FamilyTree, Person } from "../../../models/types.js";

const withPhoto: Person = {
  id: "p1", name: "Ann", gender: "female", notes: [], media: [], famsIds: [],
  photo: { thumb: "T", print: "P" },
};
const noPhoto: Person = { id: "p2", name: "Bo", gender: "male", notes: [], media: [], famsIds: [] };

describe("resolvePhoto", () => {
  it("selects thumb vs print", () => {
    expect(resolvePhoto(withPhoto, "thumb")).toBe("T");
    expect(resolvePhoto(withPhoto, "print")).toBe("P");
    expect(resolvePhoto(noPhoto, "thumb")).toBeUndefined();
  });
  it("derives alt text from the name", () => {
    expect(photoAlt(withPhoto)).toBe("Photo of Ann");
  });
  it("buildPhotoMap includes only people with photos", () => {
    const tree = {
      metadata: { sourceFormat: "manual", importedAt: "t" },
      persons: { p1: withPhoto, p2: noPhoto },
      families: {},
      validation: { validatedAt: "t", issues: [], isValid: true },
    } as unknown as FamilyTree;
    const map = buildPhotoMap(tree, "thumb");
    expect(map.get("p1")).toBe("T");
    expect(map.has("p2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace web -- lib/resolvePhoto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/lib/resolvePhoto.ts`:

```ts
import type { FamilyTree, Person, UUID } from "../../../models/types.js";

export type PhotoQuality = "thumb" | "print";

/** The ONLY code that knows photos are data URIs today. Swap this to blob/file/remote URLs
 * later without touching the renderer, which only ever receives an opaque href string. */
export function resolvePhoto(person: Person, quality: PhotoQuality): string | undefined {
  return person.photo?.[quality];
}

export function photoAlt(person: Person): string {
  return person.photo?.alt ?? `Photo of ${person.name}`;
}

export function buildPhotoMap(tree: FamilyTree, quality: PhotoQuality): Map<UUID, string> {
  const map = new Map<UUID, string>();
  for (const id of Object.keys(tree.persons)) {
    const href = resolvePhoto(tree.persons[id], quality);
    if (href) map.set(id, href);
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace web -- lib/resolvePhoto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/resolvePhoto.ts web/tests/lib/resolvePhoto.test.ts
git commit -m "feat(web): photo accessor + render-map builder (sole data-URI layer)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Appearance preferences persistence

**Files:**
- Create: `web/src/lib/appearancePrefs.ts`
- Test: `web/tests/lib/appearancePrefs.test.ts`

**Interfaces:**
- Consumes: `DisplayMode`, `PhotoShape`, `PosterStyleOptions`, `DEFAULT_POSTER_STYLE` (`poster/types.js`).
- Produces:
  - `export interface AppearancePrefs { displayMode: DisplayMode; photoShape: PhotoShape; showLivingIndicator: boolean }`
  - `export const DEFAULT_APPEARANCE_PREFS: AppearancePrefs`
  - `export function loadAppearancePrefs(): AppearancePrefs`
  - `export function saveAppearancePrefs(prefs: AppearancePrefs): void`
  - `export function appearanceToStyle(prefs: AppearancePrefs): PosterStyleOptions` (merges prefs onto `DEFAULT_POSTER_STYLE`)

- [ ] **Step 1: Write the failing test**

Create `web/tests/lib/appearancePrefs.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  appearanceToStyle,
  DEFAULT_APPEARANCE_PREFS,
  loadAppearancePrefs,
  saveAppearancePrefs,
} from "../../src/lib/appearancePrefs.js";

beforeEach(() => localStorage.clear());

describe("appearancePrefs", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadAppearancePrefs()).toEqual(DEFAULT_APPEARANCE_PREFS);
  });

  it("persists across reload (save then load)", () => {
    saveAppearancePrefs({ displayMode: "photoCards", photoShape: "circle", showLivingIndicator: true });
    expect(loadAppearancePrefs()).toEqual({ displayMode: "photoCards", photoShape: "circle", showLivingIndicator: true });
  });

  it("merges prefs onto the poster style", () => {
    const style = appearanceToStyle({ displayMode: "photoCards", photoShape: "circle", showLivingIndicator: true });
    expect(style.displayMode).toBe("photoCards");
    expect(style.photoShape).toBe("circle");
    expect(style.showLivingIndicator).toBe(true);
    expect(style.nameFontSize).toBe(11); // untouched default carried through
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace web -- lib/appearancePrefs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/src/lib/appearancePrefs.ts`:

```ts
import {
  DEFAULT_POSTER_STYLE,
  type DisplayMode,
  type PhotoShape,
  type PosterStyleOptions,
} from "../../../poster/types.js";

export interface AppearancePrefs {
  displayMode: DisplayMode;
  photoShape: PhotoShape;
  showLivingIndicator: boolean;
}

export const DEFAULT_APPEARANCE_PREFS: AppearancePrefs = {
  displayMode: "compact",
  photoShape: "rounded",
  showLivingIndicator: false,
};

const KEY = "familyTree.appearance.v1";

export function loadAppearancePrefs(): AppearancePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_APPEARANCE_PREFS;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    return {
      displayMode: parsed.displayMode ?? DEFAULT_APPEARANCE_PREFS.displayMode,
      photoShape: parsed.photoShape ?? DEFAULT_APPEARANCE_PREFS.photoShape,
      showLivingIndicator: parsed.showLivingIndicator ?? DEFAULT_APPEARANCE_PREFS.showLivingIndicator,
    };
  } catch {
    return DEFAULT_APPEARANCE_PREFS;
  }
}

export function saveAppearancePrefs(prefs: AppearancePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort — storage may be unavailable or full. Ignore.
  }
}

export function appearanceToStyle(prefs: AppearancePrefs): PosterStyleOptions {
  return {
    ...DEFAULT_POSTER_STYLE,
    displayMode: prefs.displayMode,
    photoShape: prefs.photoShape,
    showLivingIndicator: prefs.showLivingIndicator,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace web -- lib/appearancePrefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/appearancePrefs.ts web/tests/lib/appearancePrefs.test.ts
git commit -m "feat(web): persisted appearance preferences (display mode, shape, living dot)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `setPersonPhoto` editor operation

**Files:**
- Modify: `editor/operations.ts` (add `setPersonPhoto`)
- Test: `tests/set-person-photo.test.ts`

**Interfaces:**
- Consumes: existing internal `withPerson(tree, personId, fn)` helper; `PersonPhoto` (Task 1).
- Produces: `export function setPersonPhoto(tree: FamilyTree, personId: UUID, photo: PersonPhoto | undefined): FamilyTree`

- [ ] **Step 1: Write the failing test**

Create `tests/set-person-photo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setPersonPhoto } from "../editor/operations.js";
import type { FamilyTree, PersonPhoto } from "../models/types.js";

function tree(): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "t" },
    persons: { p1: { id: "p1", name: "Ann", gender: "female", notes: [], media: [], famsIds: [] } },
    families: {},
    validation: { validatedAt: "t", issues: [], isValid: true },
  };
}
const photo: PersonPhoto = { thumb: "T", print: "P" };

describe("setPersonPhoto", () => {
  it("sets a photo immutably", () => {
    const t0 = tree();
    const t1 = setPersonPhoto(t0, "p1", photo);
    expect(t1.persons.p1.photo).toEqual(photo);
    expect(t0.persons.p1.photo).toBeUndefined(); // original unchanged
    expect(t1).not.toBe(t0);
  });
  it("clears a photo when passed undefined", () => {
    const t1 = setPersonPhoto(tree(), "p1", photo);
    const t2 = setPersonPhoto(t1, "p1", undefined);
    expect(t2.persons.p1.photo).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/set-person-photo.test.ts`
Expected: FAIL — `setPersonPhoto` not exported.

- [ ] **Step 3: Implement**

In `editor/operations.ts`, add (near `updatePersonFields`; ensure `PersonPhoto` is in the type import from `../models/types.js`):

```ts
export function setPersonPhoto(tree: FamilyTree, personId: UUID, photo: PersonPhoto | undefined): FamilyTree {
  return withPerson(tree, personId, (p) => ({ ...p, photo }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/set-person-photo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/operations.ts tests/set-person-photo.test.ts
git commit -m "feat(editor): setPersonPhoto operation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Appearance menu + "Show photos" in the View menu

**Files:**
- Create: `web/src/components/editor/AppearanceMenu.tsx`
- Modify: `web/src/components/editor/ViewMenu.tsx` (add `showPhotos` + `onToggleShowPhotos`)
- Test: `web/tests/components/editor/AppearanceMenu.test.tsx`
- Modify test: `web/tests/components/editor/ViewMenu.test.tsx` (pass the two new props; assert the new item)

**Interfaces:**
- Consumes: `AppearancePrefs` (Task 7).
- Produces: `AppearanceMenu({ prefs, onChange }: { prefs: AppearancePrefs; onChange: (next: AppearancePrefs) => void })`. `ViewMenu` gains required props `showPhotos: boolean` and `onToggleShowPhotos: () => void`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/components/editor/AppearanceMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppearanceMenu } from "../../../../src/components/editor/AppearanceMenu.js";
import { DEFAULT_APPEARANCE_PREFS } from "../../../../src/lib/appearancePrefs.js";

describe("AppearanceMenu", () => {
  it("changes the display mode via onChange", async () => {
    const onChange = vi.fn();
    render(<AppearanceMenu prefs={DEFAULT_APPEARANCE_PREFS} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /appearance/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /photo cards/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ displayMode: "photoCards" }));
  });

  it("toggles the living indicator", async () => {
    const onChange = vi.fn();
    render(<AppearanceMenu prefs={DEFAULT_APPEARANCE_PREFS} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /appearance/i }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /living indicator/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showLivingIndicator: true }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace web -- AppearanceMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AppearanceMenu`**

Create `web/src/components/editor/AppearanceMenu.tsx` (mirror `ViewMenu`'s open/close + Escape pattern):

```tsx
import { useState } from "react";
import { useCloseOnEscape } from "../../lib/useCloseOnEscape.js";
import type { AppearancePrefs } from "../../lib/appearancePrefs.js";
import type { DisplayMode, PhotoShape } from "../../../../poster/types.js";

interface AppearanceMenuProps {
  prefs: AppearancePrefs;
  onChange: (next: AppearancePrefs) => void;
}

const MODES: { value: DisplayMode; label: string }[] = [
  { value: "minimal", label: "Minimal" },
  { value: "compact", label: "Compact" },
  { value: "photoCards", label: "Photo Cards" },
];
const SHAPES: { value: PhotoShape; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
];

export function AppearanceMenu({ prefs, onChange }: AppearanceMenuProps) {
  const [open, setOpen] = useState(false);
  useCloseOnEscape(open, () => setOpen(false));

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
      >
        Appearance ▾
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div role="menu" className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Display mode</p>
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="menuitemradio"
                aria-checked={prefs.displayMode === m.value}
                onClick={() => onChange({ ...prefs, displayMode: m.value })}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {m.label}
                {prefs.displayMode === m.value && <span aria-hidden="true" className="text-emerald-600">✓</span>}
              </button>
            ))}
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Photo shape</p>
            {SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="menuitemradio"
                aria-checked={prefs.photoShape === s.value}
                onClick={() => onChange({ ...prefs, photoShape: s.value })}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {s.label}
                {prefs.photoShape === s.value && <span aria-hidden="true" className="text-emerald-600">✓</span>}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={prefs.showLivingIndicator}
              onClick={() => onChange({ ...prefs, showLivingIndicator: !prefs.showLivingIndicator })}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
            >
              Living indicator
              {prefs.showLivingIndicator && <span aria-hidden="true" className="text-emerald-600">✓</span>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add "Show photos" to `ViewMenu`**

In `web/src/components/editor/ViewMenu.tsx`, add to `ViewMenuProps`:

```ts
  showPhotos: boolean;
  onToggleShowPhotos: () => void;
```

and add a first item to the `items` array:

```ts
    { label: "Show photos", onClick: props.onToggleShowPhotos, checked: props.showPhotos },
```

- [ ] **Step 5: Update the existing ViewMenu test for the new required props**

In `web/tests/components/editor/ViewMenu.test.tsx`, add `showPhotos={false}` and `onToggleShowPhotos={() => {}}` (or a `vi.fn()`) to every `<ViewMenu … />` render, and add one assertion:

```tsx
// after opening the menu:
expect(screen.getByRole("menuitemcheckbox", { name: /show photos/i })).toBeInTheDocument();
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --workspace web -- AppearanceMenu.test.tsx ViewMenu.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/editor/AppearanceMenu.tsx web/src/components/editor/ViewMenu.tsx web/tests/components/editor/AppearanceMenu.test.tsx web/tests/components/editor/ViewMenu.test.tsx
git commit -m "feat(web): Appearance menu + Show photos toggle in View menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Wire appearance + photos into the editor canvas (render + memo)

**Files:**
- Modify: `web/src/components/editor/EditorCanvas.tsx` (accept `appearance` prop; build style; memoize layout on `posterLayoutKey`; build + pass `photos` map)
- Modify: `web/src/pages/EditorPage.tsx` (own `AppearancePrefs` state with load/save; render `AppearanceMenu`; pass `showPhotos` + toggle to `ViewMenu`; pass `appearance` to `EditorCanvas`)
- Test: `web/tests/components/editor/EditorCanvas.test.tsx` (extend) and `web/tests/integration/editor-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `appearanceToStyle` (Task 7), `posterLayoutKey` (Task 4), `buildPhotoMap` (Task 6), `renderPosterSvg` 4-arg form (Task 3), `AppearancePrefs` (Task 7).
- Produces: `EditorCanvas` gains required prop `appearance: AppearancePrefs`. Behavior: editing a photo does not recompute `layout` (only the SVG string); switching display mode does.

- [ ] **Step 1: Write the failing test** (photo edit must not recompute layout; display-mode switch shows photos)

Extend `web/tests/components/editor/EditorCanvas.test.tsx` with a render that asserts photo cards appear. Add:

```tsx
it("renders an <image> for a person with a photo in photoCards mode", () => {
  const tree = makeTreeWithPhoto(); // person "p1" has photo {thumb:'data:image/webp;base64,ZZ', print:'...'}
  const { container } = render(
    <EditorCanvas
      tree={tree}
      appearance={{ displayMode: "photoCards", photoShape: "rounded", showLivingIndicator: false }}
      onSelectPerson={() => {}}
    />
  );
  expect(container.querySelector("image")).not.toBeNull();
});
```

Add a focused unit test `web/tests/lib/layoutKey-stability.test.ts` proving the memo contract at the seam Task 10 relies on (layout key stable across a photo edit — this is the machine-checkable form of "photo change doesn't recompute layout"):

```ts
import { describe, expect, it } from "vitest";
import { posterLayoutKey } from "../../../poster/layoutKey.js";
import { appearanceToStyle } from "../../src/lib/appearancePrefs.js";
import { setPersonPhoto } from "../../../editor/operations.js";
import type { FamilyTree } from "../../../models/types.js";

function tree(): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "t" },
    persons: { p1: { id: "p1", name: "Ann", gender: "female", notes: [], media: [], famsIds: [] } },
    families: {},
    validation: { validatedAt: "t", issues: [], isValid: true },
  };
}

it("photo edit keeps the layout key stable (no re-layout)", () => {
  const style = appearanceToStyle({ displayMode: "photoCards", photoShape: "rounded", showLivingIndicator: false });
  const before = posterLayoutKey(tree(), style);
  const edited = setPersonPhoto(tree(), "p1", { thumb: "T", print: "P" });
  expect(posterLayoutKey(edited, style)).toBe(before);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace web -- EditorCanvas.test.tsx layoutKey-stability.test.ts`
Expected: FAIL — `EditorCanvas` has no `appearance` prop; no `<image>` rendered.

- [ ] **Step 3: Implement `EditorCanvas` wiring**

In `web/src/components/editor/EditorCanvas.tsx`:

1. Add imports:

```ts
import { posterLayoutKey } from "../../../../poster/layoutKey.js";
import { buildPhotoMap } from "../../lib/resolvePhoto.js";
import { appearanceToStyle, type AppearancePrefs } from "../../lib/appearancePrefs.js";
```

2. Add `appearance: AppearancePrefs;` to `EditorCanvasProps`.

3. Replace `const style = DEFAULT_POSTER_STYLE;` with:

```ts
    const style = useMemo(() => appearanceToStyle(appearance), [appearance]);
```

(Destructure `appearance` in the component params. `DEFAULT_POSTER_STYLE` import may now be unused — remove it if so.)

4. Change the `layout` memo to key on structure, and add a `photos` memo, and thread `photos` into the `svg` memo:

```ts
    const layoutKey = useMemo(() => posterLayoutKey(tree, style), [tree, style]);
    const layout = useMemo(
      () => (hasPeople ? computeBalancedPosterLayout(tree, style, measurer) : undefined),
      // Keyed on the structural signature, not the tree object, so a photo edit does not re-layout.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [layoutKey, measurer, hasPeople]
    );
    const photos = useMemo(
      () => (style.displayMode === "photoCards" ? buildPhotoMap(tree, "thumb") : undefined),
      [tree, style.displayMode]
    );
    const svg = useMemo(
      () => (layout && page ? renderPosterSvg(layout, page, style, photos) : ""),
      [layout, page, style, photos]
    );
```

- [ ] **Step 4: Implement `EditorPage` wiring**

In `web/src/pages/EditorPage.tsx`:

1. Imports:

```ts
import { AppearanceMenu } from "../components/editor/AppearanceMenu.js";
import { loadAppearancePrefs, saveAppearancePrefs, type AppearancePrefs } from "../lib/appearancePrefs.js";
```

2. In `EditorWorkspace`, add state + persistence:

```ts
  const [appearance, setAppearance] = useState<AppearancePrefs>(() => loadAppearancePrefs());
  const updateAppearance = useCallback((next: AppearancePrefs) => {
    setAppearance(next);
    saveAppearancePrefs(next);
  }, []);
  const toggleShowPhotos = useCallback(
    () => updateAppearance({ ...appearance, displayMode: appearance.displayMode === "photoCards" ? "compact" : "photoCards" }),
    [appearance, updateAppearance]
  );
```

3. In the toolbar, render `AppearanceMenu` right after `<ViewMenu … />` and add the two new props to `ViewMenu`:

```tsx
            <ViewMenu
              focusMode={focusMode}
              showPhotos={appearance.displayMode === "photoCards"}
              onToggleShowPhotos={toggleShowPhotos}
              onFitTree={() => canvasRef.current?.fitTree()}
              /* …existing handlers unchanged… */
              onResetView={() => canvasRef.current?.resetView()}
            />
            <AppearanceMenu prefs={appearance} onChange={updateAppearance} />
```

4. Pass `appearance` to the canvas:

```tsx
          <EditorCanvas
            ref={canvasRef}
            tree={tree}
            appearance={appearance}
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
            focusPersonId={focusPersonId}
            onFocusModeChange={setFocusMode}
          />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace web -- EditorCanvas.test.tsx layoutKey-stability.test.ts editor-view.test.tsx`
Expected: PASS. (Any existing `EditorCanvas`/`EditorPage` render in tests must now pass `appearance` — update those renders to pass `DEFAULT_APPEARANCE_PREFS`.)

- [ ] **Step 6: Full web suite + typecheck**

Run: `npm test --workspace web && npm run typecheck --workspace web`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/editor/EditorCanvas.tsx web/src/pages/EditorPage.tsx web/tests/components/editor/EditorCanvas.test.tsx web/tests/lib/layoutKey-stability.test.ts web/tests/integration/editor-view.test.tsx
git commit -m "feat(web): wire appearance + photo rendering into the editor canvas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Hover preview + search auto-preview (editor only)

**Files:**
- Modify: `web/src/components/editor/EditorCanvas.tsx` (pointer-move hover preview; auto-show on search focus for ~2.5s)
- Test: `web/tests/components/editor/EditorCanvas.test.tsx` (extend)

**Interfaces:**
- Consumes: existing `hitTestNode`, `focusPersonId` prop, `nodeById`; `resolvePhoto` (Task 6).
- Produces: no new exports; internal hover-preview overlay `<img>` sourced from `person.photo.print`.

- [ ] **Step 1: Write the failing test**

Add to `web/tests/components/editor/EditorCanvas.test.tsx`:

```tsx
it("auto-shows a larger preview for the focused person if they have a photo", () => {
  const tree = makeTreeWithPhoto(); // p1 has a photo
  render(
    <EditorCanvas
      tree={tree}
      appearance={{ displayMode: "photoCards", photoShape: "rounded", showLivingIndicator: false }}
      onSelectPerson={() => {}}
      focusPersonId="p1"
    />
  );
  expect(screen.getByRole("img", { name: /photo of/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace web -- EditorCanvas.test.tsx`
Expected: FAIL — no preview `<img>` rendered.

- [ ] **Step 3: Implement**

In `EditorCanvas.tsx`:

1. Import `resolvePhoto`, `photoAlt`:

```ts
import { resolvePhoto, photoAlt } from "../../lib/resolvePhoto.js";
```

2. Add hover-preview state + a helper to build the overlay:

```ts
    const [hoverPreview, setHoverPreview] = useState<{ personId: UUID; left: number; top: number } | null>(null);
```

3. In `onPointerMove`, when not dragging, hit-test and set/clear the preview (throttle by only updating when the id changes):

```ts
      if (!d.moved) {
        const id = personAt(e.clientX, e.clientY);
        setHoverPreview((prev) => {
          if (!id) return null;
          if (prev?.personId === id) return prev;
          const el = viewportRef.current!.getBoundingClientRect();
          return { personId: id, left: e.clientX - el.left + 16, top: e.clientY - el.top + 16 };
        });
      }
```

(Guard: only run when `dragRef.current` is null or `!d.moved`; clear on `onPointerLeave` → `setHoverPreview(null)`.)

4. Auto-show on focus: in the existing `focusPersonId` effect (the one that pulses), also set a hover preview for ~2.5s:

```ts
      // Auto-preview the focused person's photo briefly, to help pick them out in large trees.
      const node = nodeById.get(focusPersonId);
      if (node) {
        setHoverPreview({ personId: focusPersonId, left: size.w / 2 + 16, top: size.h / 2 + 16 });
        const p = setTimeout(() => setHoverPreview(null), 2500);
        return () => { clearTimeout(t); clearTimeout(p); };
      }
```

5. Render the overlay (only when the person has a photo), near the selection/pulse overlays:

```tsx
        {hoverPreview && (() => {
          const person = tree.persons[hoverPreview.personId];
          // Use the 160px thumb, not the 640px print, for the on-hover preview — 160px is sharp
          // at this display size and keeps the big print image out of active memory until an
          // export explicitly needs it (refinement 5).
          const href = person && resolvePhoto(person, "thumb");
          if (!href) return null;
          return (
            <img
              src={href}
              alt={photoAlt(person)}
              className="pointer-events-none absolute z-30 h-40 w-40 rounded-lg border border-slate-300 object-cover shadow-xl"
              style={{ left: hoverPreview.left, top: hoverPreview.top }}
            />
          );
        })()}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace web -- EditorCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/editor/EditorCanvas.tsx web/tests/components/editor/EditorCanvas.test.tsx
git commit -m "feat(web): hover preview + auto-preview focused person's photo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Person Inspector — Photo section (upload / replace / remove / drag-drop)

**Files:**
- Modify: `web/src/components/explorer/PersonInspector.tsx` (add a Photo section)
- Test: `web/tests/components/explorer/PersonInspector.test.tsx` (extend)

**Interfaces:**
- Consumes: `processImageFile` (Task 5), `setPersonPhoto` (Task 8), `resolvePhoto`/`photoAlt` (Task 6). Uses the existing `onEdit(mutate)` prop.
- Produces: no new exports; UI section with an accessible file input and Upload/Replace/Remove controls, plus drag-and-drop, showing an instant preview.

- [ ] **Step 1: Write the failing test** (mock `processImageFile` so no real canvas is needed)

Add to `web/tests/components/explorer/PersonInspector.test.tsx`:

```tsx
import { processImageFile } from "../../../../src/lib/photo.js";
vi.mock("../../../../src/lib/photo.js", () => ({
  processImageFile: vi.fn(async () => ({ thumb: "data:image/webp;base64,TT", print: "data:image/webp;base64,PP" })),
  isAcceptedPhotoType: () => true,
}));

it("uploads a photo and shows a preview", async () => {
  // render PersonInspector for a person with no photo (reuse this file's existing render helper)
  const { getByLabelText, findByRole } = renderInspector(); // adapt to the file's existing setup
  const file = new File(["x"], "a.png", { type: "image/png" });
  await userEvent.upload(getByLabelText(/upload photo/i), file);
  expect(processImageFile).toHaveBeenCalled();
  expect(await findByRole("img", { name: /photo of/i })).toBeInTheDocument();
});
```

> Adapt `renderInspector()` to the render pattern already used in this test file (props: `tree`, `personId`, `searchIndex`, `onNavigate`, `onEdit`, `onClose`). `onEdit` should apply the mutate function to a mutable tree ref so the re-render shows the photo.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace web -- PersonInspector.test.tsx`
Expected: FAIL — no "Upload photo" control.

- [ ] **Step 3: Implement**

In `web/src/components/explorer/PersonInspector.tsx`:

1. Imports:

```ts
import { processImageFile, isAcceptedPhotoType } from "../../lib/photo.js";
import { resolvePhoto, photoAlt } from "../../lib/resolvePhoto.js";
import { setPersonPhoto } from "../../../../editor/operations.js";
```

2. Add local state near the other hooks:

```ts
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
```

3. Add a handler:

```ts
  async function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    if (!isAcceptedPhotoType(file.type)) {
      setPhotoError("Please choose a PNG, JPEG, or WebP image.");
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const photo = await processImageFile(file);
      onEdit((t) => setPersonPhoto(t, personId, photo));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not process that image.");
    } finally {
      setPhotoBusy(false);
    }
  }
```

4. Add the Photo section as the first child inside the edit `<form>` (or directly under the heading, inside the `<fieldset>`). `person` is defined here (guarded above):

```tsx
        <section
          className="flex flex-col gap-2 border-t border-slate-200 pt-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handlePhotoFile(e.dataTransfer.files?.[0]);
          }}
        >
          <h3 className="text-sm font-semibold text-slate-800">Photo</h3>
          <div className="flex items-center gap-3">
            {resolvePhoto(person, "thumb") ? (
              <img
                src={resolvePhoto(person, "thumb")}
                alt={photoAlt(person)}
                className="h-16 w-16 rounded-md border border-slate-200 object-cover"
              />
            ) : (
              <div
                aria-label="No photo available"
                role="img"
                className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-100 text-slate-400"
              >
                <span aria-hidden="true">👤</span>
              </div>
            )}
            <div className="flex flex-col gap-1 text-xs">
              <label className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-center text-slate-700 hover:bg-slate-50">
                {person.photo ? "Replace" : "Upload"} photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => void handlePhotoFile(e.target.files?.[0] ?? undefined)}
                />
              </label>
              {person.photo && (
                <button
                  type="button"
                  onClick={() => onEdit((t) => setPersonPhoto(t, personId, undefined))}
                  className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  Remove photo
                </button>
              )}
              <span className="text-slate-400">or drag an image here</span>
            </div>
          </div>
          {photoBusy && <p className="text-xs text-slate-500">Processing image…</p>}
          {photoError && <p role="alert" className="text-xs text-red-700">{photoError}</p>}
        </section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace web -- PersonInspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/explorer/PersonInspector.tsx web/tests/components/explorer/PersonInspector.test.tsx
git commit -m "feat(web): Photo section in the Person Inspector (upload/replace/remove/drag)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Poster export — include photos + shape + quality

**Files:**
- Modify: `web/src/components/poster/PosterExportPanel.tsx` (add Include-photos toggle, photo shape, quality; build `photos` map; pass to `renderPosterSvg`)
- Test: `web/tests/components/poster/PosterExportPanel.test.tsx` (extend)

**Interfaces:**
- Consumes: `buildPhotoMap` (Task 6), `renderPosterSvg` 4-arg form (Task 3), `PhotoQuality` (Task 6).
- Produces: export SVG contains `<image>` data URIs when "Include photos" is on; Optimized embeds `thumb`, High quality embeds `print`; neither present when off.

- [ ] **Step 1: Write the failing test**

Add to `web/tests/components/poster/PosterExportPanel.test.tsx`:

```tsx
it("includes photo images only when Include photos is enabled, honoring quality", async () => {
  const tree = makeTreeWithPhoto(); // p1 photo {thumb:'data:image/webp;base64,TT', print:'data:image/webp;base64,PP'}
  const { container, getByLabelText } = render(<PosterExportPanel tree={tree} sourceFileName="x.ftz" />);
  // Off by default -> no <image>.
  expect(container.querySelector("image")).toBeNull();
  // Enable photos (defaults to Optimized/thumb).
  await userEvent.click(getByLabelText(/include photos/i));
  expect(container.innerHTML).toContain("data:image/webp;base64,TT");
  // Switch to High quality -> print image.
  await userEvent.click(getByLabelText(/high quality/i));
  expect(container.innerHTML).toContain("data:image/webp;base64,PP");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace web -- PosterExportPanel.test.tsx`
Expected: FAIL — no "Include photos" control; export has no `<image>`.

- [ ] **Step 3: Implement**

In `web/src/components/poster/PosterExportPanel.tsx`:

1. Imports:

```ts
import { buildPhotoMap, type PhotoQuality } from "../../lib/resolvePhoto.js";
import type { DisplayMode, PhotoShape } from "../../../../poster/types.js";
```

2. Add state (near the existing `useState` calls):

```ts
  const [includePhotos, setIncludePhotos] = useState(false);
  const [exportShape, setExportShape] = useState<PhotoShape>("rounded");
  const [quality, setQuality] = useState<PhotoQuality>("thumb");
```

3. Fold photo settings into the style the export renders with, and build the photos map:

```ts
  const exportStyle = useMemo(
    () => ({ ...style, displayMode: (includePhotos ? "photoCards" : "compact") as DisplayMode, photoShape: exportShape }),
    [style, includePhotos, exportShape]
  );
  const photos = useMemo(
    () => (includePhotos ? buildPhotoMap(tree, quality) : undefined),
    [tree, includePhotos, quality]
  );
```

4. Change the layout/page/svg memos to use `exportStyle` and pass `photos`:

```ts
  const layout = useMemo(
    () => (layoutMode === "balanced" ? computeBalancedPosterLayout(tree, exportStyle, measurer) : computePosterLayout(tree, exportStyle, measurer)),
    [tree, exportStyle, measurer, layoutMode]
  );
  const page = useMemo(() => computePosterPageSize(layout, exportStyle), [layout, exportStyle]);
  const svg = useMemo(() => renderPosterSvg(layout, page, exportStyle, photos), [layout, page, exportStyle, photos]);
```

(Keep `measurer` keyed on `style.fontFamily`; `exportStyle` shares that font.)

5. Add controls inside the "Customize appearance" `<details>` grid (a new full-width block):

```tsx
          <div className="col-span-2 flex flex-col gap-2 border-t border-slate-200 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
              Include photos
            </label>
            {includePhotos && (
              <div className="flex flex-col gap-2 pl-1">
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span>Shape:</span>
                  {(["square", "rounded", "circle"] as PhotoShape[]).map((s) => (
                    <label key={s} className="flex items-center gap-1">
                      <input type="radio" name="export-shape" checked={exportShape === s} onChange={() => setExportShape(s)} />
                      {s}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <label className="flex items-center gap-1">
                    <input type="radio" name="export-quality" checked={quality === "thumb"} onChange={() => setQuality("thumb")} />
                    Optimized (smaller file)
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" name="export-quality" checked={quality === "print"} onChange={() => setQuality("print")} />
                    High quality (print)
                  </label>
                </div>
              </div>
            )}
          </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace web -- PosterExportPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suites + typecheck (both packages)**

Run: `npm test && npm test --workspace web && npm run typecheck && npm run typecheck --workspace web`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/poster/PosterExportPanel.tsx web/tests/components/poster/PosterExportPanel.test.tsx
git commit -m "feat(web): poster export with optional photos + shape + quality

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npm test` (root) — all green.
- [ ] `npm test --workspace web` — all green.
- [ ] `npm run typecheck && npm run typecheck --workspace web` — clean.
- [ ] `npm run lint --workspace web` — clean (fix any eslint-a11y findings on new JSX).
- [ ] **Export consistency (refinement 4):** confirm the invariant holds by construction — `PosterExportPanel` uses one `svg` value for BOTH its on-screen preview and the SVG/PDF downloads, `posterExport.ts` builds the PDF from that exact SVG string, and `EditorCanvas` calls the same `renderPosterSvg`. So for a given `(displayMode, photoShape, photos)`, editor preview, SVG, and PDF are identical. Spot-check manually: export SVG in photoCards mode and confirm the on-screen card matches the downloaded file.
- [ ] **Memory (refinement 5):** confirm the editor path calls `buildPhotoMap(tree, "thumb")` only, the hover preview uses `"thumb"`, and `"print"` is built solely inside `PosterExportPanel` when High quality is selected.
- [ ] Manual smoke (optional, via the `run` skill): open the editor, toggle Show photos, upload a photo in the inspector, confirm the card updates without the tree reflowing, export an SVG with and without photos and confirm size difference.

## Requirements → task traceability

- Person Card / three display modes → Tasks 2, 3 (+ default compact: Global Constraints, Task 1).
- Photo model / two sizes / discard original → Tasks 1, 5.
- Placeholder (silhouette + gray + shape) → Task 3 (+ shape test each shape).
- Renderer changes only, layout engine untouched → Tasks 2, 3 (Global Constraints).
- No re-layout on photo change → Tasks 4, 10 (+ stability test).
- Show Photos toggle + Appearance (mode/shape/living) → Tasks 9, 10.
- Appearance persisted separately from tree → Task 7.
- Inspector upload/replace/remove/drag + instant preview + a11y → Task 12.
- Hover preview + search auto-preview → Task 11.
- Export with/without photos + quality → Task 13.
- Living indicator → Tasks 1 (living field), 3 (dot), 9 (toggle).
- Future-proofing (detailed mode + extra elements) → Task 3 (`renderCardExtras` extension point).
- Future storage flexibility (renderer decoupled from data URIs) → Tasks 3, 6 (Global Constraints).
- Year display uses `yearLineFor()` in all year-showing modes; minimal is name-only (refinement 1) → Global Constraints, Tasks 2/3.
- Photo capped square, centered, not full width (refinement 2) → Task 2 (`photoAreaHeight`), Task 3 (`renderPhotoCard`).
- Graceful fallback — a photo never breaks rendering/export (refinement 3) → Task 3 (empty-href → placeholder), Task 5 (reject corrupt/unsupported), Task 12 (inspector catches → placeholder).
- Export/editor/PDF consistency (refinement 4) → Global Constraints + Final verification (single `renderPosterSvg` string).
- Memory — thumb until export needs print (refinement 5) → Tasks 6, 10 (thumb map), 11 (thumb hover), 13 (print only on High quality).
- Tests (the five explicitly requested) → Task 2/3 (compact↔photoCards consistency; placeholder per shape), Task 4/10 (photo change no re-layout), Task 7 (prefs persist), Task 13 (quality selects thumb vs print).
