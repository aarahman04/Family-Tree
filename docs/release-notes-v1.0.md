# Release Notes — Version 1.0

**The first public release.** Upload a Quick Family Tree (`.ftz`) export, explore and
optionally fix up the data, and convert it to a standards-compliant GEDCOM file — entirely in
your browser, with nothing ever uploaded anywhere.

## Highlights

- **Full pipeline, verified end to end**: upload → parse → validate → explore → edit → export
  → download, tested against both synthetic fixtures and a real 473-person/136-family export,
  including a real Gramps import test of the generated GEDCOM file.
- **Interactive family tree explorer**: search by name or original FTZ ID, browse
  generations, see cousin marriages and shared ancestors rendered correctly with no duplicate
  nodes, verified against real family clusters up to 45 people in view at once and performance-
  tested synthetically at 10,000 people / 5,000 families.
- **In-browser editing with full undo/redo**: correct names, dates, and relationships before
  export. Every edit is immediately revalidated (duplicate detection, broken references,
  circular ancestry, self-marriage/self-parent) and can't corrupt the underlying family graph.
  Edits exist only for your current session — the original uploaded file is never touched.
- **Accessible by construction**: keyboard navigation, screen-reader labeling, focus
  management, and color-independent gender indicators (WCAG 1.4.1), verified with `jest-axe`.
- **Private by construction, not just by policy**: no backend exists for your data to be sent
  to. See `docs/security-privacy-review.md` for the verified breakdown.
- **Your work is protected against accidental loss**: a warning before closing the tab with
  unsaved edits, a confirmation before Clear/Replace/navigating away destroys anything, and a
  recovery screen (instead of a blank page) if something genuinely goes wrong. See
  `docs/explorer-architecture.md`.

## Fixed in this release

Three successive rounds of testing and adversarial review — the last two explicitly
instructed to try to reject the release rather than confirm it was ready — found and fixed
real issues before this became a public release. In order: three data-correctness issues in
the validation and editing logic caught while writing integration tests; a race condition
that could make an exported file silently not match what was on screen and a CSS layout bug
that made the explorer render completely blank on mobile; a missing data-loss-protection
system, a missing error boundary, a missing ZIP size guard, and a GEDCOM spec-compliance gap
(unescaped `@` characters); and finally a Unicode correctness bug in GEDCOM line-wrapping
(could corrupt an emoji in a name or note) plus an accessibility gap in the error boundary
added the round before. Full details, in order found, in `docs/audit-findings.md` and
`CHANGELOG.md`.

## Known limitations

- Validated against one real FTZ sample file; some FTZ fields (`face/` media folder, a couple
  of unmapped columns) remain unimplemented because no example data exists to build against.
  See `docs/ftz-format-spec.md`'s single-sample-risk note.
- The FTZ format has no escaping mechanism for its own tab delimiter, and the parser assumes
  a free-text field never contains a literal tab — investigated with real evidence (see
  `docs/ftz-format-spec.md`'s "Known limitation" section), not just assumed, but not proven
  impossible either.
- GEDCOM *import* (the reverse direction) isn't built yet — see `docs/roadmap.md`.
- The visualization shows a bounded neighborhood (2 generations out, expandable), not the
  entire tree at once, by design — this is what keeps it fast at any tree size, but it means
  there's no single "print the whole tree" view yet (see roadmap: printable charts).
- Multiple-spouse/remarriage and death-month/day field handling are validated only against
  synthetic fixtures, since the real sample data doesn't happen to exercise those cases.

## Upgrading

There's no prior public release to upgrade from — this is the first one. If you've been using
a pre-1.0 development build, no action is needed: the on-disk format for your uploaded file
never changes (it's read-only), and there's no persisted local state to migrate.

## Thanks

This project exists because family history shouldn't be held hostage by whichever app
happened to be convenient when it was first entered. Thank you to everyone who tests it
against their own family's data and reports back what doesn't quite work yet.
