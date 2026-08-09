/**
 * Canonical internal data model. Format-independent — see docs/data-model.md.
 * Neither FTZ nor GEDCOM concepts leak in; both are I/O adapters around this model.
 */

export type UUID = string;
export type FtzId = number;

export interface DatePart {
  year?: number;
  month?: number;
  day?: number;
}

export interface Metadata {
  sourceFormat: "ftz" | "gedcom" | "manual";
  sourceFileName?: string;
  importedAt: string;
  ftzAnchorId?: FtzId;
  formatVersion?: string;
}

export type ValidationIssueCode =
  | "DUPLICATE_PERSON_ID"
  | "DUPLICATE_FAMILY_ID"
  | "ID_NAMESPACE_COLLISION"
  | "BROKEN_FAMC"
  | "BROKEN_SPOUSE_REF"
  | "SELF_MARRIAGE"
  | "SELF_PARENT"
  | "CIRCULAR_ANCESTRY"
  | "GENDER_ROLE_MISMATCH"
  | "FAMILY_MISSING_PARENT"
  | "MALFORMED_ROW"
  | "UNKNOWN_RECORD_GROUP"
  | "EXTRA_FIELDS_PRESERVED"
  | "DANGLING_XREF"
  | "DUPLICATE_XREF"
  | "UNMAPPED_FIELD_POPULATED"
  | "UNFORMATTABLE_DATE"
  | "EXPORT_BLOCKED_BY_SOURCE_ERRORS";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: ValidationIssueCode;
  message: string;
  relatedIds: UUID[];
}

export interface ValidationState {
  validatedAt: string;
  issues: ValidationIssue[];
  isValid: boolean;
}

export interface Event {
  id: UUID;
  type: "birth" | "death" | "marriage" | "custom";
  date?: DatePart;
  place?: string;
  note?: string;
}

export interface MediaRef {
  id: UUID;
  fileName: string;
  role?: "portrait" | "document" | "other";
  sourcePath?: string;
}

export interface NoteEntry {
  id: UUID;
  text: string;
  category?: "biography" | "event" | "general";
}

export type Gender = "male" | "female" | "unknown";

export interface Person {
  id: UUID;
  ftzId?: FtzId;
  name: string;
  nickname?: string;
  gender: Gender;
  birth?: Event;
  death?: Event;
  notes: NoteEntry[];
  media: MediaRef[];
  famcId?: UUID;
  famsIds: UUID[];
  layout?: { x: number; y: number };
  raw?: string[];
}

export interface Family {
  id: UUID;
  ftzId?: FtzId;
  husbandId?: UUID;
  wifeId?: UUID;
  childrenIds: UUID[];
  marriage?: Event;
  layout?: { x: number; y: number };
  raw?: string[];
}

/** Not persisted — the shape returned by relationship queries (parser/relationships.ts). */
export interface Relationship {
  personId: UUID;
  father?: UUID;
  mother?: UUID;
  spouses: UUID[];
  children: UUID[];
  siblings: UUID[];
  grandparents: {
    paternalGrandfather?: UUID;
    paternalGrandmother?: UUID;
    maternalGrandfather?: UUID;
    maternalGrandmother?: UUID;
  };
  grandchildren: UUID[];
}

export interface FamilyTree {
  metadata: Metadata;
  persons: Record<UUID, Person>;
  families: Record<UUID, Family>;
  validation: ValidationState;
}

export interface ParseResult {
  tree: FamilyTree;
  validation: ValidationState;
}

export interface ExportResult {
  /** Present iff rejected is false. */
  gedcom?: string;
  rejected: boolean;
  /** Reason export was refused; only set when rejected is true. */
  rejectionReason?: string;
  issues: ValidationIssue[];
}

export interface RoundTripReport {
  personCountMatches: boolean;
  familyCountMatches: boolean;
  sourcePersonCount: number;
  gedcomIndiCount: number;
  sourceFamilyCount: number;
  gedcomFamCount: number;
  relationshipMismatches: ValidationIssue[];
  noteCountMismatches: ValidationIssue[];
  duplicateIndividuals: ValidationIssue[];
  cousinMarriageCountSource: number;
  cousinMarriageCountGedcom: number;
  cousinMarriagesMatch: boolean;
  passed: boolean;
}
