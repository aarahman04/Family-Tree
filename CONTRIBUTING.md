# Contributing

Thanks for considering a contribution. This project converts real people's family history
data — correctness and never-silently-lose-data matter more here than almost anywhere else in
software. Please keep that in mind for any change.

## Project layout

```
models/       Internal data model (Person, Family, ValidationIssue, ...) — plain types, no logic
parser/       FTZ archive/node.ftt parsing → internal model
validation/   Graph-level integrity checks, reusable by both the parser and the editor
editor/       Pure, immutable edit operations on a FamilyTree (name/date edits, relationship
              assignment/removal) — every edit revalidates via validation/ automatically
gedcom/       Internal model → GEDCOM 5.5.1 generation, plus an independent round-trip verifier
lib/          Tiny framework-free utilities (e.g. UUID generation)
tests/        Tests for everything above (Node/vitest)
web/          The React web app — imports parser/editor/gedcom/validation directly, no
              duplicated logic. Includes the tree explorer (search, visualization via React
              Flow, person inspector, undo/redo) built on top of editor/
docs/         Format specification, design decisions, and milestone-by-milestone documentation
```

Read [`docs/architecture-overview.md`](docs/architecture-overview.md) first — it's the guided
tour of the whole pipeline (FTZ → Parser → Validation → Internal Model → Editor → GEDCOM →
download) and points to the deeper doc for whichever piece you're touching.
`docs/architecture-plan.md` has more detail on repo structure history plus known risks and
limitations worth knowing before you change anything.

## Setup

```bash
git clone <repo-url>
cd Family-Tree
npm install       # installs the root package and web/ together (npm workspaces)
```

## Running things

```bash
# Root package (parser/validation/editor/gedcom)
npm test           # 104 tests
npm run typecheck

# Web app
cd web
npm run dev         # dev server at http://localhost:5173
npm test              # 66 tests: component + integration + accessibility
npm run typecheck
npm run build          # production build
npm run lint
npm run format:check
```

### Real-browser verification

Some classes of bug (CSS layout collapsing on a narrow viewport, a canvas that only renders
after a real ResizeObserver fires) are invisible to the jsdom-based test suite no matter how
much coverage it has — jsdom stubs layout geometry to a constant fake size rather than really
computing it. For any change touching layout, responsive breakpoints, or the visualization
canvas, verify in a real browser (Playwright against `npm run dev`) at a few widths (~390px,
~900px, ~1600px) before considering it done, not just in the automated suite.

## Testing against real data

The parser/exporter were validated against a real FTZ export (see `docs/validation-report.md`
and `docs/gedcom-exporter.md` for the actual results — counts, integrity checks, a real Gramps
import test). That file is **not** in this repository — it's someone's real family data, and
`.gitignore` excludes `Family Tree FTZ/` and `samples/` for that reason.

If you have your own `.ftz` file, place it at `Family Tree FTZ/FamilyTree.ftz` and:

- `tests/real-sample.test.ts`, `tests/gedcom-real-sample.test.ts`, and several `web/tests/`
  files will pick it up and run their real-data assertions.
- Without it, those specific tests skip (`it.skipIf`/`describe.skipIf`) rather than fail —
  this is what CI does, and it's expected, not a bug.

**Never commit a real person's FTZ/GEDCOM file to this repo**, including in a PR, an issue,
or a test fixture. Use synthetic data (see `tests/helpers.ts` and `web/tests/mocks/`) for
anything that needs to be committed.

## Coding standards

- **No duplicated business logic.** The web app must call into `parser/`/`editor/`/`gedcom/`/
  `validation/` — never reimplement parsing, editing, validation, or GEDCOM generation in a
  component or hook.
- **Never silently discard information.** If a field can't be mapped or a value looks wrong,
  surface it as a `ValidationIssue` (see `models/types.ts`) — don't drop it and don't guess.
- **Edits are pure and immutable.** Every function in `editor/operations.ts` takes a
  `FamilyTree` and returns a new one — never mutate the input. Route every edit through
  `editor/index.ts`'s `applyEdit()` so it's automatically revalidated; there's no code path
  that should apply an edit without immediately re-running integrity checks.
- **State assumptions.** When the FTZ format is ambiguous (see `docs/ftz-format-spec.md`),
  document the assumption and its confidence level rather than picking silently.
- Strict TypeScript (`strict`, `noUncheckedIndexedAccess` are both on — don't turn them off).
- Match existing code style; run `npm run format:check` (web) before opening a PR.
- Every new parser/editor/gedcom/validation behavior needs a test. Every new UI interaction
  needs at least a component test, and anything touching layout or the visualization canvas
  needs real-browser verification (see above) — jsdom can't catch that class of bug.

## Submitting a change

1. Open an issue first for anything non-trivial (new field mapping, new validation rule,
   architecture change) — see the issue templates in `.github/ISSUE_TEMPLATE/`.
2. Keep PRs focused — one concern per PR.
3. Make sure `npm test` (root) and `npm test` + `npm run typecheck` + `npm run build` (web) all
   pass. CI runs the same checks.
4. Describe what you changed and why, not just what — especially for anything touching the FTZ
   field mapping, since the reasoning matters more than the diff there.
