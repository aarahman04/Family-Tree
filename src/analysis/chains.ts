import type { FamilyTree, UUID } from "../models/types.js";
import type { MarriageAnalysis } from "./marriages.js";

/**
 * Cousin-marriage chains — how far a cousin-marriage pattern repeats across generations
 * (spec §5.3/§6: "this branch contains repeated cousin marriages across 3 generations").
 * Consumes the precomputed marriages map (from classifyAllMarriages) so it is a cheap DP over
 * the family graph. See docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md §E.
 */

export interface CousinChainInfo {
  /**
   * Depth of consecutive cousin-marriage generations ending at this person's parents' union
   * (0 if the parents are not a cousin marriage; 1 lone cousin marriage; 2 if the grandparents'
   * union on some line is also one; …).
   */
  ancestralChainDepth: number;
  /** True when this person's own union, or any descendant's union, is a cousin marriage. */
  continuesInDescendants: boolean;
}

/** One consecutive run of cousin marriages, oldest generation first. */
export interface CousinChain {
  /** The families in the run, ancestor-first, so it reads the way the generations run. */
  familyIds: UUID[];
  depth: number;
}

export interface CousinChains {
  byPerson: Map<UUID, CousinChainInfo>;
  /** The longest consecutive cousin-marriage chain anywhere in the tree. */
  maxChainDepth: number;
  /**
   * Every chain tying for `maxChainDepth`, reconstructed. The DP alone answers "how deep"; the
   * UI has to answer "who", so the winning path is kept rather than discarded (CP6.3).
   */
  longestChains: CousinChain[];
  /**
   * Chain depth ending at each cousin-marriage family, so a list of marriages can be grouped or
   * sorted by how deep a run each one caps. Already computed by the DP -- exposing it costs
   * nothing and saves the UI recomputing it.
   */
  depthByFamily: Map<UUID, number>;
}

/**
 * Memoized "consecutive cousin-marriage depth ending at family F, extended upward".
 *
 * `bestParent` records WHICH parent family supplied each family's maximum, which is what makes
 * the chain reconstructible afterwards without a second traversal.
 */
function makeChainUp(
  tree: FamilyTree,
  marriages: Map<UUID, MarriageAnalysis>,
): {
  chainUp: (familyId: UUID) => number;
  bestParent: Map<UUID, UUID | undefined>;
} {
  const memo = new Map<UUID, number>();
  const visiting = new Set<UUID>();
  const bestParent = new Map<UUID, UUID | undefined>();
  function chainUp(familyId: UUID): number {
    const cached = memo.get(familyId);
    if (cached !== undefined) return cached;
    if (visiting.has(familyId)) return 0; // cycle guard (malformed data)
    const m = marriages.get(familyId);
    if (!m || !m.isCousinMarriage) {
      memo.set(familyId, 0);
      return 0;
    }
    visiting.add(familyId);
    const parentFams = [
      tree.persons[m.husbandId]?.famcId,
      tree.persons[m.wifeId]?.famcId,
    ];
    let best = 0;
    let bestFrom: UUID | undefined;
    for (const pf of parentFams) {
      if (!pf) continue;
      const d = chainUp(pf);
      if (d > best) {
        best = d;
        bestFrom = pf;
      }
    }
    visiting.delete(familyId);
    bestParent.set(familyId, bestFrom);
    const value = 1 + best;
    memo.set(familyId, value);
    return value;
  }
  return { chainUp, bestParent };
}

/** Memoized "does this person, or any descendant, have a cousin marriage". */
function makeDescendantCousin(
  tree: FamilyTree,
  marriages: Map<UUID, MarriageAnalysis>,
): (personId: UUID) => boolean {
  const memo = new Map<UUID, boolean>();
  const visiting = new Set<UUID>();
  function down(personId: UUID): boolean {
    const cached = memo.get(personId);
    if (cached !== undefined) return cached;
    if (visiting.has(personId)) return false; // cycle guard
    visiting.add(personId);
    let result = false;
    for (const famId of tree.persons[personId]?.famsIds ?? []) {
      if (marriages.get(famId)?.isCousinMarriage) result = true;
      for (const childId of tree.families[famId]?.childrenIds ?? []) {
        if (tree.persons[childId] && down(childId)) result = true;
      }
    }
    visiting.delete(personId);
    memo.set(personId, result);
    return result;
  }
  return down;
}

/** Whole-tree cousin-chain analysis, sharing one set of memo tables. */
export function analyzeCousinChains(
  tree: FamilyTree,
  marriages: Map<UUID, MarriageAnalysis>,
): CousinChains {
  const { chainUp, bestParent } = makeChainUp(tree, marriages);
  const down = makeDescendantCousin(tree, marriages);

  const byPerson = new Map<UUID, CousinChainInfo>();
  for (const personId of Object.keys(tree.persons)) {
    const famc = tree.persons[personId]?.famcId;
    byPerson.set(personId, {
      ancestralChainDepth: famc ? chainUp(famc) : 0,
      continuesInDescendants: down(personId),
    });
  }

  let maxChainDepth = 0;
  const depthByFamily = new Map<UUID, number>();
  for (const familyId of Object.keys(tree.families)) {
    const depth = chainUp(familyId);
    if (depth > 0) depthByFamily.set(familyId, depth);
    maxChainDepth = Math.max(maxChainDepth, depth);
  }

  // Only families whose own depth EQUALS the maximum are chain heads. A family part-way up a
  // longer run has a smaller depth, so it never produces a duplicate shorter entry of its own.
  const longestChains: CousinChain[] = [];
  if (maxChainDepth > 0) {
    for (const familyId of Object.keys(tree.families)) {
      if (chainUp(familyId) !== maxChainDepth) continue;
      const familyIds: UUID[] = [];
      let cursor: UUID | undefined = familyId;
      while (cursor !== undefined) {
        familyIds.push(cursor);
        cursor = bestParent.get(cursor);
      }
      familyIds.reverse(); // ancestor-first
      longestChains.push({ familyIds, depth: maxChainDepth });
    }
  }

  return { byPerson, maxChainDepth, longestChains, depthByFamily };
}

/** Convenience single-person lookup (rebuilds memo tables; use analyzeCousinChains for a full pass). */
export function cousinChainInfo(
  tree: FamilyTree,
  personId: UUID,
  marriages: Map<UUID, MarriageAnalysis>,
): CousinChainInfo {
  const { chainUp } = makeChainUp(tree, marriages);
  const down = makeDescendantCousin(tree, marriages);
  const famc = tree.persons[personId]?.famcId;
  return {
    ancestralChainDepth: famc ? chainUp(famc) : 0,
    continuesInDescendants: down(personId),
  };
}
