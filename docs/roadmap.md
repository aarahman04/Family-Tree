# Roadmap

This is a plan, not a promise — dates aren't attached because this is a volunteer-driven open
source project, but the sequencing below reflects real dependency order (what has to exist
before what) and a deliberate bias toward features that reinforce the core mission (never lose
or lock in someone's family history) over features that would just make the project bigger.
**Nothing in this document is implemented yet** — this is planning only, written as part of
the v1.0 release, not a changelog of work already done (see `CHANGELOG.md` for that).

## Guiding principle for what makes the list

Every candidate below was evaluated against one question: does this help someone keep or
recover their family history, or is it scope creep? Features that widen *what data sources
this tool can rescue* (GEDCOM import, CSV import) rank above features that are merely nice
UI additions (timeline view, printable charts), which in turn rank above larger architectural
bets (plugins, i18n) that would only be worth the complexity once there's a larger contributor
base to justify them.

## Version 1.1 — round out the core loop

The v1.0 pipeline is one-directional (FTZ in, GEDCOM out) and English-only. v1.1 focuses on
closing the most-requested gaps without adding new architectural surface area.

- **GEDCOM import.** Makes the pipeline bidirectional — read an existing `.ged` file into the
  same internal `FamilyTree` model the FTZ parser already produces, so the explorer/editor/
  exporter all work on GEDCOM-sourced data for free. Needs its own field-mapping document
  (mirroring `docs/gedcom-mapping.md` in reverse) since GEDCOM's tag vocabulary is broader
  than what FTZ ever populates.
- **Duplicate-person detection.** A heuristic (name + approximate birth-year similarity)
  surfaced as a human-reviewed suggestion list — genuinely hard to get right, so this ships as
  *detection* first (flag likely duplicates for a person to look at), not automatic merging.
- **Merge duplicate people.** Depends on detection above. Needs a UUID-remapping strategy so a
  merge doesn't break `famcId`/`famsIds` references elsewhere in the tree — this is a real
  data-integrity risk if done carelessly, and will get its own design doc before
  implementation, not a quick patch.

## Version 1.2 — richer data, richer view

- **CSV import/export.** Export is straightforward (a flat view is inherently lossy since
  relationships don't flatten cleanly into rows — the UI will say so plainly rather than
  pretending otherwise). Import is harder: CSV has no standard genealogy schema, so this means
  designing (and documenting) this project's own expected column layout.
- **JSON export.** The easiest item on this entire roadmap — serialize `FamilyTree` directly,
  since the internal model is already format-independent. Useful for anyone who wants to
  script against their data without writing a GEDCOM parser.
- **Photo support.** Currently blocked, not just unbuilt: FTZ's `face/` media folder and
  Person columns 27–28 remain unmapped because no sample data populates them (see
  `docs/ftz-format-spec.md`). This needs a second real sample file with photos before it can
  be designed responsibly — guessing at the format risks silently misinterpreting someone's
  actual photos.
- **Relationship finder.** "How is X related to Y" — a shortest-path search over the same
  father/mother/spouse/child graph edges the explorer already computes. No new data model
  needed, mostly a new UI surface over existing `parser/relationships.ts` queries.
- **Timeline view.** Sort every `Event` across the tree chronologically. Mostly a
  presentation-layer feature; the underlying `Event` data is already there.

## Version 2.0 — bigger bets

These are real architectural additions, not incremental features, and are the ones most
likely to have their scope revised once actually scoped in detail:

- **Printable family charts.** A dedicated print/export layout (pedigree chart, descendant
  chart) distinct from the interactive explorer — likely its own rendering path rather than
  "print the canvas," since a good printed chart has different layout needs than an
  interactive one.
- **PWA support.** Installable, works offline after first load. Mostly a packaging/service-
  worker concern with limited data-model impact, but touches the "nothing persists locally"
  privacy stance (`docs/security-privacy-review.md`) — offline support that caches the *app
  shell* is fine; anything that starts persisting *tree data* locally needs its own privacy
  review and explicit user opt-in, not a silent behavior change.
- **Internationalization / multiple language support.** The UI is English-only today. A real
  i18n pass (extracting every string, right-to-left layout support for languages that need it,
  translated validation messages) is a substantial, cross-cutting change — worth doing once
  there's contributor interest in specific languages, not speculatively.
- **Plugin architecture.** The most speculative item here. Only worth designing once there are
  concrete third-party use cases asking for it (e.g. a custom export format, a custom
  validation rule) — designing a plugin API against zero real consumers tends to guess wrong
  about what the API actually needs to support.

## Explicitly not planned

- **A server/backend of any kind**, for storage, sync, or processing. This would undermine the
  project's core privacy value proposition (`docs/security-privacy-review.md`) and isn't on
  the table regardless of feature pressure to add one.
- **Auto-merging duplicate people** without human review — see "Merge duplicate people" above;
  detection-then-human-decision is the permanent design, not a v1.1-only stepping stone.
- **"Correcting" ambiguous or uncertain data automatically** (e.g. guessing a missing gender,
  auto-splitting a name) — this violates the project's foundational "never silently
  guess" principle (see `docs/architecture-overview.md`) and won't change regardless of how
  convenient it might seem for any specific feature above.

## How to influence this roadmap

Open a feature request (see `.github/ISSUE_TEMPLATE/feature_request.md`) or, for something
less concrete, start a Discussion under "Ideas" (see `.github/DISCUSSIONS.md`). Real usage and
real use cases move things up this list faster than speculation does.
