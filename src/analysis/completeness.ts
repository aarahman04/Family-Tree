import type { FamilyTree, UUID } from "../models/types.js";
import { DEPTH_CAP } from "./ancestry.js";
import { ancestryCompleteness } from "./confidence.js";

/**
 * Per-person ancestry-completeness scores (spec Phase 4, plan §CP4.2) — a direct reuse of
 * `ancestryCompleteness` (CP2.3) over every person in the tree. Pure and framework-free.
 */

export interface CompletenessAnalysis {
  byPerson: Map<UUID, number>;
  /** Unweighted average across every person in the tree. */
  treeAverage: number;
}

export function analyzeCompleteness(
  tree: FamilyTree,
  depth: number = DEPTH_CAP,
): CompletenessAnalysis {
  const byPerson = new Map<UUID, number>();
  for (const id of Object.keys(tree.persons)) {
    byPerson.set(id, ancestryCompleteness(tree, id, depth));
  }
  const values = [...byPerson.values()];
  const treeAverage =
    values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  return { byPerson, treeAverage };
}
