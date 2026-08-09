# Architecture Overview

Start here. This is a guided tour of the whole system for a new contributor — what each stage
does, why it's shaped the way it is, and which doc to read next for depth. Every other
document in `docs/` goes deeper on one stage; this one is the map.

## The pipeline

```
 .ftz file
     │
     ▼
┌─────────────────┐
│     Parser       │   parser/  — unzips the archive, tokenizes node.ftt, parses each row,
│                  │   assigns UUIDs, resolves FTZ-integer-ID references
└────────┬─────────┘
         ▼
┌─────────────────┐
│    Validation     │   validation/  — graph-level integrity checks: duplicates, broken
│                  │   refs, cycles, self-marriage/self-parent, missing parents
└────────┬─────────┘
         ▼
┌─────────────────┐
│  Internal Model   │   models/  — the FamilyTree/Person/Family shape everything else reads
│  (FamilyTree)     │   and writes. Format-independent: no FTZ or GEDCOM concepts leak in here.
└────────┬─────────┘
         ▼
┌─────────────────┐
│      Editor        │   editor/  — optional. Pure, immutable edits (name/date fixes,
│  (optional)        │   relationship changes), each one re-run through Validation automatically
└────────┬─────────┘
         ▼
┌─────────────────┐
│  GEDCOM Export     │   gedcom/  — Internal Model → GEDCOM 5.5.1 text, plus an independent
│                  │   round-trip verifier
└────────┬─────────┘
         ▼
     .ged download
```

Every arrow in that diagram is a real function call, not a conceptual grouping — you can
trace the exact same pipeline in `parser/index.ts`'s `parseFtzFile()`,
`editor/index.ts`'s `applyEdit()`, and `gedcom/export.ts`'s `exportGedcom()`.

## What each stage owns, and where to read more

| Stage | Package | What it's responsible for | Read next |
|---|---|---|---|
| Parser | `parser/` | ZIP extraction, `node.ftt` tokenizing/row-parsing, UUID assignment, FTZ-ID reference resolution | `docs/ftz-format-spec.md` (the file format itself), `docs/parser-spec.md` + `docs/parser-implementation.md` |
| Validation | `validation/` | Graph-level integrity checks over a `FamilyTree` — reusable at import time *and* after every edit | `docs/validation-report.md`, `docs/data-model.md` |
| Internal Model | `models/` | The `FamilyTree`/`Person`/`Family`/`ValidationIssue` types everything else is built around | `docs/data-model.md` |
| Editor | `editor/` | Pure, immutable edit operations; the only way a tree can change after import | `docs/explorer-architecture.md` |
| GEDCOM Export | `gedcom/` | Internal Model → GEDCOM 5.5.1 text; independent round-trip verification | `docs/gedcom-mapping.md`, `docs/gedcom-exporter.md` |
| Web app | `web/` | Everything user-facing: upload, the tree explorer/visualization, the editing UI, export/download — built entirely on top of the packages above, with zero duplicated logic | `docs/explorer-architecture.md` |

## The one rule that shapes everything above

**Never silently discard or guess at data.** If a field can't be mapped, a value looks wrong,
or an edit is uncertain, it becomes a `ValidationIssue` (with a `severity` of `error`,
`warning`, or `info`) — not a dropped field, not a silent correction. This is why:

- The parser keeps every original row (`Person.raw`/`Family.raw`) even for columns it doesn't
  yet interpret.
- The exporter has a dedicated check (`findUnmappedPopulatedFields`) that warns if any `raw`
  field is non-empty and has no GEDCOM mapping, rather than assuming "nothing important is
  there."
- The editor rejects graph-corrupting operations outright (self-parent, circular ancestry)
  instead of applying them and hoping validation catches it later.
- Export is blocked on `error`-severity issues, but never on `warning`s — a family missing one
  parent is real, exportable data; a self-marriage is not something to export silently.

## Where state lives, and why it's shaped that way

The web app is the only stateful layer — every package below it (`parser/`, `validation/`,
`editor/`, `gedcom/`) is pure functions over plain data, with no persistence of its own.

- **`useFtzConversion`** owns the upload → parse → validate lifecycle for one file.
- **`useTreeEditor`** owns the undo/redo history for one editing session, as a stack of full
  `FamilyTree` snapshots (not inverse operations — see `docs/explorer-architecture.md` for
  why that tradeoff was made deliberately).
- **Nothing is persisted between page loads.** Refreshing the browser discards everything
  except what you've already downloaded — see `docs/security-privacy-review.md`.

## Why the framework-free packages matter

`parser/`, `models/`, `validation/`, `editor/`, and `gedcom/` have zero React dependency by
design. This isn't incidental — it's what let the explorer/editor (Milestone 6) get built on
top of the parser/exporter (Milestones 3–4) without redesigning or duplicating either, and
it's what would let a future non-web surface (a CLI batch-converter, say) reuse the exact same
logic. If you're adding a feature and find yourself reaching for a React import inside one of
these packages, that's a signal to stop and reconsider the boundary.

## Where to go from here

- Making your first change? Read `CONTRIBUTING.md` next.
- Curious about a specific bug that shaped the current design? `docs/audit-findings.md` and
  `CHANGELOG.md` document real issues found and fixed, with the reasoning.
- Wondering what's not built yet? `docs/roadmap.md`.
