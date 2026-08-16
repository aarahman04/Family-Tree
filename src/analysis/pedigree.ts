import type { FamilyTree, UUID } from "../models/types.js";
import {
  DEPTH_CAP,
  computeAncestorMap,
  filledAncestorSlots,
} from "./ancestry.js";

/**
 * Pedigree collapse (implex) scoring (spec §3C, plan §CP3.1). Measures how much of a person's
 * known ancestry re-converges on the same individuals — e.g. a cousin marriage makes a shared
 * great-grandparent occupy two ancestor slots instead of two different people occupying them.
 * See docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md, decision D-5.
 */

/**
 * `1 − distinctAncestors / filledSlots` up to `depth` generations. Both counts are taken over
 * KNOWN ancestry only (not the theoretical full binary pedigree), so missing records read as
 * "nothing to measure" (0), never as collapse — incompleteness and collapse are kept distinct.
 * 0 = every filled slot is a different person (no collapse); higher = more re-use. Undefined
 * ancestry (no parents recorded) scores 0, not NaN.
 */
export function pedigreeCollapseScore(
  tree: FamilyTree,
  personId: UUID,
  depth: number = DEPTH_CAP,
): number {
  const filled = filledAncestorSlots(tree, personId, depth);
  if (filled === 0) return 0;
  const distinct = computeAncestorMap(tree, personId, depth).size;
  return 1 - distinct / filled;
}

/** People with no recorded children anywhere in the tree — each lineage's terminal ("most
 * recent"/living-presumed) generation, used for the tree-level headline (D-5) without depending
 * on the date-based living heuristic (which lives in the web layer, not this framework-free
 * package). */
function terminalGenerationIds(tree: FamilyTree): UUID[] {
  const hasChildren = new Set<UUID>();
  for (const fam of Object.values(tree.families)) {
    if (fam.childrenIds.length === 0) continue;
    if (fam.husbandId) hasChildren.add(fam.husbandId);
    if (fam.wifeId) hasChildren.add(fam.wifeId);
  }
  return Object.keys(tree.persons).filter((id) => !hasChildren.has(id));
}

export interface PedigreeAnalysis {
  byPerson: Map<UUID, number>;
  /** Average per-person score over the terminal generation only (D-5) — reflects the
   * descendants who actually carry the collapse, not one arbitrary (e.g. root) person. */
  treeScore: number;
}

/** Whole-tree pedigree-collapse analysis. */
export function analyzePedigreeCollapse(
  tree: FamilyTree,
  depth: number = DEPTH_CAP,
): PedigreeAnalysis {
  const byPerson = new Map<UUID, number>();
  for (const id of Object.keys(tree.persons)) {
    byPerson.set(id, pedigreeCollapseScore(tree, id, depth));
  }
  const terminal = terminalGenerationIds(tree);
  const treeScore =
    terminal.length > 0
      ? terminal.reduce((sum, id) => sum + (byPerson.get(id) ?? 0), 0) /
        terminal.length
      : 0;
  return { byPerson, treeScore };
}
