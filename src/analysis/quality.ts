import type { FamilyTree, UUID } from "../models/types.js";

/**
 * Data-quality / trust-layer soft insights (spec Phase 4, plan §CP4.1). These are heuristic
 * "worth a look" signals surfaced separately from hard `ValidationIssue`s (which mean the data
 * is structurally broken) — a duplicate-name warning doesn't block export the way a broken
 * cross-reference does. Pure and framework-free.
 */

export interface DuplicateSuspect {
  /** Two people sharing both a normalized name and a recorded birth year. */
  personIds: [UUID, UUID];
}

export interface DuplicateNameGroup {
  /** Normalized (trimmed, lowercased, whitespace-collapsed) name. */
  name: string;
  personIds: UUID[];
}

export interface IncompleteRecord {
  personId: UUID;
  /** The person's family-of-birth record exists but has only one of husbandId/wifeId set. */
  missingParent: boolean;
  /** A family the person is a spouse in has children but only one of husbandId/wifeId set. */
  missingSpouse: boolean;
  /** Neither a birth year nor a death year is recorded. */
  missingDate: boolean;
}

export interface SuspiciousLoop {
  personIds: UUID[];
}

export interface QualityAnalysis {
  duplicateSuspects: DuplicateSuspect[];
  duplicateNameGroups: DuplicateNameGroup[];
  /** Only people with at least one flag set. */
  incompleteRecords: IncompleteRecord[];
  /** People with no family links at all (not a child, spouse, or parent in any recorded family). */
  isolatedRecordIds: UUID[];
  /** Reused from `tree.validation.issues` (CIRCULAR_ANCESTRY) — not re-detected here. */
  suspiciousLoops: SuspiciousLoop[];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function findDuplicates(tree: FamilyTree): {
  duplicateSuspects: DuplicateSuspect[];
  duplicateNameGroups: DuplicateNameGroup[];
} {
  const byName = new Map<string, UUID[]>();
  const byNameAndYear = new Map<string, Map<number, UUID[]>>();
  for (const p of Object.values(tree.persons)) {
    const norm = normalizeName(p.name);
    if (!norm) continue;
    if (!byName.has(norm)) byName.set(norm, []);
    byName.get(norm)!.push(p.id);

    const year = p.birth?.date?.year;
    if (year !== undefined) {
      if (!byNameAndYear.has(norm)) byNameAndYear.set(norm, new Map());
      const byYear = byNameAndYear.get(norm)!;
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(p.id);
    }
  }

  const duplicateNameGroups: DuplicateNameGroup[] = [];
  for (const [name, personIds] of byName) {
    if (personIds.length > 1) duplicateNameGroups.push({ name, personIds });
  }

  const duplicateSuspects: DuplicateSuspect[] = [];
  for (const byYear of byNameAndYear.values()) {
    for (const ids of byYear.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          duplicateSuspects.push({ personIds: [ids[i]!, ids[j]!] });
        }
      }
    }
  }

  return { duplicateSuspects, duplicateNameGroups };
}

function findIncompleteRecords(tree: FamilyTree): IncompleteRecord[] {
  const result: IncompleteRecord[] = [];
  for (const p of Object.values(tree.persons)) {
    const famc = p.famcId ? tree.families[p.famcId] : undefined;
    const missingParent = famc
      ? (famc.husbandId ? 1 : 0) + (famc.wifeId ? 1 : 0) === 1
      : false;

    let missingSpouse = false;
    for (const famId of p.famsIds) {
      const fam = tree.families[famId];
      if (!fam) continue;
      const isSpouse = fam.husbandId === p.id || fam.wifeId === p.id;
      if (isSpouse && fam.childrenIds.length > 0) {
        const otherId = fam.husbandId === p.id ? fam.wifeId : fam.husbandId;
        if (!otherId) missingSpouse = true;
      }
    }

    const missingDate =
      p.birth?.date?.year === undefined && p.death?.date?.year === undefined;

    if (missingParent || missingSpouse || missingDate) {
      result.push({ personId: p.id, missingParent, missingSpouse, missingDate });
    }
  }
  return result;
}

/** People who appear as neither a child, spouse, nor parent in any recorded family. */
function findIsolatedRecordIds(tree: FamilyTree): UUID[] {
  const linked = new Set<UUID>();
  for (const fam of Object.values(tree.families)) {
    if (fam.husbandId) linked.add(fam.husbandId);
    if (fam.wifeId) linked.add(fam.wifeId);
    for (const childId of fam.childrenIds) linked.add(childId);
  }
  return Object.keys(tree.persons).filter((id) => !linked.has(id));
}

function findSuspiciousLoops(tree: FamilyTree): SuspiciousLoop[] {
  return tree.validation.issues
    .filter((issue) => issue.code === "CIRCULAR_ANCESTRY")
    .map((issue) => ({ personIds: issue.relatedIds }));
}

/** Whole-tree data-quality analysis. */
export function analyzeQuality(tree: FamilyTree): QualityAnalysis {
  const { duplicateSuspects, duplicateNameGroups } = findDuplicates(tree);
  return {
    duplicateSuspects,
    duplicateNameGroups,
    incompleteRecords: findIncompleteRecords(tree),
    isolatedRecordIds: findIsolatedRecordIds(tree),
    suspiciousLoops: findSuspiciousLoops(tree),
  };
}
