import type { Event, Gender, MediaRef, NoteEntry, ValidationIssue } from "../models/types.js";
import { generateId } from "../lib/uuid.js";
import { FAMILY_FIELD_COUNT, PERSON_FIELD_COUNT } from "./tokenizer.js";

function toInt(raw: string | undefined): { value: number; wasInvalid: boolean } {
  if (raw === undefined || raw === "") return { value: 0, wasInvalid: false };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { value: 0, wasInvalid: true };
  return { value: n, wasInvalid: false };
}

function toFloat(raw: string | undefined): { value: number; wasInvalid: boolean } {
  if (raw === undefined || raw === "") return { value: 0, wasInvalid: false };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: 0, wasInvalid: true };
  return { value: n, wasInvalid: false };
}

/** Pads a row with "" up to `length`, never truncates here — overflow is handled by the caller. */
function padRow(fields: string[], length: number): string[] {
  if (fields.length >= length) return fields;
  return [...fields, ...Array(length - fields.length).fill("")];
}

export interface ParsedPersonRow {
  ftzId: number;
  famcFtzId: number;
  birthOrder: number;
  x: number;
  y: number;
  nickname?: string;
  name: string;
  gender: Gender;
  birth?: Event;
  death?: Event;
  notes: NoteEntry[];
  media: MediaRef[];
  raw: string[];
}

function genderFromCode(code: number): Gender {
  if (code === 1) return "male";
  if (code === 2) return "female";
  return "unknown";
}

/**
 * Parses a single Person row (already tab-split). Never throws — malformed rows are
 * padded/coerced defensively and reported via the returned issues array.
 * Column layout: docs/ftz-format-spec.md "Person record (29 fields)".
 */
export function parsePersonRow(
  fields: string[],
  rowIndex: number
): { row: ParsedPersonRow; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  let working = fields;

  if (fields.length < PERSON_FIELD_COUNT) {
    issues.push({
      severity: "warning",
      code: "MALFORMED_ROW",
      message: `Person row ${rowIndex} has ${fields.length} fields, expected ${PERSON_FIELD_COUNT}. Missing trailing fields were padded as empty/zero.`,
      relatedIds: [],
    });
    working = padRow(fields, PERSON_FIELD_COUNT);
  } else if (fields.length > PERSON_FIELD_COUNT) {
    issues.push({
      severity: "info",
      code: "EXTRA_FIELDS_PRESERVED",
      message: `Person row ${rowIndex} has ${fields.length} fields, expected ${PERSON_FIELD_COUNT}. Extra trailing field(s) were preserved in raw but are not yet interpreted.`,
      relatedIds: [],
    });
  }

  const id = toInt(working[0]);
  const famc = toInt(working[2]);
  const birthOrder = toInt(working[3]);
  const x = toFloat(working[6]);
  const y = toFloat(working[7]);
  const nickname = working[12];
  const name = working[13] ?? "";
  const flagsA = toInt(working[16]);
  const birthYear = toInt(working[17]);
  const birthMonth = toInt(working[18]);
  const birthDay = toInt(working[19]);
  const flagsB = toInt(working[20]);
  const deathYear = toInt(working[21]);
  const deathMonth = toInt(working[22]);
  const deathDay = toInt(working[23]);
  const genderCode = toInt(working[24]);
  const eventNote = working[25];
  const generalNote = working[28];

  for (const [label, parsed] of [
    ["id", id],
    ["famc", famc],
    ["birthOrder", birthOrder],
    ["x", x],
    ["y", y],
    ["flagsA", flagsA],
    ["birthYear", birthYear],
    ["birthMonth", birthMonth],
    ["birthDay", birthDay],
    ["flagsB", flagsB],
    ["deathYear", deathYear],
    ["deathMonth", deathMonth],
    ["deathDay", deathDay],
    ["gender", genderCode],
  ] as const) {
    if (parsed.wasInvalid) {
      issues.push({
        severity: "warning",
        code: "MALFORMED_ROW",
        message: `Person row ${rowIndex}: field "${label}" was not numeric and was coerced to 0.`,
        relatedIds: [],
      });
    }
  }

  const notes: NoteEntry[] = [];
  if (generalNote) {
    notes.push({ id: generateId(), text: generalNote, category: "general" });
  }
  if (eventNote) {
    notes.push({ id: generateId(), text: eventNote, category: "event" });
  }

  const birth: Event | undefined =
    birthYear.value || birthMonth.value || birthDay.value
      ? {
          id: generateId(),
          type: "birth",
          date: {
            year: birthYear.value || undefined,
            month: birthMonth.value || undefined,
            day: birthDay.value || undefined,
          },
        }
      : undefined;

  const death: Event | undefined =
    deathYear.value || deathMonth.value || deathDay.value
      ? {
          id: generateId(),
          type: "death",
          date: {
            year: deathYear.value || undefined,
            month: deathMonth.value || undefined,
            day: deathDay.value || undefined,
          },
        }
      : undefined;

  return {
    row: {
      ftzId: id.value,
      famcFtzId: famc.value,
      birthOrder: birthOrder.value,
      x: x.value,
      y: y.value,
      nickname: nickname ? nickname : undefined,
      name,
      gender: genderFromCode(genderCode.value),
      birth,
      death,
      notes,
      media: [],
      raw: working,
    },
    issues,
  };
}

export interface ParsedFamilyRow {
  ftzId: number;
  husbandFtzId: number;
  wifeFtzId: number;
  x: number;
  y: number;
  raw: string[];
}

/**
 * Parses a single Family row (already tab-split). Column layout:
 * docs/ftz-format-spec.md "Family record (12 fields)".
 */
export function parseFamilyRow(
  fields: string[],
  rowIndex: number
): { row: ParsedFamilyRow; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  let working = fields;

  if (fields.length < FAMILY_FIELD_COUNT) {
    issues.push({
      severity: "warning",
      code: "MALFORMED_ROW",
      message: `Family row ${rowIndex} has ${fields.length} fields, expected ${FAMILY_FIELD_COUNT}. Missing trailing fields were padded as empty/zero.`,
      relatedIds: [],
    });
    working = padRow(fields, FAMILY_FIELD_COUNT);
  } else if (fields.length > FAMILY_FIELD_COUNT) {
    issues.push({
      severity: "info",
      code: "EXTRA_FIELDS_PRESERVED",
      message: `Family row ${rowIndex} has ${fields.length} fields, expected ${FAMILY_FIELD_COUNT}. Extra trailing field(s) were preserved in raw but are not yet interpreted.`,
      relatedIds: [],
    });
  }

  const id = toInt(working[0]);
  const husband = toInt(working[2]);
  const wife = toInt(working[4]);
  const x = toFloat(working[6]);
  const y = toFloat(working[7]);

  for (const [label, parsed] of [
    ["id", id],
    ["husband", husband],
    ["wife", wife],
    ["x", x],
    ["y", y],
  ] as const) {
    if (parsed.wasInvalid) {
      issues.push({
        severity: "warning",
        code: "MALFORMED_ROW",
        message: `Family row ${rowIndex}: field "${label}" was not numeric and was coerced to 0.`,
        relatedIds: [],
      });
    }
  }

  return {
    row: {
      ftzId: id.value,
      husbandFtzId: husband.value,
      wifeFtzId: wife.value,
      x: x.value,
      y: y.value,
      raw: working,
    },
    issues,
  };
}
