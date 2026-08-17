import { useMemo } from "react";
import type { FamilyTree } from "../../../src/models/types.js";
import { type TreeAnalysis, analyzeTree } from "../../../src/analysis/index.js";

/**
 * Memoize the whole-tree relationship analysis on tree identity — the same recompute-on-edit
 * model as `computeTreeInsights` and the poster layout (see docs/editor-architecture.md
 * "Performance model"). Runs synchronously: `analyzeTree()` measures a median ~5ms on the real
 * 473-person sample (D-6 benchmark, CP2.6), well under one animation frame, so no Web Worker.
 */
export function useTreeAnalysis(tree: FamilyTree): TreeAnalysis {
  return useMemo(() => analyzeTree(tree), [tree]);
}
