# Engineering Audit — Version 1.0 Release Findings

Performed as part of Milestone 7 (release readiness). Scope: parser, validation, editor,
visualization, GEDCOM exporter, UI, worker communication, state management, tests,
accessibility, and performance — looking specifically for hidden assumptions, edge cases,
race conditions, stale state, duplicate logic, memory leaks, unnecessary renders, scalability
issues, and browser compatibility issues. This document reports what was found; two issues
were real and are now fixed, everything else reviewed and confirmed sound.

## Findings that were real bugs, and are fixed

### 1. Export-during-edit race could produce a download that doesn't match the screen

**Where:** `web/src/hooks/useExport.ts`, `web/src/components/explorer/TreeExplorer.tsx`,
`web/src/components/explorer/PersonInspector.tsx`.

`useExport`'s `runExport(tree, sourceFileName)` captures the tree **by value** at the moment
the Export button is clicked, then does a real async round-trip through a Web Worker. Nothing
previously prevented the user from making another edit (a field save, an undo, a relationship
change) while that round-trip was in flight. Since the worker had already been posted the
pre-edit snapshot, the resulting download would silently reflect the *old* state while the
screen had already moved on to the new one — a genuine data-trust problem, not merely a
cosmetic one.

**Fix:** `TreeExplorer` now owns the `useExport` state (lifted out of `ExportPanel`) and
passes `disabled={isExporting}` down to `PersonInspector`, which wraps its entire editable
surface — the field-edit form, every relationship add/remove button, and the person-picker
components it renders — in a single `<fieldset disabled>`. HTML cascades a fieldset's disabled
state to every descendant form control regardless of component-tree depth, so this closes the
hole with one prop rather than threading `disabled` through a dozen individual buttons. The
toolbar's Undo/Redo buttons are disabled the same way. A short status message explains why.

**Verified:** a new integration test (`web/tests/integration/explorer.test.tsx`, "editing is
paused while an export is in flight") makes a real edit, starts a real (artificially-delayed-
in-the-test-mock) export, and asserts both the Save button and the Undo button are disabled
mid-flight, then re-enable once the export resolves.

### 2. The explorer canvas rendered completely blank on mobile-width viewports

**Where:** `web/src/components/explorer/TreeExplorer.tsx`,
`web/src/components/explorer/FamilyTreeCanvas.tsx`.

React Flow's canvas needs its container to resolve to a genuinely *definite* pixel height. The
container chain used `height: 100%` (Tailwind's `h-full`) cascading through several nested
wrapper divs, down from an ancestor whose own height came from `min-height` winning a
flex-basis clamp (`h-[65vh]` vs. `min-h-96` — on a narrow viewport, `min-h-96`'s 384px wins
over `65vh`'s smaller value). A flex item whose size is decided by `min-height` clamping,
rather than its own flex-basis, is not reliably treated as "definite" by Chromium's
percentage-height resolution — so every descendant relying on `height: 100%` silently
collapsed to 0px. The container had real width, real border, real background — it was just
zero pixels tall, so the entire family tree canvas was invisible with no error, no console
warning, nothing. This did not reproduce on desktop-width viewports, where `65vh` itself won
the clamp and produced a normal definite height, which is why it wasn't caught earlier.

**Fix:** every wrapper in the chain now sizes itself via `flex-1` (flex-grow, computed by the
flex algorithm directly) instead of `height: 100%` (a percentage that has to resolve against
an ancestor). The innermost wrapper — the direct parent of `<ReactFlow>` — uses
`absolute inset-0` against a `position: relative` ancestor instead of a percentage height at
all, which sidesteps the resolution ambiguity entirely with a hard pixel box.

**Verified:** real-browser (Playwright/Chromium) checks at 390px (mobile), 900px and 1024px
(tablet/breakpoint boundary), and 1600px (desktop) widths, confirming the canvas resolves to a
non-zero height and renders the expected node count at every width. **This class of bug is
structurally invisible to the jsdom-based test suite** — jsdom stubs `getBoundingClientRect`
to a constant fake size regardless of the actual CSS (see `web/tests/setup.ts`), so no amount
of jsdom test coverage could have caught a real flexbox layout collapse. This is now called
out explicitly in `CONTRIBUTING.md` and `docs/explorer-architecture.md` as a reason real-
browser verification at multiple widths is a required step for layout-touching changes, not
an optional extra.

## Also found and fixed: a UX gap in "center on selection"

Not a defect exactly, but the same investigation that surfaced the mobile bug above also
found that the canvas's "center on the selected person" behavior used a fixed zoom of 1
(`setCenter`), which routinely left grandparents, spouses, or children just outside the
viewport on real family clusters — a depth-2 neighborhood is often taller or wider than a
single screen at 1:1 zoom, and since off-screen nodes are culled from the DOM entirely
(`onlyRenderVisibleElements`), they weren't just out of view, they weren't rendered. Replaced
with React Flow's `fitView`, scoped to the whole current neighborhood rather than just the
focus point, so nothing relevant is hidden right after a search or navigation. See
`docs/explorer-architecture.md` for the full writeup.

## Reviewed and confirmed sound

- **Worker lifecycle** (`web/src/worker/workerClient.ts`) — a fresh Worker per request,
  always terminated on both the success and error paths. No accumulation of live worker
  instances across repeated use.
- **Blob URL cleanup** (`web/src/components/DownloadPanel.tsx`) — the generated download URL
  is created in a `useMemo` and revoked in the matching `useEffect` cleanup, keyed on the URL
  itself, so regenerating a download or unmounting never leaks an object URL.
- **Double-submit races** (upload during parse, double-click export) — both are prevented by a
  synchronous state transition (`setState({stage: "parsing"|"exporting"})`) that happens before
  the first `await` in the relevant handler, which disables the triggering control before the
  browser can process a second click.
- **Export error handling** — a worker-level error (not just an application-level rejection) is
  still caught by `exportGedcomViaWorker`'s `try/catch` around the worker round-trip and mapped
  to a normal error state; there's no path that leaves the UI stuck showing "exporting"
  forever.
- **Memoization** — `computeNeighborhood`, `layoutNeighborhood`, the derived React Flow
  node/edge arrays, and the search index are all wrapped in `useMemo` keyed on their actual
  inputs. `PersonNode` is wrapped in `React.memo`. One minor, non-urgent observation: because
  the memoized `nodes` array depends on the whole `tree` object (which gets a new reference on
  *any* edit, anywhere), every visible person's card re-renders on every edit, not just the
  edited person's. At the current bounded scale (max 150 nodes in view) this is not a
  measurable performance issue — see `docs/performance-report.md` — so it wasn't changed;
  noted here in case a future scale increase changes that calculus.
- **Ancestry-walk cycle detection** (`validation/integrity.ts`, `editor/helpers.ts`) — bounded
  at 2000 steps in both places. This is many times deeper than any real genealogy (2000
  *generations* vs. a realistic maximum in the dozens), so the cap is a safety net against
  pathological/corrupted data, not a real-world limitation.
- **Undo/redo memory** — full-tree snapshots, capped at 50 steps, with structural sharing (an
  edit only allocates new objects for the touched Person/Family and the two containing maps,
  not the whole tree). At the 10,000-person scale this project targets, that's a real but
  bounded and acceptable memory cost, documented in `docs/explorer-architecture.md`.
- **Browser compatibility** — every browser API this project depends on (Web Workers,
  `crypto.randomUUID`, `ResizeObserver`, the File/Blob APIs, drag-and-drop) is broadly
  supported in current Chrome, Firefox, Safari, and Edge. The one thing that looked like a
  browser-compatibility gap (`DOMMatrixReadOnly` missing) turned out to be a jsdom-only gap,
  not a real one — see `web/tests/setup.ts`'s polyfill comments.

## Family graph verification (real dataset)

Verified directly against the real 473-person/136-family sample (see
`docs/performance-report.md` for the same dataset's timing numbers):

- **Zero duplicate individuals** — checked programmatically by comparing rendered React Flow
  node count against unique node IDs (not display labels, since many real people in this
  dataset legitimately share a blank or common name) across five different focus scenarios:
  a cousin marriage with three shared ancestors spanning two generations, the widest sibling
  group in the data (11 children), the deepest ancestry chain (6 generations), and two
  general spot checks. All five: rendered node count exactly equals unique person-ID count.
- **Cousin marriages and shared ancestors render correctly** — a shared ancestor reached
  through both spouses' lines (confirmed with "Mohammad Abdul Qahar × Shenaaz Begum," who
  share three ancestors across two generations) appears exactly once on the canvas, with a
  spouse-edge line correctly crossing between the two family branches that converge on it.
- **Wide sibling groups render without overlap** — the real 11-child family renders as a clean
  horizontal band with no card overlap, at the neighborhood size cap headroom to spare (45 of
  150 max nodes for that view).
- **The dataset has one connected component** — all 473 people are reachable from each other;
  there's no accidental fragmentation. (This means the "disconnected trees are intentional"
  requirement wasn't directly exercisable against real data — the underlying BFS-based
  neighborhood logic handles a disconnected person the same way it handles anyone else, by
  simply not including unreachable people in that focus's neighborhood, which is correct
  behavior, but it's confirmed by the synthetic tests in `web/tests/lib/neighborhood.test.ts`
  rather than by this real-data check.)
