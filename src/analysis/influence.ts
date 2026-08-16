import type { FamilyTree, UUID } from "../models/types.js";
import {
  childrenOf,
  fatherOf,
  motherOf,
  siblingsOf,
  spousesOf,
} from "../parser/relationships.js";
import { descendantsOf } from "./branches.js";

/**
 * Simple whole-tree "who matters most" headlines (spec §11): the person with the largest total
 * descendant subtree, and the person with the most direct relationship edges. Deliberately two
 * separate metrics — a prolific ancestor is not necessarily the most directly-connected person
 * (e.g. an only child of a large family, or a multiply-married hub with few descendants each).
 * See docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md, plan §CP3.3.
 */

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

/** Direct relationship edges: recorded parents + spouses + children + siblings. */
function connectionCount(tree: FamilyTree, personId: UUID): number {
  let count = 0;
  if (fatherOf(tree, personId)) count++;
  if (motherOf(tree, personId)) count++;
  count += spousesOf(tree, personId).length;
  count += childrenOf(tree, personId).length;
  count += siblingsOf(tree, personId).length;
  return count;
}

/** Whole-tree influence analysis. Ties break on the lower id for determinism. */
export function analyzeInfluence(tree: FamilyTree): InfluenceAnalysis {
  let mostInfluentialAncestor: InfluentialAncestor | undefined;
  let mostConnectedPerson: MostConnectedPerson | undefined;

  for (const personId of Object.keys(tree.persons)) {
    // Skip the (expensive) descendant walk for anyone with no children at all.
    if (childrenOf(tree, personId).length > 0) {
      const descendantCount = descendantsOf(tree, personId).members.size - 1;
      if (
        !mostInfluentialAncestor ||
        descendantCount > mostInfluentialAncestor.descendantCount ||
        (descendantCount === mostInfluentialAncestor.descendantCount &&
          personId < mostInfluentialAncestor.personId)
      ) {
        mostInfluentialAncestor = { personId, descendantCount };
      }
    }

    const connections = connectionCount(tree, personId);
    if (
      connections > 0 &&
      (!mostConnectedPerson ||
        connections > mostConnectedPerson.connectionCount ||
        (connections === mostConnectedPerson.connectionCount &&
          personId < mostConnectedPerson.personId))
    ) {
      mostConnectedPerson = { personId, connectionCount: connections };
    }
  }

  return { mostInfluentialAncestor, mostConnectedPerson };
}
