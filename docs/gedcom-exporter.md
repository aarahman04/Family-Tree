# GEDCOM Exporter — Developer Documentation

Status: Milestone 4. Implements `Internal Family Model → GEDCOM Generator → .ged file` — this
document's scope is the exporter itself, not the web app, editor, or visualization that were
built on top of it in later milestones (see `docs/explorer-architecture.md`). The web app's
export flow (`web/src/hooks/useExport.ts`) calls directly into `exportGedcom` from this
package via a Web Worker; the exporter logic documented here is unchanged and untouched by
anything built afterward.

## Export pipeline

```
FamilyTree (internal model)
  │
  ├─ validateForExport(tree)        structural check: every FAMC/FAMS/HUSB/WIFE/CHIL resolves
  │                                  to a record that actually exists. Always blocking — see
  │                                  "Rejection policy" below.
  │
  ├─ check tree.validation.issues   pre-existing error-severity issues from the parser
  │                                  (duplicate IDs, self-marriage, circular ancestry, ...).
  │                                  Blocking unless { force: true } is passed.
  │
  ├─ XrefAllocator(tree)             deterministic @I1@.. / @F1@.. assignment (sorted by UUID)
  │
  ├─ write HEAD, SUBM
  ├─ write one INDI per Person       NAME, SEX, BIRT/DATE, DEAT/DATE, FAMC, FAMS, NOTE, REFN
  ├─ write one FAM per Family        HUSB, WIFE, CHIL (ordered), REFN
  ├─ write TRLR
  │
  ├─ findUnmappedPopulatedFields    warns if any raw column with no GEDCOM mapping is
  │                                  actually populated (never happens on the real sample —
  │                                  see samples/export-report.md)
  │
  ▼
ExportResult { gedcom, rejected, issues }
```

`gedcom/export.ts` is the entry point (`exportGedcom(tree, options)`). It never throws — structural or policy problems come back as `{ rejected: true, rejectionReason, issues }` rather than an exception, consistent with the rest of this codebase's error-handling style (`docs/parser-implementation.md`).

## Rejection policy

Two distinct reasons export can be refused, on purpose kept separate:

1. **Structural dangling references** (`validateForExport`) — cannot be forced through, ever. Writing them would produce a GEDCOM file with a cross-reference pointer to an xref that doesn't exist in the file, which is invalid by the GEDCOM spec itself, not just bad genealogy. Under normal operation (any tree produced by `parser/build.ts`) this can never actually happen — the parser never stores an unresolved reference, it leaves the field `undefined` instead. The check exists as a defensive backstop for a hand-edited or programmatically-constructed tree (see the "broken internal model" test), matching the milestone's completion criterion that a broken model must fail validation rather than produce silently-corrupt output.
2. **Pre-existing error-severity issues on `tree.validation`** (duplicate IDs, self-marriage, circular ancestry, broken parse-time references) — refused unless `{ force: true }`. These don't corrupt GEDCOM *syntax* (GEDCOM has no rule against, say, a FAM where HUSB and WIFE are the same INDI), but exporting genealogically-nonsensical data without an explicit human acknowledgment would violate this project's running principle of never silently passing a known problem downstream. `force` exists for the case where a human has reviewed the warnings and wants the export anyway.

## Mapping decisions

Full field-by-field table already exists in `docs/gedcom-mapping.md` (Milestone 2) — this section covers what changed or got decided during actual implementation:

- **Name splitting**: `gedcom/name.ts` takes the last whitespace-separated token as the surname, everything before it as given names (`"Mohammad Abdul Khadar"` → `Mohammad Abdul /Khadar/`). This is a heuristic, flagged as a risk (not a loss) in `gedcom-mapping.md` — the full original string is never discarded (it stays on `Person.name` in the internal model regardless of how it's split for GEDCOM).
- **Original ID preservation**: uses the standard GEDCOM `REFN` tag (`1 REFN <ftzId>`), not a custom `_FTZID` tag as `gedcom-mapping.md` tentatively proposed — `REFN` is a real GEDCOM 5.5.1 tag for exactly this purpose ("user reference number"), so no custom tag was needed at all. This is the only place the exporter deviates from that earlier doc, in the direction of *more* spec compliance.
- **Layout coordinates are not exported.** No GEDCOM concept exists for canvas position, and it's not genealogical data. Per "do not invent custom tags unless absolutely necessary," a `_FTZ_X`/`_FTZ_Y` custom tag was judged unnecessary — the data isn't lost overall (it stays in the internal model's `Person.layout`/`Family.layout`), it's just not projected into a format that has nothing to receive it.
- **Birth-order** is preserved implicitly via the order `CHIL` lines are written under `FAM` (per the GEDCOM spec, this order is significant), not via any explicit tag.
- **Dates**: `gedcom/date.ts` formats year/month/day into GEDCOM's `DD MON YYYY` / `MON YYYY` / `YYYY` forms depending on what's known. A date with month/day but no year (never occurs in the real sample, but reachable via a hand-built tree) can't be represented in a standard `DATE` value — the exporter still emits the `BIRT`/`DEAT` tag (so "this event happened" is preserved) but omits `DATE` and raises an `UNFORMATTABLE_DATE` warning rather than guessing.
- **Blank names**: an empty `Person.name` (present in the real sample — see `docs/ftz-format-spec.md` on person `397680`) still emits `1 NAME //`, GEDCOM's convention for an unknown name, rather than omitting the `NAME` line entirely — most importers expect at least one `NAME` structure per `INDI`.

## Unsupported FTZ fields

No change from `docs/gedcom-mapping.md`'s analysis. As of this milestone, that analysis is now backed by a real runtime check (`gedcom/fields.ts`) rather than just a design document: every export scans the always-reserved/unknown columns (Person: 2,5,6,9,10,11,12,15,16,27,28; Family: 2,4,6,9,10,11,12 — 1-indexed) and emits an `UNMAPPED_FIELD_POPULATED` warning if any of them is ever non-empty/non-zero. Running this against the real sample produces **zero** such warnings — see `samples/export-report.md`.

`SOUR` (source citations) is supported by the exporter's tag vocabulary per the milestone's requirements list, but the FTZ format has no source-citation data to map from, so it is never emitted — there is nothing to preserve here, not a gap.

## Data preservation strategy

1. Every genealogically-meaningful field with a direct GEDCOM equivalent is mapped (see `docs/gedcom-mapping.md`).
2. Fields with no GEDCOM equivalent but populated data (would only happen on a future/different FTZ export) are caught by `findUnmappedPopulatedFields` and surfaced as warnings — never silently dropped without at least a paper trail in `ExportResult.issues`.
3. Fields with no GEDCOM equivalent and (verified) no data in the real sample are documented as intentionally not exported (layout coordinates), rather than either fabricating a custom tag for them or leaving their absence unexplained.
4. The internal model itself (`Person.raw`/`Family.raw`, from Milestone 3) is untouched by exporting — the *source of truth* never loses anything regardless of what any one export format can represent. GEDCOM export is a projection, not a migration.

## Round-trip verification

`gedcom/verify.ts` independently re-parses the generated GEDCOM text (a from-scratch line scanner, not reusing the exporter's own bookkeeping) and diffs person/family counts, every FAMC/FAMS/HUSB/WIFE/CHIL relationship, note counts, and the cousin-marriage/shared-ancestor rate against the source tree. "Independent" is verified, not just claimed: `tests/gedcom-verify.test.ts` deliberately feeds the verifier corrupted GEDCOM text (a missing INDI, a wrong HUSB pointer, a missing NOTE, a duplicate xref, a missing FAM) and confirms it actually catches each one — a verifier that only ever agrees with correct input isn't proven to work.

Running this against the real FTZ sample is `samples/export-report.md`'s core content.

## Known limitations

- **Name splitting is a heuristic** (see above) — will misfire on names that don't follow a simple "given(s) + surname" shape (compound surnames, single-word names, cultural naming conventions with no space-delimited surname).
- **Only one `DATE` granularity path is implemented** (year, year+month, or full date). A month/day without a year has no representation and is dropped with a warning — never encountered in the real sample.
- **No `SOUR` data exists to export**, so `SOUR` support is present in the writer's vocabulary but structurally untested against real source-citation data.
- **Media (`OBJE`) is not implemented** — consistent with `docs/gedcom-mapping.md`, since the underlying FTZ media fields (columns 27/28, `face/` folder) remain unmapped from Milestone 2 onward.
- Everything flagged as a limitation in `docs/parser-implementation.md` (single-sample column-mapping risk, etc.) still applies — the exporter inherits whatever the parser produced.

## Compatibility notes

The milestone asked for automated import testing against Gramps, FamilySearch, RootsMagic, and Legacy Family Tree. In this sandboxed Linux devcontainer:

- **RootsMagic** and **Legacy Family Tree** are Windows-only desktop applications — not installable or scriptable here under any circumstances.
- **FamilySearch** import requires a FamilySearch account, API credentials, and network access to a third-party production service — not something this environment can or should exercise automatically.
- **Gramps** is open source, Linux-native, and has a scriptable CLI (`gramps -i file.ged -a check`). It was installed in this environment (`apt-get install gramps`) specifically to run a real automated import test rather than relying on documentation alone. **Result: clean import, "No errors detected."** A full structural round-trip (import → re-export → diff against our original) matched exactly on every count: 473 INDI, 136 FAM, 41 NOTE, 136 HUSB, 136 WIFE, 367 CHIL, 367 FAMC, 272 FAMS, 609 REFN. Spot-checks on a note and one of the 31 real cousin marriages confirmed correct, uncorrupted, non-duplicated relationships. Gramps' own independent genealogical consistency checker (distinct from the plain importer) flagged only "Unknown gender" (34 instances) — which exactly matches the 34 people with unrecorded gender found independently during Milestone 2's raw-data analysis, not a new problem. Full detail: `samples/export-report.md`.

For the three targets that couldn't be exercised automatically, compatibility rests on **structural conformance to the GEDCOM 5.5.1 specification**: correct level nesting, `CONT`/`CONC` line handling for embedded newlines and overlong values, required `HEAD`/`TRLR` records, valid cross-reference syntax, and the independent round-trip verification described above. This is the fallback the milestone explicitly authorizes when automated import against a specific product isn't possible — applied here to 3 of the 4 named targets, with the 4th (Gramps) actually exercised.
