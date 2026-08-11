# Person Cards with Photos — Design Specification

**Status:** Approved (design). Awaiting implementation-plan review.
**Date:** 2026-08-11
**Scope:** Enhance the node renderer and person model to support optional photos and configurable card display modes. The layout/positioning engine is NOT modified.

---

## 1. Goal

Upgrade every person from a plain rectangle into a structured **Person Card** that can optionally show a photo, while:

- keeping the single shared rendering pipeline intact (editor, SVG export, PDF export all render the same SVG string);
- leaving `computePosterLayout` / `computeBalancedPosterLayout` (positioning) untouched;
- keeping **Compact** the default so existing users and existing tests see byte-for-byte identical output until they opt in.

## 2. Guiding architectural constraint

`poster/renderSvg.ts::renderPosterSvg` is the **only** rendering backend. It is consumed by:

- the interactive editor (`EditorCanvas`, injected via `dangerouslySetInnerHTML`),
- the SVG export (`posterSvgToSvgBlob`),
- the PDF export (`posterSvgToPdfBlob`, via `svg2pdf.js` parsing the same string).

Therefore **all photo work lands in exactly two places**: box *sizing* (`poster/boxSizing.ts`) and the *node renderer* (`poster/renderSvg.ts`). Photos travel into the output as `<image href="…">` elements, which is what keeps SVG/PDF exports self-contained.

Positioning code (`poster/layout.ts` node placement, `poster/layoutBalanced.ts`) is not changed except to thread the (already-present) `style` object through to box sizing, which it already does.

## 3. Data model

`models/types.ts`:

```ts
export interface PersonPhoto {
  /** ~160px WebP data URI — the image the renderer embeds by default. */
  thumb: string;
  /** ~640px WebP data URI — used by the "High quality" export option. */
  print: string;
  /** Optional caption; UI defaults it to "Photo of {name}". */
  alt?: string;
}

export interface Person {
  // …existing fields…
  photo?: PersonPhoto;
}
```

- The existing `media: MediaRef[]` (FTZ media references) is unrelated and stays as-is.
- Because `photo` lives in the tree, it round-trips through autosave, `.ftz`/manual save, and every export with zero extra plumbing.
- **Future-storage flexibility (requirement 9):** the *renderer* never sees `PersonPhoto`. It only ever receives an opaque **href string** (see §6). A single web-layer accessor `resolvePhoto(person, quality) → { href: string }` is the only code that knows photos are data URIs today. Swapping to file references / IndexedDB / cloud URLs later changes only that accessor — the renderer API is unaffected because SVG `<image href>` accepts data URIs, blob URLs, and remote URLs identically.

## 4. Appearance settings (first-class, baked in now)

Added to `PosterStyleOptions` (single source of truth shared by box sizing and rendering), with defaults that preserve today's output exactly:

```ts
displayMode: "minimal" | "compact" | "photoCards";  // default "compact"
photoShape:  "square" | "rounded" | "circle";        // default "rounded"
showLivingIndicator: boolean;                         // default false
```

Display modes:

- **minimal** — name only (one line). For very large trees.
- **compact** — the *current* card (name + gender glyph + year line). Output is unchanged from today, guaranteeing existing poster tests stay green.
- **photoCards** — photo/placeholder on top, then name + gender + years below.

A **future `"detailed"` mode** is left as a clearly-marked extension point in `renderNode` (see §7) but is NOT implemented and NOT exposed in the UI.

## 5. Photo Card content & layout (photoCards mode)

Card structure (compact, uncluttered):

```
┌─────────────────────┐
│                     │
│   Photo / Placeholder│  ← square, clipped to photoShape
│                     │
├─────────────────────┤
│ Full Name           │  ← existing name wrapping rules
│ ♂ 1974–2022      ●  │  ← gender glyph (existing) · year line · living dot (optional)
└─────────────────────┘
```

- **Photo**: square region at the top, side length derived from the card width; clipped to `photoShape` (square / rounded-rect / circle).
- **Full name**: reuses the existing name-wrapping logic in `boxSizing.ts`.
- **Gender icon**: the existing `genderIcon` vector glyph (♂ / ♀; nothing for unknown).
- **Year line**: reuses the existing `yearLineFor` output — `1974–2022` for deceased, `1974–` for a living person (empty death). No second year formatter is introduced, so compact behavior and its tests are untouched. The living/deceased distinction is additionally and explicitly conveyed by the living indicator dot.
- **Living indicator** (optional, `showLivingIndicator`): a small dot — green when living (no death year), gray when deceased. Subtle, corner-placed.

## 6. Rendering — how photos reach the SVG without triggering re-layout

Two deliberate moves satisfy requirement 8 ("photo changes never recompute layout"):

**(a) Geometry depends on `displayMode` only, never on per-person photo presence.**
`computePersonBox` reserves the square photo slot whenever `displayMode === "photoCards"`, regardless of whether that person has a photo (a missing photo shows the placeholder in the same slot). So adding / replacing / removing a photo produces identical box sizes → identical positions.

**(b) Photo pixels are passed to the renderer separately, not stored on `PosterNode`.**
`renderPosterSvg` gains an optional parameter:

```ts
export function renderPosterSvg(
  layout: PosterLayout,
  page: PosterPageSize,
  style: PosterStyleOptions,
  photos?: ReadonlyMap<UUID, string>, // personId -> image href (data URI today; opaque to renderer)
): string
```

- New parameter is optional, so all three existing call sites and all existing tests compile and behave identically (compact, no photos).
- The renderer looks up `photos.get(node.personId)`; if present it emits `<image href="…" …/>` clipped to `photoShape`; if absent it emits the **placeholder** (§8).
- The `photos` map is opaque href strings only — the renderer has no knowledge of data URIs (requirement 9).

**Layout memoization (`web`):**

- A new pure helper `poster/layoutKey.ts::posterLayoutKey(tree, style)` produces a compact **structural signature** covering only layout-affecting data (person ids, display names, `yearLineFor` inputs, gender, relationships, `displayMode`, `photoShape`, sizing style) — **excluding `photo` bytes**.
- `EditorCanvas` and the export path memoize `layout` on `[posterLayoutKey, measurer]` instead of the raw `tree`. Result:
  - editing a photo → new tree, but identical layout key → **layout is reused; only the cheap SVG string regenerates**;
  - toggling display mode → key changes → layout recomputes (geometry genuinely changed — expected and correct).
- The `photos` map is memoized separately on a photo signature, so it only rebuilds when a photo actually changes.

## 7. Future-proofing the card renderer (requirement 7)

`renderNode` is refactored to build a card from an **ordered list of optional card elements** rather than a fixed sequence, so future elements slot in without redesign:

- reserved, documented extension points for: `detailed` mode body, occupation, country, verification badge, notes indicator, document/photo count.
- None are implemented now. The structure simply leaves room (e.g., a `renderCardExtras(node, style)` hook that currently returns nothing, and a `displayMode` switch with a `case "detailed"` placeholder).

## 8. Placeholder (requirement 3)

When a person has no photo, in photoCards mode:

- neutral vector silhouette (head + shoulders),
- on a subtle gray background fill,
- clipped to the **same** `photoShape` as real photos (square / rounded / circle),
- visually intentional and modern — never an empty white box, never a "broken image".

Accessible name: `No photo available`.

## 9. Image processing (`web/src/lib/photo.ts`, new — no new dependencies)

Browser Canvas API only. On upload (`accept="image/png,image/jpeg,image/webp"`):

1. **Validate** MIME type and enforce a reasonable max input size.
2. **Square crop**: center-crop to the largest centered square. Face-center *if* `window.FaceDetector` is available (Chromium); otherwise center-crop — the "center the face if possible, otherwise center crop" behavior, degrading silently when the API is absent.
3. **Encode two WebP sizes** — 160px (`thumb`) and 640px (`print`) — via `canvas.convertToBlob({ type: "image/webp", quality })` → data URIs. Compression quality tuned so thumbnails stay sharp while keeping exports small (requirement 4).
4. The **original full-resolution image is discarded** and never retained in memory.

Testability: the crop-rectangle math is a pure function (`computeSquareCrop(width, height, face?)`) unit-tested without a real canvas (jsdom has no canvas); the canvas encode step is a thin wrapper mocked in tests.

## 10. UI

- **View menu** (`ViewMenu.tsx`): add a `☑ Show photos` item that toggles `displayMode` between `compact` and `photoCards`.
- **New `Appearance ▾` menu** (`AppearanceMenu.tsx`, mirroring `ViewMenu`'s pattern and a11y): Display mode (Minimal / Compact / Photo Cards) · Photo shape (Square / Rounded / Circle, default Rounded) · Living indicator (on/off).
- **Person Inspector** (`PersonInspector.tsx`): a new **Photo** section — preview (thumb or placeholder), **Upload / Replace / Remove**, drag-and-drop onto the preview area, instant preview after processing.
- **Poster Export panel** (`PosterExportPanel.tsx`): **Include photos** toggle + **Optimized (160px) / High quality (640px)** selector. Quality selects `thumb` vs `print` when building the export `photos` map.
- **Hover preview (editor only)**: hovering a node that has a photo shows a larger floating preview near the cursor (reuses `hitTestNode`, pointer-move throttled). Cheap; editor-only.
- **Search experience (requirement 6)**: the existing center + pulse behavior is retained; additionally, if the focused person has a photo, the larger hover-preview is shown automatically for ~2–3 seconds (reusing the existing focus effect and its ~2500ms timer).
- **Accessibility**: each `<image>` carries `<title>Photo of {name}</title>`; placeholders carry `aria-label="No photo available"`.

## 11. Appearance preferences persistence (requirement 5)

Appearance settings are **user preferences**, stored separately from the `FamilyTree` — never embedded in tree data.

- New `web/src/lib/appearancePrefs.ts`: load/save `{ displayMode, photoShape, showLivingIndicator }` to `localStorage` (best-effort, same defensive try/catch pattern as `autosave.ts`).
- "Show photos" state is represented by `displayMode` (`photoCards` = on) and therefore persists via `displayMode`; this deliberately avoids a redundant second source of truth for the same state.
- Preferences load on editor mount and persist across reloads. They are applied by merging into the `PosterStyleOptions` passed to layout/render.

## 12. Performance (requirement 8, restated)

- **Photo change** → no layout recomputation, no positioning invalidation; only the renderer output regenerates (via the structural layout key in §6).
- **Display-mode change** → layout may recompute, because geometry genuinely changes (expected).
- `EditorCanvas` stays `memo`-wrapped; hover-preview hit-testing is throttled; the `photos` map is memoized on a photo signature.
- Exports stay small: WebP compression + embedding the 160px thumb by default (640px only when "High quality" is chosen).

## 13. Backwards compatibility

- `DEFAULT_POSTER_STYLE` gains `displayMode: "compact"`, `photoShape: "rounded"`, `showLivingIndicator: false`.
- With `compact` default and `photos` omitted, `computePersonBox` and `renderPosterSvg` produce output identical to today → existing suites (`tests/poster-*.test.ts`, `web` component/integration tests) remain green without modification.

## 14. Testing

Existing suite must stay green (guaranteed by the compact default). New tests:

**Image processing**
- `computeSquareCrop` returns a centered square for landscape / portrait / already-square inputs; honors a provided face box; falls back to center when absent.
- format acceptance (png/jpeg/webp) and rejection of unsupported types / oversized inputs.

**Box sizing**
- photoCards reserves a square photo slot; box height accounts for it.
- compact box sizing is byte-for-byte identical to before.

**Renderer**
- photoCards emits `<image>` when a photo href is supplied; emits the placeholder when absent.
- **placeholder rendering matches all supported photo shapes** (square / rounded / circle) — requirement 10.
- minimal renders name only; compact output unchanged; photoCards includes gender glyph + year line + (optional) living dot.
- image `<title>` alt text and placeholder `aria-label` present.

**Display mode & layout consistency (requirement 10)**
- **switching Compact ↔ Photo Cards preserves layout consistency** (same node set, positions differ only by the reserved photo geometry; structural key changes only across modes).
- **changing only a photo does not trigger layout recomputation** — asserted via `posterLayoutKey` stability across a photo edit (identical key → memoized layout reused).

**Preferences (requirement 10)**
- **appearance preferences persist across reloads** — save then load returns the same `{ displayMode, photoShape, showLivingIndicator }`.

**Inspector**
- upload sets `person.photo`; replace swaps it; remove clears it; preview reflects state; alt text derived from name.

**Export (requirement 10)**
- export **with** photos: SVG contains `<image>` data URIs; **without**: no `<image>`.
- **export quality correctly selects thumbnail vs print image** — Optimized embeds `thumb`, High quality embeds `print`.
- persistence round-trip: a tree with `person.photo` survives autosave save/load.

## 15. Explicitly out of scope (future; room left, not built)

- IndexedDB / file-reference / cloud storage backends (model + renderer API already decoupled to allow it — §3, §6).
- Web-worker offload of image processing.
- The `detailed` display mode and its metadata rows (occupation, country, verification badge, notes indicator, document/photo count) — extension point left in `renderNode` (§7).
- Drag-to-reposition / manual crop adjustment.

## 16. Files touched

**Shared engine (`poster/`, `models/`)**
- `models/types.ts` — `PersonPhoto`, `Person.photo`.
- `poster/types.ts` — `PosterStyleOptions` appearance fields + defaults.
- `poster/boxSizing.ts` — reserve photo slot in photoCards; minimal sizing.
- `poster/renderSvg.ts` — `renderNode` display-mode switch, image/placeholder/shape/living dot, optional `photos` param, extension hook.
- `poster/layoutKey.ts` — new structural memo key.

**Web app (`web/src/`)**
- `lib/photo.ts` (new) — image processing + `computeSquareCrop`.
- `lib/appearancePrefs.ts` (new) — persisted appearance settings.
- `lib/resolvePhoto.ts` (new) — the sole data-URI-aware accessor.
- `components/editor/AppearanceMenu.tsx` (new).
- `components/editor/ViewMenu.tsx` — "Show photos".
- `components/editor/EditorCanvas.tsx` — photos map, structural memo, hover preview, search auto-preview.
- `components/explorer/PersonInspector.tsx` — Photo section.
- `components/poster/PosterExportPanel.tsx` + `hooks/useExport.ts` — include-photos + quality wiring.
- Tests across all of the above.
