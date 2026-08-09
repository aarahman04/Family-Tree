import type { FamilyTree } from "../models/types.js";
import { runIntegrityChecks } from "../validation/integrity.js";

export * from "./errors.js";
export * from "./operations.js";
export { isAncestor } from "./helpers.js";

/**
 * Wraps a pure edit operation with revalidation via the EXISTING validation engine
 * (validation/integrity.ts — not reimplemented here). Every edit "immediately triggers
 * validation" by construction: nothing produces a tree without this passing through it.
 */
export function applyEdit(tree: FamilyTree, mutate: (tree: FamilyTree) => FamilyTree): FamilyTree {
  const mutated = mutate(tree);
  const issues = runIntegrityChecks(mutated);
  return {
    ...mutated,
    validation: {
      validatedAt: new Date().toISOString(),
      issues,
      isValid: !issues.some((i) => i.severity === "error"),
    },
  };
}
