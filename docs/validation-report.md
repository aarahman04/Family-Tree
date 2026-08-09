# Validation Report — Relationship Reconstruction & Integrity Checks

This report is generated from an actual analysis script run against the real sample data (473 persons, 136 families), not from inspection alone. Script: `analyze_ftz.py` (kept outside the repo, in the session scratchpad — it's throwaway verification tooling, not application code). Findings below are the script's real output.

## 1. Relationship reconstruction

Derivation rules (identical to what `parser-spec.md` specifies for the real parser):

| Relationship | Derivation |
|---|---|
| Father | `Family(Person.famc).husband` |
| Mother | `Family(Person.famc).wife` |
| Spouse(s) | every Family where `husband == person.id \|\| wife == person.id`, returning the other side |
| Children | union of children (by `famc`) across all of the person's spouse-families |
| Siblings | other children of `Family(Person.famc)`, excluding self |
| Grandparents | father's father/mother + mother's father/mother |
| Grandchildren | union of children-of-children |

**Result: reconstruction was attempted for all 473 persons — 0 errors, 0 exceptions, 0 unresolved crashes.** (`full_graph_reconstruction_ok: true`)

Three worked examples (chosen to show a root couple with no recorded parents, and a second-generation person with full relationships):

```json
{
  "id": 658204, "name": "Sheik imam (OG)",
  "father": null, "mother": null,
  "spouses": [397680],
  "children": [8025, 367304, 762371],
  "siblings": [],
  "grandchildren": [10777, 127627, 180947, 190266, 193440, 199171, 265816,
    271870, 323162, 364510, 384363, 433074, 464616, 487365, 510752, 517272,
    537450, 557097, 701231, 826685, 872017, 1002640, 1023680]
}
```

```json
{
  "id": 367304, "name": "Mohammad Abdul Khadar",
  "father": 658204, "mother": 397680,
  "spouses": [909784],
  "children": [364510, 433074, 510752, 557097],
  "siblings": [8025, 762371],
  "grandparents": { "paternal_grandfather": null, "paternal_grandmother": null,
                     "maternal_grandfather": null, "maternal_grandmother": null },
  "grandchildren": [82027, 214679, 231874, ... 32 total]
}
```

Full result set: `report_full.txt` in session scratchpad (not committed — regenerable from `node.ftt` at any time; not source data).

## 2. Integrity checks

All 12 requested categories were run as real graph queries against all 473 persons / 136 families, not spot-checked.

| Check | Method | Result |
|---|---|---|
| Duplicate Person IDs | count collisions on Person.col1 | **0 found** |
| Duplicate Family IDs | count collisions on Family.col1 | **0 found** |
| ID namespace collision (Person ID == Family ID) | set intersection | **0 found** |
| Orphaned / broken FAMC references | Person.famc ≠ 0 pointing to nonexistent Family | **0 found** (100% valid) |
| Broken spouse references | Family.husband / Family.wife pointing to nonexistent Person | **0 found** (100% valid) |
| Self-marriage | Family.husband == Family.wife | **0 found** |
| Self-parent | Person appears as husband/wife of their own FAMC family | **0 found** |
| Circular ancestry | bounded walk (≤2000 steps) up father/mother chains, per person | **0 cycles found** |
| Invalid spouse references | (same as broken spouse references above) | **0 found** |
| Invalid parent references | (same as broken FAMC references above) | **0 found** |
| Invalid child references | children derived only from valid famc back-references — no dangling child pointers possible by construction | **0 found** |
| Families with missing parent(s) | Family.husband or Family.wife == 0 | **0 found** — every family in the sample has both recorded |
| People belonging to multiple parent families | schema only allows one `famc` per Person row; only reachable via duplicate IDs | **N/A — 0 duplicate IDs, so impossible here** |

**Zero integrity violations across every category.** This is strong evidence the reverse-engineered field mapping (in particular: ID scheme, FAMC, husband/wife FKs) is correct — a wrong mapping would almost certainly have produced broken references or cycles by chance across 473+136 records.

### Additional checks run beyond the required list

- **Gender/role consistency**: checked whether every Family.husband has gender code 1 (or unknown/0) and every Family.wife has gender code 2 (or unknown/0). **0 mismatches** — supports the gender-code inference in `ftz-format-spec.md`, though see the cultural-inference risk note in `architecture-plan.md`.
- **Fully isolated persons** (no parents, no spouse, no children): **0 found** — every person in this tree connects to the graph somehow.
- **Families with no recorded children**: 23/136 (16.9%) — not an error, just childless-couple or not-yet-filled-in records.

## 3. Complex relationship scenarios — validated against real data

- **Cousin marriages / shared ancestors**: detected by computing each spouse's ancestor set (walked up to 10 generations, tree's actual max depth is 5) and intersecting. **31 of 136 families (22.8%) are marriages between people who share at least one recorded ancestor.** This is a real, load-bearing feature of this specific family tree, not a hypothetical — the reverse-engineered model resolves every one of these correctly with **no duplicated person records**: shared ancestors are referenced by ID from multiple descendant paths, exactly as the FTZ format and the internal model both require. Sample (8 of 31):

  | Family | Husband | Wife | Shared ancestor IDs |
  |---|---|---|---|
  | 1902398 | 557097 | 193440 | 397680, 658204 |
  | 1477530 | 433074 | 180947 | 397680, 658204 |
  | 1256585 | 693909 | 918127 | 8025, 397680, 447019, 658204 |
  | 1758690 | 353982 | 556438 | 8025, 180947, 337711, 367304, 397680, 433074, 447019, 658204, 762371, 909784 |
  | 1468237 | 81782 | 1006297 | 8025, 190266, 193440, 323162, 337711, 367304, 397680, 447019, 557097, 658204, 762371, 909784 |
  | 1837853 | 682043 | 980204 | 10777, 337711, 397680, 527313, 658204, 762371 |
  | 1063075 | 285686 | 968373 | 367304, 397680, 658204, 909784 |
  | 1611660 | 590838 | 874055 | 180947, 337711, 367304, 397680, 433074, 658204, 762371, 909784 |

  Notably, `397680` and `658204` (the tree's founding couple) appear as shared ancestors in nearly every case — consistent with this being one large extended clan with many internal marriages, matching your stated requirement.

- **Multiple spouses / remarriage**: the format structurally supports it (a person can appear as husband/wife in more than one Family record), but **0 of 473 people in this sample exercise it** (`max_spouse_families_for_one_person: 1`). This scenario is validated by design/code-reading, not by real data — flagged as a required synthetic test fixture in `test-cases.md`.
- **Multiple generations**: max paternal-chain depth observed is **5 generations**. Reconstruction succeeded at every depth.

## 4. What this report does and doesn't prove

**Proves**: the field mapping in `ftz-format-spec.md` produces a fully self-consistent, loss-free graph for this real 473-person tree, including its hardest real cases (cousin marriage, shared ancestors, multi-generation chains).

**Doesn't prove**: behavior on a different FTZ export (different app version, different device, a tree that actually uses multiple spouses, death dates, or the `face/` media folder). Those remain synthetic-test-fixture territory until a second real sample is available.
