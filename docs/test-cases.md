# Parser Test Case Specification

Each case names its expected parser output. Cases marked **[real data]** can be lifted directly from `Family Tree FTZ/FamilyTree.ftz` and are already known-good (see `validation-report.md`). Cases marked **[synthetic fixture required]** don't occur in the real sample and need a small hand-built `node.ftt` fixture before they can be tested at all.

## 1. Single family — **[real data]**
Fixture: family `1552657` (husband `658204`, wife `397680`, children `367304`/`762371`/`8025`).
Expected: 1 `Family`, 5 `Person` records; `father`/`mother` resolve on all 3 children; `children` on both parents returns all 3, ordered by birth-order (`8025` order 1, `762371` order 2, `367304` order 0 → expected order `[367304, 8025, 762371]`); 0 validation issues.

## 2. Multiple generations — **[real data]**
Fixture: chain `658204 → 367304 → 364510` (grandfather → father → child; 3 generations, real max depth in the sample is 5).
Expected: `grandparents_of(364510).paternal_grandfather === 658204`; `grandchildren_of(658204)` includes `364510`.

## 3. Cousin marriages — **[real data]**
Fixture: family `1902398` (husband `557097`, wife `193440` — both descend from `658204`/`397680`, one of 31 such cases found in the real file).
Expected: parses as a completely normal `Family` — cousin marriage is **not** a validation error. A separate consanguinity-detection query (ancestor-set intersection, as used in `validation-report.md`) reports it as `info`-level, never `error`/`warning`. Regression to guard: a naive "duplicate person" check must NOT fire just because two spouses share an ancestor ID.

## 4. Multiple spouses / remarriage — **[synthetic fixture required]**
No real example exists (`max_spouse_families_for_one_person: 1` in the sample). Fixture: one Person ID appearing as `husband` in two different Family rows, e.g.:
```
100  0  0  0  0  0  0  0  0  0  0  0    John Doe        2 0 0 0 2 0 0 0 1
200  0  0  0  0  0  0  0  0  0  0  0    Wife One        2 0 0 0 2 0 0 0 2
300  0  0  0  0  0  0  0  0  0  0  0    Wife Two        2 0 0 0 2 0 0 0 2
```
Two Family rows: `(fam=1, husband=100, wife=200)`, `(fam=2, husband=100, wife=300)`.
Expected: `spouses_of(100) === [200, 300]`; `famsIds` on person `100` has length 2; `children_of(100)` merges children from both families with no duplicates even if the same child were (incorrectly) linked twice.

## 5. Shared ancestors / pedigree collapse — **[real data, deeper case]**
Fixture: family `1468237` (husband `81782`, wife `1006297`) — shares 12 ancestor IDs, the deepest real example found.
Expected: same as case 3, plus explicit check that each shared ancestor ID resolves to a **single** `Person` object referenced from multiple paths — never duplicated in `tree.persons`.

## 6. Large trees — **[synthetic fixture required]**
Fixture: generated, e.g. 5,000 persons / 1,500 families (procedurally generated valid tree, not hand-written).
Expected: parses in roughly linear time; ancestor/descendant traversal functions (`ancestors_of`, ancestry-cycle check) must be **iterative or depth-bounded**, not naive unbounded recursion — a 5,000-node tree must not stack-overflow even if pathologically deep (e.g. a single 5,000-generation lineage chain).

## 7. Missing data — **[real data]**
Fixture: person `397680` — no name, no gender-implying honorific (gender code present but name blank), no birth date.
Expected: parses without error; `Person.name === ""`; downstream UI must show a placeholder (e.g. "Unknown") rather than crashing on empty string; GEDCOM export omits the `BIRT` tag entirely rather than emitting `BIRT` with an empty `DATE`.

## 8. Broken references — **[synthetic fixture required]**
Fixture: a Person row with `famc = 999999` where no Family `999999` exists; a Family row with `husband = 888888` where no Person `888888` exists.
Expected: `Person.famcId === undefined`; two `ValidationIssue`s with `severity: "error"`, codes `BROKEN_FAMC` and `BROKEN_SPOUSE_REF`; the rest of the tree still parses and `validation.isValid === false`, but `ParseResult.tree` is still returned (not thrown).

## 9. Duplicate IDs — **[synthetic fixture required]**
Fixture: two Person rows both with ID `100` but different names.
Expected: `ValidationIssue` `severity: "error"`, code `DUPLICATE_PERSON_ID`, `relatedIds` containing both rows' generated UUIDs; parser keeps the **first** occurrence as the canonical `Person` in `tree.persons`, and records the second as a flagged duplicate rather than silently overwriting the first or crashing.

## 10. Circular references — **[synthetic fixture required]**
Fixture: Family `1` has husband `100`; Person `100`'s `famc` points back to Family `1` (i.e. `100` is listed as his own father).
Expected: the bounded ancestry walk detects the cycle within a small, deterministic number of steps; `ValidationIssue` `severity: "error"`, code `CIRCULAR_ANCESTRY`; parsing completes (does not hang) regardless of cycle depth, bounded by the walk's step cap.

## Coverage gap summary

6 of 10 required scenarios (1, 2, 3, 5, 7, and the integrity baseline) are already validated against real data — see `validation-report.md` for the actual numbers. 4 scenarios (4, 6, 8, 9, 10 — multi-spouse, large-scale, and all "broken/duplicate/circular" cases) require hand-built synthetic fixtures because the real sample file is clean and doesn't exercise them. These synthetic fixtures should live in `/tests/fixtures/` per `architecture-plan.md` and should be committed as small, readable `.ftt`-format text files, not generated at test-run time, so they're inspectable in code review.
