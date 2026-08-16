import type { ExportResult, FamilyTree, Person, ValidationIssue } from "../models/types.js";
import { formatGedcomDate } from "./date.js";
import { findUnmappedPopulatedFields } from "./fields.js";
import { formatGedcomName } from "./name.js";
import { validateForExport } from "./validate.js";
import { GedcomWriter, escapeGedcomValue } from "./writer.js";
import { XrefAllocator } from "./xref.js";

export interface ExportOptions {
  /** Export despite error-severity issues already present on tree.validation (see export.ts policy doc comment). Structural dangling-xref problems can never be forced through. */
  force?: boolean;
  sourceFileName?: string;
}

function genderToSex(gender: Person["gender"]): string {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return "U";
}

function writeIndi(writer: GedcomWriter, xrefs: XrefAllocator, person: Person, issues: ValidationIssue[]): void {
  const xref = xrefs.personXref.get(person.id)!;
  writer.lineWithXref(0, xref, "INDI");
  writer.line(1, "NAME", formatGedcomName(person.name));
  if (person.nickname) writer.line(2, "NICK", escapeGedcomValue(person.nickname));
  writer.line(1, "SEX", genderToSex(person.gender));

  if (person.birth) {
    writer.line(1, "BIRT");
    const date = formatGedcomDate(person.birth.date);
    if (date) {
      writer.line(2, "DATE", date);
    } else if (person.birth.date) {
      issues.push({
        severity: "warning",
        code: "UNFORMATTABLE_DATE",
        message: `Person's birth date could not be formatted for GEDCOM (month/day known without a year) and was omitted; the BIRT event itself was still recorded.`,
        relatedIds: [person.id],
      });
    }
    if (person.birth.place) writer.line(2, "PLAC", escapeGedcomValue(person.birth.place));
  }

  if (person.death) {
    writer.line(1, "DEAT");
    const date = formatGedcomDate(person.death.date);
    if (date) {
      writer.line(2, "DATE", date);
    } else if (person.death.date) {
      issues.push({
        severity: "warning",
        code: "UNFORMATTABLE_DATE",
        message: `Person's death date could not be formatted for GEDCOM (month/day known without a year) and was omitted; the DEAT event itself was still recorded.`,
        relatedIds: [person.id],
      });
    }
    if (person.death.place) writer.line(2, "PLAC", escapeGedcomValue(person.death.place));
  }

  if (person.famcId) {
    const famXref = xrefs.familyXref.get(person.famcId);
    if (famXref) writer.line(1, "FAMC", famXref);
  }
  for (const famId of person.famsIds) {
    const famXref = xrefs.familyXref.get(famId);
    if (famXref) writer.line(1, "FAMS", famXref);
  }

  for (const note of person.notes) {
    writer.line(1, "NOTE", escapeGedcomValue(note.text));
  }

  if (person.ftzId !== undefined) {
    writer.line(1, "REFN", String(person.ftzId));
  }
}

function writeFam(writer: GedcomWriter, xrefs: XrefAllocator, tree: FamilyTree, familyId: string, issues: ValidationIssue[]): void {
  const family = tree.families[familyId]!;
  const xref = xrefs.familyXref.get(familyId)!;
  writer.lineWithXref(0, xref, "FAM");

  if (family.husbandId) {
    const husbandXref = xrefs.personXref.get(family.husbandId);
    if (husbandXref) writer.line(1, "HUSB", husbandXref);
  }
  if (family.wifeId) {
    const wifeXref = xrefs.personXref.get(family.wifeId);
    if (wifeXref) writer.line(1, "WIFE", wifeXref);
  }
  for (const childId of family.childrenIds) {
    const childXref = xrefs.personXref.get(childId);
    if (childXref) writer.line(1, "CHIL", childXref);
  }

  if (family.marriage) {
    writer.line(1, "MARR");
    const date = formatGedcomDate(family.marriage.date);
    if (date) {
      writer.line(2, "DATE", date);
    } else if (family.marriage.date) {
      issues.push({
        severity: "warning",
        code: "UNFORMATTABLE_DATE",
        message: `Family's marriage date could not be formatted for GEDCOM (month/day known without a year) and was omitted; the MARR event itself was still recorded.`,
        relatedIds: [familyId],
      });
    }
    if (family.marriage.place) writer.line(2, "PLAC", escapeGedcomValue(family.marriage.place));
  }

  if (family.ftzId !== undefined) {
    writer.line(1, "REFN", String(family.ftzId));
  }
}

function writeHeader(writer: GedcomWriter, sourceFileName: string | undefined): void {
  writer.line(0, "HEAD");
  writer.line(1, "SOUR", "FTZ2GEDCOM");
  writer.line(2, "VERS", "0.1.0");
  writer.line(2, "NAME", "FTZ to GEDCOM Converter");
  writer.line(1, "GEDC");
  writer.line(2, "VERS", "5.5.1");
  writer.line(2, "FORM", "LINEAGE-LINKED");
  writer.line(1, "CHAR", "UTF-8");
  writer.line(1, "FILE", escapeGedcomValue(sourceFileName ?? "export.ged"));
  writer.line(1, "SUBM", "@SUBM1@");
  writer.line(0, "@SUBM1@", "SUBM");
  writer.line(1, "NAME", "Unknown");
}

/**
 * Export policy: refuses to write GEDCOM in two distinct situations, for two distinct reasons.
 *
 * 1. Structural dangling references (validateForExport) — ALWAYS refused, force cannot
 *    override this, because writing them would produce a genuinely invalid GEDCOM file
 *    (a cross-reference pointer to an xref that doesn't exist in the output).
 *
 * 2. Pre-existing error-severity issues on tree.validation (duplicate IDs, self-marriage,
 *    broken parse-time references, circular ancestry, etc.) — refused UNLESS options.force
 *    is set. These don't corrupt GEDCOM *syntax*, but exporting genealogically-nonsensical
 *    data (e.g. a person married to themself) without the caller explicitly acknowledging
 *    it contradicts the "never silently discard/transform problems" principle this whole
 *    project follows. options.force exists for a human who has reviewed the warnings and
 *    wants the export anyway.
 */
export function exportGedcom(tree: FamilyTree, options: ExportOptions = {}): ExportResult {
  const structuralIssues = validateForExport(tree);
  if (structuralIssues.length > 0) {
    return {
      rejected: true,
      rejectionReason: `Export refused: ${structuralIssues.length} structural reference problem(s) found (dangling cross-references). These cannot be forced through — fix the internal model first.`,
      issues: structuralIssues,
    };
  }

  const sourceErrors = tree.validation.issues.filter((i) => i.severity === "error");
  if (sourceErrors.length > 0 && !options.force) {
    return {
      rejected: true,
      rejectionReason: `Export refused: the source tree has ${sourceErrors.length} unresolved error-severity issue(s) (e.g. duplicate IDs, self-marriage, circular ancestry). Pass { force: true } to export anyway after review.`,
      issues: [
        ...sourceErrors,
        {
          severity: "error",
          code: "EXPORT_BLOCKED_BY_SOURCE_ERRORS",
          message: `Export was blocked by ${sourceErrors.length} pre-existing error(s) on the source tree.`,
          relatedIds: [],
        },
      ],
    };
  }

  const xrefs = new XrefAllocator(tree);
  const writer = new GedcomWriter();
  const issues: ValidationIssue[] = [...(options.force ? sourceErrors : [])];

  writeHeader(writer, options.sourceFileName);

  for (const personId of [...xrefs.personXref.keys()]) {
    writeIndi(writer, xrefs, tree.persons[personId]!, issues);
  }
  for (const familyId of [...xrefs.familyXref.keys()]) {
    writeFam(writer, xrefs, tree, familyId, issues);
  }

  writer.line(0, "TRLR");

  issues.push(...findUnmappedPopulatedFields(tree));

  return { gedcom: writer.toString(), rejected: false, issues };
}
