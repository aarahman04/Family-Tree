# Full-Screen Family Tree Editor — Single Layout Engine

**Status:** Approved design (2026-08-10)
**Owner:** editor / poster unification

## Goal

Refactor the Family Tree Editor so it uses the **exact same layout engine as the
Print Poster**. The editor becomes the primary workspace for viewing, navigating,
editing, searching, analyzing, and exporting a family tree.

The Print Poster is already the correct implementation. The editor must visually and
structurally match it so there is **one source of truth** for tree rendering.

## Core principle — one layout engine

```
Tree Data
    │
    ▼
computeBalancedPosterLayout(...)  ──► renderPosterSvg(...)
    │
    ├── Print Poster
    └── Interactive Editor
```

The shared `poster/` package stays **untouched** — the editor reuses
`computeBalancedPosterLayout` + `renderPosterSvg` unchanged. Interaction (selection,
hover, search, focus) is layered *above* the SVG and never regenerates it; only a real
tree edit recomputes the layout.

---

## 1. Full-screen editor route

- Extend the hash router with an `"editor"` route (`#/editor`).
- App-level `TreeSessionProvider` holds: validated tree, imported filename, editing
  session. `HomePage` writes to it after a successful import; the editor reads from it.
- After import, Home shows an **"Open editor →"** button that navigates to `#/editor`.
- Landing on `#/editor` with no tree loaded shows: *"No tree loaded. Upload a family
  tree first."* plus a button back to Home.

## 2. Full-screen layout

On the editor route: no footer, no width clamp, slim header, entire viewport used.
Canvas occupies ~75–80% of width; a collapsible sidebar takes the rest.

## 3. Remove React Flow completely

Delete `FamilyTreeCanvas`, `PersonNode`, `lib/neighborhood.ts`, and the
`@xyflow/react` dependency. The editor renders the poster engine's SVG directly.

## 4. Interactive SVG canvas (`EditorCanvas`)

`computeBalancedPosterLayout(...)` → `renderPosterSvg(...)`, producing output
indistinguishable from the poster: spouses adjacent, children under the father only,
reciprocal cousin-marriage chips, identical spacing / connectors / alignment / gender
icons.

## 5. Interaction layers (above the static SVG)

Selection overlay, hover overlay, search-highlight overlay. None regenerate the SVG.

## 6. Navigation

Wheel-zoom toward cursor, drag-to-pan, Zoom In / Out / Reset / Fit to View / Center
Selection. A small non-interactive minimap in a corner shows the viewport within the
whole tree.

## 7. Selection via hit-testing

Each layout node has `x/y/width/height`. A click inside a node selects + highlights it
and opens the inspector. No changes to the shared renderer.

## 8. Search

Autocomplete over name / id / spouse name / alternate names. Selecting a result
centers + smoothly zooms to the person and briefly pulses them (2–3 s).

## 9. Right sidebar (collapsible)

Sections: Search, Person Details, Relationships, Quick Actions, Undo/Redo, Insights.
Reuse the existing `PersonInspector`.

## 10. Quick actions

One-click: Add Parent, Add Child, Add Spouse, Delete Person, Center View, Expand Family.

## 11. Keyboard shortcuts

`Ctrl+F` search · `Ctrl+Z` undo · `Ctrl+Shift+Z` redo · `Delete` delete selected ·
`Esc` clear selection · `Space+Drag` pan · wheel zoom · double-click center selected.

## 12. Focus mode

When a person is selected, they + parents + spouse + children + siblings stay opaque;
everyone else fades to ~20–30%. Clicking empty space exits focus mode.

## 13. Export

Single **Export ▼** menu: GEDCOM, Print Poster (SVG), Print Poster (PDF). JSON / PNG /
CSV are future entries. Reuse existing export components.

## 14. Autosave

Periodically persist the editing session to local storage. On reopen after an
unexpected close, offer *"Restore previous editing session?"*.

## 15. Performance

Whole-tree SVG is acceptable. Memoize layout, text measurement, connectors, and the
search index. Overlays never regenerate the SVG; only edits recompute the layout.

## 16. Insights module — `lib/insights.ts`

Pure, reusable, unit-tested. UI clearly separates **exact** vs **estimated**; never
present estimates as historical fact.

- **General:** total members; male / female / unknown counts; M/F %; living; deceased.
- **Family structure:** generations; largest family (most children); average children
  per family; number of marriages; largest generation; disconnected family groups.
- **Timeline (labeled estimates):** estimated earliest generation (~decade) and
  estimated tree span (~years), extrapolating unknown generations at ~30 yrs/generation
  from known birth years.
- **Lifespan (where data exists):** average lifespan; longest-lived person; oldest and
  youngest living person.
- **Names:** most common surname; most common first name.
- **Display:** compact stat strip on top + detailed Insights panel in the sidebar.

## 17. Future-proof architecture

Future capabilities (collapse/expand branches, hide distant relatives, filter by
generation/surname, relationship-path highlighting, timeline view, tree comparison)
must operate as overlays / view transformations, never by modifying the poster layout.

## 18. Testing

`insights.test.ts` (generation calc, estimated-earliest heuristic, empty trees, edge
cases), selection hit-testing, editor routing, accessibility smoke tests. All existing
tests keep passing.

---

## Build phases (implementation order)

To ship a solid, tested core first and layer polish afterward:

- **Phase 1 — Foundation:** router `editor` route + `TreeSessionProvider`; full-bleed
  `Layout` mode; "Open editor" from Home; `EditorCanvas` (poster layout + SVG) with
  pan / zoom / fit; click-to-select via hit-testing; sidebar with reused
  `PersonInspector`, search, undo/redo; export menu (GEDCOM + poster). Remove React
  Flow. Full suites green.
- **Phase 2 — Insights:** `lib/insights.ts` + tests; stat strip + Insights panel.
- **Phase 3 — Navigation polish:** minimap, Center Selection, search pulse/autocomplete,
  keyboard shortcuts, quick actions.
- **Phase 4 — Focus mode + autosave.**

Each phase keeps all tests green and leaves the app shippable.

## Implementation philosophy

Maintainability over shortcuts. One rendering path. Reuse components. The editor should
feel like a professional genealogy app comfortable with hundreds–thousands of members,
providing a seamless **Import → Explore → Search → Edit → Analyze → Export** workflow
without leaving the full-screen editor.
