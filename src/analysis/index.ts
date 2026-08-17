import type { FamilyTree, UUID } from "../models/types.js";
import { type BranchAnalysis, analyzeBranches } from "./branches.js";
import { type CousinChains, analyzeCousinChains } from "./chains.js";
import { type CompletenessAnalysis, analyzeCompleteness } from "./completeness.js";
import type { Confidence } from "./confidence.js";
import { type InfluenceAnalysis, analyzeInfluence } from "./influence.js";
import { type MarriageAnalysis, classifyAllMarriages } from "./marriages.js";
import { type PedigreeAnalysis, analyzePedigreeCollapse } from "./pedigree.js";
import { type QualityAnalysis, analyzeQuality } from "./quality.js";
import { type TreeTimeline, analyzeTimeline } from "./timeline.js";
import { type GenerationAnalysis, analyzeGenerations } from "./generations.js";
import { type CousinMarriageBreakdown, cousinMarriageBreakdown } from "./ancestralChain.js";

/**
 * Public API of the relationship-analysis engine (Insights v2). `analyzeTree` is the single
 * memoization boundary: the web layer computes it once per tree via `useTreeAnalysis` (the same
 * recompute-on-edit model as computeTreeInsights / the poster layout). See
 * docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md §H.
 */

export * from "./ancestry.js";
export * from "./classify.js";
export * from "./confidence.js";
export * from "./marriages.js";
export * from "./chains.js";
export * from "./pedigree.js";
export * from "./branches.js";
export * from "./influence.js";
export * from "./quality.js";
export * from "./completeness.js";
export * from "./timeline.js";
export * from "./generations.js";
export * from "./ancestralChain.js";
export * from "./kinship.js";

export interface TreeAnalysisSummary {
  /** Couples with both spouses recorded. */
  totalMarriages: number;
  /** Couples classified specifically as cousins. */
  cousinMarriageCount: number;
  /** Couples sharing any common ancestor (cousins + siblings + avuncular). */
  consanguineousCount: number;
  /** cousinMarriageCount / totalMarriages, as a whole-number percent. */
  cousinMarriagePercent: number;
  /** Longest consecutive cousin-marriage chain anywhere in the tree. */
  maxChainDepth: number;
  /** Confidence distribution across all couples. */
  byConfidence: Record<Confidence, number>;
  /** Tree-level pedigree-collapse score (D-5: averaged over the terminal generation), as a
   * whole-number percent. */
  pedigreeCollapsePercent: number;
  /** How much branches' descendant sets overlap due to cross-branch marriages, as a
   * whole-number percent (see `BranchAnalysis.overlapPercent`). */
  branchOverlapPercent: number;
  /** Count of `QualityAnalysis.incompleteRecords` (missing parent/spouse/date). */
  incompleteRecordCount: number;
  /** Count of `QualityAnalysis.duplicateSuspects`. */
  duplicateSuspectCount: number;
  /** Count of `QualityAnalysis.isolatedRecordIds`. */
  isolatedRecordCount: number;
  /** Tree-wide average ancestry completeness (CP4.2), as a whole-number percent. */
  completenessPercent: number;
  /** How many years the tree spans back to its earliest (recorded or estimated) birth. */
  treeAgeYears?: number;
}

export interface TreeAnalysis {
  /** Per-family marriage analysis, keyed by family id. */
  marriages: Map<UUID, MarriageAnalysis>;
  /** Cousin-marriage families (a filtered view of `marriages`). */
  cousinMarriages: MarriageAnalysis[];
  /** Cousin-marriage chain depth per person + tree-wide max. */
  chains: CousinChains;
  /** Pedigree-collapse score per person + the tree-level headline. */
  pedigree: PedigreeAnalysis;
  /** Branch overlap / vitality analysis. */
  branches: BranchAnalysis;
  /** Most-influential ancestor + most-connected person headlines. */
  influence: InfluenceAnalysis;
  /** Data-quality soft insights (duplicates, missing fields, isolated records, loops). */
  quality: QualityAnalysis;
  /** Per-person + tree-wide ancestry-completeness scores. */
  completeness: CompletenessAnalysis;
  /** Measured generation gap, per-person birth-year estimates, and how far back the tree reaches. */
  timeline: TreeTimeline;
  /** Per-generation people/marriage/cousin-marriage counts and the standout generations (S-3). */
  generations: GenerationAnalysis;
  /** Cousin marriages split by degree, removal, and how far the pattern repeats. */
  cousinBreakdown: CousinMarriageBreakdown;
  /** Headline counts for the insights panel/strip. */
  summary: TreeAnalysisSummary;
}

/**
 * Compute the whole-tree relationship analysis. Pure and framework-free. All heavy work
 * (ancestor maps) is shared internally via classifyAllMarriages' cache, and the chain DP reuses
 * the resulting marriages map — so this is a single O(n + f·Ā) pass, memoized upstream on `tree`.
 */
export function analyzeTree(
  tree: FamilyTree,
  // Injected rather than read from the clock inside, so a caller can pin it and get a
  // reproducible result -- the timeline's age arithmetic is the only clock-dependent part.
  now: number = new Date().getFullYear(),
): TreeAnalysis {
  const marriages = classifyAllMarriages(tree);
  const cousinMarriages: MarriageAnalysis[] = [];
  const byConfidence: Record<Confidence, number> = {
    confirmed: 0,
    likely: 0,
    possible: 0,
    unknown: 0,
  };
  let consanguineousCount = 0;
  for (const m of marriages.values()) {
    if (m.isCousinMarriage) cousinMarriages.push(m);
    if (m.sharesCommonAncestor) consanguineousCount++;
    byConfidence[m.confidence.level]++;
  }

  const chains = analyzeCousinChains(tree, marriages);
  const timeline = analyzeTimeline(tree, now);
  const generations = analyzeGenerations(tree, marriages);
  const pedigree = analyzePedigreeCollapse(tree);
  const branches = analyzeBranches(tree);
  const cousinBreakdown = cousinMarriageBreakdown(marriages, chains, branches);
  const influence = analyzeInfluence(tree);
  const quality = analyzeQuality(tree);
  const completeness = analyzeCompleteness(tree);
  const totalMarriages = marriages.size;
  const cousinMarriageCount = cousinMarriages.length;

  return {
    marriages,
    cousinMarriages,
    chains,
    pedigree,
    branches,
    influence,
    quality,
    completeness,
    timeline,
    generations,
    cousinBreakdown,
    summary: {
      totalMarriages,
      cousinMarriageCount,
      consanguineousCount,
      cousinMarriagePercent:
        totalMarriages > 0
          ? Math.round((cousinMarriageCount / totalMarriages) * 100)
          : 0,
      maxChainDepth: chains.maxChainDepth,
      byConfidence,
      pedigreeCollapsePercent: Math.round(pedigree.treeScore * 100),
      branchOverlapPercent: branches.overlapPercent,
      incompleteRecordCount: quality.incompleteRecords.length,
      duplicateSuspectCount: quality.duplicateSuspects.length,
      isolatedRecordCount: quality.isolatedRecordIds.length,
      completenessPercent: Math.round(completeness.treeAverage * 100),
      treeAgeYears: timeline.treeAgeYears,
    },
  };
}
