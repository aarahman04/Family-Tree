# Parser Implementation — Developer Documentation

Status: Milestone 3 complete. Implements the pipeline `FTZ → ZIP extraction → node.ftt parser → validation → internal model`. Does not implement GEDCOM export, the React UI, or editing — those are later milestones.

## Architecture

```
parser/
  errors.ts          FtzParseError — the only thing this package throws
  zip.ts              extractNodeFtt(): archive bytes -> decoded node.ftt text
  tokenizer.ts        tokenizeNodeFtt(): text -> header + grouped Person/Family line arrays
  rows.ts             parsePersonRow() / parseFamilyRow(): one row -> typed fields + issues
  build.ts            buildTree(): parsed rows -> UUID-keyed Person/Family records, references resolved
  relationships.ts    father/mother/spouses/children/siblings/grandparents/grandchildren queries
  index.ts            public API: parseFtzFile(), parseNodeFtt()

models/
  types.ts            FamilyTree, Person, Family, Event, ValidationIssue, etc. (see docs/data-model.md)

validation/
  integrity.ts         runIntegrityChecks(): graph-level checks over a built FamilyTree

lib/
  uuid.ts             generateId() — crypto.randomUUID() wrapper
```

`models`, `validation`, and `lib` have zero dependency on `parser` internals beyond types — `runIntegrityChecks` takes a `FamilyTree` and, as planned, is exactly what `editor/index.ts`'s `applyEdit()` now calls after every edit (see `docs/explorer-architecture.md`), not just at import time. This wasn't a hypothetical reuse — it's the same function, unmodified.

## Parsing flow

1. `extractNodeFtt` (`parser/zip.ts`) opens the archive with JSZip, finds the file named `node.ftt` anywhere in it (folder name is not hard-coded), decodes it as UTF-8, and strips a leading BOM.
2. `tokenizeNodeFtt` (`parser/tokenizer.ts`) splits it into lines, parses the 3-integer header (`personCount`, `familyCount`, `anchorId`), and partitions the remaining lines into Person/Family groups.
   - **Grouping strategy** (see inline doc comment in `tokenizer.ts`): if `personCount + familyCount` equals the actual number of data lines, the header's counts are used to slice the lines positionally — this is what lets a Person row with extra trailing columns (future FTZ schema growth) still be recognized as a Person row rather than misclassified. If the header's counts don't add up, the parser falls back to exact field-count matching (29 fields = Person, 12 = Family) and emits an `UNKNOWN_RECORD_GROUP` warning; any line matching neither shape is preserved verbatim in the warning message rather than dropped.
3. `parsePersonRow` / `parseFamilyRow` (`parser/rows.ts`) map each row's fields by position (per `docs/ftz-format-spec.md`) into a typed intermediate shape. Rows with too few fields are padded (never dropped); rows with more fields than expected have the extras preserved and flagged `EXTRA_FIELDS_PRESERVED` (info-level) rather than rejected. Every non-numeric value in a numeric column is coerced to `0` with a `MALFORMED_ROW` warning naming the offending field.
4. `buildTree` (`parser/build.ts`) assigns a UUID to every row, builds `ftzId → UUID` lookup maps, and resolves every cross-reference (`famc`, `husband`, `wife`) from FTZ integer IDs to UUIDs. Unresolvable references become `error`-severity issues (`BROKEN_FAMC`, `BROKEN_SPOUSE_REF`) and are left `undefined` rather than guessed at. Duplicate `ftzId`s are handled by keeping the **first** occurrence as the canonical, graph-connected record while still preserving every duplicate row as its own `Person`/`Family` object — see the doc comment at the top of `build.ts` for the full rationale.
5. `runIntegrityChecks` (`validation/integrity.ts`) runs graph-level checks over the fully-built tree: self-marriage, self-parent, circular ancestry (bounded walk, cap 2000 steps — cannot hang regardless of input), gender/role mismatch, and family-missing-parent (distinguished from a broken reference by checking the original raw field was the `"0"` sentinel, not a dangling pointer).
6. `parseNodeFtt` (`parser/index.ts`) combines everything into a `ParseResult { tree, validation }`. `parseFtzFile` wraps steps 1–6 for a full archive.

## Error handling

Two tiers, deliberately different:

- **`FtzParseError` (thrown)** — reserved for structural failures where there is nothing to parse: not a ZIP, no `node.ftt` in the archive, or an unrecognized header. These can't be partially recovered from.
- **`ValidationIssue` (returned, never thrown)** — everything else: malformed rows, broken references, duplicate IDs, self-marriage, circular ancestry, etc. Each has a `severity` (`error` | `warning` | `info`). `ParseResult.validation.isValid` is `true` iff there are zero `error`-severity issues. The parser always returns a usable `tree` even when `isValid` is `false` — nothing is ever silently dropped, and nothing ever crashes the whole import over one bad row.

## Validation process

Issues accumulate from three sources into one `ValidationState.issues` array:
1. Tokenizer-level (`UNKNOWN_RECORD_GROUP`) — header/shape mismatches.
2. Row-level (`MALFORMED_ROW`, `EXTRA_FIELDS_PRESERVED`) — per-field problems while decoding one row.
3. Build/graph-level (`DUPLICATE_PERSON_ID`, `DUPLICATE_FAMILY_ID`, `ID_NAMESPACE_COLLISION`, `BROKEN_FAMC`, `BROKEN_SPOUSE_REF` from `build.ts`; `SELF_MARRIAGE`, `SELF_PARENT`, `CIRCULAR_ANCESTRY`, `GENDER_ROLE_MISMATCH`, `FAMILY_MISSING_PARENT` from `validation/integrity.ts`).

The split between (3a) build.ts and (3b) validation/integrity.ts is intentional: build.ts's checks need the raw FTZ integer IDs (only available during reference resolution), while integrity.ts's checks operate purely on the UUID-based graph and have no FTZ-specific knowledge — making them safe to re-run after a future edit in the UI, per `docs/data-model.md`.

## Internal data model

See `docs/data-model.md` for the full interface definitions and design rationale. Implementation notes beyond that doc:

- `Person.raw` / `Family.raw` always hold the complete original tab-split row, padded/truncated per the row-parsing rules above — this is what makes the "never silently discard information" requirement verifiable rather than just asserted: every original value is inspectable even for the columns the parser doesn't yet interpret.
- `childrenIds` order encodes the original birth-order field; `Person` does not separately store birth order (it's recoverable from `raw[3]` if ever needed).
- `famcId`/`famsIds` are the only relationship data actually stored; father/mother/siblings/grandparents/grandchildren are always computed on demand (`parser/relationships.ts`) so they can't desync from `famcId`/`famsIds` after an edit.

## Public API

```typescript
import { parseFtzFile, parseNodeFtt, getRelationships, runIntegrityChecks, FtzParseError } from "./parser/index.js";

// Full pipeline from raw archive bytes
const { tree, validation } = await parseFtzFile(fileBytes, "FamilyTree.ftz");

// Or, if you already have the extracted node.ftt text (e.g. in a test)
const { tree, validation } = parseNodeFtt(nodeFttText);

// Relationship queries, computed on demand
const rel = getRelationships(tree, somePersonUuid);
// rel.father, rel.mother, rel.spouses, rel.children, rel.siblings, rel.grandparents, rel.grandchildren

// Re-run graph-level validation after a hypothetical future edit
const issues = runIntegrityChecks(tree);
```

`parseFtzFile` and `parseNodeFtt` never throw for data-quality problems — check `validation.isValid` and `validation.issues` after every call. They only throw `FtzParseError` for the structural failures listed above.

## Deviations from the approved specification (flagged, not hidden)

1. **Tokenizer grouping strategy** is header-position-primary with field-count fallback, rather than the field-count-primary-with-header-cross-check described in `docs/parser-spec.md`. This was necessary to make the documented "extra trailing columns are preserved as a Person row" forward-compatibility behavior actually work — see the rationale comment in `tokenizer.ts`. The safety net (fallback to field-count grouping, with a warning, when the header is inconsistent) is preserved.
2. **One new `ValidationIssue` code**, `EXTRA_FIELDS_PRESERVED`, was added beyond the list in `docs/data-model.md` to distinguish "this row has more fields than expected and they were kept" (info-level, benign) from `MALFORMED_ROW` (warning-level, something looked wrong).
3. **Test fixtures are built programmatically** (`tests/helpers.ts`) rather than hand-written as literal `.ftt` text files, since tab-separated text is close to unreadable in a diff/review; the generated output is still genuine tab-separated text run through the real parser, not a mocked shortcut.

## Known limitations carried over from Milestone 2

- Field-position mapping is validated against a single real sample file. See the "single-sample risk" section of `docs/architecture-plan.md`.
- Multiple-spouse/remarriage and death month/day handling are validated only via synthetic fixtures (no real example exists in the sample data).
- `face/` media folder and Person columns 27/28 remain unimplemented/unmapped (no data to build against).
