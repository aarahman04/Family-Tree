# Family Tree Insights v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan checkpoint-by-checkpoint. Steps use checkbox (`- [ ]`) syntax.
>
> **On approval this file is saved to** `docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md` (project convention: `YYYY-MM-DD-<feature>.md`). The continuity companion (below) is saved next to it.

**Goal:** Turn the family-tree viewer into a *relationship-analysis engine* — cousin-marriage detection with degree classification and confidence, branch-overlap / pedigree-collapse analytics, a data-quality trust layer, and inline insight visuals — without ever adding a second rendering path.

**Architecture:** A new framework-free `src/analysis/` package (peer of `parser/`, `validation/`, `poster/`) computes a single memoized `TreeAnalysis` object from `FamilyTree`. The web layer consumes it through a `useTreeAnalysis(tree)` memo, exactly like `computeTreeInsights`/layout today. **Every persistent/exported visual is emitted by the existing `renderPosterSvg` via a new optional `analytics` parameter** — never a parallel renderer.

**Tech Stack:** TypeScript (framework-free core), React 18 + Tailwind (web), Vitest (both workspaces). No new runtime dependencies.

**Spec:** `family_tree_insight_phased_plan.md` (repo root). The spec was written generically with no knowledge of this codebase; §"Already-shipped vs genuinely-new" below reconciles it against the real code.

---

## Global Constraints (every checkpoint inherits these)

1. **Single rendering pipeline (non-negotiable).** `FamilyTree → computeBalancedPosterLayout() → renderPosterSvg() → {Editor canvas, SVG export, PDF export, Print poster}`. Every visual element this epic adds — cousin-loop coloring, branch-merge indicators, generation bands, heatmaps, node insight badges, export overlays — is produced **inside `renderPosterSvg`** (extended with an optional `analytics` argument that defaults to today's exact output). The one documented exception is *transient editor-only interaction affordances* (the existing selection pulse / focus-dim overlays), which `docs/editor-architecture.md` already defines as the "thin interaction layer" and which are **never** part of an export. Any such overlay must be justified as interaction-only, not a rendered element.
2. **Styling reuse only.** All new UI uses `docs/dark-mode-tokens.md` pairs (surfaces L0–L2, borders, text roles, semantic tints). No ad-hoc colors/spacing. Every light utility carries its `dark:` partner. Contrast pairs that are new must be added to `web/tests/lib/theme-contrast.test.ts`.
3. **Touch targets.** Interactive elements meet the established 44px minimum via `[@media(pointer:coarse)]:min-h-11` (see `PersonInspector.tsx`).
4. **Poster is theme-exempt.** `renderPosterSvg` output is never themed (`docs/dark-mode-tokens.md` §"Theme-exempt: the poster", enforced by `theme-render-identity.test.ts`). Analytics colors are poster-palette colors, not dark-mode tokens.
5. **Both-workspace gates are exit criteria for every checkpoint.** Root `tsc -p tsconfig.json --noEmit` **and** web `tsc -b` + `vite build`, plus `vitest run` in whichever workspace(s) changed, plus `prettier --check` and `eslint`. Root misses errors the web `tsc -b` catches, and vice-versa (per project practice).
6. **TDD.** Each checkpoint: write the failing test → run it red → minimal implementation → run it green → commit. Pure `src/analysis/` logic is unit-tested against small hand-built trees and, where a golden exists, the real 473-person sample (`Family Tree FTZ/FamilyTree.ftz`).
7. **Review triggers.** Anything **Large** or **touching `poster/`** gets a standalone `superpowers:requesting-code-review` before merge. Genuinely small, independent, pure checkpoints may be **batched** into one review.
8. **Analysis uses the canonical UUID model**, not `ftzId`. `gedcom/verify.ts`'s `ftzId`-based ancestor code stays as-is (it serves round-trip verification); the new module is the UUID-based source of truth (see Open Decision O-11).

---

## Context — why this epic

The app today renders and exports trees beautifully but exposes almost none of the *relationship intelligence* the data contains. Critically, **cousin marriages are already detected structurally** — the poster engine models them as `PosterChip`s and `gedcom/verify.ts` already computes shared-ancestor marriage *counts* — but that signal is thrown away for round-trip checking and never classified, never scored for confidence, never shown to the user. This epic surfaces and deepens that latent intelligence (degree/removal classification, common-ancestor paths, chains, pedigree collapse, branch overlap, data-quality trust) as inline insights and optional poster overlays, keeping the tree central per the spec's core UX rule.

---

## Already-shipped vs genuinely-new (spec reconciliation)

**Phase 1 (spec §3A / §Phase 1) is essentially already built.** Do **not** rebuild it.

| Spec item (§3A / Phase 1) | Status | Where |
| --- | --- | --- |
| total members; male/female/unspecified | ✅ shipped | `insights.ts` `computeTreeInsights` (maleCount/femaleCount/unknownCount, percentages) |
| living / deceased | ✅ shipped (presumptive) | `insights.ts` (death event OR age>110 heuristic) |
| generations | ✅ shipped | `insights.ts` `computeGenerations` (memoized, cycle-guarded) |
| marriages; avg children/family; largest generation; largest family | ✅ shipped | `insights.ts` |
| most common names / surnames | ✅ shipped | `insights.ts` `topCount` |
| separate family groups | ✅ shipped | `insights.ts` `countDisconnectedGroups` (union-find) |
| GEDCOM/FTZ import, tree render, person-click panel, export/print, mobile base | ✅ shipped | parser, poster pipeline, `PersonInspector`, `PosterExportPanel`, PR #10 mobile pass |
| relationship queries (parents/spouses/children/siblings/grandparents) | ✅ shipped | `parser/relationships.ts` |
| cousin-marriage **detection (structural)** | ✅ shipped, unused for insight | `poster` chips; `verify.ts` `ancestorFtzSet` + shared-ancestor **count** |

**Genuinely new (this epic's real work):**

| New capability | Phase |
| --- | --- |
| Relationship **distance classification** (degree, removal, double-cousin) with common-ancestor **paths** (not just set membership) | 2 |
| **Confidence framework** (confirmed / likely / possible / unknown) with concrete rules | 2 |
| Per-marriage & "parents related" classification **surfaced in the panel**; chain detection across generations | 2 |
| Pedigree-collapse, branch-overlap, descendant/vitality, influential-ancestor analytics | 3 |
| Data-quality **insight** layer (duplicate suspects, isolated records, completeness) distinct from hard `ValidationIssue`s | 4 |
| Cousin-loop coloring, branch-merge indicators, generation bands, heatmap, insight badges, export overlays — **through `renderPosterSvg`** | 5 |
| Editor transient ancestry/loop highlight (interaction overlay) | 2 |

Phase 1 in this plan is therefore a **confirm-and-close-gaps** checkpoint, not a build.

---

## Where each visual feature goes through the single renderer (explicit)

| Feature | Phase | Routed through the ONE renderer how |
| --- | --- | --- |
| Editor highlight of selected person's ancestry path / cousin loop | 2 | **Interaction overlay** in `EditorCanvas` (same class as selection pulse / focus-dim per `editor-architecture.md`); transient, never exported. Not a second renderer. |
| Cousin-marriage **loop coloring** | 5 | `renderChip` + the chip's anchor-connector line already use `style.chipBorderColor`; extend to take a per-`familyId` color from `analytics`. Same function. |
| **Branch-merge indicator** glyph | 5 | Emitted in `renderPosterSvg`'s existing chip loop (a small marker at the chip/marriage point), gated by `analytics`. |
| **Generation bands** (background) | 5 | Emitted at the top of `renderPosterSvg` (behind all content) from `layout.generationCount` + row Ys, gated by `analytics`. |
| **Heatmap** tint by interconnection | 5 | Per-`personId` fill override passed via `analytics` into `renderNode`. Same function. |
| **Node insight badges** (incomplete record, cousin marriage) | 5 | The documented `renderCardExtras` extension point in `renderSvg.ts`, fed from `analytics`. |
| **Export analytics overlays** toggle | 5 | `PosterExportPanel` (SVG/PDF) and `EditorCanvas` (insight mode) pass the **same** `analytics` object into the **same** `renderPosterSvg`; with `analytics` absent, output is byte-identical to today. |

`renderPosterSvg` remains the **only** rendering backend; we add an optional parameter, never a path.

---

## Core algorithms (designed, not deferred)

All in the new `src/analysis/` package. Small, pure, memoized. Cycle-guarded using the exact pattern already proven in `insights.ts` `computeGenerations` (a `visiting` set + a `memo` map) and `verify.ts` `ancestorFtzSet` (bounded BFS).

### A. Ancestor map with distance + paths — `ancestry.ts`
```
type AncestorRecord = { minDistance: number; paths: UUID[][] };  // paths capped at K=4 for display
computeAncestorMap(tree, personId, maxDepth=DEPTH_CAP): Map<UUID, AncestorRecord>
```
BFS upward via `fatherOf`/`motherOf` (`relationships.ts`). Distance = generational steps from `personId`. Self is excluded (distance 0 is the person, not stored as an ancestor). Cycle guard: never revisit a node already on the current frontier lineage; `CIRCULAR_ANCESTRY`-flagged nodes terminate that branch. `maxDepth` = `DEPTH_CAP` (default 15 — Open Decision O-1). Store `minDistance` always; store up to K representative paths (for the UX "explanation path").
Complexity: O(A) where A = #distinct ancestors (≤ n); memoized per person across a whole-tree pass.

### B. Common-ancestor detection between two people — `ancestry.ts`
```
type CommonAncestor = { ancestorId: UUID; distA: number; distB: number };
findCommonAncestors(mapA, mapB): CommonAncestor[]
isDirectLineage(a, b, mapA, mapB): boolean   // a∈ancestors(b) or b∈ancestors(a)
```
Intersect key sets; per shared ancestor emit `{distA, distB}` from the two maps' `minDistance`. **Direct lineage is excluded first** (spec §9 rule: not a parent-child/ancestor-descendant match) and reported as its own kind, never as "cousin".

### C. Relationship-distance classification — `classify.ts`
```
type RelKind = "self"|"direct-lineage"|"siblings"|"avuncular"|"cousins"|"unrelated";
classifyPair(commons: CommonAncestor[]): {
  kind: RelKind; cousinDegree?: number; removal?: number;
  lines: number;              // # independent common-ancestor lines (>=2 => "double")
  closest: CommonAncestor | null;
}
```
Using the closest shared ancestor (minimises `min(distA,distB)`): let `m=min(distA,distB)`, `M=max(distA,distB)`.
- `m==1,M==1` → siblings; `m==1,M==2` → avuncular (aunt/uncle–niece/nephew).
- `m>=2` → cousins: **cousinDegree = m − 1**, **removal = |distA − distB|** (e.g. `2,2`→first cousins; `2,3`→first cousins once removed; `3,3`→second cousins).
- **Double/independent lines:** group all common ancestors into *lines* — two commons are in the same line if one is an ancestor of the other, they are spouses at a shared family, **or they are co-parents of a shared child** (D-3: covers an ancestral couple with no marriage record but shared children). Count *maximal independent* lines. `lines>=2` at the same closest degree ⇒ "double first cousins", etc.
- Labels map from `{cousinDegree, removal, lines}`: "First cousins", "…once removed" (removal 1), "Second cousins", "Third cousins", and **"Distant cousins" for `cousinDegree ≥ 4`** (4th cousins and beyond — D-1).

### D. "Parents related" — `marriages.ts`
For a person, take `famc` → its `husbandId`/`wifeId`; run the marriage classifier on that couple. Yields "This person's parents are first cousins," etc. Reused by chain detection.

### E. Cousin-marriage chains — `chains.ts`
Walk **up** a person's lineage counting ancestral marriages (parents, grandparents, …) that classify as cousin marriages → "repeated cousin marriages across N generations." Walk **down** to report "children continue the chain." A chain is a maximal connected run of cousin-marriage families along a descent path. Memoized DP over the descent DAG, O(n).

### F. Confidence framework — `confidence.ts`
```
type Confidence = "confirmed"|"likely"|"possible"|"unknown";
ancestryCompleteness(tree, personId, depth): number   // filled slots / expected, capped
classifyConfidence(link): { level: Confidence; reasons: string[] }  // reasons = audit trail
```
Rules (link = a classified relationship via a closest common ancestor):
- **confirmed** — both spouses' paths to the shared ancestor are fully populated (every person on both paths exists with the parent links used), no `CIRCULAR_ANCESTRY` on either path, and any present birth/death dates are chronologically consistent (ancestor older than descendant).
- **likely** — link complete, but one soft signal is off: a date is missing on a path node, or exactly one non-breaking date inconsistency, or a path node is a *possible* duplicate (Phase 4).
- **possible** — a gap *within* a path (a missing parent between the person and the shared ancestor forces an inferred hop), or the shared ancestor is reached only via a possible-duplicate node.
- **unknown** — insufficient ancestry to attempt classification (e.g. `< 2` recorded ancestor generations for a spouse), or `DEPTH_CAP` reached with no shared ancestor. **Distinct from a confident negative:** when both spouses have deep, complete ancestry and share nothing, the result is "no cousin-marriage evidence found" (a confident *no*), not "unknown."
`reasons[]` is the human-readable **audit trail** (Phase 4 surfaces it).

### G. Complexity / performance (large trees)
- All ancestor maps for a tree: O(n + E) amortized (E = parent edges) with per-person memoization; each map ≤ O(n).
- Classify all marriages: O(f · Ā) (f families, Ā avg ancestors) — intersect two maps per family. Real sample (136 families): sub-millisecond. Synthetic 4,000+ tree: well under the poster engine's own sub-second budget.
- Chains / branch DP: O(n) memoized over the DAG.
- **Regression guard:** a 15-second bound on a ~4,100-person synthetic tree, mirroring `poster-layout.test.ts`, to catch accidental exponential blow-up (double-cousin path enumeration is the risk — hence the K-path cap in §A).

### H. Caching strategy (what / when / where)
- **Where:** one memoized `TreeAnalysis` object (`analysis/index.ts` `analyzeTree(tree)`), consumed in web via `useTreeAnalysis(tree)` = `useMemo(() => analyzeTree(tree), [tree])` — the identical pattern to `computeTreeInsights`, `buildSearchIndex`, and the poster layout memo (`editor-architecture.md` §Performance model).
- **What's cached:** ancestor maps (per person), marriage classifications (per family), person→analysis records, chain results, and Phase-3 branch/pedigree scores — all fields of the single `TreeAnalysis`.
- **Invalidation:** `useTreeEditor` produces a **new immutable `tree` snapshot** on every edit, so the memo key changes and the whole analysis recomputes — no stale sub-caches, no manual invalidation. This is deliberately the same "recompute-on-edit" model the layout already uses. An incremental/partial cache is explicitly **out of scope** for v2 (D-6).
- **Compute location (D-6, resolved at CP2.6, not now):** CP2.6 first **benchmarks the real `analyzeTree()` on the 473-person sample** and reports the *expected* (typical, not worst-case) wall-clock, plus whether it runs synchronously on every edit or lazily. Threshold: if it is not clearly imperceptible on the main thread on real data (guide: a synchronous per-edit cost noticeably above the existing layout/insights recompute, ~tens of ms), move `analyzeTree()` into a **Web Worker reusing the existing `web/src/worker/ftzWorker.ts` + `workerClient.ts` pattern** (as `exportGedcomViaWorker.ts` already does) rather than blocking the main thread. The benchmark result decides sync-vs-worker **before** CP2.6 locks the execution model.

---

## Badge visibility — living vs deceased (stated product position)

**Relationship-derived badges (cousin marriage, parents-related, cousin-degree, chain) render for _all_ individuals in the private, on-screen editor. At the export boundary (SVG / PDF / printed poster, and any shared artifact), the sensitive relationship badges are OFF by default for _living_ individuals and require explicit opt-in; the same badges render by default for _deceased_ individuals. Non-sensitive data-quality badges (e.g. "Incomplete record") render for everyone in all contexts.**

Rationale: the editor is private and local ("nothing ever leaves your device"); an export is a shareable file. Cousin marriage is a socially- and sometimes legally-sensitive attribute; a living person retains a privacy interest in it that a deceased person, as historical record, does not. "Living" uses the existing presumptive definition in `insights.ts` (no death event, or age ≤ 110). **D-2 (resolved):** the reliance of this *privacy* control on a *heuristic* is accepted for v2 with **no new per-person privacy flag**; it is recorded as a **known limitation in the continuity doc** — a mis-classified living person could have a sensitive badge exported. This position is a required line of the plan, not an implementation detail; the default-off export toggle is implemented in CP5.8.

---

## UI reuse map (per phase — no new patterns)

| New UI | Built from (existing) |
| --- | --- |
| Phase 2 relationship section in the person panel | `PersonInspector.tsx` sections; `InsightsPanel.tsx` `Section`/`Stat`; "est." badge pattern for estimates |
| Inline relationship badges ("Cousin Marriage", "Parents Related", "2nd Cousin Link") | `PersonInspector.tsx` badge: `inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs … [@media(pointer:coarse)]:min-h-11`; semantic tints from `dark-mode-tokens.md` |
| Phase 3 "family health" blocks | `InsightsPanel.tsx` `Section`/`Stat` (scrollable blocks in the same panel — **not** a new dashboard, per spec §Phase 3 UX note) |
| Phase 3/4 headline chips | `InsightsStrip.tsx` `Chip` + `useScrollFade` |
| Phase 4 data-quality panel + confidence tags | `InsightsPanel.tsx` collapsible panel; `ValidationSummary.tsx` list pattern; amber warning tint tokens |
| Phase 5 editor "insight mode" / "simple tree" toggle | `ViewMenu`/`AppearanceMenu` toggle patterns; transform-only where possible |
| Phase 5 export overlay toggles | `PosterExportPanel.tsx` `<details>`/checkbox controls (Include photos pattern) |
| Phase 5 poster visuals | `renderPosterSvg` primitives (`textLine`, `renderChip`, `renderCardExtras`); poster palette from `PosterStyleOptions`, **not** dark tokens |

---

## Phases & checkpoints

Each checkpoint states: deliverable · files · TDD test intent · exit gate · review/batch. Steps within a checkpoint follow the TDD 5-step cycle (write red test → run red → implement → run green → commit); expanded literally at execution time by the sub-skill.

### Phase 1 — Confirm & close gaps (NOT a rebuild)
- **CP1.1** (small, batchable) — Audit `insights.ts` against spec §3A; produce a one-page coverage note (goes into the continuity doc); add any genuinely-missing trivial stat only if found (expected: none). **Exit:** both-workspace gates green; coverage note written. **Review:** batch.

### Phase 2 — Relationship intelligence & cousin classification (CORE; largest)
- **CP2.1** — `src/analysis/ancestry.ts`: `computeAncestorMap`, `findCommonAncestors`, `isDirectLineage`. **Test:** hand-built trees (first cousins, once-removed, second cousins, direct lineage, cycle, depth cap). **Gate:** root. **Review:** standalone (foundational).
- **CP2.2** — `src/analysis/classify.ts`: `classifyPair` incl. degree/removal + independent-line grouping (double cousins). **Test:** the degree/removal table + a double-first-cousin fixture. **Gate:** root. **Review:** batchable with 2.1 (both pure, independent-ish).
- **CP2.3** — `src/analysis/confidence.ts`: `ancestryCompleteness`, `classifyConfidence` with `reasons[]`. **Test:** confirmed/likely/possible/unknown fixtures + the "confident negative vs unknown" distinction. **D-12 evidence:** the checkpoint must **run the classifier over the real 473-person sample and report the actual confirmed/likely/possible/unknown distribution** (counts) as evidence the default thresholds are sane — not merely "defaults set." **Gate:** root. **Review:** batchable.
- **CP2.4** — `src/analysis/marriages.ts`: `classifyMarriage(tree, familyId)`, `classifyAllMarriages(tree)`, `parentsRelated(tree, personId)`, composing 2.1–2.3. Cross-check its cousin-marriage **count** against `verify.ts`'s independent count on the real sample (a **golden-agreement test**). Add a **cross-reference comment** between `gedcom/verify.ts` and this module noting the two intentionally-independent ancestor implementations (D-11). **Report the golden-agreement result explicitly** (the two counts and that they match) when this checkpoint lands — not just pass/fail. **Gate:** root. **Review:** standalone (Large, correctness-critical).
- **CP2.5** — `src/analysis/chains.ts`: up/down chain + repeated-pattern depth. **Test:** a 3-generation repeated-cousin fixture. **Gate:** root. **Review:** batchable with 2.4.
- **CP2.6** — `src/analysis/index.ts` `analyzeTree(tree): TreeAnalysis` + web `useTreeAnalysis(tree)` memo. **First step (D-6 resolution): benchmark `analyzeTree()` on the real 473-person sample and report expected wall-clock + sync-vs-lazy;** if not clearly imperceptible on the main thread, route through a Web Worker reusing `web/src/worker/ftzWorker.ts` + `workerClient.ts` (like `exportGedcomViaWorker.ts`). This decision is made here, before the execution model is locked. **Test:** memo identity stable across non-edits; recompute on edit. **Gate:** root + web. **Review:** standalone.
- **CP2.7** — `PersonInspector` relationship-intelligence section (parents related, spouse related, cousin degree, common ancestor, compact path, chain depth, confidence tag). UI reuse per map. **Gate:** web. **Review:** standalone (user-facing).
- **CP2.8** — inline relationship badges (panel + selection). **Gate:** web (+ `theme-contrast.test.ts` if a new pair). **Review:** batchable with 2.7.
- **CP2.9** — editor transient highlight overlay (selected person's ancestry path + cousin loop) as an **interaction overlay** in `EditorCanvas` (documented as interaction-only, never exported). **Gate:** web. **Review:** standalone (touches `EditorCanvas`).

*Phase 2 does not touch `renderPosterSvg`.*

### Phase 3 — Branch overlap, pedigree collapse, health metrics
- **CP3.1** — `src/analysis/pedigree.ts`: pedigree-collapse (implex) score = `1 − distinctAncestors/expectedSlots` to `DEPTH_CAP`, per-person; **tree-level = average of the per-person score over the most-recent / living-presumed generation** (D-5), so the headline reflects the descendants who actually carry the collapse, not one arbitrary person. **Gate:** root. **Review:** standalone.
- **CP3.2** — `src/analysis/branches.ts`: **branch = the subtree under each child of the primary root anchor**, reusing `layoutBalanced.ts`'s existing anchor / `childrenOf` root concept so "branch" matches what the poster actually renders; **fall back to child-subtrees per connected component** only if a tree has no single clean root anchor (D-4). Descendant & living-descendant counts, depth/spread, overlap %, interconnection & marriage-bridge scores. Memoized DAG DP. **Gate:** root. **Review:** standalone (Large).
- **CP3.3** — `src/analysis/influence.ts`: most-influential ancestor, most-connected person. **Gate:** root. **Review:** batchable with 3.2.
- **CP3.4** — "Family health" blocks in `InsightsPanel` (scrollable, same panel). **Gate:** web. **Review:** standalone.
- **CP3.5** — headline chips (top influential ancestor, densest branch) in `InsightsStrip`. **Gate:** web. **Review:** batchable with 3.4.

### Phase 4 — Data quality & trust layer
- **CP4.1** — `src/analysis/quality.ts`: duplicate-person suspects (name+date similarity), duplicate-name warnings, missing parent/spouse/date, isolated records (reuse `countDisconnectedGroups` singletons), suspicious loops (reuse `CIRCULAR_ANCESTRY`). These are **soft insights**, kept separate from hard `ValidationIssue`s. **Gate:** root. **Review:** standalone (Large).
- **CP4.2** — per-person completeness score (reuse `ancestryCompleteness`). **Gate:** root. **Review:** batchable with 4.1.
- **CP4.3** — data-quality panel + confidence tags on insight cards + low-confidence cousin warnings + audit-trail display (renders `reasons[]` from CP2.3/2.4). **Gate:** web. **Review:** standalone (user-facing).

### Phase 5 — Visualization & polish (ALL persistent visuals through `renderPosterSvg`)
- **CP5.1** — extend `renderPosterSvg(layout, page, style, photos?, analytics?)` with an optional `PosterAnalytics` type (per-family class/color, per-node badge/tint, overlay flags). **With `analytics` absent, output is byte-identical** — preserve all existing `poster-render`/`poster-layout` goldens unchanged as the proof. **Gate:** root. **Review:** standalone — **touches `poster/`**.
- **CP5.2** — cousin-loop coloring by class (chip border + anchor connector). **Gate:** root. **Review:** poster.
- **CP5.3** — branch-merge indicator glyph. **Gate:** root. **Review:** poster (batchable with 5.2).
- **CP5.4** — generation bands (background), default off (Open Decision O-8). **Gate:** root. **Review:** poster.
- **CP5.5** — heatmap tint via `analytics` node-fill override (legibility/file-size caveat = Open Decision O-7). **Gate:** root. **Review:** poster.
- **CP5.6** — node insight badges via `renderCardExtras` (incomplete record, cousin marriage). **Gate:** root. **Review:** poster (batchable with 5.5).
- **CP5.7** — editor "insight mode" / "simple tree" toggle: passes `analytics` into the **same** renderer. **Gate:** web. **Review:** standalone (touches `EditorCanvas`).
- **CP5.8** — `PosterExportPanel` overlay toggles for SVG/PDF, wired to the **same** `analytics`; implements the **living-default-off** badge policy. **Gate:** web. **Review:** standalone.
- **CP5.9** — mini lineage-path viewer, collapsible detail-card polish, responsive/touch pass. **Gate:** web. **Review:** standalone.

---

## Continuity document (design)

Saved as `docs/superpowers/plans/insights-v2-continuity.md`, **updated after every checkpoint (at minimum every phase)**. A fresh session with zero memory must be able to resume from it alone.

**Sections:**
1. **Epic summary** + links to this plan and the source spec.
2. **Invariants that must hold** (copy of Global Constraints 1–8) — the single-pipeline rule, dark tokens, 44px, poster theme-exemption, living/deceased export policy.
3. **Status table** — every phase/checkpoint: `not-started | in-progress | done`, with the landing commit SHA and PR # when done.
4. **Module map** — each `src/analysis/*.ts` file with its exported signatures (kept current as built), so the next session sees the real interfaces without re-reading.
5. **Decisions log** — each resolved decision (D-1…D-12, plus any new ones) with the chosen answer and the date it was decided (2026-08-16 for D-1…D-12). Pre-seeded from the "Resolved decisions" section above.
6. **Known gaps / deferrals** — anything punted, with why. **Seeded with D-2's known limitation** (privacy control rests on the living heuristic; a mis-classified living person could export a sensitive badge) and D-6/D-11 notes.
7. **How to resume** — run both-workspace gates; read this + the plan; find the first non-done checkpoint; follow its TDD steps.

The plan file itself is immutable history; the continuity file is the living state. (This mirrors how this project already tracks multi-phase work.)

---

## Sequencing / prerequisites (from review)

- **This epic starts only after the repo-structure refactor merges.** `src/analysis/` is created in its **real final location** from the outset — never built in a pre-refactor location and moved later. (CP1.1, a read-only audit of `insights.ts` + the coverage note, is the only work that may run before the refactor lands, since it creates no `analysis/` files.)
- **D-6 (compute location) is resolved at CP2.6, before the execution model is locked** — via the real-sample benchmark described in that checkpoint and in §H.

## Resolved decisions (D-1…D-12)

All twelve are resolved; recorded here and mirrored into the continuity doc's decisions log.

- **D-1** — `DEPTH_CAP = 15` (confirmed). "Distant cousins" cutoff moved to **`cousinDegree ≥ 4`** (4th cousins and beyond).
- **D-2** — Accept the presumptive living heuristic for v2; **no new privacy flag.** Documented as a **known limitation** in the continuity doc (a mis-classified living person could export a sensitive badge).
- **D-3** — Confirmed: co-parents of a shared child count as one common-ancestor line.
- **D-4** — Branch = subtree under each child of the **primary root anchor**, reusing `layoutBalanced.ts`'s existing anchor/`childrenOf` concept (matches what's rendered); **fall back** to child-subtrees per connected component only if there is no single clean root anchor.
- **D-5** — Tree-level pedigree collapse = **average of the per-person score over the most-recent / living-presumed generation** (not one arbitrary person).
- **D-6** — No incremental cache in v2. **Before CP2.6 locks the model, report the *expected* `analyzeTree()` runtime on the real 473-person sample and whether it runs sync-per-edit or lazily; if not clearly imperceptible on the main thread, move it into a Web Worker reusing `web/src/worker/ftzWorker.ts`** rather than blocking the main thread.
- **D-7** — Confirmed: heatmap restricted to editor + optional export, off by default.
- **D-8** — Confirmed: generation bands opt-in only.
- **D-9** — Confirmed: new `src/analysis/` package — **contingent on the sequencing note above** (created in its post-refactor final location).
- **D-10** — Confirmed: insight strings English-only for v2.
- **D-11** — Confirmed: leave `verify.ts`'s `ftzId`-based code as-is; **add a cross-reference comment** between `verify.ts` and the new module noting the two intentionally-independent implementations (they keep each other honest via the CP2.4 golden-agreement test).
- **D-12** — Confirmed thresholds, **with evidence**: CP2.3 must report the real confirmed/likely/possible/unknown distribution on the 473-person sample, not just that defaults are set.

---

## Suggested additions (beyond the source doc — NOT part of the approved phases)

- **S-1 — Any-two-people relationship calculator.** "How are these two related?" between arbitrarily selected people, not just spouses — reuses `findCommonAncestors`/`classifyPair` directly.
- **S-2 — Kinship / inbreeding coefficient (F).** The rigorous genealogical numeric measure (path-based), complementing the degree labels. Higher trust than labels alone.
- **S-3 — Generation-level insights (spec §11).** "Generation with most marriages / most cousin marriages" as stats — cheap once §C/§E exist.
- **S-4 — Machine-readable analysis export.** A JSON/CSV analysis report alongside the poster (families classified, scores, confidence) for users who want the data.
- **S-5 — Ancestry-completeness mini-bars per branch.** Small per-branch completeness visualization in the health panel.
- **S-6 — Consanguinity legal/region notes.** Deliberately **not recommended** for v2 (region-specific, sensitive); listed only to record it was considered and set aside.

---

## Self-review (plan vs spec)

- **Coverage:** spec §3A→Phase 1 table; §3B/§5/§9→Phase 2 (CP2.1–2.9); §3C/§3E/§11→Phase 3; §3D/§Phase 4→Phase 4; §Phase 5/§6 visuals→Phase 5 (all via `renderPosterSvg`); §10 person panel→CP2.7/4.3; §8.3 caching→§H; confidence (§Phase 2/4)→`confidence.ts`. No spec section is left without a checkpoint.
- **Single-pipeline:** every §Phase-5 visual has an explicit "routed through `renderPosterSvg`" row; the only overlay (CP2.9) is justified as interaction-only per `editor-architecture.md`.
- **No placeholders in the algorithm design:** signatures, degree/removal formula, confidence rules, complexity, and caching are concrete. Per-checkpoint literal test code is intentionally deferred to execution time (multi-phase epic; later phases depend on earlier outcomes and the Open Decisions).

---

## Handoff

All twelve decisions are resolved (D-1…D-12). On approval I will: (1) save this plan to `docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md`; (2) create the continuity companion `docs/superpowers/plans/insights-v2-continuity.md` (with the decisions log and D-2 known limitation pre-seeded); (3) **proceed with CP1.1 only** (read-only audit of `insights.ts` + coverage note — creates no `analysis/` files, so it is safe before the repo-structure refactor merges). Everything from CP2.1 onward waits for the refactor to merge so `src/analysis/` is created in its final location. Reviews: standalone for anything Large or touching `poster/`; batch reporting for small independent checkpoints. CP2.3's real distribution, CP2.4's golden-agreement counts, and CP2.6's benchmark will each be **reported explicitly** when they land.
