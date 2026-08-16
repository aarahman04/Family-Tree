import type { FamilyTree, UUID } from "../models/types.js";
import { grandparentsOf } from "../parser/relationships.js";
import {
  type CommonAncestor,
  ancestorPaths,
  filledAncestorSlots,
} from "./ancestry.js";
import type { RelKind } from "./classify.js";

/**
 * Confidence framework (spec §Phase 2/4, plan §F). Rates how trustworthy a relationship
 * classification is, given the completeness of the ancestry it rests on and the chronological
 * consistency of any dates on the path. Pure and framework-free.
 *
 * NOTE: "possible" is defined here but only *activated* in Phase 4, once duplicate-suspect
 * detection exists (a shared ancestor reached only via a possible-duplicate node downgrades to
 * "possible"). Through CP2.3 the reachable levels are confirmed / likely / unknown.
 */

export type Confidence = "confirmed" | "likely" | "possible" | "unknown";

/**
 * Fraction of a person's expected ancestor slots (the full binary pedigree, 2^k per generation)
 * that are actually filled, up to `depth` generations. 1 = every slot known; 0 = no parents
 * recorded. A missing parent makes that slot and everything above it unfillable (still counted
 * as expected). Bounded by `depth`, self-parent-guarded.
 */
export function ancestryCompleteness(
  tree: FamilyTree,
  personId: UUID,
  depth: number,
): number {
  if (depth <= 0) return 1;
  let expected = 0;
  for (let k = 1; k <= depth; k++) expected += 2 ** k;
  const actual = filledAncestorSlots(tree, personId, depth);
  return expected === 0 ? 1 : actual / expected;
}

export interface ConfidenceLink {
  tree: FamilyTree;
  personA: UUID;
  personB: UUID;
  /** The relationship kind from classifyPair. */
  kind: RelKind;
  /** The closest shared ancestor governing the classification, or null when unrelated. */
  closest: CommonAncestor | null;
}

export interface ConfidenceResult {
  level: Confidence;
  /** Human-readable audit trail — surfaced in the data-quality panel (Phase 4, CP4.3). */
  reasons: string[];
}

/** A person has "sufficient" ancestry to trust a *negative* result when ≥1 grandparent is known. */
function sufficientAncestry(tree: FamilyTree, id: UUID): boolean {
  const g = grandparentsOf(tree, id);
  return !!(
    g.paternalGrandfather ||
    g.paternalGrandmother ||
    g.maternalGrandfather ||
    g.maternalGrandmother
  );
}

/** Missing dates / chronological contradictions along the first path from `fromId` up to `toId`. */
function pathDateStatus(
  tree: FamilyTree,
  fromId: UUID,
  toId: UUID,
): { missing: boolean; contradiction: boolean } {
  const paths = ancestorPaths(tree, fromId, toId);
  if (paths.length === 0) return { missing: true, contradiction: false };
  const path = paths[0]!; // path[i] is the child of path[i+1] (person → … → ancestor)
  let missing = false;
  let contradiction = false;
  for (const id of path) {
    if (tree.persons[id]?.birth?.date?.year === undefined) missing = true;
  }
  for (let i = 0; i + 1 < path.length; i++) {
    const childY = tree.persons[path[i]!]?.birth?.date?.year;
    const parentY = tree.persons[path[i + 1]!]?.birth?.date?.year;
    if (childY !== undefined && parentY !== undefined && parentY > childY)
      contradiction = true;
  }
  return { missing, contradiction };
}

/**
 * Rate a classification's confidence. Related links (cousins/siblings/avuncular) are confirmed
 * when both ancestry paths are fully dated and consistent, else likely. A no-relation result is
 * a *confident negative* ("confirmed") when both people have ≥2 generations of ancestry, else
 * "unknown" — the key distinction between "we checked and they're not related" and "we can't tell".
 */
export function classifyConfidence(link: ConfidenceLink): ConfidenceResult {
  const { tree, personA, personB, kind, closest } = link;
  const related =
    kind === "cousins" || kind === "siblings" || kind === "avuncular";

  if (!related || !closest) {
    const aSuff = sufficientAncestry(tree, personA);
    const bSuff = sufficientAncestry(tree, personB);
    if (aSuff && bSuff) {
      return {
        level: "confirmed",
        reasons: [
          "Both ancestries reach at least two generations; no shared ancestor found.",
        ],
      };
    }
    const reasons: string[] = [];
    if (!aSuff)
      reasons.push(
        "First person's ancestry is too shallow to rule a link in or out.",
      );
    if (!bSuff)
      reasons.push(
        "Second person's ancestry is too shallow to rule a link in or out.",
      );
    return { level: "unknown", reasons };
  }

  const a = pathDateStatus(tree, personA, closest.ancestorId);
  const b = pathDateStatus(tree, personB, closest.ancestorId);
  if (a.contradiction || b.contradiction) {
    return {
      level: "likely",
      reasons: [
        "Birth dates on the ancestry path are inconsistent (kept, but lowers confidence).",
      ],
    };
  }
  if (a.missing || b.missing) {
    return {
      level: "likely",
      reasons: ["Some ancestors on the path have no recorded dates."],
    };
  }
  return {
    level: "confirmed",
    reasons: ["Full ancestry path on both sides with consistent dates."],
  };
}
