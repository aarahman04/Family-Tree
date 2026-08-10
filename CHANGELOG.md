# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- **Print poster layout engine, V2** (`poster/`) — a from-scratch rewrite focused entirely on
  publication-quality layout, not new features. Real text measurement (a pixel-accurate
  `canvas.measureText`-backed measurer in the browser, a deterministic heuristic for
  Node/tests) drives auto-sizing boxes that grow width before height and never clip, even for
  a single unbreakable long name; Arabic names are detected and rendered right-to-left. A
  genuine seven-stage algorithm (hierarchy → box measurement → initial placement → collision
  detection → shift → connector routing → convergence) replaces V1's fixed-size, abstract-unit
  layout, with a proven-converging collision-resolution sweep as a defense-in-depth layer on
  top of accurate width reservation — verified with zero overlaps across 504 boxes (person
  nodes + chips) on the real 473-person sample, and against a ~4,100-person synthetic tree.
  Cousin marriages now render as a compact "Spouse: <name>" chip at the marriage point instead
  of V1's connector line spanning the entire poster — the spouse still has exactly one real
  node, under their own parents; the chip only names them and points there, with no duplicated
  relationship line. The real sample now renders at ~18.4m × 229mm; since the PDF file format
  itself caps a page at 14,400pt (200in/5.08m — confirmed empirically against `jsPDF`, which
  otherwise silently clamps and clips), the PDF export now proportionally scales down and
  clearly labels the print scale factor on screen, while the SVG export stays fully uncapped.
  The preview gained metric (m/mm) sizing, fit-to-view, and actual-size controls. See
  `docs/poster-architecture.md`'s "Version history" for the full V1 → V2 diff.

### Added (V1, now superseded by the V2 changes above)
- **Print poster export** (`poster/`) — a dedicated whole-tree layout engine (not the
  interactive explorer's dagre layout), auto-sized to one continuous page (no A4 splitting or
  tiling), exporting vector PDF (via `jspdf` + `svg2pdf.js`, dynamically imported so it never
  bloats the main bundle) or SVG from a single shared SVG generator so the in-app preview
  always matches the download. See `docs/poster-architecture.md`.

## [1.0.0] — Version 1.0 (first public release)

The full pipeline, end to end: upload → parse → validate → explore → edit → export → download,
verified against both synthetic fixtures and a real 473-person/136-family export, including a
real Gramps import test.

### Added
- **FTZ parser** (`parser/`) — extracts and parses `node.ftt` from a `.ftz` archive into a
  UUID-keyed internal `FamilyTree` model, preserving every original field even when unmapped.
- **Validation engine** (`validation/`) — detects duplicate people, broken references, self-
  marriage, self-parent, circular ancestry, gender/role mismatches, and families missing a
  parent. Runs at import time and after every edit.
- **GEDCOM 5.5.1 exporter** (`gedcom/`) — with an independent round-trip verifier and a real
  Gramps import test against the generated file.
- **Web application** (`web/`) — drag-and-drop upload, validation summary, and download, all
  running client-side via a Web Worker so large trees never block the UI thread.
- **Family tree explorer** — interactive visualization (React Flow + dagre), search by name/
  ID, a bounded-neighborhood rendering strategy that keeps performance independent of total
  tree size (verified at 10,000 people / 5,000 families).
- **In-browser editing** (`editor/`) — correct name/date fields, assign or remove parents/
  spouses/children, with automatic revalidation on every edit and full undo/redo. Edits exist
  only for the current session; the original uploaded file is never modified.
- **Accessibility** — keyboard navigation, screen-reader labeling, focus management, WCAG
  1.4.1-compliant color-independent gender indicators, verified with `jest-axe`.
- **Privacy pages and documentation** — explicit, verified claims about what data ever leaves
  the browser (nothing).
- **Unsaved-edit protection** — a `beforeunload` warning (registered only while there are
  actual unsaved edits) plus confirmation dialogs before Clear/Replace/navigating away from an
  in-progress editing session; replacing the loaded file now parses and validates the new one
  *before* touching the current session, so a failed or cancelled replacement leaves the
  original tree completely untouched. See `docs/explorer-architecture.md`'s "Unsaved-edit
  protection" section.
- **Top-level error boundary** — an uncaught rendering error now shows a recovery screen
  (with a "Return to upload screen" action and focus management matching the rest of the
  app) instead of silently blanking the page. See `docs/explorer-architecture.md`'s "Error
  recovery" section.
- **ZIP archive size guards** — an uploaded `.ftz` is rejected, with a clear message, if its
  compressed size or its `node.ftt` entry's declared uncompressed size is unreasonably large,
  before extraction is attempted. See `docs/security-privacy-review.md`.

### Fixed
*(all found through testing during development, before this first release — see
`docs/audit-findings.md` for the ones found specifically during the dedicated v1.0
release-readiness audits)*
- A family record could have its `FAMILY_MISSING_PARENT` validation check go stale after an
  edit cleared a parent, since it compared against the original import-time snapshot instead
  of the live tree.
- `removeSpouse` incorrectly cleared both people from a family record instead of only the one
  being removed, silently un-parenting the wrong person.
- The person inspector's edit form could show stale (already-undone) data after an undo/redo
  while the same person stayed selected, risking a silent "re-do" if the user saved again
  without noticing.
- **(v1.0 audit)** Exporting GEDCOM captured the tree by value at click time with nothing
  preventing a concurrent edit; the downloaded file could silently not match what was on
  screen. Editing is now paused for the moment an export is in flight.
- The visualization always re-centered at a fixed zoom of 1, which routinely left grandparents,
  spouses, or children just outside the viewport on real family clusters; it now fits the
  whole current neighborhood into view.
- **(v1.0 audit)** The explorer's canvas silently rendered nothing at all on mobile-width
  viewports — a CSS flexbox percentage-height resolution edge case collapsed its container to
  zero height. Only caught by real-browser, real-viewport testing; invisible to the jsdom test
  suite.
- **(v1.0 audit)** GEDCOM output never escaped a literal `@` character in names, nicknames,
  notes, or the source file name, which the 5.5.1 spec requires (an unescaped `@` can be
  misread as the start of an `@XREF@` pointer by a strict parser). Fixed and independently
  confirmed via a real Gramps import/re-export round-trip.
- **(v1.0 audit)** GEDCOM `CONC` line-wrapping could split a UTF-16 surrogate pair in half —
  reproduced directly with an emoji placed near the ~200-character chunk boundary, corrupting
  the character on both sides of the break. This predates the v1.0 audits entirely (original
  Milestone 4 exporter code); the real sample's notes never happened to contain a
  supplementary-plane character, so it went unnoticed until specifically tested for. Fixed
  with a surrogate-aware chunk boundary and 35 regression tests sweeping multiple characters
  across every offset around the boundary.

## Milestones 1–6 (pre-1.0 development)

Built and verified incrementally, each with its own design/implementation documentation in
`docs/`:

1. **FTZ format analysis** — reverse-engineered the `.ftz`/`node.ftt` format from a real
   sample export (`docs/ftz-format-spec.md`).
2. **Validation design** — canonical internal data model, integrity checks, GEDCOM mapping
   plan (`docs/data-model.md`, `docs/validation-report.md`, `docs/gedcom-mapping.md`).
3. **Parser implementation** (`docs/parser-spec.md`, `docs/parser-implementation.md`).
4. **GEDCOM exporter**, verified with a real Gramps import (`docs/gedcom-exporter.md`).
5. **Public web application (MVP)** — upload, validate, convert, download.
6. **Family tree explorer, editor & visualization** — everything described under "Added"
   above (`docs/explorer-architecture.md`).
7. **Version 1.0 release readiness** — engineering audit, real-dataset graph verification,
   UX review, branding, GitHub release preparation, documentation audit, privacy/security
   review, performance benchmarking.
8. **Stabilization passes** — two further rounds of adversarial review (each explicitly
   trying to find reasons to reject the release rather than confirm it was ready) found and
   fixed the data-loss, error-recovery, ZIP-safety, and GEDCOM-compliance issues described
   under "Added"/"Fixed" above, and investigated (rather than speculatively "fixed") the
   FTZ tab-delimiter question — see `docs/ftz-format-spec.md`'s "Known limitation" section
   for the evidence behind that decision.
