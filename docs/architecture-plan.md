# Repository Structure, Future Features & Critical Architecture Review

**Status note (v1.0):** this document was written during Milestone 2, before implementation
began. Its repository-structure sketch and "future features" table below are kept as
historical planning context, but both are now superseded by what actually got built — see the
corrections in each section, `docs/explorer-architecture.md` for the real web-app structure,
and `docs/roadmap.md` for the current (post-v1.0) feature plan. The "Final review" critical
analysis further down remains live and worth reading; most of its identified risks were since
addressed, and that's noted inline rather than pretending the risks were never real.

## Repository structure

As actually built (root package + `web/`, npm workspaces):

```
/parser        Pure functions: unzip .ftz, parse node.ftt → ParseResult. No UI, no React.
/models        TypeScript interfaces (models/types.ts) — see data-model.md
/validation    Integrity-check functions — pure, reusable by both the parser and editor/
/editor        Pure, immutable edit operations on a FamilyTree — see explorer-architecture.md
/gedcom        GEDCOM writer (Internal Model → .ged text) + an independent round-trip verifier
/lib           Generic utilities with no genealogy-specific meaning (UUID generation)
/tests         Unit + integration tests for everything above (Node/vitest)
/docs          Specification set + milestone-by-milestone architecture/design documentation
/web           The React web app (Vite) — imports parser/editor/gedcom/validation directly:
  /web/src/components    UI pieces, including the tree explorer (search, canvas, inspector)
  /web/src/pages         Home, About, Privacy
  /web/src/hooks         useFtzConversion, useExport, useAutoFocus
  /web/src/state         useTreeEditor (undo/redo)
  /web/src/lib           search index, neighborhood/layout engine for visualization
  /web/src/worker        parses/exports off the main thread via a Web Worker
  /web/tests             component, integration, accessibility, and performance tests
```

`parser/`, `models/`, `validation/`, `editor/`, and `gedcom/` are deliberately framework-free
(no React imports), exactly as planned — this is what let the editor and visualization layer
get built in a later milestone without touching or duplicating any of the earlier logic.
`components`/`pages` ended up nested under `web/src/` rather than at the repo root, since they
are genuinely web-app-specific (unlike the framework-free packages, which are reusable by any
future non-web surface, e.g. a CLI).

## Feature status (originally "future features — not implemented in this milestone")

Most of the original list has since shipped. What's still actually future-facing has moved to
[`docs/roadmap.md`](roadmap.md), which supersedes this table.

| Feature | Status |
|---|---|
| Tree visualization | **Shipped** (Milestone 6) — React Flow + dagre, see `docs/explorer-architecture.md` |
| Family search | **Shipped** (Milestone 6) — `web/src/lib/search.ts` |
| Drag-and-drop tree editing (of data, not layout) | **Shipped** (Milestone 6) — the editor lets you fix names/dates/relationships; canvas node *positions* are computed by dagre and intentionally not draggable, see explorer-architecture.md's "Known limitations" |
| Relationship finder | Not built — see roadmap |
| Duplicate detection | Not built — see roadmap |
| Merge duplicate people | Not built — see roadmap |
| Timeline view | Not built — see roadmap |
| Photo support | Not built — still blocked on the same unresolved `face/`/cols 27–28 question, see roadmap |
| JSON export | Not built — see roadmap |
| CSV export | Not built — see roadmap |
| GEDCOM import | Not built — see roadmap |
| Offline support / IndexedDB | Not built — explicit design choice for v1.0, see `docs/security-privacy-review.md` ("nothing persisted") |
| PWA | Not built — see roadmap |

## Final review — critical, not confirmatory

### Hidden assumptions

1. **Column positions are assumed stable across FTZ versions and export sources — validated against exactly one file.** Every "High confidence" label in `ftz-format-spec.md` is high confidence *for this file*, not proven stable across the Quick Family Tree app's version history or platforms (iOS/Android/desktop may differ). This is the single biggest risk to the whole spec. Mitigation already designed: field-count cross-checking in `parser-spec.md` step 5, plus `raw` passthrough — but the team should actively seek 2–3 more sample exports (ideally from different app versions/devices) before hard-coding this as gospel.
2. **The header's 3-value order (`personCount, familyCount, anchorId`) is inferred from one file.** It fits perfectly here, but "fits perfectly" and "is the documented, guaranteed order" are different claims. If a differently-configured export omits the anchor or reorders these, the header-trust fallback (cross-check against field-count) is what saves the parser — this is exactly why that fallback isn't optional/nice-to-have.
3. **Gender inference (col 25: 1=male, 2=female) is a cultural-linguistic inference from Urdu/Hindi honorifics in this specific family's names**, not from any documented legend or UI screenshot of the source app. It happens to validate cleanly (0 role mismatches against husband/wife positions), but that's *consistency*, not *proof of meaning* — the numbers being self-consistent doesn't rule out, say, `1`/`2` actually meaning something else that happens to correlate with the husband/wife role in every family in a single-tree sample. Recommend treating this as Medium confidence permanently unless a second sample or app documentation confirms it, and always exporting `0`/unknown as GEDCOM `U`, never guessing.
4. **The tab delimiter itself has no escaping mechanism, and the parser assumes a free-text field (name/note) never contains a literal tab.** Investigated directly for the v1.0 release (not assumed): the real sample's all 609 records match their expected field count exactly (zero anomalies — the signature a stray tab would leave), no escape convention appears anywhere in the reverse-engineered format, and no unescaping logic exists in `parser/rows.ts`. A synthetic fixture confirmed what happens if this is ever wrong: the existing field-count-tolerance logic *does* flag it (`EXTRA_FIELDS_PRESERVED`), but the affected row's columns genuinely shift and corrupt. Documented as an accepted, evidence-backed limitation rather than defensively coded against — see `ftz-format-spec.md`'s "Known limitation" section for the full writeup, including exactly what to check if a future sample ever contradicts this.

### Edge cases not covered by real data

Multiple spouses/remarriage, death month/day, populated media (`face/` folder + Person cols 27/28), non-Latin/RTL name scripts (this tree's names are Latin-transliterated; UTF-8 handling should work for native scripts but is untested), and very large trees (this sample is small — 473 people). All flagged as synthetic-fixture-required in `test-cases.md`.

### Scalability — resolved

Both concerns flagged here were real and have since been addressed:
- Ancestor/descendant traversals are iterative and bounded everywhere they occur, not just in
  the original cycle-detection check — `validation/integrity.ts` and `editor/helpers.ts`
  (`isAncestor`, used to reject circular-ancestry edits before they're applied) both cap at
  2000 steps.
- Unzip + parse (and GEDCOM export) run in a Web Worker (`web/src/worker/`), off the main
  thread, since Milestone 5 — confirmed not to block the UI at real-sample scale, and
  performance-tested synthetically at 10,000 people / 5,000 families in
  `web/tests/performance/largeTree.test.ts`. See `docs/performance-report.md` for measured
  numbers.

### GEDCOM compatibility — resolved

This was the single largest open risk at the time this document was written, and it has since
been closed: Milestone 4 validated the exporter's output with a real, automated import into
Gramps (open-source genealogy software), with zero structural errors, matching person/family
counts, and intact parent-child and cousin-marriage relationships. See
`docs/gedcom-exporter.md` for the full compatibility report. RootsMagic, Legacy Family Tree,
and FamilySearch imports are designed-for but not yet automated-tested — see
`docs/roadmap.md`.

### Data integrity risk — still the operating principle

The parser/validator must never "correct" inferred data (e.g., silently fixing a gender it
thinks is wrong, or auto-splitting a name it's unsure about) — every inference uncertainty
must surface as a `ValidationIssue` for a human to resolve, never a silent transformation.
This held throughout implementation and into the editor (Milestone 6): every edit operation is
pure and immutable, and `editor/index.ts`'s `applyEdit()` re-runs the same integrity checks
after every single edit, so this guarantee didn't erode when editing was added on top of the
original read-only parser.

### Performance — measured, not just estimated

See `docs/performance-report.md` for real measurements (real 473-person sample plus a
synthetic 10,000-person benchmark) covering initial load, parse, validation, visualization,
editing, and export.
