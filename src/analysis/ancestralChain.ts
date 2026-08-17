import type { FamilyTree, UUID } from "../models/types.js";
import { DEPTH_CAP } from "./ancestry.js";
import type { BranchAnalysis } from "./branches.js";
import type { CousinChains } from "./chains.js";
import type { MarriageAnalysis } from "./marriages.js";

/**
 * Every cousin marriage standing above one person in their ancestry — not just their parents'.
 *
 * `chains.ts` answers "how deep does the run go" as a number. That is the wrong shape for someone
 * actually reading their own line: they want to see that their parents were first cousins, AND
 * that their grandparents were second cousins, AND that it happened again further up. The DP in
 * `chains.ts` also only follows CONSECUTIVE runs, so a cousin marriage with an ordinary marriage
 * between it and the next one is invisible to it. This walk reports all of them regardless of
 * gaps, closest first.
 *
 * Bounded by `DEPTH_CAP` and guarded against the parent cycles malformed data contains.
 */

export interface AncestralCousinLink {
  familyId: UUID;
  husbandId: UUID;
  wifeId: UUID;
  /** 1 = this person's own parents, 2 = grandparents, and so on. */
  generationsUp: number;
  relation: MarriageAnalysis["relation"];
  confidence: MarriageAnalysis["confidence"];
}

export function ancestralCousinMarriages(
  tree: FamilyTree,
  personId: UUID,
  marriages: Map<UUID, MarriageAnalysis>,
): AncestralCousinLink[] {
  const links: AncestralCousinLink[] = [];
  const seenFamilies = new Set<UUID>();
  const seenPeople = new Set<UUID>([personId]);

  // Breadth-first so `generationsUp` is the true distance: a person reached by two routes (which
  // pedigree collapse makes routine) is recorded at the SHALLOWER one and never twice.
  let frontier: UUID[] = [personId];
  let generationsUp = 0;

  while (frontier.length > 0 && generationsUp < DEPTH_CAP) {
    generationsUp += 1;
    const next: UUID[] = [];

    for (const childId of frontier) {
      const familyId = tree.persons[childId]?.famcId;
      if (!familyId) continue;
      const family = tree.families[familyId];
      if (!family) continue;

      // A shared ancestral union is reachable through both of a couple's children. It is one
      // marriage: record it once, or every generation below would inflate the chain.
      if (!seenFamilies.has(familyId)) {
        seenFamilies.add(familyId);
        const m = marriages.get(familyId);
        if (m?.isCousinMarriage) {
          links.push({
            familyId,
            husbandId: m.husbandId,
            wifeId: m.wifeId,
            generationsUp,
            relation: m.relation,
            confidence: m.confidence,
          });
        }
      }

      for (const parentId of [family.husbandId, family.wifeId]) {
        if (!parentId || !tree.persons[parentId] || seenPeople.has(parentId)) continue;
        seenPeople.add(parentId);
        next.push(parentId);
      }
    }

    frontier = next;
  }

  // Closest first: the reader's own parents matter more than a link five generations up.
  return links.sort((a, b) => a.generationsUp - b.generationsUp);
}

/**
 * Tree-wide breakdown of cousin marriages by closeness and by how far the pattern repeats.
 *
 * A single "31 cousin marriages" headline flattens two very different trees: one where every link
 * is a distant third-cousin tie, and one where first cousins marry in three consecutive
 * generations. These counts keep those apart.
 */
export interface CousinMarriageBreakdown {
  total: number;
  /** Count per cousin degree — index 1 is first cousins, 2 second, and so on. */
  byDegree: Record<number, number>;
  /** Marriages carrying any generational offset ("once removed" and beyond). */
  onceRemoved: number;
  /** Runs of cousin marriage spanning two or more consecutive generations. */
  multiGenerationChains: number;
  /** Longest consecutive run anywhere. */
  deepestChain: number;
  /** How many generations separate the shallowest and deepest cousin marriage in the tree. */
  generationsSpanned: number;
  /** Distinct ancestral lines that contain more than one cousin marriage. */
  branchesWithRepeats: number;
}

export function cousinMarriageBreakdown(
  marriages: Map<UUID, MarriageAnalysis>,
  chains: CousinChains,
  branches: BranchAnalysis,
): CousinMarriageBreakdown {
  const byDegree: Record<number, number> = {};
  let total = 0;
  let onceRemoved = 0;

  for (const m of marriages.values()) {
    if (!m.isCousinMarriage) continue;
    total += 1;
    const degree = m.relation.cousinDegree ?? 1;
    byDegree[degree] = (byDegree[degree] ?? 0) + 1;
    if ((m.relation.removal ?? 0) > 0) onceRemoved += 1;
  }

  // A chain of depth >= 2 is a repeat: the same line married cousins in consecutive generations.
  let multiGenerationChains = 0;
  for (const depth of chains.depthByFamily.values()) {
    if (depth >= 2) multiGenerationChains += 1;
  }

  // How far apart the shallowest and deepest cousin marriage sit, measured from the roots so the
  // answer is "the pattern spans N generations" rather than a per-person figure.
  const generationsOfCousinMarriage: number[] = [];
  for (const [familyId, depth] of chains.depthByFamily) {
    if (marriages.get(familyId)?.isCousinMarriage) generationsOfCousinMarriage.push(depth);
  }
  const generationsSpanned =
    generationsOfCousinMarriage.length === 0
      ? 0
      : Math.max(...generationsOfCousinMarriage) - Math.min(...generationsOfCousinMarriage) + 1;

  // Distinct from `multiGenerationChains`, which counts CONSECUTIVE runs. A branch can hold two
  // cousin marriages generations apart with ordinary marriages between them: no chain, but the
  // line still married relatives more than once, which is what someone tracing their own family
  // wants to know. Counted per branch by membership, so the two figures answer different
  // questions rather than restating one.
  let branchesWithRepeats = 0;
  for (const branch of branches.branches) {
    let count = 0;
    for (const m of marriages.values()) {
      if (!m.isCousinMarriage) continue;
      if (branch.memberIds.has(m.husbandId) || branch.memberIds.has(m.wifeId)) count += 1;
      if (count >= 2) break;
    }
    if (count >= 2) branchesWithRepeats += 1;
  }

  return {
    total,
    byDegree,
    onceRemoved,
    multiGenerationChains,
    deepestChain: chains.maxChainDepth,
    generationsSpanned,
    branchesWithRepeats,
  };
}
