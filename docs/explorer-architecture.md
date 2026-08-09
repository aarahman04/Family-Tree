# Explorer Architecture — Developer Documentation

Status: Milestone 6 complete. Adds interactive browsing, editing, and visualization on top of the existing parser/validation/GEDCOM-exporter pipeline (`docs/parser-implementation.md`, `docs/gedcom-exporter.md`). Does not redesign or duplicate that pipeline — the explorer is a new layer that reads and writes the same `FamilyTree` model.

## Package layout

```
editor/
  errors.ts           EditorError — thrown only for graph-corrupting edits or missing-record references
  helpers.ts           withPerson/withFamily (immutable record replacement), pruneEmptyFamily, isAncestor
  operations.ts        Pure edit operations: updatePersonFields, createPerson, setFather/setMother,
                        addSpouse/removeSpouse, addChildToFamily/addChildToPerson, removeChildFromFamily
  index.ts              Public API + applyEdit() — the only way an edit becomes "official"

web/src/
  state/useTreeEditor.ts        Undo/redo reducer wrapping editor/ operations
  lib/search.ts                  buildSearchIndex / searchPeople
  lib/neighborhood.ts            computeNeighborhood / layoutNeighborhood (bounded-graph viz engine)
  components/explorer/
    TreeExplorer.tsx             Top-level container: wires search, canvas, inspector, export together
    FamilyTreeCanvas.tsx          React Flow canvas — renders one Neighborhood
    PersonNode.tsx                Custom React Flow node (person card)
    PersonPicker.tsx              Inline search-or-create widget used by relationship editing
    PersonInspector.tsx           Selected-person detail panel: field edits + relationship nav/editing
    SearchBox.tsx                 Combobox search UI
    ExportPanel.tsx               Session summary + "Export GEDCOM" action
  hooks/useExport.ts              Export state machine, reuses the existing GEDCOM worker pipeline
```

`editor/` has the same shape as `parser/` and `validation/`: framework-free TypeScript, zero React dependency, importable by both the CLI/tests and `web/`. No business logic is duplicated in `web/` — every mutation and every validation check ultimately calls into `editor/` and `validation/integrity.ts`.

## Editing workflow

Every edit follows one path, regardless of which UI control triggered it:

```
UI event (e.g. "Save changes", "Remove spouse")
  → PersonInspector calls onEdit(mutate)          // mutate: (tree) => tree, from editor/operations.ts
  → TreeExplorer forwards it to useTreeEditor's edit()
  → useTreeEditor dispatches { type: "EDIT", mutate }
  → reducer calls editor/index.ts's applyEdit(present, mutate)
      → mutate(tree)                               // pure, returns a new tree
      → runIntegrityChecks(mutated)                 // the SAME function parser/index.ts runs at import time
      → returns { ...mutated, validation: <fresh> }
  → new tree becomes state.present; old present is pushed onto `past`; `future` is cleared
```

Nothing produces a tree that skips `applyEdit` — there is no code path in the explorer that mutates `state.present` directly. This is what makes "every edit immediately triggers validation" true by construction rather than by convention.

**Field edits** (`PersonInspector`'s "Edit" form: Name, Nickname, Gender, Birth, Death, Notes) go through `updatePersonFields`. They are deliberately **not** applied on every keystroke — the form holds a local `draft` copy and only calls `onEdit` when "Save changes" is clicked. Applying on every keystroke would flood undo history with one entry per character typed.

**Relationship edits** (assign father/mother, add/remove spouse, add/remove child) go through `setFather`/`setMother`/`addSpouse`/`removeSpouse`/`addChildToFamily`/`addChildToPerson`/`removeChildFromFamily`. These apply immediately on click — there is no draft state for relationships, since a single click is already the complete, unambiguous action (unlike a multi-field form).

### Corruption prevention

`editor/operations.ts` rejects, by throwing `EditorError`, any edit that would corrupt the graph before it ever reaches the tree:
- **Self-parent**: `parentId === childId` in `setFather`/`setMother`, or a family's own husband/wife listed among its children in `addChildToFamily`.
- **Self-spouse**: `personId === spouseId` in `addSpouse`.
- **Circular ancestry**: before assigning a parent or child, `helpers.ts`'s `isAncestor` walks the candidate's ancestor chain (bounded at 2000 steps, matching `validation/integrity.ts`'s own cycle-detection bound) to confirm the assignment wouldn't make someone their own ancestor.
- **Missing records**: operations validate that referenced person/family IDs exist and throw rather than silently creating a dangling reference.

These are *prevention*, not detection — they stop a corrupting edit from ever being applied. `runIntegrityChecks` (below) is *detection* — it catches problems in whatever tree state exists, including ones that predate the explorer (e.g. broken references already present in the imported FTZ file) or that prevention can't reject outright (e.g. a family missing a parent is a legitimate, valid state — just one worth flagging).

### Family lifecycle

A `Family` record is created (`ensureFamcFamily` for parent assignment, inline in `addSpouse`/`addChildToPerson` for spouse/single-parent families) the first time it's needed, and deleted (`pruneEmptyFamily`) the moment it has no husband, no wife, and no children left — so edits never leave inert empty records behind. Notably: `removeSpouse(tree, personId, spouseId)` only clears `spouseId`'s slot in the family; `personId` (the person whose inspector the removal was triggered from) stays recorded as the remaining parent, so any children's `FAMC` references stay valid and the family isn't pruned out from under them.

## Validation workflow

Validation is not reimplemented for the explorer — `validation/integrity.ts`'s `runIntegrityChecks` (self-marriage, self-parent, circular ancestry, gender/role mismatch, family-missing-parent) is the same function the parser runs once at import time, now also run after every single edit via `applyEdit`. It takes a `FamilyTree` and returns `ValidationIssue[]`; it has no FTZ-specific knowledge, no import-time-only state, and no side effects, which is exactly what makes it safe to re-run arbitrarily often.

`TreeExplorer` derives `errors`/`warnings` straight from `tree.validation.issues` on every render (no separate re-run needed — `applyEdit` already refreshed `tree.validation` as part of producing the tree) and:
- Shows a live `role="status"` summary line (people/family counts + error/warning counts, or "Ready for export.").
- Disables the "Export GEDCOM" button in `ExportPanel` whenever any `error`-severity issue exists — warnings do not block export (e.g. a family missing one parent is exportable; a self-marriage is not).
- Surfaces warnings tied to the currently-selected person directly in `PersonInspector` (filtered from `tree.validation.issues` by `relatedIds.includes(personId)`).

One production bug this workflow caught during development, worth recording as an example of why re-running the *live* graph state (not a cached import-time snapshot) matters: the original `FAMILY_MISSING_PARENT` check compared against `family.raw` (the row exactly as imported) to decide whether a missing parent was "always missing" vs. "a broken reference." Since `raw` is captured once at import and never updated, a parent cleared by an edit was never flagged. Fixed by checking `family.husbandId`/`wifeId === undefined` directly against the live tree.

## Visualization architecture

**The core problem**: a tree can have 10,000+ people, but a screen can meaningfully show a few dozen at once. The explorer never renders "the tree" — it renders a bounded neighborhood around whatever the user is currently looking at, recomputed on demand.

`web/src/lib/neighborhood.ts`:
- `computeNeighborhood(tree, focusId, expandedIds)` — BFS out from `focusId` to a fixed depth of 2 (covers grandparent ↔ grandchild, siblings, and spouses in view), plus a 1-hop BFS around every person in `expandedIds` (people the user explicitly clicked "expand" on). Hard-capped at 150 total nodes (`MAX_NEIGHBORHOOD_SIZE`) regardless of depth, because depth alone doesn't bound size — a person with a large sibling group can pull in hundreds of people within 2 hops. If the cap is hit, `truncated: true` is returned and surfaced as a visible banner rather than silently dropping people.
- Returns deduplicated `nodeIds` and `edges` — the BFS tracks visited people in a `Set<UUID>` (`included`), so a person reachable via two different paths (e.g. a shared grandparent reached through both spouses of a cousin marriage) is added once and every later path to them is a no-op, not a second copy.
- `layoutNeighborhood(nodeIds, edges)` — runs `dagre` (top-to-bottom rank layout) **only over this bounded subgraph**, not the whole tree. Spouse edges get `minlen: 0` so dagre is free to place couples on the same rank without forcing it.

`FamilyTreeCanvas.tsx` renders that neighborhood with `@xyflow/react` (React Flow):
- `onlyRenderVisibleElements` culls off-screen nodes from the DOM even within the already-small neighborhood.
- `PersonNode` (custom node type) shows name, gender glyph (♂/♀, not color alone — WCAG 1.4.1), birth/death year, a warning indicator, and an expand (+) button when the person has relations outside the current neighborhood.
- Parent-child edges use a `smoothstep` connector between dedicated top/bottom handles; spouse edges use a `straight` dashed connector between dedicated left/right handles, with the handle side chosen per-render by comparing the two people's laid-out x-positions (so the line never crosses through a node).
- Selecting a person (canvas click, search, or an inspector navigation link) updates `focusPersonId`, which re-frames the viewport via React Flow's `fitView` (scoped to the current neighborhood, not just the focus person's coordinates) — this is the mechanism behind "center the view on any individual." An earlier version used `setCenter` at a fixed zoom of 1, which routinely left grandparents, spouses, or children just outside the viewport on real family clusters (a depth-2 neighborhood is often wider/taller than a single screen at 1:1 zoom) — since `onlyRenderVisibleElements` culls off-screen nodes from the DOM entirely, they weren't just invisible, they weren't rendered. `fitView` fits the whole current neighborhood into view instead, so nothing relevant is hidden right after a search or navigation; `maxZoom: 1` keeps a lone, sparsely-connected person from being zoomed in unnaturally close.
- Clicking a node's `+` adds that person to `expandedIds`, which triggers a new `computeNeighborhood` call including their 1-hop relations — "expand a branch" without ever computing or laying out the full tree.

**Sizing the canvas container** (fixed during the v1.0 release audit, real-browser-only bug): React Flow needs its container to resolve to a genuinely *definite* pixel height — a chain of `height: 100%` divs cascading down from an ancestor whose own height comes from `min-height` winning a flex-basis clamp (`h-[65vh]` vs `min-h-96` on narrow viewports) is not reliably treated as "definite" by Chromium's percentage-height resolution, so the canvas silently collapsed to 0 height and rendered nothing on mobile-width viewports, while working fine on desktop where `h-[65vh]` itself won the clamp. Every wrapper in the chain down to `FamilyTreeCanvas`'s own div now sizes itself via `flex-1` (flex-grow, not a percentage) instead of `h-full`; the innermost wrapper directly parenting `<ReactFlow>` uses `absolute inset-0` against a `position: relative` ancestor rather than `height: 100%`, which sidesteps percentage-resolution ambiguity entirely with a hard pixel box. jsdom's `getBoundingClientRect` is a constant stub (see below), so this class of bug is invisible to the unit/integration test suite regardless of coverage — it was only caught by real-viewport Playwright verification across desktop, tablet-width (900px, 1024px), and mobile-width (390px) viewports.

This design makes rendering cost independent of total tree size: a 10,000-person tree and a 200-person tree cost the same to lay out and paint, because neither `computeNeighborhood` nor `layoutNeighborhood` nor React Flow's node list ever touches more than ~150 people. Verified directly in `web/tests/performance/largeTree.test.ts` against a synthetic 10,000-person/5,000-family tree.

## State management

**Session state (`web/src/state/useTreeEditor.ts`)** — a `useReducer` holding:
```typescript
{ originalTree: FamilyTree; past: FamilyTree[]; present: FamilyTree; future: FamilyTree[]; editCount: number }
```
`originalTree` is set once from the freshly-parsed upload and never mutated by any reducer action — this is what makes "the original uploaded data remains unchanged" a structural guarantee rather than a discipline the UI has to maintain. `present` is what every other component reads and displays.

**Undo/redo uses full-tree snapshots, not inverse operations.** Every `EDIT` action pushes the pre-edit `present` onto `past` and clears `future`; `UNDO`/`REDO` just move the present pointer across those arrays. This was a deliberate simplicity tradeoff: an inverse-operation model (recording "undo `setFather(x, y)`" as "call `setFather(x, undefined)`") would need a hand-written inverse for every operation, and get every one of them exactly right for every edge case (e.g. what "undo `addChildToFamily`" does when the child had a different previous family) — a correctness burden with a much larger surface for bugs than "keep the previous whole tree." Memory is bounded via `MAX_HISTORY = 50` (oldest snapshots drop off `past`), which is far above what one editing session realistically needs. At the tree sizes this app targets (thousands of people, each a small POJO), 50 snapshots of structurally-shared objects is not a meaningful memory concern.

`TreeExplorer` mounts a fresh `useTreeEditor` instance per uploaded file (`HomePage` keys the whole explorer subtree by `metadata.importedAt`), so undo history from one file never leaks into the next.

**Local UI state**, not part of the undo/redo history, lives directly in `TreeExplorer`: `focusPersonId` (what the canvas is centered on), `selectedPersonId` (who the inspector is showing), `expandedIds` (which people have been manually expanded). None of these represent tree *data*, so they aren't — and shouldn't be — undo/redo-able; undoing an edit shouldn't also un-select whoever you're looking at.

**Per-person form state** lives inside `PersonInspector` as a local `draft`, separate from the live tree, so in-progress typing survives re-renders without being committed until "Save changes." This introduced a real bug during development: the original code only resynced `draft` from the tree when `personId` itself changed, so an undo/redo (or any other edit) that changed the *currently-selected* person's data left the form showing stale values — clicking "Save changes" again with no further typing would have silently redone the just-undone edit. Fixed with a `dirtyRef` that tracks whether the user has unsaved typing: a second `useEffect` keyed on the `person` object reference (which changes on any edit touching that person, via `editor/helpers.ts`'s immutable `withPerson`) resyncs the draft whenever the underlying data changes **and** there's no unsaved typing in progress. Covered by `web/tests/integration/explorer.test.tsx`'s "undo resyncs the edit form itself, not just the heading" test, and reproduced/confirmed fixed against the real sample file in a live browser (see Testing below).

### Unsaved-edit protection (`web/src/lib/unsavedEdits.ts`)

Since edits live only in memory (by design — see "Session Handling" above), an accidental tab
close, refresh, in-app "Clear"/"Replace file" click, or navigation away from Home could
silently discard everything a user has done in a session. This is guarded on three fronts,
added in a dedicated stabilization pass after a release-readiness audit flagged it as a
release blocker — data loss is exactly the risk the whole undo/redo and immutable-tree design
elsewhere in this document exists to prevent, so it needed a real fix, not just a caveat.

- **`beforeunload`** (`HomePage.tsx`) is added via a `useEffect` keyed on
  `editCount > 0`, and removed the instant that flips back to zero — registered only while
  there's something to lose, exactly as specified, not permanently-with-an-internal-no-op.
- **A shared module-level flag** (`unsavedEdits.ts`'s `setHasUnsavedEdits`/
  `confirmDiscardIfUnsaved`) lets `Header.tsx`'s navigation links guard themselves too, since
  navigating from Home to About/Privacy unmounts `HomePage` (destroying its state) without
  ever triggering `beforeunload` — a hash change isn't a page unload. A plain shared module
  was used instead of React Context deliberately: the only two consumers (`HomePage`, the
  writer; `Header`, the reader) are siblings with no other shared state, and a Context
  provider just for this one boolean would be more structural surface than the problem
  warrants. `confirmDiscardIfUnsaved` is a no-op (no dialog) whenever there's nothing to lose.
- **"Replace file" parses and validates the new file before touching any state.**
  `useFtzConversion.ts`'s `selectFile` checks whether it's replacing an already-loaded tree
  (`isReplace`); if so, `state` is never written to except on a successful parse — a failed or
  wrong-extension replacement surfaces `window.alert(...)` and leaves the original tree,
  filename, and edit history completely untouched. This closed a real bug: the previous
  version transitioned to a new/error state *before* attempting to parse the replacement, so
  even a failed replace destroyed the working session for nothing.

Covered by `web/tests/integration/unsavedEdits.test.tsx` (12 tests: beforeunload registration,
Clear/Replace/navigation confirmation and cancellation, the parse-before-replace guarantee)
and `web/tests/lib/unsavedEdits.test.ts` (the guard module in isolation). Also verified in a
real headless-Chromium browser — jsdom's `window.confirm`/`alert` are mocked, not real, in the
test suite, so the actual native-dialog behavior (message text, cancel preserving the session,
accept applying it) was checked independently in a genuine browser as well.

## Error recovery

`web/src/components/ErrorBoundary.tsx` wraps the whole app (`main.tsx`) and catches any
uncaught rendering error, showing a "Something went wrong" recovery screen with a "Return to
upload screen" action instead of React's default — unmounting the entire tree to a blank white
page. This matters specifically *because* there's no autosave: without it, a single rendering
bug anywhere would silently destroy a user's in-session edits with no explanation and no way
back. "Return to upload screen" does a full page reload (not just clearing local component
state) deliberately — an error this boundary catches means some part of the React tree's state
can no longer be trusted, so the only honest recovery is a genuinely fresh start.

Necessarily a class component — `componentDidCatch`/`getDerivedStateFromError` have no hook
equivalent in React as of version 18 — which also means it can't reuse the `useAutoFocus` hook
every other transient panel in this app uses to move keyboard focus to itself on appearance.
It replicates the same behavior manually instead of skipping it: `componentDidMount` covers an
error thrown during the boundary's very first render (no prior commit exists for
`componentDidUpdate` to compare against in that case), and `componentDidUpdate` covers an
error appearing later, after some number of successful renders. Both paths are exercised
directly in `web/tests/components/ErrorBoundary.test.tsx`.

The two raw `tree.persons[id]!` assertions this component's own error surface made worth
double-checking (`PersonInspector.tsx`'s `draftFromPerson`, `FamilyTreeCanvas.tsx`'s node
mapping) were replaced with safe fallbacks — an empty draft and a skipped node, respectively —
rather than left to throw. Neither is reachable today (no `editor/` operation deletes a
person), but `docs/roadmap.md`'s planned duplicate-merge feature would change that, and the
fix was cheap insurance against it becoming a real crash later.

## Performance considerations

- **Bounded neighborhood, not virtualization of the whole tree** (see Visualization architecture above) is the primary performance strategy — it avoids the problem (rendering thousands of nodes) rather than optimizing the rendering of it.
- **`onlyRenderVisibleElements`** gives DOM-level culling as a second layer within the already-small neighborhood.
- **Search** (`lib/search.ts`) is a plain array + linear substring scan over a pre-lowercased index, rebuilt only when `tree` changes (`useMemo` in `TreeExplorer`). At up to ~10,000 people this is a few thousand cheap string comparisons per keystroke — well under a millisecond — so no trie or fuzzy-search library was worth the added complexity.
- **Memoization**: `computeNeighborhood`, `layoutNeighborhood`, the derived React Flow `nodes`/`edges` arrays, and the search index are all wrapped in `useMemo` keyed on their actual inputs, so they only recompute when the tree, focus, expansion set, or selection actually changes — not on every unrelated re-render (e.g. typing in the search box before submitting).
- **Immutable updates share structure**: `withPerson`/`withFamily` only shallow-copy the `persons`/`families` maps and the one changed record; every untouched record keeps its previous object identity. This is also what makes the `dirtyRef` resync effect above cheap to key on (`person` object identity, not a deep comparison).
- Verified at scale in `web/tests/performance/largeTree.test.ts` (10,000 people / 5,000 families, synthetic) and manually in a real browser against the 473-person/136-family real sample file (see Testing).

## Testing

- **`tests/editor.test.ts`** (root package): unit tests for every `editor/operations.ts` function, including rejection paths (self-parent, circular ancestry, self-spouse), family creation/reuse/pruning, and `addChildToPerson`'s 0/1/multiple-spouse-family disambiguation.
- **`web/tests/lib/neighborhood.test.ts`**: BFS/dedup/truncation logic, including a dedicated cousin-marriage fixture proving a shared ancestor appears exactly once.
- **`web/tests/components/explorer/FamilyTreeCanvas.smoke.test.tsx`**: renders the canvas for a simple family and, separately, the cousin-marriage fixture, asserting no duplicate DOM nodes for the shared ancestor.
- **`web/tests/components/explorer/PersonInspector.test.tsx`**: field editing, relationship editing/removal, navigation links, warning display.
- **`web/tests/state/useTreeEditor.test.ts`**: undo/redo reducer semantics.
- **`web/tests/integration/explorer.test.tsx`**: full-stack tests against a synthetic 8-person fixture rendering the real `App` — search-and-select, edit propagation (inspector → heading → search index), multi-relation navigation (parent/grandparent/sibling/spouse/child), undo/redo (including the form-resync regression test above), live validation after an edit (removing a spouse produces a visible warning, export stays enabled since it's warning- not error-severity), and export reflecting edited (not original) data.
- **`web/tests/performance/largeTree.test.ts`**: synthetic 10,000-person/5,000-family tree, asserting neighborhood computation and layout stay fast regardless of total tree size.
- **Real-sample and real-browser verification**: the existing real-FTZ-sample tests (`tests/real-sample.test.ts`, `web/tests/integration/conversion-flow.test.tsx`) continue to pass unmodified. Additionally, the full explore → search → select → canvas-node-click → edit → undo → redo → export → About/Privacy-page flow was driven end-to-end in a real headless Chromium browser (Playwright) against the actual 473-person/136-family sample file, with zero console or page errors — this is also how the draft-resync bug above was originally caught (the jsdom test suite alone did not check the *form field's* value after an undo, only the heading), and how a real mobile-viewport bug was caught (see Known limitations).
- **jsdom cannot catch CSS layout bugs**: jsdom implements no real layout engine — `getBoundingClientRect` is stubbed to a constant fake size regardless of the actual CSS (see `web/tests/setup.ts`), so a whole class of bug (wrong flexbox sizing, a collapsed-height container, a broken responsive breakpoint) is structurally invisible to the jsdom test suite no matter how much coverage it has. This is why real-browser, real-viewport verification (Playwright, across desktop/tablet/mobile widths) is a required part of testing this component, not an optional extra.
- **jsdom also doesn't implement `window.confirm`/`window.alert`** — every test exercising the unsaved-edits guards (above) stubs them explicitly with `vi.spyOn`. The real native dialogs (message text, blocking behavior, cancel vs. accept) were separately verified in a real headless-Chromium browser rather than trusted to the mock alone.
- **`web/tests/lib/unsavedEdits.test.ts`**, **`web/tests/integration/unsavedEdits.test.tsx`**, **`web/tests/components/ErrorBoundary.test.tsx`**: cover the data-loss protection and error-recovery systems described above.

## Accessibility

- Every interactive canvas node is a real `<button>` with an `aria-label` describing name, gender, and warning status — not a bare clickable `<div>`.
- Gender is distinguished by glyph (♂/♀) in addition to border/background color, per WCAG 1.4.1 (color is never the only differentiator).
- The person-count/validation summary line uses `role="status"` so screen readers announce it as it changes after an edit.
- `PersonInspector` moves focus to the newly-selected person's heading on every navigation (not just on mount, since the panel stays mounted across selections), so keyboard/screen-reader users land somewhere meaningful after a jump.
- `ErrorBoundary`'s recovery screen does the same (see "Error recovery" above) — added after a review specifically caught it as the one transient panel in the app that *didn't* follow this pattern, leaving a keyboard user's focus stranded exactly when the app's own last-resort safety net triggers.
- Verified with `jest-axe` in `web/tests/a11y/axe.test.tsx` against the explorer screen loaded with the real sample data.

## Known limitations

- Neighborhood depth (2) and size cap (150) are fixed constants, not user-configurable. They were chosen to comfortably cover the "grandparent through grandchild" range the milestone calls out; a future milestone could expose these as settings if real usage shows they're too tight or too loose.
- Undo/redo history is per-browser-session and capped at 50 steps; neither is persisted, consistent with the milestone's session-handling requirement (edits exist only for the current session unless explicitly exported).
- Canvas-node drag/reposition is intentionally disabled (`nodesDraggable={false}`) — positions come entirely from the dagre layout, since manual positioning isn't part of this milestone's scope and would need its own persistence story.
