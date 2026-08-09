import type { FamilyTree, ValidationIssue } from "../models/types.js";

/**
 * 0-based indices into Person.raw / Family.raw that have no GEDCOM mapping today
 * (docs/gedcom-mapping.md "Fields that cannot be cleanly mapped"). Layout coordinates
 * (indices 6,7 on both) are deliberately excluded here — they're populated on every
 * record and their omission from GEDCOM is an intentional, documented design choice
 * (see docs/gedcom-exporter.md), not an unmapped-data risk worth warning about on
 * every single export.
 */
const UNMAPPED_PERSON_INDICES = [1, 4, 5, 8, 9, 10, 11, 14, 15, 26, 27];
const UNMAPPED_FAMILY_INDICES = [1, 3, 5, 8, 9, 10, 11];

function isPopulated(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0";
}

/**
 * Scans every record's raw fields for the columns we have no GEDCOM mapping for, and
 * warns (does not block export) whenever one is actually populated — turning "we hope
 * nothing's there" into "we verified nothing's there", per docs/gedcom-mapping.md's
 * zero-unexpected-data-loss recommendation.
 */
export function findUnmappedPopulatedFields(tree: FamilyTree): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const person of Object.values(tree.persons)) {
    if (!person.raw) continue;
    for (const idx of UNMAPPED_PERSON_INDICES) {
      const value = person.raw[idx];
      if (isPopulated(value)) {
        issues.push({
          severity: "warning",
          code: "UNMAPPED_FIELD_POPULATED",
          message: `Person (ftzId ${person.ftzId}) has a value in column ${
            idx + 1
          } (no GEDCOM mapping exists for this column): "${value}". Not exported.`,
          relatedIds: [person.id],
        });
      }
    }
  }

  for (const family of Object.values(tree.families)) {
    if (!family.raw) continue;
    for (const idx of UNMAPPED_FAMILY_INDICES) {
      const value = family.raw[idx];
      if (isPopulated(value)) {
        issues.push({
          severity: "warning",
          code: "UNMAPPED_FIELD_POPULATED",
          message: `Family (ftzId ${family.ftzId}) has a value in column ${
            idx + 1
          } (no GEDCOM mapping exists for this column): "${value}". Not exported.`,
          relatedIds: [family.id],
        });
      }
    }
  }

  return issues;
}
