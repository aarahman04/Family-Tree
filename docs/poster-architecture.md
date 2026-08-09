# Print Poster — Developer Documentation

Status: complete, for the confirmed "Focused" scope (see "Scope" below). A dedicated,
whole-tree, single-page print export, built on top of the existing `FamilyTree` model —
it does not read from or modify the interactive explorer's visualization.

## Scope

The user's formal feature request and their own plain-language description of what they
actually wanted directly conflicted: the formal spec asked for six named paper presets
(A4/A3/Letter/etc.) with multi-sheet tiling and six visual themes; their own words asked for
one custom-sized file, "as wide as it goes," explicitly rejecting A4 ("On A4, it's really
small, and it doesn't fit"). Rather than silently pick a side, this was resolved by asking —
the user chose the focused scope:

- ✅ A dedicated print layout algorithm (not the interactive explorer's dagre layout)
- ✅ One auto-sized custom page that fits the whole tree at a readable size
- ✅ PDF (vector) and SVG export
- ✅ Correct cousin-marriage / shared-ancestor handling, no duplicated people
- ✅ One print theme, with font/spacing/color/margin knobs
- ✅ A basic preview (zoom + live style updates) before export
- ❌ Named paper presets (A4/A3/Letter/...) and multi-sheet tiling
- ❌ Multiple pre-built visual themes
- ❌ PNG export (the spec's own "avoid rasterization" principle argues against it; PDF/SVG
  already cover printing)
- ❌ Photo/notes fields on nodes (the spec itself marks these "(future)")
- ❌ A full interactive pan/zoom/regenerate preview console

## Package layout

```
poster/
  types.ts        PosterNode, PosterConnector (marriage/cross-branch/descent), PosterLayout,
                   PosterStyleOptions, DEFAULT_POSTER_STYLE, PosterPageSize
  layout.ts        computePosterLayout(tree) -- the layout algorithm (see below)
  pageSize.ts      computePosterPageSize(layout, style) -- layout units -> physical page size
  renderSvg.ts      renderPosterSvg(layout, page, style) -- hand-written SVG generator
  index.ts          Public API

web/src/
  lib/posterExport.ts                    posterSvgToPdfBlob / posterSvgToSvgBlob
  components/poster/PosterExportPanel.tsx  UI: stats, style controls, zoomable preview, downloads
```

`poster/` has the same shape as `parser/`, `validation/`, and `editor/`: framework-free
TypeScript, zero React dependency, importable by both tests and `web/`. It is deliberately
**not** built on `@xyflow/react`/`dagre` (the interactive explorer's stack) — the explorer
renders a bounded neighborhood around one focus person and re-lays-out incrementally as the
user expands nodes; the poster renders the *entire* tree at once, on paper, where "expand on
demand" doesn't apply and the layout, spacing, and connector style needs are print-specific
(see `docs/explorer-architecture.md` for the interactive engine).

## Layout algorithm

`computePosterLayout(tree: FamilyTree): PosterLayout` runs in four passes, each O(n) (n =
person count, plus O(f) for family count, f ≤ n in practice):

### 1. Canonical placement

Every person is assigned exactly one of three placements, which is what guarantees a person
is never duplicated on the poster:

- **`child`** — the person has a `famcId` (recorded blood parents): they render under those
  parents, always. This is the highest-priority rule and never yields to anything else.
- **`top`** — no `famcId`, and the person is the *anchor* of at least one of their marriages
  (see "anchor" below), or has no marriages at all. They render as a standalone tree root.
- **`adjacent`** — no `famcId`, never an anchor of any of their marriages: they render next
  to whichever spouse anchors their *first* recorded marriage (`famsIds[0]`). Any other
  marriage they're part of becomes a cross-branch connector back to this position.

An **anchor** of a family (a marriage record) is whichever spouse keeps the children when the
family is rendered:

- Only one spouse recorded → that spouse anchors, trivially.
- One spouse has a `famcId` (known blood parents) and the other doesn't → the one *with*
  blood parents anchors, since they already have a fixed position in the tree; the other
  (who has nowhere else to go) is rendered adjacent to them.
- Both have `famcId`, or neither does → the husband anchors, by convention (falls back to
  the wife if there is no husband).

### 2. Generation assignment

A memoized, cycle-guarded recursion over placement:

- `child`: generation = 1 + max(parents' generations) — recurses through the family's
  husband/wife, which themselves resolve via their own placement.
- `adjacent`: generation = anchor spouse's generation (a couple sits on the same row).
- `top`: generation = 0.

This is what makes a married-in spouse (no recorded ancestry) land on their *partner's* row
instead of always defaulting to row 0, without ever needing a second, separate propagation
pass — placement already encodes which case applies.

### 3. Subtree width (bottom-up)

Reingold–Tilford-style: each person's width, in abstract "sibling slot" units, is the sum of
the widths of everything that has to fit below them:

```
subtreeWidth(person) = max(1, Σ over each family they anchor of:
    Σ subtreeWidth(child) for each child, if any children
    else 1 if their spouse renders adjacent in that family
    else 0)
```

Because a person is a "child" of at most one family (their own `famcId`), this recursion
visits every person exactly once regardless of how many spouses or cousin marriages exist
elsewhere in the tree — memoization is a safety net for shared subtrees, not a requirement
for correctness the way it would be in a general graph.

### 4. Position assignment (top-down)

Starting from all `top`-placement people (sorted by id for determinism), each family's
children are walked left-to-right and given an `x` slice proportional to their own
`subtreeWidth`, recursively. A person left unplaced after this walk (only possible from
corrupted source data — e.g. a family record with *both* parents missing that a child still
references via `famcId`) is force-placed as an extra standalone root in a final sweep, so a
person can never silently vanish from the poster.

### Connectors

Three kinds, built during position assignment (see `poster/types.ts`):

- **`marriage`** — a straight line between two spouses rendered adjacent to each other.
- **`descent`** — one shared branch per sibling group: a stub down from the parent(s)'
  midpoint to a horizontal bus, then one stub per child. Never a separate line per child back
  to the parents, per the spec's explicit requirement.
- **`cross-branch`** — a dashed line, in a distinct color, from a spouse's *real* (already
  rendered, under their own parents) position to the marriage point of a family they're part
  of but aren't the anchor of. This is how cousin marriages and shared ancestors are drawn
  without ever duplicating a node: the person is drawn once, where their blood ancestry
  places them, and every marriage they're part of beyond their "home" placement is a
  connector, not a second copy of the box.

Verified against the real 473-person sample: the SVG output contains exactly 31
cross-branch connectors, matching the cousin-marriage count independently verified in
`tests/real-sample.test.ts`.

## Page sizing

`computePosterPageSize(layout, style)` converts abstract layout units into a physical page,
in points (1/72 inch, matching PDF/SVG conventions):

```
slotWidth  = style.nodeWidth + style.siblingSpacing
rowHeight  = style.nodeHeight + style.generationSpacing
pageWidth  = layout.maxRowWidth * slotWidth + 2 * style.marginPt
pageHeight = layout.generationCount * rowHeight + 2 * style.marginPt
```

There is no named preset and no upper bound — per the confirmed scope, the page is exactly
as large as the tree needs to keep names readable at the configured font size, however wide
that turns out to be (the real sample renders to roughly 544in × 10in at the default style).
Printing such a file is a print-shop wide-format job, not a desktop-printer job — which is
exactly what was asked for.

## Rendering pipeline

```
FamilyTree --[layout.ts]--> PosterLayout --[pageSize.ts]--> PosterPageSize
                                  |                                |
                                  '-----------[renderSvg.ts]-------'
                                                  |
                                            SVG string
                                    /                        \
                        (in-app preview,                (posterExport.ts:
                         dangerouslySetInnerHTML)         jsPDF + svg2pdf.js,
                                                           dynamically imported)
```

`renderSvg.ts` is the **only** rendering backend — the preview, the SVG download, and the PDF
download (via `svg2pdf.js` converting that same SVG into vector PDF content) all consume the
identical string. There is no second renderer that could drift out of sync with the preview,
which is what makes "preview matches exported output" true by construction rather than by
coincidence.

jsPDF and svg2pdf.js (plus their own sub-dependencies) are ~213KB gzipped combined and are
loaded via a dynamic `import()` inside `web/src/lib/posterExport.ts`, only when a user clicks
"Download PDF" — verified via a real `vite build`: neither chunk is referenced from
`index.html` or preloaded, so a user who never opens the Print Poster tab never downloads
them. The main bundle's gzipped size is unchanged from the pre-poster baseline in
`docs/performance-report.md`.

## Performance characteristics

All four layout passes are O(n + f); `renderSvg.ts` is a single O(n + connectors) pass over
the computed layout. Verified in `tests/poster-layout.test.ts` with a synthetic ~12,000-person
tree (well over the spec's 5,000-person target): layout computes in well under a second,
with an intentionally generous 5-second regression bound to catch any future change that
reintroduces exponential behavior without making the test itself flaky.

## Testing

- `tests/poster-layout.test.ts` — single family; three generations; wide (8-child) sibling
  groups render as one shared descent branch, not eight; deep (6-generation) ancestry; a
  cousin marriage (verifies exactly one cross-branch connector, no duplicated node); multiple
  cousin marriages sharing an ancestor; a corrupted-data edge case (family record missing
  both parents); a ~12,000-person synthetic tree; and, when the real sample file is present,
  the full real 473-person/136-family tree (every family with both spouses known produces
  either a marriage or a cross-branch connector — never neither).
- `tests/poster-render.test.ts` — page auto-sizing produces a wide page for a wide sibling
  group (not clamped to a preset); the SVG is well-formed and XML-escapes names containing
  `&`, `<`, `>`, and quotes; cross-branch connectors render in a visually distinct
  (dashed, differently-colored) style from normal marriage lines.
- `web/tests/components/poster/PosterExportPanel.test.tsx` — renders a real cousin-marriage
  tree, confirms shared ancestors appear exactly once in the DOM, confirms style controls
  actually change the rendered SVG.
- `web/tests/integration/explorer.test.tsx` — switching between the Explore and Print Poster
  tabs and back, within the full app.
- Manually verified end-to-end in a real Chromium browser against the real sample file:
  upload → switch to Print Poster → preview renders (dashed cross-branch lines visible for
  cousin marriages) → zoom changes the preview → SVG downloads → PDF downloads (a valid
  single-page PDF) → switching back to Explore still works. No console errors. The page body
  never scrolls horizontally even though the poster preview itself is very wide, because the
  preview lives in its own `overflow-auto` container.

## Known limitations

- Multiple marriages for the same person (remarriage) are laid out by fanning each
  additional spouse out to the side of the person's fixed position, rather than perfectly
  centering the person between all their spouses. Structurally correct (no duplication, no
  lost relationships) but not pixel-perfect for this specific, comparatively rare case.
- No photo or notes indicator on nodes — matches the specification's own "(future)" labels
  for these fields.
- No named paper presets or multi-sheet A4 tiling — out of scope per the user's explicit
  choice (see "Scope" above); the output is a single continuous page sized for a wide-format
  print shop.
- `svg2pdf.js`'s SVG feature coverage is not 100% of the SVG spec; the renderer only emits
  `rect`, `line`, `path`, and `text` elements (no gradients, filters, or embedded images), all
  of which are well-supported by `svg2pdf.js`.

## Future improvements

- Centered multi-marriage layout (see "Known limitations" above).
- An optional "highlight one branch" preview mode for very large trees, to help a user find
  a specific line before committing to print.
- Photo/notes node fields, once the spec's own "(future)" marker is lifted.
