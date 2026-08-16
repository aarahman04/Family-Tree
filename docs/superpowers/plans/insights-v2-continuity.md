# Family Tree Insights v2 — Continuity Doc (living state)

**Purpose:** the single living record of where this epic stands. A fresh session with zero memory of prior work should be able to read _this file alone_ and know exactly what is done, what the interfaces are, what was decided, and what to do next. Updated **after every checkpoint, without exception** — even checkpoints batched together in one review each get their own status entry.

- **Plan (immutable):** `docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md`
- **Source spec:** `family_tree_insight_phased_plan.md` (repo root)
- **Last updated:** 2026-08-16 — after CP2.1.

---

## Invariants that must hold (do not violate)

1. **Single rendering pipeline.** `FamilyTree → computeBalancedPosterLayout() → renderPosterSvg() → {editor, SVG, PDF, poster}`. Every persistent/exported visual is emitted _inside_ `renderPosterSvg` via its optional `analytics` param (absent ⇒ byte-identical to today). Only transient editor interaction overlays (selection pulse / focus dim class) may live in `EditorCanvas`.
2. **Styling reuse only** — `docs/dark-mode-tokens.md` pairs; every light utility has its `dark:` partner; new contrast pairs added to `web/tests/lib/theme-contrast.test.ts`.
3. **44px touch targets** via `[@media(pointer:coarse)]:min-h-11`.
4. **Poster is theme-exempt** (`theme-render-identity.test.ts`); analytics colors are poster-palette, not dark tokens.
5. **Both-workspace gates** (root `tsc --noEmit` + web `tsc -b` + `vite build` + `vitest` + prettier + eslint) are the exit criterion for every code checkpoint.
6. **TDD**, **analysis uses the canonical UUID model** (not `ftzId`).
7. **Reviews:** standalone for anything Large or touching `poster/`; batch only where the plan explicitly allows.

---

## Status table

Legend: ⬜ not-started · 🟡 in-progress · ✅ done

| CP                     | Deliverable                                           | Status | Landing SHA / PR             | Notes                                                                                                                                    |
| ---------------------- | ----------------------------------------------------- | ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1**                | Audit `insights.ts` vs spec §3A; coverage note        | ✅     | (doc-only; no source change) | See "CP1.1 coverage note" below — **full coverage, nothing to build**                                                                    |
| 2.1                    | `analysis/ancestry.ts`                                | ✅     | `f0196ba`                    | 6 tests; root suite 242 green. Branch `feat/insights-v2` off `main`                                                                      |
| 2.2                    | `analysis/classify.ts`                                | ✅     | `f0a253f`                    | 10 tests; root suite 252 green. Review batch A = 2.1+2.2+2.3                                                                             |
| 2.3                    | `analysis/confidence.ts`                              | ⬜     | —                            | must report real confirmed/likely/possible/unknown distribution on 473-sample                                                            |
| 2.4                    | `analysis/marriages.ts`                               | ⬜     | —                            | standalone review; report golden-agreement counts vs `verify.ts`                                                                         |
| 2.5                    | `analysis/chains.ts`                                  | ⬜     | —                            | batchable w/ 2.4                                                                                                                         |
| 2.6                    | `analysis/index.ts` `analyzeTree` + `useTreeAnalysis` | ⬜     | —                            | **benchmark on 473-sample first**; decide sync vs Web Worker (D-6). **HARD STOP after this CP** — interface handoff to a different model |
| 2.7–2.9, 3.x, 4.x, 5.x | Phase 2 UI, Phases 3–5                                | ⬜     | —                            | not yet in scope of the current run                                                                                                      |

**Refactor-merge gate (satisfied):** the repo-structure refactor **PR #11** (`refactor/repo-structure-src`) is **confirmed merged into `main`** (2026-08-16 13:43 UTC). `src/analysis/` is being created in its post-refactor final location on branch `feat/insights-v2` (off `main`, which also carries the PR #12 scroll fix).

**Last updated:** after CP2.2.

---

## Module map (real exported signatures, updated as built)

### Built

**`src/analysis/ancestry.ts`** (CP2.1, `f0196ba`):

```ts
export const DEPTH_CAP = 15;
export interface AncestorInfo {
  minDistance: number;
} // parent = 1
export type AncestorMap = Map<UUID, AncestorInfo>;
export function computeAncestorMap(
  tree,
  personId,
  maxDepth = DEPTH_CAP,
): AncestorMap;
export interface CommonAncestor {
  ancestorId: UUID;
  distA: number;
  distB: number;
}
export function findCommonAncestors(
  a: AncestorMap,
  b: AncestorMap,
): CommonAncestor[];
export function isDirectLineage(
  aId,
  bId,
  aMap: AncestorMap,
  bMap: AncestorMap,
): boolean; // incl. aId===bId
export function ancestorPaths(
  tree,
  fromId,
  toId,
  maxDepth = DEPTH_CAP,
  cap = 4,
): UUID[][]; // [from … to]
```

**Refinement vs plan §A:** the map stores `minDistance` only (`AncestorInfo`); display paths come from the separate `ancestorPaths()`, not stored per-ancestor — avoids exponential path storage under pedigree collapse. Consumers needing distances use the map; consumers needing a path string call `ancestorPaths`.

**`src/analysis/classify.ts`** (CP2.2, `f0a253f`):

```ts
export type RelKind =
  | "self"
  | "direct-lineage"
  | "siblings"
  | "avuncular"
  | "cousins"
  | "unrelated";
export interface PairClass {
  kind: RelKind;
  cousinDegree?: number;
  removal?: number;
  lines: number;
  closest: CommonAncestor | null;
  label: string;
}
export function classifyPair(
  commons: CommonAncestor[],
  lines: number,
): PairClass; // pure
export function countIndependentLines(
  tree: FamilyTree,
  commons: CommonAncestor[],
): number; // needs tree (D-3)
```

cousinDegree = min−1, removal = |distA−distB|; degree ≥ 4 ⇒ "Distant cousins"; `lines` ⇒ Double/Triple prefix.

### Planned (not yet built; signatures may refine at implementation)

- `src/analysis/confidence.ts` — `ancestryCompleteness(tree, personId, depth)`; `classifyConfidence(link): { level, reasons[] }`.
- `src/analysis/marriages.ts` — `classifyMarriage(tree, familyId)`; `classifyAllMarriages(tree)`; `parentsRelated(tree, personId)`.
- `src/analysis/chains.ts` — up/down cousin chain + repeated-pattern depth.
- `src/analysis/index.ts` — `analyzeTree(tree): TreeAnalysis`; web `useTreeAnalysis(tree)` memo.

Update this section with the **actual** exported types/signatures as each file lands.

---

## Decisions log (all dated 2026-08-16 unless noted)

- **D-1** — `DEPTH_CAP = 15`; "distant cousins" cutoff = `cousinDegree ≥ 4`.
- **D-2** — Accept presumptive living heuristic; no new privacy flag. _(Known limitation — see Gaps.)_
- **D-3** — Co-parents of a shared child count as one common-ancestor line.
- **D-4** — Branch = subtree under each child of the primary root **anchor** (reuse `layoutBalanced.ts`); fall back to child-subtrees per connected component if no clean anchor.
- **D-5** — Tree-level pedigree collapse = average per-person score over the most-recent/living-presumed generation.
- **D-6** — No incremental cache in v2. Benchmark `analyzeTree()` on the real sample **before CP2.6 locks the model**; move to a Web Worker (reuse `web/src/worker/ftzWorker.ts`) if not clearly imperceptible on the main thread.
- **D-7** — Heatmap: editor + optional export only, off by default.
- **D-8** — Generation bands: opt-in only.
- **D-9** — New `src/analysis/` package, created in its post-refactor final location.
- **D-10** — Insight strings English-only for v2.
- **D-11** — Leave `verify.ts` `ftzId` code as-is; add a cross-reference comment between it and the new module.
- **D-12** — Confidence thresholds confirmed, with CP2.3 real-sample distribution as evidence.

---

## Known gaps / deferrals

- **D-2 privacy limitation:** the living/deceased **export** badge policy relies on the presumptive living heuristic (`insights.ts`: no death event, or age ≤ 110). A mis-classified living person (e.g. missing death record) could have a sensitive relationship badge exported in a shareable artifact. Accepted for v2; revisit if a per-person privacy flag is ever added.
- **D-6:** execution model (sync vs Web Worker) is decided at CP2.6 from the real-sample benchmark, not before.
- **D-11:** `gedcom/verify.ts` intentionally keeps its own independent `ftzId`-based ancestor/cousin-count code; the CP2.4 golden-agreement test is what keeps the two honest.

---

## How to resume (fresh session)

1. Run both-workspace gates to confirm a green baseline.
2. Read this file + the plan (`2026-08-16-family-tree-insights-v2.md`) + the spec.
3. Find the first non-✅ row in the status table.
4. **Before CP2.1:** confirm the repo-structure refactor is merged into `main` (`gh pr list --state merged` / `git log main`). If not merged, stop and report — do not create `src/analysis/` in a pre-refactor location.
5. Follow that checkpoint's TDD steps in the plan; on landing, update this file (status, SHA, module map, decisions/gaps) before moving on.
6. **Hard stop after CP2.6** — report the benchmark result and the locked module interface; the epic hands off to a different model there.

---

## CP1.1 coverage note (Phase 1 audit — spec §3A vs `web/src/lib/insights.ts`)

**Result: full coverage. Nothing to build in Phase 1.** Every spec §3A "Family Structure Insight" is already computed by `computeTreeInsights` and rendered by `InsightsPanel`/`InsightsStrip`.

| Spec §3A item               | Implemented as                                                                 | Rendered in                                                  |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| total members               | `totalMembers`                                                                 | InsightsPanel "People", InsightsStrip                        |
| male / female / unspecified | `maleCount` / `femaleCount` / `unknownCount` (+ `malePercent`/`femalePercent`) | InsightsPanel, InsightsStrip                                 |
| living / deceased           | `livingCount` / `deceasedCount` (presumptive: no death event or age > 110)     | InsightsPanel ("Living (presumed)" carries the `est.` badge) |
| generations                 | `generationCount` (via cycle-guarded `computeGenerations`)                     | both                                                         |
| marriages                   | `marriageCount`                                                                | InsightsPanel                                                |
| average children per family | `averageChildrenPerFamily`                                                     | InsightsPanel                                                |
| largest generation          | `largestGeneration`                                                            | InsightsPanel                                                |
| largest family              | `largestFamily`                                                                | InsightsPanel                                                |
| most common names           | `mostCommonFirstName`                                                          | InsightsPanel                                                |
| most common surnames        | `mostCommonSurname`                                                            | InsightsPanel                                                |

**Bonus already shipped beyond §3A** (no action): timeline estimate (`estimatedEarliestDecade`, `estimatedSpanYears`), lifespan block (`averageLifespan`, `longestLived`, `oldestLiving`, `youngestLiving`), and `disconnectedGroups` (union-find). All estimates already carry an `est.` badge and hedged wording.

**Gate note:** CP1.1 changed no source files (audit + doc only), so the both-workspace gates are unaffected by it; the first real gate run for this epic is CP2.1.
