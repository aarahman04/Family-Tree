# Family Tree Insights v2 — Continuity Doc (living state)

**Purpose:** the single living record of where this epic stands. A fresh session with zero memory of prior work should be able to read _this file alone_ and know exactly what is done, what the interfaces are, what was decided, and what to do next. Updated **after every checkpoint, without exception** — even checkpoints batched together in one review each get their own status entry.

- **Plan (immutable):** `docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md`
- **Source spec:** `family_tree_insight_phased_plan.md` (repo root)
- **Last updated:** 2026-08-17 — **Phase 5 complete (CP5.1–CP5.9); the epic's checkpoint list is finished.** Landed after a **Codespace-loss recovery** (see below). Both-workspace gates green: root 314/314, web 250/250, `vite build` + eslint (0 errors) + prettier. Byte-identical-when-absent SHA256 re-confirmed across 4 display modes × living-indicator on/off against the pre-CP5.1 baseline. Two standalone reviews ran: the poster review of CP5.4–5.6 (5 findings — 3 fixed in `153f793`, 1 escalated to the user as **D-13**, 1 unreachable edge case) and the review of CP5.7+CP5.8 (5 findings — 3 fixed in `88b58ff`, including a **Medium privacy leak** where the living-person gate covered badges but not the branch-merge glyph; 2 recorded in Known gaps). **Still open before the epic can be called done: `Confidence = "possible"` remains unreachable** (carried from Phase 4, never part of the checkpoint list — flag to the user), plus the two recorded CP5.7/5.8 gaps and the deferred photoCards non-determinism.

**Recovery record (2026-08-17).** The Codespace carrying CP3.4→CP5.6 was deleted mid-session. GitHub's auto-export branch `codespace-super-succotash-r4pgv7qwvqjrh44g` held **13 real commits** that `feat/insights-v2` was missing (not just the export commit as first assumed) plus a final `Pending changes exported from your codespace` commit (`fd9fe14`). `feat/insights-v2` was strictly behind — merge-base equalled its HEAD — so the 13 commits were **fast-forwarded**, not merged. `fd9fe14` touched 78 files, of which **only 3 were real work** (`src/poster/renderSvg.ts`, `src/poster/types.ts`, `tests/poster-render.test.ts` = CP5.4/5.5/5.6); the other 75 were generated `graphify-out/` artifacts (69), two screenshots, an unrelated plan doc, and tooling config — all deliberately **not** carried over. The 3 real files were reapplied as `d46e0ae` and re-verified from scratch: red/green confirmed (the new tests fail against the pre-export implementation), full gates re-run, byte-identity re-proved. PR #13 was used only as a recovery source and is **not** the landing mechanism; it can be closed.

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

Legend: ⬜ not-started · 🟡 in-progress · 🔴 blocked/not-done · ✅ done

| CP       | Deliverable                                           | Status | Landing SHA / PR             | Notes                                                                                                                                                                              |
| -------- | ----------------------------------------------------- | ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1**  | Audit `insights.ts` vs spec §3A; coverage note        | ✅     | (doc-only; no source change) | See "CP1.1 coverage note" below — **full coverage, nothing to build**                                                                                                              |
| 2.1      | `analysis/ancestry.ts`                                | ✅     | `f0196ba`                    | 6 tests; root suite 242 green. Branch `feat/insights-v2` off `main`                                                                                                                |
| 2.2      | `analysis/classify.ts`                                | ✅     | `f0a253f`                    | 10 tests; root suite 252 green. Review batch A = 2.1+2.2+2.3                                                                                                                       |
| 2.3      | `analysis/confidence.ts`                              | ✅     | `2aabefe`                    | 6 tests; root suite 258 green. **D-12 evidence captured** (see Results below)                                                                                                      |
| 2.4      | `analysis/marriages.ts`                               | ✅     | `336b9ae`                    | 7 tests; suite 265 green. **Golden 31=31** vs verify.ts. D-11 comment added. Review batch B = 2.4+2.5                                                                              |
| 2.5      | `analysis/chains.ts`                                  | ✅     | `2c1d8b9`                    | 5 tests; suite 270 green. Review batch B = 2.4+2.5                                                                                                                                 |
| 2.6      | `analysis/index.ts` `analyzeTree` + `useTreeAnalysis` | ✅     | `dfb5df9`                    | root 272 + web build/test green. **D-6: 4.71ms median → SYNC useMemo, no worker.**                                                                                                 |
| 2.7      | `PersonInspector` relationship-intelligence section   | ✅     | `34b0ebd`                    | Batched review with 2.8. Parents-related + per-spouse classification, confidence tags, common-ancestor path, chain depth.                                                          |
| 2.8      | Inline relationship badges (panel header)             | ✅     | `34b0ebd`                    | Batched with 2.7. "Parents Related" + per-cousin-marriage label pills near the person heading, reusing the accent-tint pair.                                                       |
| 2.9      | Editor transient ancestry-highlight overlay           | ✅     | `d261890`                    | Both-workspace gates green. **Standalone review complete: no Critical/Important findings**, 2 Minor notes recorded in Known gaps below.                                            |
| 3.1      | `analysis/pedigree.ts` pedigree-collapse scoring      | ✅     | `2f33c7e`                    | Both-workspace gates green. **Standalone review complete: no Critical/Important findings**, 2 Minor notes in Known gaps below.                                                     |
| 3.2      | `analysis/branches.ts` branch overlap                 | ✅     | `6d22aa0` + fix `0cd7307`    | Critical review finding **fixed** in `0cd7307`: `ownedChildrenOf` now continues through a spouse's family past the root edge when the spouse has recorded parents (daughter/wife-mediated descent no longer severed). Fixture added; both-workspace gates green. |
| 3.3      | `analysis/influence.ts` most-influential ancestor     | ✅     | `34dd3fd` + fix `0cd7307`    | Critical review finding **fixed** in `0cd7307`: `mostInfluentialAncestor` tie-break now uses the `husbandId`-preference convention (`beatsInfluentialTie`), not UUID order. Fixture added; both-workspace gates green.                                            |
| 3.4      | "Family health" blocks in `InsightsPanel`             | ✅     | `b610c40` + grammar fix      | Re-verified after CP3.2/CP3.3 fix (`0cd7307`). **Standalone review complete: no Critical/Important findings.** 2 singular/plural bugs fixed inline; 2 Minor notes in Known gaps below.  |
| 3.5      | Headline chips in `InsightsStrip`                     | ✅     | `b610c40`                    | Re-verified after CP3.2/CP3.3 fix (`0cd7307`). **Standalone review complete: no Critical/Important findings.**                                                                     |
| 4.1      | `analysis/quality.ts` data-quality soft insights      | ✅     | `81382e4` + review fix `ab3f67f` | Standalone review complete (Large): isolated-records false-positive confirmed by execution, fixed. Root gates green. Batched with 4.2.                                             |
| 4.2      | `analysis/completeness.ts` per-person completeness    | ✅     | `81382e4`                    | Batched review with 4.1. Reuses `ancestryCompleteness`, no reimplementation. 1 Minor perf note in Known gaps below.                                                                 |
| 4.3      | Data-quality panel / confidence tags / audit trail    | ✅     | `4272cab` + review `5bbca81` | Standalone review complete (user-facing): no correctness bugs, 2 Minor cleanups applied. "Confidence tags" deliverable was already shipped in CP2.7/2.8 — no new work needed there. |
| 5.1      | `renderPosterSvg` + optional `PosterAnalytics` param  | ✅     | `77e2e5c`                    | Standalone review (touches poster/): **zero findings.** Byte-identical proof: SHA256 match on 3 synthetic fixtures + real 473-sample (default mode) before/after. Pre-existing photoCards-mode non-determinism discovered, confirmed unrelated, deferred per user decision. |
| 5.2–5.3  | Cousin-loop chip coloring + branch-merge glyph        | ✅     | `d26e3fb`                    | Chip border/anchor-line color via `analytics.byFamily.get(chip.familyId)?.color`; branch-merge glyph (`data-role="branch-merge"`) on both the marriage-connector path AND the chip-anchor path — **review caught that real cousin marriages only ever use the chip path** (both spouses blood-placed → no `MarriageConnector`), fixed + covered by a dedicated test (10/10 poster-render green). Also fixed: unescaped analytics-derived SVG attribute values, added `BRANCH_MERGE_CLASS_NAME` shared constant. `MarriageConnector.familyId` added; `DescentConnector.familyId` deliberately not (unused, out of scope). Byte-identical-when-absent SHA256-reconfirmed. Both-workspace gates green (root 305/305, web 231/231).                    |
| 5.4      | Generation bands (background), default off (O-8)      | ⚠️     | `d46e0ae` + review `153f793` | Code landed and tested (`data-role="generation-band"`, one band per EVEN generation, full page width, band bounds include chip heights not just node heights). **Review finding gates CP5.7:** the band math assumes generations are horizontal rows, which only `computePosterLayout` produces — `computeBalancedPosterLayout` (used by `EditorCanvas` and by `PosterExportPanel` in "balanced" mode) stacks wings/columns and carries `generation` over unchanged, so generations overlap vertically and the bands are meaningless there. Unreachable today (no caller sets `showGenerationBands`). **User decision required before CP5.7 exposes the flag** — see Known gaps. |
| 5.5      | Heatmap tint via `analytics` node-fill override (O-7) | ✅     | `d46e0ae` + review `153f793` | `analytics.byNode.get(id)?.tint` overrides the card fill in all three display modes. Review fix: an empty-string tint emitted `fill=""` (SVG resolves that to black, painting the whole card); now falls back to `backgroundColor` via `||`, matching this file's existing "absent OR empty href" photo handling. |
| 5.6      | Node insight badges via `renderCardExtras`            | ✅     | `d46e0ae` + review `153f793` | `BADGE_INCOMPLETE_RECORD` / `BADGE_COUSIN_MARRIAGE` tokens; unrecognized tokens ignored (forward-compatible). Two review fixes: (1) **Medium** — on an RTL photo card the badge rendered at the *identical* coordinate as the living-dot and painted over it, because badges mirrored to the "leading" edge while the dot is pinned to the box's **right** edge for every node regardless of `node.rtl`; badges now anchor bottom-**left** unconditionally (mirroring the dot instead would change analytics-absent output, violating invariant 1). (2) **Low** — the cousin-marriage badge was a filled diamond in the same accent color as `branchMergeGlyph`, so one shape carried two meanings; it is now two interlocking rings, restoring the AUD-5 shape-coding. `renderCardExtras` dropped its now-unused `node`/`boxWidth` params. |
| 5.7      | Editor "insight mode" toggle                          | ✅     | `31d3560` + review `88b58ff` | `View ▸ Insight mode` (menuitemcheckbox, "Show photos" pattern) feeds `web/src/lib/posterAnalytics.ts`'s `buildPosterAnalytics` into `renderPosterSvg`'s `analytics` param — not a separate React layer (invariant 1). Analytics are built only while insight mode is on, so the plain editor passes no `analytics` and keeps byte-identical output. Never sets `showGenerationBands` (D-13). |
| 5.8      | Export overlay toggles + living-badge policy          | ✅     | `9dfce82` + review `88b58ff` | Default-off "Show insights" in `PosterExportPanel`, feeding the SAME producer and the SAME `renderPosterSvg` call the preview and both downloads already share. `buildPosterAnalytics` takes a **required** `sensitiveBadgesForLiving` (no default — a new call site that forgets the privacy control fails to compile). Editor passes `true` (private/local); export passes `false` unless the user ticks the opt-in. Withholding is per spouse for badges, per couple for family overlays. "Living" reuses `isPresumedLiving`, extracted behaviour-preservingly from `computeTreeInsights` so the gate and the displayed "Living (presumed)" stat cannot drift. Generation-bands checkbox enables only under the "Single row" layout and a ticked box does not survive a switch back to balanced (D-13). |
| 5.9      | Mini lineage-path viewer + collapsible detail card    | ✅     | `88b58ff`                    | `LineagePath` replaces the flat merged arrow string with the shared ancestor named once plus one descent leg per side, wrapping instead of scrolling sideways. Relationship-intelligence block is now a `<details open>` with a `[@media(pointer:coarse)]:min-h-11` summary. |

**Refactor-merge gate (satisfied):** the repo-structure refactor **PR #11** (`refactor/repo-structure-src`) is **confirmed merged into `main`** (2026-08-16 13:43 UTC). `src/analysis/` is being created in its post-refactor final location on branch `feat/insights-v2` (off `main`, which also carries the PR #12 scroll fix).

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
export function filledAncestorSlots(tree, personId, depth): number; // (CP3.1) no dedup by identity — every parent-link instance counts
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

**`src/analysis/confidence.ts`** (CP2.3, `2aabefe`):

```ts
export type Confidence = "confirmed" | "likely" | "possible" | "unknown";
export function ancestryCompleteness(tree, personId, depth: number): number; // filled slots / 2^k
export interface ConfidenceLink {
  tree;
  personA: UUID;
  personB: UUID;
  kind: RelKind;
  closest: CommonAncestor | null;
}
export interface ConfidenceResult {
  level: Confidence;
  reasons: string[];
} // reasons = audit trail
export function classifyConfidence(link: ConfidenceLink): ConfidenceResult;
```

Related ⇒ confirmed (fully dated+consistent path) | likely (missing/contradictory dates). Unrelated ⇒ confirmed-negative (both have ≥2 gens) | unknown. **"possible" is defined but only activated in Phase 4** (duplicate-suspect on path).

**`src/analysis/marriages.ts`** (CP2.4, `336b9ae`):

```ts
export interface CoupleRelation {
  relation: PairClass;
  confidence: ConfidenceResult;
  sharesCommonAncestor: boolean;
  isCousinMarriage: boolean;
}
export interface MarriageAnalysis extends CoupleRelation {
  familyId: UUID;
  husbandId: UUID;
  wifeId: UUID;
}
export interface ParentsRelation extends CoupleRelation {
  fatherId: UUID;
  motherId: UUID;
  related: boolean;
}
export function classifyMarriage(
  tree,
  familyId,
  mapOf?,
): MarriageAnalysis | undefined;
export function classifyAllMarriages(
  tree,
): Map<UUID /*familyId*/, MarriageAnalysis>;
export function parentsRelated(
  tree,
  personId,
  mapOf?,
): ParentsRelation | undefined;
```

`mapOf` is an optional shared ancestor-map cache (a whole-tree pass computes each person's map once). Direct-lineage spouses are excluded from cousin classification.

**`src/analysis/chains.ts`** (CP2.5, `2c1d8b9`):

```ts
export interface CousinChainInfo {
  ancestralChainDepth: number;
  continuesInDescendants: boolean;
}
export interface CousinChains {
  byPerson: Map<UUID, CousinChainInfo>;
  maxChainDepth: number;
}
export function analyzeCousinChains(
  tree,
  marriages: Map<UUID, MarriageAnalysis>,
): CousinChains;
export function cousinChainInfo(tree, personId, marriages): CousinChainInfo; // single lookup
```

Cheap DP over the family graph; takes the marriages map as input (compute once in CP2.6, feed here).

**`src/analysis/index.ts`** (CP2.6, `dfb5df9`) — public API + memo boundary:

```ts
export * from "./ancestry.js";
export * from "./classify.js";
export * from "./confidence.js";
export * from "./marriages.js";
export * from "./chains.js";
export interface TreeAnalysisSummary {
  totalMarriages;
  cousinMarriageCount;
  consanguineousCount;
  cousinMarriagePercent;
  maxChainDepth;
  byConfidence: Record<Confidence, number>;
  pedigreeCollapsePercent: number; // CP3.1
  branchOverlapPercent: number; // CP3.2
}
export interface TreeAnalysis {
  marriages: Map<UUID, MarriageAnalysis>;
  cousinMarriages: MarriageAnalysis[];
  chains: CousinChains;
  pedigree: PedigreeAnalysis; // CP3.1
  branches: BranchAnalysis; // CP3.2
  influence: InfluenceAnalysis; // CP3.3
  summary: TreeAnalysisSummary;
}
export function analyzeTree(tree: FamilyTree): TreeAnalysis;
```

(Fields tagged CP3.x above were added in those checkpoints, additive to the CP2.6-locked shape.)

**`src/analysis/pedigree.ts`** (CP3.1, `2f33c7e`):

```ts
export function pedigreeCollapseScore(
  tree,
  personId,
  depth = DEPTH_CAP,
): number; // 1 − distinctAncestors/filledSlots, over KNOWN ancestry only
export interface PedigreeAnalysis {
  byPerson: Map<UUID, number>;
  treeScore: number; // D-5: averaged over the terminal (no-recorded-children) generation
}
export function analyzePedigreeCollapse(
  tree,
  depth = DEPTH_CAP,
): PedigreeAnalysis;
```

**Refinement vs plan:** both `distinctAncestors` and `filledSlots` are counted over ancestry that
is actually recorded, NOT the theoretical full binary pedigree (2^depth) — using the theoretical
denominator would score a person with only 1 of 2 known parents as ~50% "collapsed," which is
missing data, not intermarriage. `filledAncestorSlots` (new export in `ancestry.ts`) was extracted
from `confidence.ts`'s `ancestryCompleteness`, which now calls it instead of duplicating the walk
(behavior-preserving — confirmed by the unchanged D-12 distribution). D-5's "living-presumed
generation" is implemented as `terminalGenerationIds` (people with no recorded children anywhere
in the tree) rather than the web layer's date-based living heuristic, to keep this package
framework-free. Wired into `analyzeTree`: `TreeAnalysis.pedigree: PedigreeAnalysis` and
`TreeAnalysisSummary.pedigreeCollapsePercent: number`.

**`src/analysis/branches.ts`** (CP3.2, `6d22aa0`; Critical fix `0cd7307`):

**Status:** ✅ done. The Critical finding is fixed. `ownedChildrenOf` now takes a
`continueThroughSpouseFamily` flag threaded through `ownedDescendantCount`'s BFS frontier
(`pastRootEdge`): at the root edge it still credits each family to a single owner
(`husbandId ?? wifeId`), but once inside the root's lineage it also walks through a person's own
spouse family when that spouse has recorded parents (a bridge between two recorded lineages) — so a
daughter/wife-mediated descent chain is no longer severed. When the spouse has no recorded parents
the spouse is itself the competing top-level owner, so the walk does not let in-laws claim it.
Fixture: `tests/analysis-branches.test.ts` "keeps anchor ownership across a daughter/wife-mediated
descent chain".

```ts
export interface DescendantClosure {
  members: Set<UUID>;
  depth: number;
  maxBreadth: number;
}
export function descendantsOf(tree, rootId): DescendantClosure; // bidirectional childrenOf, per-call cycle-safe dedup
export interface Branch {
  rootPersonId: UUID;
  memberIds: Set<UUID>;
  descendantCount: number;
  livingDescendantCount: number;
  depth: number;
  maxBreadth: number;
  bridgeCount: number;
}
export interface BranchOverlap {
  branchA: UUID;
  branchB: UUID;
  sharedDescendantIds: UUID[];
}
export interface MarriageBridge {
  familyId: UUID;
  branchA: UUID;
  branchB: UUID;
}
export interface BranchAnalysis {
  primaryRootId: UUID | undefined;
  branches: Branch[];
  overlaps: BranchOverlap[];
  overlapPercent: number;
  marriageBridges: MarriageBridge[];
}
export function analyzeBranches(tree): BranchAnalysis;
```

**Critical refinement vs plan (found by TDD, not by design):** anchor selection CANNOT use the
same bidirectional `childrenOf` that branch membership uses. A person's in-law (their own child's
spouse's parent) structurally out-scores the "main line" root by exactly +1 descendant whenever
both sides' grandparents are recorded (extremely common) — because the in-law's walk credits
their own child on top of every descendant already shared with the main-line root. Fixed with a
NEW module-private `ownedDescendantCount`/`ownedChildrenOf` (husbandId-preferred single-owner per
family, mirroring `layoutBalanced.ts`'s `parentPersonIds[0]` convention) used ONLY for picking the
anchor. Branch membership itself deliberately stays bidirectional — a cross-branch marriage's
child legitimately belonging to both branches IS the overlap signal this module measures; if
anchor selection used the same rule as branch membership, overlap detection would work but anchor
picking would be wrong (or vice versa). D-4's "no single clean anchor → fall back to per-component"
was generalized: `analyzeBranches` always processes every connected component (each gets its own
local anchor + branches), and only the component with the most PEOPLE (not most descendants) sets
the tree-level `primaryRootId` — smaller components are never discarded.

**`src/analysis/influence.ts`** (CP3.3, `34dd3fd`; Critical fix `0cd7307`):

**Status:** ✅ done. The Critical finding is fixed. `mostInfluentialAncestor` no longer breaks
descendant-count ties by UUID/string comparison. A new module-private `beatsInfluentialTie` prefers
the family owner (`husbandId ?? wifeId`) when the two tied people are spouses/co-parents in the same
family — the same stability convention used for branch ownership, not a claim that one lineage
matters more. Fixture: `tests/analysis-influence.test.ts` "breaks a repeated spouse
descendant-count tie by the husbandId ownership convention, not UUID order" (deliberately gives the
wife the lexicographically lower UUID so the old code would pick her).

```ts
export interface InfluentialAncestor {
  personId: UUID;
  descendantCount: number;
}
export interface MostConnectedPerson {
  personId: UUID;
  connectionCount: number;
}
export interface InfluenceAnalysis {
  mostInfluentialAncestor: InfluentialAncestor | undefined;
  mostConnectedPerson: MostConnectedPerson | undefined;
}
export function analyzeInfluence(tree): InfluenceAnalysis;
```

Two deliberately independent metrics (confirmed by a fixture where they pick different people):
`mostInfluentialAncestor` reuses `branches.ts`'s `descendantsOf` (bidirectional — this is a
whole-tree headline, not anchor selection, so the in-law-inflation concern above doesn't apply
here); `mostConnectedPerson` = most direct edges (parents+spouses+children+siblings). Skips the
descendant walk for anyone with zero children as a bounded perf guard.

**`src/analysis/quality.ts`** (CP4.1, `81382e4`; review fix `ab3f67f`):

**Status:** ✅ done. Standalone review (Large) confirmed one bug by direct execution:
`findIsolatedRecordIds` originally used connected-component size (union-find), which wrongly
flagged a person as isolated whenever their only family record was degenerate (e.g. sole recorded
husband with no wife and no children) — they ARE a recorded family member, just not one with
group-mates. Fixed with a direct membership-set check ("appears in zero family records") matching
the interface's own contract; this also removed the union-find machinery, mooting the review's
reuse-vs-`branches.ts` finding. The duplicate-suspect `(name, birthYear)` key was also switched
from a concatenated string to a nested `Map` (the flagged delimiter-collision was verified
non-exploitable — `year` always renders as pure digits, so the last-`|` recovery is provably
injective — but the nested Map removes any doubt for free).

```ts
export interface DuplicateSuspect { personIds: [UUID, UUID] }
export interface DuplicateNameGroup { name: string; personIds: UUID[] }
export interface IncompleteRecord {
  personId: UUID;
  missingParent: boolean; // family exists, has exactly one of husbandId/wifeId
  missingSpouse: boolean; // family has children, has exactly one of husbandId/wifeId
  missingDate: boolean; // no birth year AND no death year
}
export interface SuspiciousLoop { personIds: UUID[] }
export interface QualityAnalysis {
  duplicateSuspects: DuplicateSuspect[];
  duplicateNameGroups: DuplicateNameGroup[];
  incompleteRecords: IncompleteRecord[]; // only people with ≥1 flag set
  isolatedRecordIds: UUID[];
  suspiciousLoops: SuspiciousLoop[]; // reused verbatim from tree.validation.issues (CIRCULAR_ANCESTRY)
}
export function analyzeQuality(tree): QualityAnalysis;
```

`missingParent` deliberately does NOT flag a person with no `famcId` at all (a root ancestor) — only
a family record that exists but has exactly one of `husbandId`/`wifeId` recorded, mirroring
CP3.2/3.3's precedent for distinguishing "no data" from "known-incomplete data".

**`src/analysis/completeness.ts`** (CP4.2, `81382e4`):

**Status:** ✅ done. Batched review with 4.1, no findings on this file beyond a Minor perf note
(below).

```ts
export interface CompletenessAnalysis {
  byPerson: Map<UUID, number>; // reuses ancestryCompleteness (CP2.3) directly, no reimplementation
  treeAverage: number; // unweighted average across every person
}
export function analyzeCompleteness(tree, depth = DEPTH_CAP): CompletenessAnalysis;
```

Both wired into `TreeAnalysis` (`quality`, `completeness`) and four new `TreeAnalysisSummary`
fields: `incompleteRecordCount`, `duplicateSuspectCount`, `isolatedRecordCount`,
`completenessPercent`.

**`web/src/hooks/useTreeAnalysis.ts`** (CP2.6, `dfb5df9`):

```ts
export function useTreeAnalysis(tree: FamilyTree): TreeAnalysis; // useMemo(analyzeTree, [tree]) — SYNC (D-6)
```

### Interface for the next model (handoff)

The `analysis/` package is complete and locked through CP2.6. The UI layer (CP2.7+) should consume **`useTreeAnalysis(tree)`** and the per-person helpers `parentsRelated(tree, personId)` and `cousinChainInfo(tree, personId, marriages)` — no new analysis logic needed. Poster visuals (Phase 5) thread through `renderPosterSvg`'s future `analytics` param (see Invariant 1), never a second renderer.

Update this section with the **actual** exported types/signatures as each file lands.

**CP2.7+2.8 UI additions:**

```ts
// web/src/components/explorer/PersonInspector.tsx — new prop:
interface PersonInspectorProps {
  // …existing…
  analysis?: TreeAnalysis; // optional: section/badges simply don't render without it
}
```

- **Data flow:** `EditorPage.tsx` computes `const analysis = useTreeAnalysis(tree);` once (the single memo boundary) and passes it straight through as a prop — `PersonInspector` does **not** call `useTreeAnalysis` or `analyzeTree` itself, so there is only ever one whole-tree analysis pass per tree identity.
- **Per-person reads inside `PersonInspector`:** `parentsRelated(tree, personId)` (called directly — cheap, per the handoff note above, not read from `TreeAnalysis`); `person.famsIds.map(id => analysis.marriages.get(id))` for the person's own marriages (avoids a second `classifyAllMarriages` pass); `analysis.chains.byPerson.get(personId)` for chain depth (also avoids recomputing — `cousinChainInfo` was deliberately **not** used here since the whole-tree chain map is already sitting in `analysis`).
- **New section** "Relationship intelligence" (after "Extended family", before the closing `</fieldset>`): renders `parentRel` (if both parents known) and one row per `marriages[]` entry (the person's own unions), each as `relationSummary()` (one of the spec §6 four canonical lines) + a `ConfidenceTag` (confirmed/likely/possible/unknown, semantic-role text color on a `bg-slate-100`/`dark:bg-slate-800` pill — reuses the "est." badge shape) + a `commonAncestorPath()` explanation string (built from two single-path `ancestorPaths(..., cap=1)` calls stitched at the shared ancestor) when a common ancestor exists. Chain depth line renders only when `ancestralChainDepth > 0 || continuesInDescendants`.
- **New inline badges** (CP2.8, in the header row, right under the name): `RelationshipBadge` pills for "Parents Related" (when `parentRel?.related`) and one per cousin-marriage the person is in (label = the marriage's own `relation.label`, e.g. "First cousins"). Styled with the documented "Selected/accent tint" pair (`bg-blue-50 border-blue-500` / dark `bg-blue-950/40 dark:border-blue-500`) + "Link/accent" text pair — no new token pairs introduced, so `theme-contrast.test.ts` needed no changes.
- **Test fixture added** (`PersonInspector.test.tsx`): `cousinTree()` — Grandpa/Grandma → DadA/DadB → CousinA×CousinB (first cousins) → their child GrandchildAB (parents-related, chain depth 1). Reused verbatim from the shape of `tests/analysis-index.test.ts`'s fixture, plus the one extra child generation.
- **CP2.9 landed (`d261890`):** `EditorCanvas` gained an optional `analysis?: TreeAnalysis` prop (existing call sites/tests that omit it are unaffected — no highlight, no behavior change). A new module-level pure function `ancestryHighlightIds(tree, personId, analysis)` computes the set of people (excluding the selected person) on the ancestry loop that explains a cousin-marriage link — via `parentsRelated(tree, personId)` for "parents are cousins" and a loop over `tree.persons[personId].famsIds` checking `analysis.marriages.get(famId)?.isCousinMarriage` for the person's own union(s) — walking each side's path to the closest common ancestor with `ancestorPaths(..., cap=1)`. Rendered as amber (`ring-amber-500`, no dark variant — matching the existing selection/pulse ring precedent, since these overlays sit on the theme-exempt paper-white sheet) ring `<div>`s in the same screen-space `overlayRect()` pattern as the pre-existing selection/pulse rings, `data-testid="ancestry-highlight"`, `pointer-events-none`, `aria-hidden`. Purely derived from `selectedPersonId` (ephemeral UI state) — never written into the `FamilyTree` data model, never passed into `renderPosterSvg` or any export path (Invariant 1 upheld the same way `focus-dim` already does).

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
- **D-13** — Generation bands are exposed **only under the row layout** (`computePosterLayout`): no toggle in `EditorCanvas` (always balanced), disabled toggle + hint in `PosterExportPanel` when `layoutMode === "balanced"`. See Known gaps for why horizontal bands cannot represent the balanced layout's stacked wings.

---

## Evidence / results (reported as checkpoints land)

- **D-12 — real-sample confidence distribution (CP2.3, `2aabefe`).** Over the 473-person sample's **136 couples (31 related)**: `confirmed 0, likely 31, possible 0, unknown 105`. All 31 related couples are "likely" (real ancestry paths carry missing dates → never "confirmed" under the strict rule); the 105 non-relations are "unknown" (those couples lack ≥2 generations of ancestry to confidently declare no relation). Honest for sparse data; the 31 related count matches `verify.ts`'s cousin-marriage count.
- **CP2.4 golden-agreement (`336b9ae`).** On the 473-sample, the UUID-based analysis module's shares-common-ancestor count = **31**, exactly matching `verify.ts`'s independent ftzId-based `cousinMarriageCountSource` = **31**. Two keyspaces + code paths agree. D-11 cross-reference comment added in `verify.ts`.
- **CP2.6 benchmark / D-6 (`dfb5df9`).** `analyzeTree()` on the 473-person sample: **median 4.71ms** (min 2.80, max 6.82 over 7 runs) — imperceptible, well under one 16ms frame. **Decision: run SYNCHRONOUSLY via `useMemo`; no Web Worker.** Execution model locked. (Benchmark lives in `tests/analysis-index.test.ts`, skipIf the sample is absent.)

---

## Known gaps / deferrals

- **D-2 privacy limitation:** the living/deceased **export** badge policy relies on the presumptive living heuristic (`insights.ts`: no death event, or age ≤ 110). A mis-classified living person (e.g. missing death record) could have a sensitive relationship badge exported in a shareable artifact. Accepted for v2; revisit if a per-person privacy flag is ever added.
- **D-6:** execution model (sync vs Web Worker) is decided at CP2.6 from the real-sample benchmark, not before.
- **D-11:** `gedcom/verify.ts` intentionally keeps its own independent `ftzId`-based ancestor/cousin-count code; the CP2.4 golden-agreement test is what keeps the two honest.
- **CP2.9 standalone review, Minor (not fixed — cosmetic/perf only, no correctness bug):**
  1. `ancestryHighlightIds`'s `ancestorPaths(..., cap=1)` calls return the first path DFS finds (father branch before mother), not necessarily the shortest — under pedigree collapse with multiple paths of different lengths to the same closest common ancestor, the amber ring could visually connect through a longer/different route than the distance the analysis actually reports. Cosmetic only; not triggered by any current fixture.
  2. `parentsRelated(tree, personId)` inside `ancestryHighlightIds` is called with its default throwaway `mapOf` cache rather than reusing anything from the already-computed `analysis` — a fresh bounded BFS ancestor-map runs on every `selectedPersonId` change. Cheap (gated by `useMemo` on selection change) and not a real perf problem, just an unexploited reuse opportunity.
- **CP3.1 standalone review, Minor (not fixed — pre-existing, not introduced by this commit):**
  1. `filledAncestorSlots` (and the inline walk it was extracted from in `ancestryCompleteness`) has no cycle-visited-set, only a same-generation self-parent guard. For genuinely cyclic malformed data (A's father is B, B's father is A), it keeps counting a new "slot" every generation up to `DEPTH_CAP` while `computeAncestorMap` dedupes and stops quickly — so `pedigreeCollapseScore`, a new user-facing metric, could report an artificially near-1.0 "collapse" for corrupt data rather than real intermarriage. Doesn't break the `distinct ≤ filled` invariant (only inflates `filled`). Worth a follow-up ticket if malformed cyclic data turns out to reach this path in practice; not blocking.
  2. `pedigreeCollapseScore` has no explicit `depth <= 0` guard (unlike `ancestryCompleteness`), but doesn't need one — confirmed the `filled === 0` early-return already covers it correctly.
- **CP3.2/CP3.3 Critical review findings — RESOLVED (`0cd7307`):**
  1. `src/analysis/influence.ts` — FIXED. `mostInfluentialAncestor` ties now resolve via `beatsInfluentialTie` (`husbandId ?? wifeId` owner preference), not `personId < previousId` UUID ordering. The headline no longer depends on arbitrary generated IDs. Regression fixture added.
  2. `src/analysis/branches.ts` — FIXED. `ownedChildrenOf` now continues through a spouse's family past the root edge when that spouse has recorded parents, so a daughter/wife-mediated ownership chain is no longer severed for anchor selection. Regression fixture added.
- **CP3.4/CP3.5 dependency caveat — CLEARED:** UI work (`b610c40`) consumes `analysis.influence` and `analysis.branches`; re-verified after the CP3.2/CP3.3 fix in `0cd7307` — web gates green (228/228).
- **CP3.4 standalone review, Minor (not fixed — cosmetic/reuse only, no correctness bug):**
  1. `InsightsPanel`'s "Pedigree collapse" stat has no presence guard and always renders `0%`, even for a tree with zero recorded ancestry — `pedigreeCollapseScore` returns 0 both for "no collapse" and "nothing to measure" (`filled === 0` early-return in `pedigree.ts`), and the UI has no signal to tell the two apart without a new field on `PedigreeAnalysis`. Every sibling stat in the same section (cousin marriages, chain depth, branch overlap, influential ancestor) correctly hides itself when there's no signal; this one doesn't. Deferred — fixing correctly means extending `src/analysis/pedigree.ts` (Large surface, own review), not a UI one-liner.
  2. `InsightsPanel`'s new `nameOf` helper re-implements the `tree.persons[id]?.name.trim() || "(no name)"` fallback already duplicated 7+ times elsewhere in `web/src` (`PersonInspector.tsx`, `lib/search.ts`, `lib/insights.ts`) instead of importing a shared resolver. Not a bug; a future change to the fallback text has one more call site to catch.
- **CP4.1/CP4.2 standalone review, Minor (not fixed — perf only, no correctness bug):**
  1. `analyzeCompleteness` calls `ancestryCompleteness` independently for every person in the tree with no cross-person cache; siblings/cousins share large swaths of the same ancestor-slot BFS, so on a large deeply-recorded tree this redoes overlapping walks per person. Not currently a measured problem (CP2.6's D-6 established the whole `analyzeTree` pipeline at 4.71ms median on the reference tree, before this addition); worth a follow-up ticket if profiling on a large real-world GEDCOM shows it matters, not blocking.
- **DEFERRED (flagged, not silently skipped): `Confidence = "possible"` is still unreachable.** `confidence.ts`'s own doc comment and plan §F both say `classifyConfidence` is supposed to downgrade a link to `"possible"` once a shared ancestor is reached only via a duplicate-suspect node (CP4.1 built `duplicateSuspects` detection, but `classifyConfidence`/`classifyAllMarriages` were never wired to consume it). CP4.3's "low-confidence cousin marriages" and the audit-trail UI both work correctly today over the currently-reachable levels (confirmed/likely/unknown) and will pick up "possible" automatically once activated (the UI checks `level !== "confirmed"`, not a level allowlist) — so this gap does NOT block CP4.3. Not implemented now because it requires reordering `analyzeTree`'s pipeline (quality analysis would need to run before marriage classification) and changing `classifyConfidence`'s signature — a behavior change to the CP2.3-locked, already-reviewed confidence module that would silently shift `byConfidence` distribution on any real tree with duplicate suspects on an ancestor path. Needs its own scoped checkpoint + review, not a silent side effect of CP4.3. **Not part of the phase 4/5 checkpoint list as written** — flag to the user before closing out the epic.
- **CP5.7/CP5.8 standalone review, Low+Minor (recorded, NOT fixed — each needs its own scoped change):**
  1. **Two different living/deceased rules can appear on the same card.** The privacy gate uses `isPresumedLiving` (no death event AND age ≤ `MAX_PLAUSIBLE_AGE`), which the plan mandates, but `src/poster/layout.ts:392` derives the poster's own living dot as `person?.death === undefined` with **no age cap** (and `src/analysis/branches.ts` holds a third private copy of the capped rule). For someone born over 110 years ago with no death record the two disagree: the renderer draws a green "Living" dot while the gate treats them as deceased and lets the cousin-marriage overlay through. Not fixed here because the honest fix is to align `layout.ts` on the capped rule, which changes **shipped poster output** for such people (green disc → grey ring) and touches `poster/` — its own checkpoint plus a poster review, not a side effect of CP5.9. Making the gate conservative instead would collapse it to `death !== undefined` and discard the age cap the plan explicitly asked for.
  2. **Insight mode defeats the canvas's SVG memo strategy.** `analytics` is a fresh object whenever `analysis`/`tree` identity changes and is a dep of `EditorCanvas`'s `svg` memo, so with insight mode ON a non-geometric, non-photo edit (e.g. adding a note) re-runs `renderPosterSvg` over the whole tree and re-injects the string (~660KB on the 473-person sample) — where the plain editor would have reused it via `layoutKey`. Only reachable with insight mode deliberately on, and the underlying render is the same one the editor already does on any geometry change. The fix is to key the analytics/SVG memo on a structural signature the way `layoutKey` already does, which is a change to the memo strategy documented at length in `EditorCanvas` — worth its own checkpoint, not an inline tweak.
- **RESOLVED — D-13, generation bands vs the balanced layout (CP5.4 review). User decision (2026-08-17): option (a), row-layout only.** `showGenerationBands` is exposed **only where `computePosterLayout` (row layout) is active**: no bands toggle in `EditorCanvas` at all (it always uses the balanced layout), and in `PosterExportPanel` the toggle is disabled with an explanatory hint whenever `layoutMode === "balanced"`. Bands therefore stay geometrically correct wherever they can be switched on, and `renderGenerationBands` stands as written. Background: nodes/chips by `generation` and places band boundaries at the midpoint between adjacent generations — correct only for `computePosterLayout`'s strict `rowY` rows. `computeBalancedPosterLayout` (`EditorCanvas.tsx:169`, and `PosterExportPanel.tsx:89` when `layoutMode === "balanced"`) re-places nodes into stacked wings/columns separated by `BAND_GAP` while carrying `generation` over unchanged, so same-generation nodes are **not** on one horizontal row. Verified on a 3-wing balanced tree: gen 1 spanned y 104–644.8 and gen 2 spanned y 208–748.8, yet the gen-2 band was emitted at y 466.4 height 104 — a slab containing almost none of gen 2, with ~354pt of page left unshaded between bands. Horizontal bands cannot represent interleaved generations, so there is no purely-technical fix; this is a product call. **Options:** (a) expose `showGenerationBands` only when the row layout is active and hide/disable the toggle in balanced mode (bands then never lie); (b) drop bands from CP5.7/5.8 entirely and keep the renderer code dormant; (c) redesign the cue for balanced layout (e.g. per-wing generation tick marks) as its own checkpoint. Not blocking CP5.5/5.6, which are done. **Nothing sets `showGenerationBands` today, so no shipped output is wrong** — the decision must land before CP5.7 wires any toggle.
- **CP5.4 review, Low (not fixed — unreachable, per project guideline "no error handling for impossible scenarios").** `renderGenerationBands` derives band neighbours from the *index* into the sorted `gens` array rather than the generation *number*. If a generation with no nodes and no chips dropped out of `bounds`, two even generations could become array-adjacent (`gens = [0, 2]`) and their bands would abut exactly, rendering as one continuous shade and defeating the alternation. Generations are assigned by depth and every component roots at generation 0, so an empty middle generation cannot occur; revisit only if generation numbering ever becomes sparse.
- **DISCOVERED (pre-existing, not caused by CP5.1): `renderPosterSvg` output for the real 473-person sample in `photoCards` mode is non-deterministic between runs of identical, unchanged code.** Confirmed by rendering the same tree/style 3x with zero code changes: same output length (662,963 bytes) but a different SHA256 each time. Every other tested scenario (3 synthetic fixtures + the real sample in default/compact mode) is perfectly stable/byte-identical across repeated runs. `renderSvg.ts` itself has no `Math.random`/`Date.now`/etc., so the source is upstream — most likely `computePosterLayout`'s collision-resolution pass or async-ordering in the FTZ parser producing different `Object.keys()` iteration order on some run-to-run non-determinism, only surfacing at real scale in photoCards mode (uniform-size boxes → more sort/collision ties). **User decision (2026-08-17): record now, root-cause in a dedicated follow-up session** — not blocking Phase 5, not caused by any CP5.x change.

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
