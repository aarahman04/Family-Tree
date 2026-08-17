import type { FamilyTree, UUID } from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";

/**
 * Ancestor-graph primitives for the relationship-analysis engine (Insights v2). Pure and
 * framework-free — computed on demand from the canonical UUID model (never `ftzId`), so it can
 * never desync from the tree after an edit. See docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md.
 *
 * NB: gedcom/verify.ts keeps its own, intentionally-independent `ftzId`-based ancestor walk for
 * round-trip verification (decision D-11); the CP2.4 golden-agreement test keeps the two honest.
 * Do not merge them — the duplication is the cross-check.
 */

/** Maximum generations walked upward (decision D-1). Bounds cost and the "distant cousin" ceiling. */
export const DEPTH_CAP = 15;

export interface AncestorInfo {
  /** Fewest generational steps from the start person up to this ancestor (parent = 1). */
  minDistance: number;
}

export type AncestorMap = Map<UUID, AncestorInfo>;

/**
 * Every ancestor of `personId` mapped to its minimum generational distance. BFS by generation
 * (so the first time an ancestor is seen is its shortest distance), with a global visited set +
 * a self-exclusion guard so malformed cyclic data (CIRCULAR_ANCESTRY / SELF_PARENT) terminates
 * instead of looping. O(number of distinct ancestors).
 */
export function computeAncestorMap(
  tree: FamilyTree,
  personId: UUID,
  maxDepth: number = DEPTH_CAP,
): AncestorMap {
  const map: AncestorMap = new Map();
  const visited = new Set<UUID>([personId]);
  let frontier: UUID[] = [personId];
  for (let d = 1; d <= maxDepth && frontier.length > 0; d++) {
    const next: UUID[] = [];
    for (const id of frontier) {
      for (const parent of [fatherOf(tree, id), motherOf(tree, id)]) {
        // Skip missing parents and never record the start person as its own ancestor (self-cycle).
        if (!parent || !tree.persons[parent] || parent === personId) continue;
        if (!map.has(parent)) map.set(parent, { minDistance: d });
        if (!visited.has(parent)) {
          visited.add(parent);
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  return map;
}

/**
 * Count of filled ancestor-SLOT instances up to `depth` generations — every parent-link edge
 * actually recorded, counting a person once per slot they occupy. Unlike `computeAncestorMap`,
 * this does NOT dedupe by ancestor identity: when pedigree collapse makes one ancestor fill
 * multiple slots (e.g. a shared great-grandparent reached via two different grandparents), each
 * occurrence counts separately. That gap between this count and the number of DISTINCT ancestors
 * is exactly what `pedigree.ts`'s collapse score measures.
 */
export function filledAncestorSlots(
  tree: FamilyTree,
  personId: UUID,
  depth: number,
): number {
  let count = 0;
  let frontier: UUID[] = [personId];
  for (let k = 1; k <= depth && frontier.length > 0; k++) {
    const next: UUID[] = [];
    for (const id of frontier) {
      for (const parent of [fatherOf(tree, id), motherOf(tree, id)]) {
        if (parent && tree.persons[parent] && parent !== id) {
          count++;
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  return count;
}

export interface CommonAncestor {
  ancestorId: UUID;
  /** Distance from the first person to this shared ancestor. */
  distA: number;
  /** Distance from the second person to this shared ancestor. */
  distB: number;
}

/** Ancestors present in BOTH maps, with each side's minimum distance. */
export function findCommonAncestors(
  a: AncestorMap,
  b: AncestorMap,
): CommonAncestor[] {
  const out: CommonAncestor[] = [];
  // Iterate the smaller map for a cheaper intersection.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const swapped = small === b;
  for (const [id, info] of small) {
    const other = large.get(id);
    if (!other) continue;
    out.push(
      swapped
        ? { ancestorId: id, distA: other.minDistance, distB: info.minDistance }
        : { ancestorId: id, distA: info.minDistance, distB: other.minDistance },
    );
  }
  return out;
}

/**
 * True when the two people are the same person, or one is an ancestor of the other — i.e. a
 * direct parent-child / ancestor-descendant match, which the spec (§9) excludes from "cousin"
 * classification. `aMap`/`bMap` are the two people's ancestor maps.
 */
export function isDirectLineage(
  aId: UUID,
  bId: UUID,
  aMap: AncestorMap,
  bMap: AncestorMap,
): boolean {
  return aId === bId || aMap.has(bId) || bMap.has(aId);
}

/**
 * Up to `cap` distinct ancestry paths from `fromId` up to `toId` (inclusive of both ends),
 * for the explanation UX ("Person → Parent → … → Common Ancestor"). Per-path cycle guard;
 * capped so pedigree collapse can't cause exponential enumeration.
 */
export function ancestorPaths(
  tree: FamilyTree,
  fromId: UUID,
  toId: UUID,
  maxDepth: number = DEPTH_CAP,
  cap = 4,
): UUID[][] {
  const results: UUID[][] = [];
  const path: UUID[] = [];
  function dfs(id: UUID, depth: number): void {
    if (results.length >= cap) return;
    path.push(id);
    if (id === toId && path.length > 1) {
      results.push([...path]);
      path.pop();
      return;
    }
    if (depth < maxDepth) {
      for (const parent of [fatherOf(tree, id), motherOf(tree, id)]) {
        if (parent && tree.persons[parent] && !path.includes(parent))
          dfs(parent, depth + 1);
        if (results.length >= cap) break;
      }
    }
    path.pop();
  }
  dfs(fromId, 0);
  return results;
}
