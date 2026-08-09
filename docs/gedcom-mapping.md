# FTZ → GEDCOM Field Mapping

Target: GEDCOM 5.5.1 (broadest compatibility across Gramps, RootsMagic, FamilySearch, Legacy Family Tree — see risk note in `architecture-plan.md`).

Mapping is always **FTZ → Internal Model → GEDCOM**, never FTZ → GEDCOM directly (per the pipeline requirement). The table below documents the ultimate GEDCOM destination for traceability, but the parser only ever writes the internal model.

## Person fields

| FTZ field | Meaning | Confidence | GEDCOM equivalent | Data loss? |
|---|---|---|---|---|
| col1 (ID) | Person ID | High | Not written as a value — becomes the `INDI` xref pointer. Original ID preserved via a custom `REFN`/`_FTZID` tag | None |
| col2 | unknown | Low | none | None (nothing to lose — value is always `0`) |
| col3 (FAMC) | parent family | High | `FAMC` pointer on `INDI` | None |
| col4 | birth order | High | No direct tag; preserved implicitly by the order `CHIL` lines are written under `FAM` (GEDCOM spec treats this order as significant) | None |
| col5, col6 | unknown | Low | none | None (always `0`) |
| col7, col8 | layout X/Y | High (meaning) / N/A (GEDCOM) | No GEDCOM concept for canvas position | **Lost on export** unless written as a custom `_FTZ_X`/`_FTZ_Y` tag — recommended, since GEDCOM allows underscore-prefixed custom tags and most readers ignore unknown tags safely |
| col9–12 | unknown | Low | none | None observed (always `0`), but see raw-passthrough note below |
| col13 | nickname | Medium | `NAME` substructure `NICK` | None |
| col14 | full name | High | `NAME` (as `GivenName /Surname/`) | **Risk, not loss**: names in the sample are single strings; splitting into given/surname requires a heuristic (last space-separated token as surname) that will misfire on some names. Recommend storing the original unsplit string as the primary `NAME` value and only best-effort splitting for the `GIVN`/`SURN` substructure |
| col15, col16 | unknown | Low | none | None (always empty) |
| col17 | flags A (has-birthdate bit) | Medium | none directly — only controls whether `BIRT` is emitted | None |
| col18–20 | birth Y/M/D | High | `BIRT` / `DATE` | None, but partial dates (year-only, no month/day) must render as GEDCOM's partial-date syntax (e.g. `1984`), not `0/0/1984` |
| col21 | flags B (has-deathdate bit) | Medium | none directly — only controls whether `DEAT` is emitted | None |
| col22–24 | death Y/M/D | Low (1 real example) | `DEAT` / `DATE` | None for the year; month/day handling is **untested** since the sample never populates them |
| col25 | gender | Medium | `SEX` (`M`/`F`/`U`) | None — but see the cultural-inference risk in `architecture-plan.md`. `0` (unknown) must map to `U`, never guessed |
| col26 | secondary note | Low | `NOTE` (generic, or `EVEN` if it's confirmed to always describe an event — not confirmed) | None, but semantic intent may be flattened |
| col27, col28 | unknown, possibly media | Low | none currently designed. If later confirmed to reference `face/` files, maps to `OBJE` | **Potential future loss** if these turn out to be populated in other exports and the mapping isn't added before then — flagged, not solved |
| col29 | notes | High | `NOTE` | None |

## Family fields

| FTZ field | Meaning | Confidence | GEDCOM equivalent | Data loss? |
|---|---|---|---|---|
| col1 (ID) | Family ID | High | becomes the `FAM` xref pointer, original ID preserved via `_FTZID` | None |
| col2 | unknown | Low | none | None (always `0`) |
| col3 | husband | High | `HUSB` | None |
| col4 | unknown | Low | none | None (always `0`) |
| col5 | wife | High | `WIFE` | None |
| col6 | unknown | Low | none | None (always `0`) |
| col7, col8 | layout X/Y | High (meaning) / N/A (GEDCOM) | none | Same as Person — cosmetic loss only unless preserved via `_FTZ_X`/`_FTZ_Y` |
| col9–12 | unknown | Low | none | None observed |

Children (`CHIL`) are not a Family field in FTZ at all — they're derived from `Person.famc` back-references and written as `CHIL` lines under the corresponding `FAM` record, ordered by birth order (col4). High confidence, no loss.

## Fields that cannot be cleanly mapped

- **Layout coordinates** (Person/Family col7, col8): no GEDCOM concept exists. Non-genealogical, so acceptable to drop from the *standard-compliant* export; recommend offering a "preserve layout as custom tags" export option for round-trip fidelity to the original FTZ view.
- **The ~9 always-empty/zero reserved columns**: nothing to map today because no data exists. This is the single biggest open risk — if a future FTZ export populates them with real data, this mapping table needs revisiting before that data can be exported without loss.
- **col27/col28** (possible media): no `OBJE` mapping implemented yet since unconfirmed against real data.

## Zero-unexpected-data-loss guarantee (recommended enforcement)

Relying on this mapping table alone is not sufficient to guarantee "zero unexpected loss," because it can only account for fields we currently understand. Per `data-model.md`, the parser stores the full original tab-split row as `raw` on every `Person`/`Family`. **Recommendation**: the GEDCOM exporter should not touch `raw` for now (nothing in GEDCOM to put it in), but the app should surface a warning if any `raw` field is non-zero/non-empty and has no corresponding mapping above — so an editor/reviewer is alerted rather than silently losing genuinely-populated-but-unmapped data on export. This turns "we hope nothing's there" into "we verify nothing's there, every export."
