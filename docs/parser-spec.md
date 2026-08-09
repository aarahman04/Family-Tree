# FTZ Parser Specification

Implementation-ready. Someone should be able to build the parser directly from this document without re-deriving the format.

## Input

A `File`/`Blob`/`ArrayBuffer` containing a `.ftz` archive (ZIP).

## Output

```typescript
interface ParseResult {
  tree: FamilyTree;          // see data-model.md
  validation: ValidationState;
}
```

Never throws for *data-quality* problems (broken refs, duplicates, etc.) — those become `ValidationIssue`s. Only throws for *structural* problems that make parsing impossible (see Error Recovery).

## Parsing order

1. **Unzip** the archive (e.g. JSZip). Locate the entry whose filename is `node.ftt`, regardless of its containing folder path (the sample's top-level folder name, `FamilyTree(2)`, is export-specific and must not be hard-coded).
   - If no file named `node.ftt` is found anywhere in the archive → throw `FtzParseError("not a valid FTZ archive: node.ftt not found")`. Unrecoverable — there's nothing to parse.
2. **Decode** the entry's bytes as UTF-8 and strip a leading BOM if present.
3. **Split into lines** on `\n`, defensively also handling `\r\n` (strip trailing `\r`). Drop a single trailing empty line if present (blank final newline).
4. **Parse the header line** (line 1): split on `\t`, expect exactly 3 fields, parse as integers `[personCount, familyCount, anchorId]`.
   - If the header doesn't parse as 3 integers → throw `FtzParseError("unrecognized node.ftt header")`. This is the closest thing to a "format version" precondition; a genuinely different format here means the rest of the parsing strategy is unsafe to apply.
5. **Group the remaining lines by tab-count**, not by the header's counts alone. In the one sample analyzed, records fall into exactly two contiguous groups: 29-field rows (Person) and 12-field rows (Family), and their counts exactly match `personCount`/`familyCount`. The parser should:
   - Compute both: (a) `header`-implied slicing (`lines[1..1+personCount]` = Person, next `familyCount` = Family), and (b) actual field-count-based grouping.
   - If they agree → proceed normally (this is the expected/only-observed case).
   - If they disagree → prefer field-count grouping, and record a `ValidationIssue` (`code: "UNKNOWN_RECORD_GROUP"`, severity `"warning"`) describing the mismatch, so a human notices before trusting the output. This is the main defense against a future FTZ version silently changing the header semantics.
6. **Parse each Person row**: split on `\t`. Expect 29 fields.
   - Fewer fields → pad missing trailing fields with `""`/`0` as appropriate to their column type, and record a `ValidationIssue` (`code: "MALFORMED_ROW"`, severity `"warning"`, `relatedIds: [rowFtzId]`). Never drop the record.
   - More fields (future schema growth) → parse the first 29 as known columns, keep the extras in `raw` beyond index 28, and record an `info`-level issue so it's visible without blocking anything.
   - Non-numeric value in an integer column → treat as `0`, record a `"warning"`.
   - Map fields per `ftz-format-spec.md`; also store the full original split row as `Person.raw`.
7. **Parse each Family row**: same approach, 12 fields, same graceful-degradation rules, `Family.raw` stores the original row.
8. **Assign UUIDs**: generate a fresh UUID for every Person and Family, and build two lookup maps (`ftzId → UUID`) — one for persons, one for families. These maps are used only during import; they are not part of the persisted model.
9. **Resolve references**: translate `Person.famc` (ftzId) → `Person.famcId` (UUID) via the family map; translate `Family.husband`/`Family.wife` (ftzId) → `Family.husbandId`/`Family.wifeId` (UUID) via the person map; build `Person.famsIds` by scanning families for where the person appears as husband/wife; build `Family.childrenIds` by scanning persons for matching `famc`, sorted by birth-order field.
   - Any ftzId reference that doesn't resolve (points to a nonexistent record) → leave the corresponding field `undefined`, and record a `ValidationIssue` (`code: "BROKEN_FAMC"` or `"BROKEN_SPOUSE_REF"`, severity `"error"`). Never invent a placeholder record.
10. **Run integrity validation** (pure functions, reusable — same ones documented and already exercised in `validation-report.md`): duplicate IDs, ID-namespace collisions, self-marriage, self-parent, circular ancestry (bounded walk, hard cap e.g. 2000 steps to guarantee termination even against adversarial/corrupt input), gender/role mismatch, families missing a parent. Each finding becomes a `ValidationIssue`.
11. **Return** `{ tree, validation }`. `validation.isValid` is `true` iff there are zero `"error"`-severity issues; warnings/info never block returning a usable tree.

## Error recovery summary

| Situation | Behavior |
|---|---|
| `node.ftt` missing from zip | Throw — unrecoverable |
| Header line malformed | Throw — unrecoverable |
| `personCount`/`familyCount` don't match actual grouped line counts | Warn, use actual grouping, continue |
| Row has wrong field count | Warn, pad/truncate defensively, keep the record |
| Non-numeric value in numeric column | Warn, coerce to `0`, continue |
| Broken FAMC/spouse reference | Error-level `ValidationIssue`, leave reference unresolved, continue parsing everything else |
| Duplicate Person/Family ID | Error-level issue; keep the **first** occurrence deterministically, flag the rest as duplicates rather than silently overwriting |
| Circular ancestry | Error-level issue; the bounded walk guarantees the parser itself never hangs regardless |

The guiding principle throughout: **never silently drop or invent genealogical data; never crash on a single bad row.** Everything questionable becomes a `ValidationIssue` for a human (via the Validation page) to resolve.

## Future compatibility

- Column-position-based parsing is inherently fragile across app versions. The field-count cross-check in step 5 is the main safety net; if a future sample file shows a 3rd record type (different field count) or a shifted header, treat that as `UNKNOWN_RECORD_GROUP` rather than misparsing it as one of the two known types.
- If a future export has more than 29 (Person) or 12 (Family) tab-separated fields, extra fields are preserved in `raw` (step 6/7) even before anyone assigns them meaning — this is what makes the zero-data-loss guarantee hold even against schema growth we haven't seen yet.
- `Metadata.formatVersion` is a placeholder for whenever a real version signal is discovered; today, nothing in the file declares one, so it stays `undefined`.
