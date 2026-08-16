/**
 * GEDCOM (5.5.1 lineage-linked) importer: GEDCOM text -> the canonical internal FamilyTree
 * model. The mirror image of gedcom/export.ts, so a file we exported re-imports to an
 * equivalent tree (see tests/gedcom-import.test.ts). Structural failures (not GEDCOM, no
 * individuals) throw GedcomImportError; everything else is reported via ParseResult.validation,
 * exactly like the FTZ parser (parser/index.ts).
 *
 * Deliberately tolerant: it reads the HUSB/WIFE/CHIL links on FAM records as the authoritative
 * family structure (many real-world GEDCOMs are inconsistent about the INDI-side FAMC/FAMS
 * pointers), and it strips date qualifiers (ABT/BEF/AFT/…) down to whatever Y/M/D it can find
 * rather than dropping a date it doesn't perfectly understand.
 */
import { generateId } from "../lib/uuid.js";
import type {
  DatePart,
  Event,
  Family,
  FamilyTree,
  Gender,
  Metadata,
  ParseResult,
  Person,
  UUID,
  ValidationIssue,
} from "../models/types.js";
import { runIntegrityChecks } from "../validation/integrity.js";
import { GedcomImportError } from "./errors.js";

interface GedLine {
  level: number;
  xref?: string;
  tag: string;
  value: string;
}

const LINE_RE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/;

function tokenize(text: string): GedLine[] {
  const lines: GedLine[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if (raw.trim() === "") continue;
    const m = LINE_RE.exec(raw);
    if (!m) continue; // skip unparseable lines rather than failing the whole import
    lines.push({ level: Number(m[1]), xref: m[2], tag: m[3]!, value: (m[4] ?? "").trim() });
  }
  return lines;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const DATE_QUALIFIERS = new Set(["ABT", "EST", "CAL", "BEF", "AFT", "FROM", "TO", "BET", "AND", "INT"]);

/** Parses a GEDCOM DATE value into whatever year/month/day it can find, ignoring approximation
 * qualifiers and range keywords. Returns undefined if not even a year is present. */
export function parseGedcomDate(value: string): DatePart | undefined {
  const tokens = value.toUpperCase().split(/\s+/).filter((t) => t && !DATE_QUALIFIERS.has(t));
  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  // First value of each kind wins, so a range ("BET 1980 AND 1985") reads as its start.
  for (const tok of tokens) {
    if (MONTHS[tok] !== undefined) month ??= MONTHS[tok];
    else if (/^\d{3,4}$/.test(tok)) year ??= Number(tok);
    else if (/^\d{1,2}$/.test(tok)) day ??= Number(tok);
  }
  if (year === undefined) return undefined;
  const date: DatePart = { year };
  if (month !== undefined) date.month = month;
  if (day !== undefined) date.day = day;
  return date;
}

/** "Given /Surname/" -> "Given Surname"; "//"/"" -> ""; a name with no slashes is kept as-is. */
function parseGedcomName(value: string): string {
  const withSurname = value.replace(/\/([^/]*)\//, " $1 ");
  return withSurname.replace(/\s+/g, " ").trim();
}

function parseGender(value: string): Gender {
  const v = value.trim().toUpperCase();
  if (v === "M") return "male";
  if (v === "F") return "female";
  return "unknown";
}

interface RawIndi {
  xref: string;
  name?: string;
  nickname?: string;
  gender: Gender;
  birth?: DatePart;
  birthPlace?: string;
  death?: DatePart;
  deathPlace?: string;
  notes: string[];
  refn?: number;
}
interface RawFam {
  xref: string;
  husb?: string;
  wife?: string;
  chil: string[];
  marriage?: DatePart;
  marriagePlace?: string;
  refn?: number;
}

export function importGedcom(text: string, sourceFileName?: string): ParseResult {
  const lines = tokenize(text);
  if (lines.length === 0) throw new GedcomImportError("This file is empty or isn't a text GEDCOM file.");

  const indis = new Map<string, RawIndi>();
  const fams = new Map<string, RawFam>();

  let record: RawIndi | RawFam | null = null;
  let recordKind: "INDI" | "FAM" | null = null;
  // Which level-1 event the following level-2 lines (DATE/PLAC/NICK/CONT/CONC) belong to.
  let context: "NAME" | "BIRT" | "DEAT" | "MARR" | "NOTE" | null = null;
  let lastNoteRef: string[] | null = null; // the notes[] entry currently being continued

  for (const line of lines) {
    if (line.level === 0) {
      record = null;
      recordKind = null;
      context = null;
      lastNoteRef = null;
      if (line.xref && line.tag === "INDI") {
        const indi: RawIndi = { xref: line.xref, gender: "unknown", notes: [] };
        indis.set(line.xref, indi);
        record = indi;
        recordKind = "INDI";
      } else if (line.xref && line.tag === "FAM") {
        const fam: RawFam = { xref: line.xref, chil: [] };
        fams.set(line.xref, fam);
        record = fam;
        recordKind = "FAM";
      }
      continue;
    }
    if (!record) continue;

    if (line.level === 1) {
      context = null;
      lastNoteRef = null;
      if (recordKind === "INDI") {
        const p = record as RawIndi;
        switch (line.tag) {
          case "NAME": if (p.name === undefined) p.name = parseGedcomName(line.value); context = "NAME"; break;
          case "SEX": p.gender = parseGender(line.value); break;
          case "BIRT": context = "BIRT"; break;
          case "DEAT": context = "DEAT"; break;
          case "FAMC": break; // family links are re-derived from FAM records below
          case "FAMS": break;
          case "NOTE": { const n = line.value; p.notes.push(n); lastNoteRef = p.notes; context = "NOTE"; break; }
          case "REFN": if (/^\d+$/.test(line.value)) p.refn = Number(line.value); break;
        }
      } else {
        const f = record as RawFam;
        switch (line.tag) {
          case "HUSB": f.husb = line.value || undefined; break;
          case "WIFE": f.wife = line.value || undefined; break;
          case "CHIL": if (line.value) f.chil.push(line.value); break;
          case "MARR": context = "MARR"; break;
          case "NOTE": context = "NOTE"; break;
          case "REFN": if (/^\d+$/.test(line.value)) f.refn = Number(line.value); break;
        }
      }
      continue;
    }

    // level >= 2: attach to the current level-1 context
    if (recordKind === "INDI") {
      const p = record as RawIndi;
      if (context === "NAME") {
        if (line.tag === "NICK") p.nickname = line.value;
        else if (line.tag === "GIVN" && !p.name) p.name = line.value;
        else if (line.tag === "SURN" && !p.name) p.name = line.value;
      } else if (context === "BIRT") {
        if (line.tag === "DATE") p.birth = parseGedcomDate(line.value);
        else if (line.tag === "PLAC") p.birthPlace = line.value;
      } else if (context === "DEAT") {
        if (line.tag === "DATE") p.death = parseGedcomDate(line.value);
        else if (line.tag === "PLAC") p.deathPlace = line.value;
      } else if (context === "NOTE" && lastNoteRef && lastNoteRef.length > 0) {
        if (line.tag === "CONT") lastNoteRef[lastNoteRef.length - 1] += "\n" + line.value;
        else if (line.tag === "CONC") lastNoteRef[lastNoteRef.length - 1] += line.value;
      }
    } else {
      const f = record as RawFam;
      if (context === "MARR" && line.tag === "DATE") f.marriage = parseGedcomDate(line.value);
      else if (context === "MARR" && line.tag === "PLAC") f.marriagePlace = line.value;
    }
  }

  if (indis.size === 0) {
    throw new GedcomImportError("This GEDCOM file has no individual (INDI) records to import.");
  }

  // ---- assemble the internal model ----
  const idOf = new Map<string, UUID>(); // xref -> uuid
  for (const xref of indis.keys()) idOf.set(xref, generateId());

  const persons: Record<UUID, Person> = {};
  const eventOf = (type: Event["type"], date: DatePart | undefined, place: string | undefined, seed: string): Event | undefined => {
    if (!date && !place) return undefined;
    return { id: `${seed}-${type}`, type, date, place };
  };

  for (const [xref, raw] of indis) {
    const id = idOf.get(xref)!;
    persons[id] = {
      id,
      ftzId: raw.refn,
      name: raw.name ?? "",
      nickname: raw.nickname,
      gender: raw.gender,
      birth: eventOf("birth", raw.birth, raw.birthPlace, id),
      death: eventOf("death", raw.death, raw.deathPlace, id),
      notes: raw.notes.filter((n) => n.trim().length > 0).map((text, i) => ({ id: `${id}-note-${i}`, text })),
      media: [],
      famsIds: [],
    };
  }

  const families: Record<UUID, Family> = {};
  for (const raw of fams.values()) {
    const id = generateId();
    const husbandId = raw.husb ? idOf.get(raw.husb) : undefined;
    const wifeId = raw.wife ? idOf.get(raw.wife) : undefined;
    const childrenIds = raw.chil.map((c) => idOf.get(c)).filter((x): x is UUID => !!x);
    families[id] = {
      id,
      ftzId: raw.refn,
      husbandId,
      wifeId,
      childrenIds,
      marriage: eventOf("marriage", raw.marriage, raw.marriagePlace, id),
    };
    // Re-derive the authoritative INDI<->FAM links from the FAM record itself.
    if (husbandId && persons[husbandId]) persons[husbandId].famsIds.push(id);
    if (wifeId && persons[wifeId]) persons[wifeId].famsIds.push(id);
    for (const childId of childrenIds) {
      const child = persons[childId];
      if (child && !child.famcId) child.famcId = id;
    }
  }

  const metadata: Metadata = {
    sourceFormat: "gedcom",
    sourceFileName,
    importedAt: new Date().toISOString(),
  };

  const tree: FamilyTree = {
    metadata,
    persons,
    families,
    validation: { validatedAt: "", issues: [], isValid: true },
  };

  const issues: ValidationIssue[] = runIntegrityChecks(tree);
  const validation = {
    validatedAt: new Date().toISOString(),
    issues,
    isValid: !issues.some((i) => i.severity === "error"),
  };
  tree.validation = validation;

  return { tree, validation };
}
