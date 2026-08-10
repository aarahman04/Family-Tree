# Print Poster — Developer Documentation

Status: **V2**, a from-scratch rewrite of the layout engine for publication-quality output.
V1 shipped a working dedicated layout + PDF/SVG export; this milestone was explicitly *not*
about adding features but about layout **quality** — real text measurement, variable box
sizing, a collision-detection-and-shift pass, and a redesigned cousin-marriage annotation.
See "Version history" at the end for what changed and why.

## Scope

The original feature request's formal spec and the user's own plain-language description of
what they wanted directly conflicted (named paper presets + tiling vs. one custom-sized file
"as wide as it goes"). That was resolved by asking, not guessing — the user chose:

- ✅ A dedicated print layout algorithm (not the interactive explorer's dagre layout)
- ✅ One auto-sized custom page that fits the whole tree at a readable size, however large
- ✅ PDF (vector) and SVG export
- ✅ Correct cousin-marriage / shared-ancestor handling, no duplicated people
- ✅ One print theme, with font/spacing/color/margin knobs
- ✅ A preview with zoom, pan, fit-to-view, and actual-size
- ❌ Named paper presets (A4/A3/Letter/...) and multi-sheet tiling
- ❌ Multiple pre-built visual themes
- ❌ PNG export (vector PDF/SVG already cover print; explicitly optional in the V2 request)
- ❌ Photo/notes fields on nodes (marked "(future)" in every version of the spec)

The V2 request added an explicit, unambiguous instruction that shapes several decisions
below: **do not shrink the tree to fit a page.** The poster grows to whatever size the data
requires — the real sample tree renders at roughly **18.4m × 229mm**. There is no upper
bound on the SVG output; see "PDF page-size limit" for the one real external constraint this
runs into (a PDF-format limit, not a self-imposed one) and how it's handled honestly rather
than silently.

## Package layout

```
poster/
  textMeasure.ts   Pluggable TextMeasurer type + a heuristic (character-width) default,
                    RTL detection, greedy word-wrap
  boxSizing.ts      computePersonBox / computeChipBox -- text -> box width/height/lines
  types.ts          PosterNode, PosterChip, PosterConnector, PosterLayout,
                     PosterStyleOptions, DEFAULT_POSTER_STYLE, PosterPageSize
  layout.ts          computePosterLayout(tree, style, measure) -- the layout algorithm
  pageSize.ts        computePosterPageSize(layout, style) -- layout -> physical page size,
                     including the PDF page-size scale-down
  renderSvg.ts        renderPosterSvg(layout, page, style) -- hand-written SVG generator
  index.ts            Public API

web/src/
  lib/canvasTextMeasure.ts               makeCanvasTextMeasurer -- pixel-accurate browser
                                          measurer, passed into computePosterLayout
  lib/posterExport.ts                    posterSvgToPdfBlob / posterSvgToSvgBlob
  components/poster/PosterExportPanel.tsx  UI: stats, style controls, zoomable/pannable
                                          preview with fit-to-view and actual-size, downloads
```

`poster/` has the same shape as `parser/`, `validation/`, and `editor/`: framework-free
TypeScript, zero React dependency, importable by both tests and `web/`. It is deliberately
**not** built on `@xyflow/react`/`dagre` (the interactive explorer's stack) — see
`docs/explorer-architecture.md` for that engine.

## Text measurement

`poster/` has no DOM, so it can't call `canvas.measureText` itself and stay importable by
plain Node tests. `computePosterLayout` accepts a `TextMeasurer` (`(text, fontSizePt) =>
width`) with a character-width-heuristic default (`heuristicTextMeasurer`) — accurate enough
to make correct wrap/no-wrap decisions in tests, but not pixel-perfect against a real font.

The web app passes `web/src/lib/canvasTextMeasure.ts`'s `makeCanvasTextMeasurer`, which uses
a real offscreen `<canvas>` context's `measureText` against the actual configured font family
— pixel-accurate box sizing for the on-screen preview and every download, since both are
generated from the exact same measured layout. (CSS defines `1pt = 4/3px`; the measurer sets
`ctx.font` in `pt` so the glyph renders at the correct physical size, then converts
`measureText`'s pixel-space result back to points — skipping that conversion would
under-measure every box by a third and reintroduce the text-overflow bug this measurer
exists to avoid.)

`isRtlText` flags Arabic-range text (U+0600–06FF and friends) so `renderSvg.ts` sets
`direction="rtl"` on that node's `<text>` elements — real bidi shaping is left to the SVG
renderer/browser, this only makes sure the direction is declared correctly.

## Box sizing — "width before height"

`poster/boxSizing.ts`'s `computePersonBox` implements the rule literally: given a name,

1. Measure it at `nameFontSize` on one line. If that fits within `nodeMaxWidth`, the box
   uses that width (clamped up to `nodeMinWidth` if the name is very short) — **no
   wrapping is even considered.**
2. Only once the one-line width exceeds `nodeMaxWidth` does it wrap (greedy word-wrap,
   `poster/textMeasure.ts`'s `wrapText`), adding a second (or third...) line — i.e. height
   only grows after width has already maxed out.
3. A single unbreakable word (no spaces to wrap on) that still exceeds `nodeMaxWidth` widens
   the box past the configured max rather than clipping it. Text overflow / clipped nodes are
   a hard failure per the spec; a slightly-over-budget box is not.

Chips (see "Cousin marriage handling") use the same primitives at a smaller, tighter max
width, since they hold a label and a name, not a full record.

## Layout algorithm — seven stages

`computePosterLayout` runs in the stages the spec asked for by name:

**1. Hierarchy.** `buildPlacements` gives every person exactly one of three placements —
`child` (rendered under their own blood parents), `top` (a standalone root), or `adjacent`
(rendered next to whichever spouse anchors their first marriage) — which is the single
source of truth that guarantees no one is ever duplicated. The **anchor** of a marriage
(who keeps the children) is whichever spouse has recorded blood parents; if both or neither
do, the husband anchors by convention. Generation is a memoized, cycle-guarded recursion over
placement.

**2. Box measurement.** Every person's box (and every chip a cousin marriage needs — see
below) is measured from its actual text *before* any position exists. Generation row heights
are the max box height in that row; row Y-coordinates are a straight cumulative sum of row
heights plus `generationSpacing`, computed once, up front.

**3. Initial placement.** Bottom-up subtree-width reservation (Reingold–Tilford-style), but
in **real physical units** (points), not an abstract "sibling slot" count: a person's
reserved width is their own box width plus, for each marriage they anchor, a "lane" whose
width is the larger of that marriage's attachment (an adjacent spouse's box, or a chip) and
the combined width its children need. Children are centered within their lane; multiple
marriages (remarriage) get side-by-side lanes. Position assignment then walks top-down,
handing each child the exact span its own reserved width claims.

**4–5. Collision detection + shift.** A left-to-right sweep across every generation row
(*every* row, not just direct siblings — this also catches two unrelated branches that
happen to converge after several generations) computes each person's combined bounding box
(their own box plus any attached spouse/chip) and, on overlap, shifts the later cluster right
by exactly the overlap amount, cascading the same shift to every descendant so relative
structure is preserved exactly.

**6. Connector routing.** Not a separate recomputation step — every connector and chip line
is resolved by ID against final node coordinates at render time (`renderSvg.ts`), so it's
automatically correct after any shift.

**7. Convergence.** Stages 4–5 repeat until a full pass produces no further shift (capped at
4 passes as a safety margin). In practice this converges in a single productive pass:
because a shift only ever cascades *down* to generations not yet swept in that same pass, one
top-down sweep is provably sufficient — sweeping row *g* uses positions already fully
resolved by every row above it, and any residual overlap introduced at row *g* is caught by
row *g*'s own sweep before moving on. A second pass exists purely as a defense-in-depth check
that finds nothing to fix, not because it's structurally required. Verified in
`tests/poster-layout.test.ts` with a deliberately asymmetric two-branch collision scenario,
a 4,000+-person synthetic tree, and the real 473-person sample (zero overlaps in every case,
504 total boxes checked pairwise against the real sample including chips).

Marriage-connector lines never cross another box by construction (nothing is ever placed
between two spouses who are drawn adjacent). Descent-bus lines for sibling groups at the same
generation-transition never cross each other either, because the collision-resolution pass
guarantees their child x-ranges don't overlap and each family's children are always placed as
one contiguous block.

## Cousin marriage handling

When both spouses in a marriage have their own recorded blood parents, the anchor (per the
convention above) keeps the children. The **other spouse is never re-rendered** as a second
node at the marriage point, and — this is the V2 change — **no line is drawn all the way
across the poster to their real position either.** Instead, a compact `PosterChip` sits at
the marriage point:

```
┌ ─ ─ ─ ─ ─ ┐
   Spouse:
  Cousin Bee
 (see own entry)
└ ─ ─ ─ ─ ─ ┘
```

connected only by a short local line to the anchor. The named spouse still has exactly one
real node, drawn once, under their own actual parents, wherever that is on the poster. This
was a deliberate redesign from V1 (which drew a dashed line spanning the full width of the
poster to the spouse's real position): for a poster that can legitimately be 10+ meters wide,
a line connecting two points that far apart is not "visually obvious," it's noise. A small,
clearly-labeled chip conveys the same information — who they married, and that their
descendants are shown elsewhere — without a relationship line that has to be traced across
the entire poster. Verified against the real sample: the output contains exactly 31 chips,
matching the independently-verified cousin-marriage count in `tests/real-sample.test.ts`.

A person who's the *non-anchor* spouse in more than one marriage (remarriage into two
different cousin lines) still gets exactly one node; every marriage beyond their first
resolves to its own chip pointing back at that single node — never a second copy of them or
their descendants.

## Page sizing

`computePosterPageSize` measures the tight bounding box of every node and chip the layout
actually produced (`layout.contentWidth`/`contentHeight`, already computed by `layout.ts`)
and adds the configured margin on all sides. There is no named preset and no upper bound —
the page is exactly as large as the tree needs, however large that is.

### PDF page-size limit

The PDF format itself caps a page at **14,400pt (200in / ≈5.08m) per side** — confirmed
empirically against `jsPDF`, which silently clamps to that limit and would otherwise clip
content rather than error. This is a real constraint of the file format, not a self-imposed
one, and ignoring it would produce a PDF that clips content — the opposite of "print-shop
ready." `computePosterPageSize` handles it honestly:

- `widthPt`/`heightPt` (and the `in`/`mm` equivalents) are always the **true, uncapped**
  size — exactly what the SVG export uses. SVG has no such ceiling.
- `pdfScale` is `1` when the true size fits; otherwise it's the uniform factor that brings
  the larger dimension down to exactly 14,400pt. `pdfWidthPt`/`pdfHeightPt` are the resulting
  PDF page size, and `web/src/lib/posterExport.ts` renders the PDF at exactly that size (not
  the true size) — since the same SVG content is scaled uniformly into a smaller page, the
  PDF stays fully vector and losslessly rescalable, exactly like an oversized architectural
  drawing that's plotted at 1:10 and printed at full size by the receiving shop.
- `PosterExportPanel` shows a clear on-screen notice whenever `pdfScale < 1`, stating the
  scale percentage and the true target size, and recommending the (uncapped) SVG download for
  print shops that accept it directly.

Verified against the real sample (18.4m wide, well over the limit): the downloaded PDF's
`/MediaBox` is exactly `[0 0 14400 179]`, at 27.61% scale — matching `18.4m / 0.2761 ≈
14400pt` — with a valid single page, confirmed with `pdftotext`-independent inspection of the
raw PDF bytes.

## Rendering pipeline

```
FamilyTree --[layout.ts]--> PosterLayout --[pageSize.ts]--> PosterPageSize
                                  |                                |
                                  '-----------[renderSvg.ts]-------'
                                                  |
                                       SVG string (TRUE size, uncapped)
                                    /                        \
                        (in-app preview,                (posterExport.ts:
                         dangerouslySetInnerHTML)         jsPDF + svg2pdf.js scales the SAME
                                                           SVG into the PDF-safe page size)
```

`renderSvg.ts` is the **only** rendering backend — the preview, the SVG download, and the PDF
download all consume the identical SVG string (the PDF path just asks `svg2pdf.js` to fit it
into a possibly-smaller page, standard SVG viewport scaling). There is no second renderer
that could drift out of sync with the preview.

jsPDF and svg2pdf.js (plus sub-dependencies) are ~213KB gzipped combined and load via a
dynamic `import()` in `web/src/lib/posterExport.ts`, only when a user clicks "Download PDF" —
verified via a real `vite build`: neither chunk is referenced from `index.html`, so a user who
never opens the Print Poster tab never downloads them.

## Preview

`PosterExportPanel` provides zoom (a slider, 1–100%), pan (the preview sits in its own
`overflow-auto` container — native scroll, and the page body never scrolls horizontally even
though the poster itself can be enormous), **fit to view** (computes the zoom percentage that
makes the poster's full width match the visible container), and **actual size** (100%, i.e.
1 CSS pixel per point). Poster dimensions are shown in both metric (m/mm, matching the
spec's own examples) and imperial (in).

## Performance characteristics

Stages 1–3 are O(n + f). The collision sweep is O(n log n) for the per-row sorts; each shift
cascades to a subtree, and the sum of all subtree sizes shifted across one top-down pass is
bounded by O(n) (see the Stage 7 convergence proof above). Verified in
`tests/poster-layout.test.ts` with a ~4,100-person synthetic tree (well over the spec's
1,000-person target): layout computes in well under a second, with a generous 15-second
regression bound to catch a future reintroduction of exponential behavior without making the
test flaky. Per the spec, layout quality is explicitly prioritized over raw speed — this
isn't a chase for the fastest possible algorithm, just a guard against real algorithmic
blowup.

## Testing

- `tests/poster-layout.test.ts` — single family; three generations; wide (8-child) sibling
  groups render as one shared descent branch; deep (6-generation) ancestry; a cousin marriage
  (exactly one chip, zero duplicated nodes, zero connector referencing the chip's spouse);
  multiple cousin marriages sharing an ancestor; a corrupted-data edge case (family record
  missing both parents); a very long name that wraps instead of overflowing; a single
  unbreakable word that widens the box instead of clipping; an Arabic name (RTL flag set, box
  sized from the real text); a synthetic two-branch collision scenario with asymmetric box
  sizes; a ~4,100-person synthetic tree; and, when the real sample file is present, the full
  real 473-person/136-family tree with pairwise overlap checking across every node and chip.
- `tests/poster-render.test.ts` — page auto-sizing produces a wide page for a wide sibling
  group; the PDF-scale path (a synthetic 50,000pt-wide layout triggers `pdfScale < 1` and a
  correctly-scaled `pdfWidthPt`); the SVG is well-formed and XML-escapes special characters;
  long names wrap onto multiple real `<text>` elements; a cousin-marriage chip renders with
  its distinct dashed style and the spouse's name, while their real node (elsewhere) still
  renders too — exactly twice total (once as their own record, once inside the chip's text);
  the SVG always encodes the true uncapped size even when the PDF page would need to scale.
- `web/tests/components/poster/PosterExportPanel.test.tsx` — renders a real cousin-marriage
  tree, confirms shared ancestors appear exactly once, confirms style controls change the
  rendered SVG.
- `web/tests/integration/explorer.test.tsx` — switching between the Explore and Print Poster
  tabs and back, within the full app.
- Manually verified end-to-end in a real Chromium browser against the real sample file:
  upload → Print Poster → preview renders (dashed chips visible, no console errors) → fit to
  view / zoom work → SVG downloads (504 boxes, independently confirmed zero pairwise
  overlaps, 31 dashed chips matching the known cousin-marriage count) → PDF downloads (valid
  single page, `/MediaBox [0 0 14400 179]`, matching the expected 27.61% scale-down) →
  switching back to Explore still works.

## Known limitations

- Multiple marriages for the same person (remarriage) fan additional spouses/chips out to
  the side of the person's fixed position rather than perfectly centering the person between
  all their spouses. Structurally correct (no duplication, no overlap, no lost relationships)
  but not pixel-perfect for this comparatively rare case.
- The heuristic text measurer (used by Node/tests, and as a defensive fallback if a browser's
  `canvas.getContext("2d")` is ever unavailable) is a character-width approximation, not real
  font metrics — the browser's canvas-backed measurer used for the live preview and every
  download is pixel-accurate against the actual font.
- No photo or notes indicator on nodes — matches the specification's own "(future)" labels.
- No named paper presets or multi-sheet A4 tiling — out of scope per the user's explicit
  choice (see "Scope"); the output is a single continuous page sized for a wide-format print
  shop, with an honest PDF-format-limit scale-down when the true size exceeds it (see above).
- `svg2pdf.js`'s SVG feature coverage is not 100% of the SVG spec; the renderer only emits
  `rect`, `line`, `path`, and `text` elements (no gradients, filters, or embedded images), all
  well-supported by `svg2pdf.js`.

## Future improvements

- Centered multi-marriage layout (see "Known limitations").
- An optional "highlight one branch" preview mode for very large trees.
- Photo/notes node fields, once the spec's own "(future)" marker is lifted.
- Orthogonal (right-angle) routing for the rare case where a chip's short connector line
  would otherwise cross a neighboring box — not currently observed on real data, since chips
  are narrow and placed directly beside their anchor, but not structurally guaranteed against
  in every configuration of the style knobs.

## Version history

- **V1**: dedicated layout engine, fixed-size boxes, abstract "sibling slot" spacing units, a
  dashed connector line spanning the poster for cousin marriages, PDF/SVG export, basic zoom
  preview.
- **V2** (this document): real text measurement and variable box sizing (width-before-height,
  never clip), a genuine multi-pass collision-detection-and-shift algorithm (rather than
  relying solely on width reservation), the cousin-marriage chip redesign (replacing the
  cross-poster connector line), honest handling of the PDF format's page-size limit (V1 would
  have silently produced a clipped PDF past ~5m), metric (m/mm) sizing display matching the
  spec's own units, and a real fit-to-view/actual-size/pan/zoom preview.
