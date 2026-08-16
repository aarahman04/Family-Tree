import type { DatePart, FamilyTree, Gender } from "../../../src/models/types.js";
import { createPerson, updatePersonFields } from "../../../src/editor/operations.js";
import { runIntegrityChecks } from "../../../src/validation/integrity.js";

export interface NewTreeInput {
  name: string;
  description?: string;
  person: {
    firstName: string;
    lastName: string;
    gender: Gender;
    birthDate?: string; // YYYY-MM-DD (from <input type="date">)
    deathDate?: string;
    living: boolean;
    notes?: string;
  };
}

/** Parses an <input type="date"> value ("YYYY-MM-DD") into a DatePart, or undefined. */
export function parseDateInput(value?: string): DatePart | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Builds a brand-new manual FamilyTree with a single root person from the wizard inputs.
 * Produces exactly the same model shape as an FTZ/GEDCOM import (one root person, populated
 * metadata, a validated state), so everything downstream — editor, poster, export — treats it
 * identically. No special code path exists after this.
 */
export function buildNewTree(input: NewTreeInput): FamilyTree {
  const now = new Date().toISOString();
  const empty: FamilyTree = {
    metadata: {
      sourceFormat: "manual",
      importedAt: now,
      createdAt: now,
      updatedAt: now,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
    },
    persons: {},
    families: {},
    validation: { validatedAt: "", issues: [], isValid: true },
  };

  const fullName = [input.person.firstName, input.person.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const { tree, personId } = createPerson(empty, { name: fullName, gender: input.person.gender });

  const notes = input.person.notes?.trim();
  let next = updatePersonFields(tree, personId, {
    birth: parseDateInput(input.person.birthDate) ?? null,
    death: input.person.living ? null : (parseDateInput(input.person.deathDate) ?? null),
    notes: notes ? [notes] : [],
  });

  const issues = runIntegrityChecks(next);
  next = {
    ...next,
    validation: {
      validatedAt: new Date().toISOString(),
      issues,
      isValid: !issues.some((i) => i.severity === "error"),
    },
  };
  return next;
}
