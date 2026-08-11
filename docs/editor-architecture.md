# Editor Architecture

The Family Tree editor is a full-screen workspace where users **import** (FTZ/GEDCOM) or
**create** a tree from scratch, then explore, edit, analyze, and export it. Everything runs on a
single canonical model and a single rendering pipeline, so the interactive editor and the print
poster can never drift apart.

## The one rendering pipeline

```
FamilyTree
   │
   ▼
Operations layer (editor/operations.ts)      ← add / edit / delete, pure & undoable
   │
   ▼
computeBalancedPosterLayout (poster/)         ← the ONLY layout engine
   │
   ▼
renderPosterSvg (poster/)                     ← the ONLY renderer (SVG string)
   │
   ├── Print Poster (PosterExportPanel)
   └── Interactive editor (EditorCanvas)      ← same SVG + a thin interaction layer
```

There is deliberately **no second rendering engine**. `EditorCanvas` renders the exact SVG string
`renderPosterSvg` produces (via `dangerouslySetInnerHTML` — the renderer's own trusted output) and
layers interaction on top of it. The poster feature and the editor call the same
`computeBalancedPosterLayout` → `renderPosterSvg` functions.

## Layers

- **Model** (`models/types.ts`): `FamilyTree { metadata, persons, families, validation }`. A
  manually-created tree is just a `FamilyTree` with `sourceFormat: "manual"` — identical in shape
  to an imported one, so no code path downstream special-cases it.
- **Operations** (`editor/operations.ts`): pure `(tree, …) => tree` functions —
  `createPerson`, `updatePersonFields`, `setFather`/`setMother`, `addSpouse`/`removeSpouse`,
  `addChildToPerson`/`removeChildFromFamily`, and `deletePerson`. They never touch rendering.
  `applyEdit` (`editor/index.ts`) wraps every operation and reruns `runIntegrityChecks`, so
  **validation is continuous** — no tree exists that hasn't been validated.
- **Undo/redo** (`web/src/state/useTreeEditor.ts`): snapshots per edit; every UI edit goes
  through `edit(mutate)`.
- **Layout + renderer** (`poster/`): unchanged by the editor; see `poster-architecture.md`.
- **Interaction** (`web/src/components/editor/EditorCanvas.tsx`): pan/zoom, click-to-select
  (hit-testing via `lib/canvasHitTest.ts`), selection/pulse overlays, minimap, focus-mode dim
  overlays, and the imperative **view actions** (below).

## View system

`EditorCanvas` is a `forwardRef` exposing an imperative `EditorCanvasHandle`
(`fitTree`, `fitWidth`, `fitHeight`, `posterScale`, `centerSelection`, `resetView`,
`toggleFocus`). The toolbar's `ViewMenu` calls these — so the toolbar stays decoupled from the
rendering internals. **Every view action is transform-only**: it mutates the pan/zoom transform
`{tx, ty, s}` and nothing else. It never recomputes the layout or regenerates the SVG. "Poster
scale (100%)" is simply `s = 1` positioned at the top-left; the existing viewport handles panning
across the natural-width tree — there are no browser scrollbars and no second viewport.

## Performance model

- Layout + SVG string are `useMemo`'d on `(tree, style, measurer)` — recomputed **only** after a
  real tree edit.
- Pan, zoom, view presets, and selection change only the transform / a lightweight overlay — the
  SVG string is unchanged, so React never rewrites the canvas DOM.
- Focus-mode dim overlays live *inside* the transformed layer (content-space coordinates), so
  they don't recompute on pan/zoom.
- `EditorCanvas` is wrapped in `React.memo`, so unrelated editor state (toast, sidebar, unsaved
  indicator) never re-renders it.
- The search index (`lib/search.ts`) and insights (`lib/insights.ts`) are memoized on the tree.

## Guided editing

`lib/addRelative.ts` is the single place that composes operations to "create a new relative and
link them" (`father`/`mother`/`parent`/`spouse`/`child`/`independent`). Both the sidebar
`QuickActions` and the toolbar `AddPersonMenu` use it — no duplicated relationship logic. Linking
two *existing* people (including cousin marriages) uses the inspector's person picker.
`deletePerson` detaches from all families, prunes empty families, re-derives references, and is
undoable with a "Person deleted · Undo" toast.

## Manual tree creation flow

1. Home offers two entry points: **Import existing tree** and **Create new family tree**.
2. `CreateFamilyTreeWizard` collects a tree name/description and the root person.
3. `lib/newTree.ts`'s `buildNewTree` produces a validated manual `FamilyTree` (one root person).
4. It's stored in the app-level `TreeSessionProvider` and the app navigates to `#/editor`.

From step 4 on, a manual tree is indistinguishable from an imported one.

## Session, autosave, unsaved changes

- `TreeSessionProvider` (`web/src/state/treeSession.tsx`) holds the current tree across routes.
- Edits mirror into the session and are autosaved to `localStorage` (debounced); a fresh load
  offers to restore (`lib/autosave.ts`).
- The unsaved-edits flag (`lib/unsavedEdits.ts`) drives a toolbar indicator, a `beforeunload`
  warning, and the header navigation guard.

## Future extension points (not yet built)

Relationship Creation Mode, Add Sibling, photos/documents/events/sources, and multiple-tree
management all plug into the **operations layer** (and, for guided flows, `addRelative`) without
touching the layout engine or renderer.
