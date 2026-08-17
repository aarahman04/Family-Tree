import type { FamilyTree, UUID } from "../models/types.js";
import { DEPTH_CAP, ancestorPaths, computeAncestorMap } from "./ancestry.js";

/**
 * Kinship coefficient φ (S-2) — the rigorous genealogical measure of relatedness, complementing
 * the human-readable degree labels from `classify.ts`.
 *
 * φ(a,b) is the probability that a randomly drawn allele from `a` and one from `b` are identical
 * by descent. The path formula sums, over every common ancestor A and every pair of distinct
 * ancestry paths a←A and b←A:
 *
 *     φ = Σ (1/2)^(n₁ + n₂ + 1) × (1 + F_A)
 *
 * where n₁/n₂ are the path lengths in generations. It is a *sum over independent lines*, not a
 * single closest-ancestor lookup — full first cousins share two grandparents and score twice what
 * half first cousins do, and only summing gets that right.
 *
 * `F_A` (the ancestor's own inbreeding coefficient) is taken as 0 in this version, so the result
 * is a slight UNDER-estimate in a tree that already contains cousin marriages further up. That is
 * the honest direction to err, and the UI says so rather than presenting φ as exact.
 *
 * Path enumeration is capped by `ancestorPaths`' own `cap`, so pedigree collapse cannot cause
 * exponential blow-up — the same guard `classify.ts` relies on.
 */

/** How many distinct paths to enumerate per (person, ancestor) pair before giving up. */
const PATH_CAP = 24;

export function kinshipCoefficient(
  tree: FamilyTree,
  aId: UUID,
  bId: UUID,
): number {
  if (!tree.persons[aId] || !tree.persons[bId]) return 0;

  const aMap = computeAncestorMap(tree, aId);
  const bMap = computeAncestorMap(tree, bId);

  // A person is their own ancestor at distance 0 for this purpose: a parent-child pair shares the
  // parent, and without including self the parent would never appear as a "common" ancestor.
  const aSelf = new Map(aMap);
  if (!aSelf.has(aId)) aSelf.set(aId, { minDistance: 0 });
  const bSelf = new Map(bMap);
  if (!bSelf.has(bId)) bSelf.set(bId, { minDistance: 0 });

  let phi = 0;
  for (const ancestorId of aSelf.keys()) {
    if (!bSelf.has(ancestorId)) continue;
    // Every combination of one path down to `a` and one down to `b` is an independent line of
    // descent and contributes separately.
    const aPaths = pathLengths(tree, aId, ancestorId);
    const bPaths = pathLengths(tree, bId, ancestorId);
    for (const n1 of aPaths) {
      for (const n2 of bPaths) {
        phi += Math.pow(0.5, n1 + n2 + 1);
      }
    }
  }
  return phi;
}

/** Generation distances from `fromId` up to `ancestorId`, one entry per distinct path. */
function pathLengths(
  tree: FamilyTree,
  fromId: UUID,
  ancestorId: UUID,
): number[] {
  if (fromId === ancestorId) return [0];
  // `ancestorPaths` returns node lists inclusive of both ends, so a path of k generations has
  // k + 1 entries.
  return ancestorPaths(tree, fromId, ancestorId, DEPTH_CAP, PATH_CAP).map(
    (path) => path.length - 1,
  );
}
