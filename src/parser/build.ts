import type { Family, Person, UUID, ValidationIssue } from "../models/types.js";
import { generateId } from "../lib/uuid.js";
import type { ParsedFamilyRow, ParsedPersonRow } from "./rows.js";

export interface BuildResult {
  persons: Record<UUID, Person>;
  families: Record<UUID, Family>;
  issues: ValidationIssue[];
}

/**
 * Assembles the internal model from parsed rows: assigns UUIDs, resolves FTZ-integer
 * references to UUIDs, and wires up famsIds/childrenIds.
 *
 * Duplicate-ID policy (see docs/parser-spec.md): if the same ftzId appears on more than one
 * row, every row still becomes its own Person/Family object (zero data loss), but only the
 * FIRST occurrence is wired into the graph as the canonical target for other records'
 * references — later occurrences are flagged via DUPLICATE_PERSON_ID / DUPLICATE_FAMILY_ID
 * and left otherwise disconnected, since we cannot know which physical row a reference
 * "meant" once the ID space itself is ambiguous.
 */
export function buildTree(
  personRows: ParsedPersonRow[],
  familyRows: ParsedFamilyRow[]
): BuildResult {
  const issues: ValidationIssue[] = [];

  const persons: Record<UUID, Person> = {};
  const families: Record<UUID, Family> = {};

  const personFtzIdToUuid = new Map<number, UUID>();
  const personFtzIdOccurrences = new Map<number, UUID[]>();
  const personBirthOrder = new Map<UUID, number>();
  const personFamcFtzId = new Map<UUID, number>();

  for (const row of personRows) {
    const uuid = generateId();
    persons[uuid] = {
      id: uuid,
      ftzId: row.ftzId,
      name: row.name,
      nickname: row.nickname,
      gender: row.gender,
      birth: row.birth,
      death: row.death,
      notes: row.notes,
      media: row.media,
      famsIds: [],
      layout: { x: row.x, y: row.y },
      raw: row.raw,
    };
    personBirthOrder.set(uuid, row.birthOrder);
    personFamcFtzId.set(uuid, row.famcFtzId);

    if (!personFtzIdToUuid.has(row.ftzId)) {
      personFtzIdToUuid.set(row.ftzId, uuid);
    }
    const occurrences = personFtzIdOccurrences.get(row.ftzId) ?? [];
    occurrences.push(uuid);
    personFtzIdOccurrences.set(row.ftzId, occurrences);
  }

  for (const [ftzId, uuids] of personFtzIdOccurrences) {
    if (uuids.length > 1) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_PERSON_ID",
        message: `Person ftzId ${ftzId} appears on ${uuids.length} rows. The first occurrence was kept as canonical for reference resolution; all rows were preserved as separate records.`,
        relatedIds: uuids,
      });
    }
  }

  const familyFtzIdToUuid = new Map<number, UUID>();
  const familyFtzIdOccurrences = new Map<number, UUID[]>();
  const familySpouseFtzIds = new Map<UUID, { husbandFtzId: number; wifeFtzId: number }>();

  for (const row of familyRows) {
    const uuid = generateId();
    families[uuid] = {
      id: uuid,
      ftzId: row.ftzId,
      childrenIds: [],
      layout: { x: row.x, y: row.y },
      raw: row.raw,
    };
    familySpouseFtzIds.set(uuid, { husbandFtzId: row.husbandFtzId, wifeFtzId: row.wifeFtzId });

    if (!familyFtzIdToUuid.has(row.ftzId)) {
      familyFtzIdToUuid.set(row.ftzId, uuid);
    }
    const occurrences = familyFtzIdOccurrences.get(row.ftzId) ?? [];
    occurrences.push(uuid);
    familyFtzIdOccurrences.set(row.ftzId, occurrences);
  }

  for (const [ftzId, uuids] of familyFtzIdOccurrences) {
    if (uuids.length > 1) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_FAMILY_ID",
        message: `Family ftzId ${ftzId} appears on ${uuids.length} rows. The first occurrence was kept as canonical for reference resolution; all rows were preserved as separate records.`,
        relatedIds: uuids,
      });
    }
  }

  // ID namespace collision: same integer used as both a Person ftzId and a Family ftzId.
  for (const [ftzId, personUuid] of personFtzIdToUuid) {
    const familyUuid = familyFtzIdToUuid.get(ftzId);
    if (familyUuid !== undefined) {
      issues.push({
        severity: "warning",
        code: "ID_NAMESPACE_COLLISION",
        message: `ftzId ${ftzId} is used by both a Person and a Family record.`,
        relatedIds: [personUuid, familyUuid],
      });
    }
  }

  // Resolve Person.famcId
  for (const [uuid, famcFtzId] of personFamcFtzId) {
    if (famcFtzId === 0) continue; // legitimate "no recorded parent family" sentinel
    const familyUuid = familyFtzIdToUuid.get(famcFtzId);
    if (familyUuid === undefined) {
      issues.push({
        severity: "error",
        code: "BROKEN_FAMC",
        message: `Person references parent family ftzId ${famcFtzId}, which does not exist.`,
        relatedIds: [uuid],
      });
      continue;
    }
    const person = persons[uuid];
    if (person) person.famcId = familyUuid;
  }

  // Resolve Family.husbandId / wifeId, and back-fill Person.famsIds
  for (const [uuid, family] of Object.entries(families)) {
    const { husbandFtzId, wifeFtzId } = familySpouseFtzIds.get(uuid) ?? {
      husbandFtzId: 0,
      wifeFtzId: 0,
    };

    if (husbandFtzId !== 0) {
      const husbandUuid = personFtzIdToUuid.get(husbandFtzId);
      if (husbandUuid === undefined) {
        issues.push({
          severity: "error",
          code: "BROKEN_SPOUSE_REF",
          message: `Family references husband ftzId ${husbandFtzId}, which does not exist.`,
          relatedIds: [uuid],
        });
      } else {
        family.husbandId = husbandUuid;
        persons[husbandUuid]?.famsIds.push(uuid);
      }
    }

    if (wifeFtzId !== 0) {
      const wifeUuid = personFtzIdToUuid.get(wifeFtzId);
      if (wifeUuid === undefined) {
        issues.push({
          severity: "error",
          code: "BROKEN_SPOUSE_REF",
          message: `Family references wife ftzId ${wifeFtzId}, which does not exist.`,
          relatedIds: [uuid],
        });
      } else {
        family.wifeId = wifeUuid;
        persons[wifeUuid]?.famsIds.push(uuid);
      }
    }
  }

  // childrenIds, ordered by birth order
  const childrenByFamily = new Map<UUID, UUID[]>();
  for (const [uuid, person] of Object.entries(persons)) {
    if (!person.famcId) continue;
    const list = childrenByFamily.get(person.famcId) ?? [];
    list.push(uuid);
    childrenByFamily.set(person.famcId, list);
  }
  for (const [familyUuid, childUuids] of childrenByFamily) {
    childUuids.sort(
      (a, b) => (personBirthOrder.get(a) ?? 0) - (personBirthOrder.get(b) ?? 0)
    );
    const family = families[familyUuid];
    if (family) family.childrenIds = childUuids;
  }

  return { persons, families, issues };
}
