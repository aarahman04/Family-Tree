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

export interface CousinChains {
  byPerson: Map<UUID, CousinChainInfo>;
  /** The longest consecutive cousin-marriage chain anywhere in the tree. */
  maxChainDepth: number;
}

/** Memoized "consecutive cousin-marriage depth ending at family F, extended upward". */
function makeChainUp(
  tree: FamilyTree,
  marriages: Map<UUID, MarriageAnalysis>,
): (familyId: UUID) => number {
  const memo = new Map<UUID, number>();
  const visiting = new Set<UUID>();
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
    for (const pf of parentFams) if (pf) best = Math.max(best, chainUp(pf));
    visiting.delete(familyId);
    const value = 1 + best;
    memo.set(familyId, value);
    return value;
  }
  return chainUp;
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
  const chainUp = makeChainUp(tree, marriages);
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
  for (const familyId of Object.keys(tree.families)) {
    maxChainDepth = Math.max(maxChainDepth, chainUp(familyId));
  }

  return { byPerson, maxChainDepth };
}

/** Convenience single-person lookup (rebuilds memo tables; use analyzeCousinChains for a full pass). */
export function cousinChainInfo(
  tree: FamilyTree,
  personId: UUID,
  marriages: Map<UUID, MarriageAnalysis>,
): CousinChainInfo {
  const chainUp = makeChainUp(tree, marriages);
  const down = makeDescendantCousin(tree, marriages);
  const famc = tree.persons[personId]?.famcId;
  return {
    ancestralChainDepth: famc ? chainUp(famc) : 0,
    continuesInDescendants: down(personId),
  };
}
