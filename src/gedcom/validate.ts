import type { FamilyTree, ValidationIssue } from "../models/types.js";

/**
 * Structural pre-export validation: every reference the exporter is about to turn into a
 * GEDCOM cross-reference pointer must resolve to a record that actually exists in the tree.
 *
 * Under normal operation (a tree produced by parser/build.ts) this can never fail — the
 * parser never stores a reference that doesn't resolve, it leaves it undefined instead.
 * This check exists as a defensive backstop against a hand-edited or programmatically
 * constructed FamilyTree that violates that invariant (see the "broken internal model"
 * test case) — export must refuse rather than emit a GEDCOM file with dangling xrefs.
 */
export function validateForExport(tree: FamilyTree): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const person of Object.values(tree.persons)) {
    if (person.famcId && !tree.families[person.famcId]) {
      issues.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Person.famcId references a family that does not exist in the tree.`,
        relatedIds: [person.id],
      });
    }
    for (const famId of person.famsIds) {
      if (!tree.families[famId]) {
        issues.push({
          severity: "error",
          code: "DANGLING_XREF",
          message: `Person.famsIds references a family that does not exist in the tree.`,
          relatedIds: [person.id],
        });
      }
    }
  }

  for (const family of Object.values(tree.families)) {
    if (family.husbandId && !tree.persons[family.husbandId]) {
      issues.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Family.husbandId references a person that does not exist in the tree.`,
        relatedIds: [family.id],
      });
    }
    if (family.wifeId && !tree.persons[family.wifeId]) {
      issues.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Family.wifeId references a person that does not exist in the tree.`,
        relatedIds: [family.id],
      });
    }
    for (const childId of family.childrenIds) {
      if (!tree.persons[childId]) {
        issues.push({
          severity: "error",
          code: "DANGLING_XREF",
          message: `Family.childrenIds references a person that does not exist in the tree.`,
          relatedIds: [family.id],
        });
      }
    }
  }

  return issues;
}
