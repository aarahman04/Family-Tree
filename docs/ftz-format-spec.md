# FTZ Format Specification

Reverse-engineered from a single real export: `Family Tree FTZ/FamilyTree.ftz` (473 people, 136 families). This is the only sample analyzed — see the "single-sample risk" callout in `architecture-plan.md` before treating anything here as guaranteed stable across app versions or other exports.

## Archive structure

`.ftz` is a standard ZIP archive.

```
<ExportName>/
├── face/           # photo/media directory — empty in the sample; purpose inferred, not confirmed
└── node.ftt         # UTF-8 (BOM) tab-separated text, the entire dataset
```

The top-level folder name inside the zip is arbitrary (`FamilyTree(2)` in the sample — the app appends a disambiguator). **A parser must locate `node.ftt` by filename, not by fixed path.**

## `node.ftt` container format

- Delimiter: tab (`\t`)
- Encoding: UTF-8 with BOM (must be stripped)
- Line 1 is a metadata header, not column names: `<personCount>\t<familyCount>\t<anchorId>`
  - `personCount` / `familyCount`: exactly match the number of records of each type that follow
  - `anchorId`: a valid Person ID present in the data (confirmed in the sample: `826685`, the record for "Mohammad Siraj Uddin"). Most likely the person the app's view was centered/focused on at export time.
- Lines `2 .. 1+personCount`: Person records (29 tab-separated fields each)
- Lines `2+personCount .. 1+personCount+familyCount`: Family records (12 tab-separated fields each)

Field-count grouping was independently verified against the header counts and found 100% contiguous and exact — the header is trustworthy in this sample, but a parser should still validate rather than blindly trust it (see `parser-spec.md`).

### Known limitation: no escaping mechanism for tab characters in free-text fields

This format has no quoting or escaping convention for its own `\t` delimiter — investigated
specifically (not assumed) as part of the v1.0 release audit, with three independent pieces of
evidence:

1. **No escape convention is described or implied anywhere in this reverse-engineered spec.**
   There's no quote character, no `\\t`-style escape sequence, and no length-prefixing anywhere
   in the format — every field is just "whatever's between two tabs."
2. **The real sample shows zero anomalies across all 609 records.** A tab embedded in a free-
   text field (name or note) would manifest as a row with more tab-separated fields than
   expected (30 instead of 29 for a Person, 13 instead of 12 for a Family) — checking every
   single record in `Family Tree FTZ/FamilyTree.ftz` found **473/473 Person rows with exactly
   29 fields and 136/136 Family rows with exactly 12**, no exceptions. This is exactly the
   signature a stray tab (or an embedded literal newline, which would show up as a split
   physical line) would leave, and it's absent.
3. **No unescaping logic exists anywhere in `parser/rows.ts`.** Every prior implementer who
   worked on this parser looked at the same real data and independently reached the same
   conclusion — there was never a reason to write one.

**What actually happens today if this assumption is ever wrong** (verified with a synthetic
fixture, not speculated): a tab injected into a Person's name field produces a 30-field row.
The existing field-count-tolerance logic in `parser/build.ts` does catch the shape mismatch
and raises an `EXTRA_FIELDS_PRESERVED` (info-level) issue — so it's not silent in the sense of
"no signal at all" — but the actual column values for that one row genuinely shift and
corrupt: in the test case, a name of `"Tab\tInjected Name"` parsed as name `"Tab"`, gender
`unknown` (shifted from the real value), and birth year `2` (a nonsense value pulled from an
unrelated column). The row is very obviously broken to a human looking at the parsed output,
but the current `EXTRA_FIELDS_PRESERVED` message doesn't specifically say "this row's fields
are shifted," only "extra field found" — someone would need to inspect the affected record to
notice the corruption, not just read the validation message.

**Decision: treat this as a documented, accepted limitation for v1.0, not a defect to fix
speculatively.** The evidence above indicates it doesn't occur in real Quick Family Tree
exports (consistent with the source app almost certainly being a normal mobile/desktop text
input — tab is conventionally a field-navigation key, not literal typeable content, on both
iOS/Android virtual keyboards and most desktop form widgets). Implementing defensive handling
for a scenario with no evidence of ever occurring would be exactly the kind of speculative,
unrequested change this project's own contribution standards argue against. If a second real
sample or a user report ever surfaces a case where this assumption doesn't hold, revisit this
section first — the failure mode above is exactly what to look for.

## Person record (29 fields)

| # | Field | Type | Confidence | Notes / rationale |
|---|---|---|---|---|
| 1 | Person ID | int | High | Globally unique (473/473) |
| 2 | — | int | Low | Always `0` in the sample; no signal to infer meaning from |
| 3 | FAMC (parent family ID) | int | High | `0` = no recorded parent family; else FK → Family.col1. Verified 100% referential integrity |
| 4 | Birth order / sibling index | int | High | 0–9; matches sibling ordering within FAMC in every observed family |
| 5 | — | int | Low | Always `0`; no signal |
| 6 | — | int | Low | Always `0`; no signal |
| 7 | Layout X | float | High | Tree-canvas position, not genealogical data |
| 8 | Layout Y / generation tier | float | High | 9 discrete values; doubles as generation depth in the layout algorithm |
| 9–12 | — | int | Low | Always `0`; no signal. Reserved slots — could be future fields (e.g. adoption flag, marriage date parts) not exercised by this tree |
| 13 | Nickname / alt-name | string | Medium | Sparse (41/473): first names, family nicknames ("Dada", "Haji Apa"). Plausible but not confirmed against an app UI |
| 14 | Full name | string | High | Primary display name |
| 15 | — | string | Low | Always empty; no signal |
| 16 | — | string | Low | Always empty; no signal |
| 17 | Flags A (bitmask) | int | Medium | `0`=blank record, `2`=default, `128`=**verified**: every row with `128` has a non-zero birth date in cols 18–20. Bit meaning beyond that is not derived |
| 18 | Birth year | int | High | `0` = unknown |
| 19 | Birth month | int | High | `0` = unknown |
| 20 | Birth day | int | High | `0` = unknown |
| 21 | Flags B (bitmask) | int | Medium | Same scheme as col 17, gates col 22. Verified via the one row where it diverges from col 17 (128 there, and only there, coincides with col 22 ≠ 0) |
| 22 | Death year (probable) | int | Low | Only 1/473 populated (`1984`) — a single data point is not enough to be fully confident this is "death year" vs. some other single-date field |
| 23 | — (death month, probable) | int | Low | Always `0` in sample; never exercised, so the "month" interpretation is unverified |
| 24 | — (death day, probable) | int | Low | Always `0` in sample; never exercised, same caveat |
| 25 | Gender code | int | Medium | `1`/`2`/`0`(unknown). Inferred from honorifics in the names ("begum", "Apa" → 2; "Sheik", "imam" → 1) — a cultural/linguistic inference, not a documented legend. See risk note in `architecture-plan.md` |
| 26 | Secondary note | string | Low | Rare (3/473) free text, e.g. "marriage at Friday, 15 November 2024". Distinct field from col 29 but exact intended purpose (event note vs. something else) is unconfirmed |
| 27 | — | string | Low | Always empty. Possibly a media/photo filename tied to `face/`, unconfirmed — the sample's `face/` folder is empty so this can't be tested |
| 28 | — | string | Low | Always empty. Same caveat as col 27 |
| 29 | Notes | string | High | Free-text occupation/education/remarks (37/473 populated), including emoji — clearly a general notes field |

## Family record (12 fields)

| # | Field | Type | Confidence | Notes / rationale |
|---|---|---|---|---|
| 1 | Family ID | int | High | Unique (136/136); referenced by Person.col3 |
| 2 | — | int | Low | Always `0` |
| 3 | Husband/Father ID | int | High | FK → Person.col1, never `0` in sample |
| 4 | — | int | Low | Always `0` |
| 5 | Wife/Mother ID | int | High | FK → Person.col1, never `0` in sample |
| 6 | — | int | Low | Always `0` |
| 7 | Layout X | float | High | Canvas position |
| 8 | Layout Y / generation tier | float | High | Same scale as Person.col8 |
| 9–12 | — | int | Low | Always `0`. Candidate future slots: marriage date (Y/M/D + flag), divorce flag — pure speculation, not asserted |

## Relationship model (derived, not stored explicitly)

- **Parents**: `Person.famc → Family.husband / Family.wife`
- **Children**: all Persons whose `famc == Family.id`, ordered by `birth_order`
- **Spouses**: not stored on the Person record — derived by scanning all Family records for ones where the person is husband or wife. A person can appear in multiple Family records (remarriage/polygamy support), though **zero such cases exist in the sample** — see `validation-report.md`
- **Identity**: each person exists exactly once; all relationships are ID references, so shared ancestors / cousin marriages never require duplicating a person record

## Fields still marked Low confidence — do not guess further without more data

Columns 2, 5, 6, 9–12 (Person) and 2, 4, 6, 9–12 (Family) are always `0` in the only file available. Columns 15, 16, 27, 28 (Person) are always empty. There is no data-driven way to determine their purpose from a single export — the honest answer is "unknown, reserved, or unused by this particular tree," and the parser must preserve them verbatim (not repurpose or drop them) in case a different export populates them. See the raw-field-passthrough requirement in `data-model.md` and `gedcom-mapping.md`.
