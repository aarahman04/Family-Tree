import type { FamilyTree, ValidationIssue } from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";

const MAX_ANCESTRY_WALK = 2000;

/**
 * Graph-level integrity checks. Pure functions over a fully-built FamilyTree — reusable
 * by the parser (at import time) and by the future editor (after any edit), per
 * docs/data-model.md. Import-time-only checks (duplicate ftzIds, broken ftzId references,
 * ftzId namespace collisions) live in parser/build.ts instead, since they depend on raw
 * FTZ integer IDs that don't exist for records created after import.
 */
export function runIntegrityChecks(tree: FamilyTree): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const family of Object.values(tree.families)) {
    // Self-marriage
    if (family.husbandId && family.wifeId && family.husbandId === family.wifeId) {
      issues.push({
        severity: "error",
        code: "SELF_MARRIAGE",
        message: `Family lists the same person as both husband and wife.`,
        relatedIds: [family.id, family.husbandId],
      });
    }

    // Gender/role mismatch
    if (family.husbandId) {
      const husband = tree.persons[family.husbandId];
      if (husband && husband.gender === "female") {
        issues.push({
          severity: "warning",
          code: "GENDER_ROLE_MISMATCH",
          message: `Person recorded as gender "female" occupies the husband role in a family.`,
          relatedIds: [family.id, husband.id],
        });
      }
    }
    if (family.wifeId) {
      const wife = tree.persons[family.wifeId];
      if (wife && wife.gender === "male") {
        issues.push({
          severity: "warning",
          code: "GENDER_ROLE_MISMATCH",
          message: `Person recorded as gender "male" occupies the wife role in a family.`,
          relatedIds: [family.id, wife.id],
        });
      }
    }

    // Family missing parent. Checked directly against husbandId/wifeId (not the original
    // `raw` import snapshot) so this stays correct after an edit clears a parent — `raw`
    // only reflects the tree as it was AT IMPORT TIME and never updates. A parse-time-only
    // broken reference (nonzero ftzId that didn't resolve) already gets its own, more
    // specific BROKEN_SPOUSE_REF error from build.ts; this may also fire alongside it for
    // that rare case, which is harmless redundancy, not incorrect — the family really does
    // have no valid parent in that slot either way.
    const husbandMissing = family.husbandId === undefined;
    const wifeMissing = family.wifeId === undefined;
    if (husbandMissing) {
      issues.push({
        severity: "warning",
        code: "FAMILY_MISSING_PARENT",
        message: `Family has no recorded husband/father.`,
        relatedIds: [family.id],
      });
    }
    if (wifeMissing) {
      issues.push({
        severity: "warning",
        code: "FAMILY_MISSING_PARENT",
        message: `Family has no recorded wife/mother.`,
        relatedIds: [family.id],
      });
    }
  }

  // Self-parent: person appears as husband/wife of their own FAMC family.
  for (const person of Object.values(tree.persons)) {
    if (!person.famcId) continue;
    const family = tree.families[person.famcId];
    if (!family) continue;
    if (family.husbandId === person.id || family.wifeId === person.id) {
      issues.push({
        severity: "error",
        code: "SELF_PARENT",
        message: `Person is listed as a parent in their own family-as-child record.`,
        relatedIds: [person.id, family.id],
      });
    }
  }

  // Circular ancestry: bounded walk up father/mother chains from every person.
  for (const person of Object.values(tree.persons)) {
    for (const parentFn of [fatherOf, motherOf]) {
      const chain = new Set<string>([person.id]);
      let current = parentFn(tree, person.id);
      let steps = 0;
      while (current !== undefined && steps < MAX_ANCESTRY_WALK) {
        if (chain.has(current)) {
          issues.push({
            severity: "error",
            code: "CIRCULAR_ANCESTRY",
            message: `Circular ancestry detected: person is their own ancestor.`,
            relatedIds: [person.id, current],
          });
          break;
        }
        chain.add(current);
        current = parentFn(tree, current);
        steps += 1;
      }
    }
  }

  return issues;
}
