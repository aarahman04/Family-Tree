import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../src/models/types.js";
import { parseNodeFtt } from "../src/parser/index.js";
import { analyzeQuality } from "../src/analysis/quality.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * Father/Child share family 10, which deliberately records only the husband (Father) --
 * exercises missing-parent (Child) and missing-spouse (Father) from the SAME family record.
 * DupA/DupB/DupC all share the name "Jane Doe" but only DupA+DupB also share a birth year, so
 * they alone should be a duplicate SUSPECT pair while all three form a duplicate-NAME group.
 * NoDate has no birth or death recorded at all. X/Y/Complete is a fully-recorded family (both
 * parents present) proving root ancestors (X, Y — no famc at all) and complete records aren't
 * false-flagged.
 */
function tree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Father", gender: 1, birthYear: 1950 }),
      personRow({ id: 2, name: "Child", famc: 10, birthYear: 1975 }),
      personRow({ id: 3, name: "Jane Doe", gender: 2, birthYear: 1960 }),
      personRow({ id: 4, name: "Jane Doe", gender: 2, birthYear: 1960 }),
      personRow({ id: 5, name: "Jane Doe", gender: 2, birthYear: 1975 }),
      personRow({ id: 6, name: "NoDate", gender: 1 }),
      personRow({ id: 7, name: "X", gender: 1, birthYear: 1900 }),
      personRow({ id: 8, name: "Y", gender: 2, birthYear: 1905 }),
      personRow({ id: 9, name: "Complete", famc: 20, birthYear: 1930 }),
    ],
    [familyRow({ id: 10, husband: 1 }), familyRow({ id: 20, husband: 7, wife: 8 })],
  );
  return parseNodeFtt(text).tree;
}

function idOf(t: ReturnType<typeof tree>, name: string): string {
  return Object.values(t.persons).find((p) => p.name === name)!.id;
}

function person(id: UUID, name: string, opts: Partial<Person> = {}): Person {
  return { id, name, gender: "unknown", famsIds: [], notes: [], media: [], ...opts };
}

function manualTree(persons: Person[], families: Family[]): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "2026-08-17T00:00:00Z" },
    persons: Object.fromEntries(persons.map((p) => [p.id, p])),
    families: Object.fromEntries(families.map((f) => [f.id, f])),
    validation: {
      validatedAt: "2026-08-17T00:00:00Z",
      issues: [
        {
          severity: "error",
          code: "CIRCULAR_ANCESTRY",
          message: "Circular ancestry detected: person is their own ancestor.",
          relatedIds: ["a", "b"],
        },
      ],
      isValid: false,
    },
  };
}

describe("analysis/quality — analyzeQuality", () => {
  it("flags a same-name same-birth-year pair as a duplicate suspect, not the third same-name-only person", () => {
    const t = tree();
    const a = analyzeQuality(t);
    const born1960 = Object.values(t.persons)
      .filter((p) => p.name === "Jane Doe" && p.birth?.date?.year === 1960)
      .map((p) => p.id);
    expect(born1960).toHaveLength(2); // DupA + DupB
    expect(a.duplicateSuspects).toHaveLength(1);
    expect(new Set(a.duplicateSuspects[0]!.personIds)).toEqual(new Set(born1960));
  });

  it("groups all same-normalized-name people into one duplicate-name group regardless of birth year", () => {
    const t = tree();
    const a = analyzeQuality(t);
    const janeDoes = Object.values(t.persons)
      .filter((p) => p.name === "Jane Doe")
      .map((p) => p.id);
    expect(a.duplicateNameGroups).toHaveLength(1);
    expect(new Set(a.duplicateNameGroups[0]!.personIds)).toEqual(new Set(janeDoes));
  });

  it("flags missing-spouse on the recorded parent and missing-parent on the child of a one-parent family, without flagging root ancestors", () => {
    const t = tree();
    const a = analyzeQuality(t);
    const fatherRecord = a.incompleteRecords.find((r) => r.personId === idOf(t, "Father"));
    const childRecord = a.incompleteRecords.find((r) => r.personId === idOf(t, "Child"));
    expect(fatherRecord).toEqual({
      personId: idOf(t, "Father"),
      missingParent: false,
      missingSpouse: true,
      missingDate: false,
    });
    expect(childRecord).toEqual({
      personId: idOf(t, "Child"),
      missingParent: true,
      missingSpouse: false,
      missingDate: false,
    });
    // X and Y have no famc at all (root ancestors) — must NOT be flagged missingParent.
    expect(a.incompleteRecords.find((r) => r.personId === idOf(t, "X"))).toBeUndefined();
    expect(a.incompleteRecords.find((r) => r.personId === idOf(t, "Y"))).toBeUndefined();
    // Complete has both parents recorded — must NOT be flagged.
    expect(a.incompleteRecords.find((r) => r.personId === idOf(t, "Complete"))).toBeUndefined();
  });

  it("flags a person with neither birth nor death date as missingDate", () => {
    const t = tree();
    const a = analyzeQuality(t);
    const record = a.incompleteRecords.find((r) => r.personId === idOf(t, "NoDate"));
    expect(record).toEqual({
      personId: idOf(t, "NoDate"),
      missingParent: false,
      missingSpouse: false,
      missingDate: true,
    });
  });

  it("treats people with no family links at all as isolated records", () => {
    const t = tree();
    const a = analyzeQuality(t);
    const expected = new Set([
      idOf(t, "NoDate"),
      ...Object.values(t.persons).filter((p) => p.name === "Jane Doe").map((p) => p.id),
    ]);
    expect(new Set(a.isolatedRecordIds)).toEqual(expected);
    // Father/Child/X/Y/Complete are all connected via family 10 or 20.
    expect(a.isolatedRecordIds).not.toContain(idOf(t, "Father"));
    expect(a.isolatedRecordIds).not.toContain(idOf(t, "Complete"));
  });

  it("returns no suspicious loops on a clean tree", () => {
    const t = tree();
    const a = analyzeQuality(t);
    expect(a.suspiciousLoops).toHaveLength(0);
  });

  it("surfaces CIRCULAR_ANCESTRY validation issues as suspicious loops (reused, not re-detected)", () => {
    const t = manualTree(
      [person("a", "A", { famcId: "fam-x" }), person("b", "B")],
      [],
    );
    const a = analyzeQuality(t);
    expect(a.suspiciousLoops).toEqual([{ personIds: ["a", "b"] }]);
  });

  it("returns empty results for a tree with no people", () => {
    const t = parseNodeFtt(buildNodeFtt([], [])).tree;
    const a = analyzeQuality(t);
    expect(a.duplicateSuspects).toHaveLength(0);
    expect(a.duplicateNameGroups).toHaveLength(0);
    expect(a.incompleteRecords).toHaveLength(0);
    expect(a.isolatedRecordIds).toHaveLength(0);
    expect(a.suspiciousLoops).toHaveLength(0);
  });
});
