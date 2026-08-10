# Native Family Tree Builder (core)

**Status:** Approved design (2026-08-10)
**Goal:** Evolve the app from an FTZ/GEDCOM converter into a genealogy editor where users can
either **import** a tree or **create one from scratch**, both ending in the *same* full-screen
editor on the *same* `FamilyTree` model and the *same* poster rendering engine.

## Non-negotiable architecture

```
FamilyTree → Operations layer (add/edit/delete) → computeBalancedPosterLayout → renderPosterSvg → Interaction layer
```

No second rendering engine. A manually-created tree is just a `FamilyTree` — no special code
path after creation. Poster and editor stay visually identical.

## Phase A — Create New Tree

- **Home** presents two entry points: **Import existing tree** (unchanged upload flow) and
  **Create new family tree** (swaps the upload area for a wizard).
- **`CreateFamilyTreeWizard`** (new):
  - Step 1: Tree name (required) + optional description.
  - Step 2: root person — First name, Last name, Gender, Birth date, Death date, Living
    (checkbox disabling Death date), Notes.
  - **Create Tree** builds a `FamilyTree` (`sourceFormat: "manual"`, one root person via
    `createPerson`), saves to the existing `TreeSessionProvider`, navigates to `#/editor`.
- **Metadata** (`models/types.ts`): add optional `name`, `description`, `createdAt`,
  `updatedAt` (keep existing `sourceFormat`, `sourceFileName`, `importedAt`). Editor toolbar
  shows the tree name.

## Phase B — Add / Delete person

- **`Add Person ▾`** toolbar dropdown: **New Independent Person** (unlinked placeholder,
  auto-selected for editing), **Parent / Child / Spouse** (reuse existing guided logic).
- **`deletePerson(tree, id)`** (new op, unit-tested): remove the person, detach from every
  family, prune empty families, regenerate `famsIds`/`famcId`, keep a valid tree. **Immediate,
  undoable, no confirm dialog** — instead a temporary **"Person deleted / Undo" toast**.
- **Delete key** deletes the selected person.
- Existing relationship pickers (add parent/child/spouse, marriages, cousin marriages) stay.

## Phase C — View menu, poster scale, unsaved changes, validation, tests

- **`View ▾`** menu: Fit Tree, Fit Width, Fit Height, Poster Scale (100%), Center Selection,
  Focus Mode, Reset View. Presets over the existing pan/zoom — no browser scrollbars, no second
  viewport. **Poster Scale (100%)** renders at natural poster scale (the "wide" experience).
- **Unsaved changes**: extend the existing beforeunload/guard so leaving/refreshing/closing with
  unsaved edits warns, alongside autosave.
- **Continuous validation**: `applyEdit` already reruns `runIntegrityChecks` after every edit;
  surface warnings visibly in the editor without blocking editing.
- Tests + final cleanup.

## Deferred (architecture must not block)

Relationship Creation Mode, Add Sibling, photos, documents, timeline, places, stories, version
history, collaboration, multiple trees. None implemented now; the layered architecture keeps
them addable without touching the rendering engine.

## Testing

Wizard + manual creation; `deletePerson`; Add Person workflow; metadata; View menu; validation;
editor integration. All existing suites stay green.
