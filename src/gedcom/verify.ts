import type {
  FamilyTree,
  RoundTripReport,
  UUID,
  ValidationIssue,
} from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";
import { XrefAllocator } from "./xref.js";

interface ParsedPerson {
  xref: string;
  ftzId?: number;
  famc?: string;
  fams: string[];
  noteCount: number;
}

interface ParsedFamily {
  xref: string;
  ftzId?: number;
  husb?: string;
  wife?: string;
  chil: string[];
}

/**
 * Minimal, independent GEDCOM line-scanner used ONLY for verification. Deliberately does
 * not reuse any state from gedcom/export.ts — it re-derives everything from the generated
 * text itself, so a bug in the writer that produces wrong xref content (not just wrong
 * xref *allocation*) will actually be caught here instead of trivially agreeing with itself.
 */
function parseGedcomForVerification(text: string): {
  persons: Map<string, ParsedPerson>;
  families: Map<string, ParsedFamily>;
} {
  const persons = new Map<string, ParsedPerson>();
  const families = new Map<string, ParsedFamily>();
  let current: { type: "INDI" | "FAM"; xref: string } | null = null;

  for (const rawLine of text.split("\n")) {
    if (rawLine === "") continue;
    const match = /^(\d+) (?:(@[^@]+@) )?(\S+)(?: (.*))?$/.exec(rawLine);
    if (!match) continue;
    const level = Number(match[1]);
    const xrefToken = match[2];
    const tag = match[3]!;
    const value = match[4];

    if (level === 0) {
      if (xrefToken && tag === "INDI") {
        current = { type: "INDI", xref: xrefToken };
        persons.set(xrefToken, { xref: xrefToken, fams: [], noteCount: 0 });
      } else if (xrefToken && tag === "FAM") {
        current = { type: "FAM", xref: xrefToken };
        families.set(xrefToken, { xref: xrefToken, chil: [] });
      } else {
        current = null;
      }
      continue;
    }

    if (level !== 1 || !current) continue; // ignore DATE/CONT/CONC/etc. sub-lines for this check

    if (current.type === "INDI") {
      const p = persons.get(current.xref)!;
      if (tag === "FAMC" && value) p.famc = value;
      else if (tag === "FAMS" && value) p.fams.push(value);
      else if (tag === "NOTE") p.noteCount += 1;
      else if (tag === "REFN" && value) p.ftzId = Number(value);
    } else {
      const f = families.get(current.xref)!;
      if (tag === "HUSB" && value) f.husb = value;
      else if (tag === "WIFE" && value) f.wife = value;
      else if (tag === "CHIL" && value) f.chil.push(value);
      else if (tag === "REFN" && value) f.ftzId = Number(value);
    }
  }

  return { persons, families };
}

function ancestorFtzSet(
  tree: FamilyTree,
  personId: UUID,
  ftzIdOf: (id: UUID) => number | undefined,
  maxDepth = 10,
): Set<number> {
  const result = new Set<number>();
  let frontier = [personId];
  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const next: UUID[] = [];
    for (const id of frontier) {
      for (const parent of [fatherOf(tree, id), motherOf(tree, id)]) {
        if (!parent) continue;
        const ftz = ftzIdOf(parent);
        if (ftz !== undefined && !result.has(ftz)) {
          result.add(ftz);
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  return result;
}

function ancestorFtzSetFromGedcom(
  families: Map<string, ParsedFamily>,
  persons: Map<string, ParsedPerson>,
  startXref: string,
  maxDepth = 10,
): Set<number> {
  const result = new Set<number>();
  let frontier = [startXref];
  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const xref of frontier) {
      const person = persons.get(xref);
      if (!person?.famc) continue;
      const family = families.get(person.famc);
      if (!family) continue;
      for (const parentXref of [family.husb, family.wife]) {
        if (!parentXref) continue;
        const parentFtz = persons.get(parentXref)?.ftzId;
        if (parentFtz !== undefined && !result.has(parentFtz)) {
          result.add(parentFtz);
          next.push(parentXref);
        }
      }
    }
    frontier = next;
  }
  return result;
}

/**
 * Independently re-derives person/family/relationship/note counts from the generated
 * GEDCOM text and diffs them against the source tree. See docs/gedcom-exporter.md
 * "Round-trip verification" for what this proves and doesn't prove.
 */
export function verifyRoundTrip(
  tree: FamilyTree,
  gedcomText: string,
): RoundTripReport {
  const { persons: gPersons, families: gFamilies } =
    parseGedcomForVerification(gedcomText);
  const xrefs = new XrefAllocator(tree); // independently re-derived, not passed in from export.ts

  const relationshipMismatches: ValidationIssue[] = [];
  const noteCountMismatches: ValidationIssue[] = [];
  const duplicateIndividuals: ValidationIssue[] = [];

  // No duplicate xref definitions in the output.
  const indiXrefLines = [...gedcomText.matchAll(/^0 (@[^@]+@) INDI$/gm)].map(
    (m) => m[1]!,
  );
  const xrefCounts = new Map<string, number>();
  for (const x of indiXrefLines)
    xrefCounts.set(x, (xrefCounts.get(x) ?? 0) + 1);
  for (const [xref, count] of xrefCounts) {
    if (count > 1) {
      duplicateIndividuals.push({
        severity: "error",
        code: "DUPLICATE_XREF",
        message: `Xref ${xref} defines an INDI record ${count} times.`,
        relatedIds: [],
      });
    }
  }

  for (const [personId, person] of Object.entries(tree.persons)) {
    const xref = xrefs.personXref.get(personId)!;
    const parsed = gPersons.get(xref);
    if (!parsed) {
      relationshipMismatches.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Person ${xref} exists in the source tree but has no INDI record in the generated GEDCOM.`,
        relatedIds: [personId],
      });
      continue;
    }

    const expectedFamc = person.famcId
      ? xrefs.familyXref.get(person.famcId)
      : undefined;
    if (expectedFamc !== parsed.famc) {
      relationshipMismatches.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Person ${xref}: expected FAMC ${expectedFamc ?? "(none)"}, found ${
          parsed.famc ?? "(none)"
        } in GEDCOM.`,
        relatedIds: [personId],
      });
    }

    const expectedFams = person.famsIds
      .map((f) => xrefs.familyXref.get(f))
      .sort();
    const actualFams = [...parsed.fams].sort();
    if (JSON.stringify(expectedFams) !== JSON.stringify(actualFams)) {
      relationshipMismatches.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Person ${xref}: FAMS mismatch between source tree and generated GEDCOM.`,
        relatedIds: [personId],
      });
    }

    if (parsed.noteCount !== person.notes.length) {
      noteCountMismatches.push({
        severity: "error",
        code: "MALFORMED_ROW",
        message: `Person ${xref}: expected ${person.notes.length} NOTE line(s), found ${parsed.noteCount}.`,
        relatedIds: [personId],
      });
    }
  }

  for (const [familyId, family] of Object.entries(tree.families)) {
    const xref = xrefs.familyXref.get(familyId)!;
    const parsed = gFamilies.get(xref);
    if (!parsed) {
      relationshipMismatches.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Family ${xref} exists in the source tree but has no FAM record in the generated GEDCOM.`,
        relatedIds: [familyId],
      });
      continue;
    }
    const expectedHusb = family.husbandId
      ? xrefs.personXref.get(family.husbandId)
      : undefined;
    const expectedWife = family.wifeId
      ? xrefs.personXref.get(family.wifeId)
      : undefined;
    if (expectedHusb !== parsed.husb || expectedWife !== parsed.wife) {
      relationshipMismatches.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Family ${xref}: HUSB/WIFE mismatch between source tree and generated GEDCOM.`,
        relatedIds: [familyId],
      });
    }
    const expectedChil = family.childrenIds.map((c) => xrefs.personXref.get(c));
    if (JSON.stringify(expectedChil) !== JSON.stringify(parsed.chil)) {
      relationshipMismatches.push({
        severity: "error",
        code: "DANGLING_XREF",
        message: `Family ${xref}: CHIL list mismatch (order or membership) between source tree and generated GEDCOM.`,
        relatedIds: [familyId],
      });
    }
  }

  // Cousin-marriage / shared-ancestor count, computed twice independently: once over the
  // UUID-space source tree, once over the freshly-reparsed GEDCOM-text ftzId-space graph.
  //
  // D-11: this ftzId-based walk is kept INTENTIONALLY separate from the UUID-based analysis
  // engine in src/analysis/ (see marriages.ts `sharesCommonAncestor`). The duplication is the
  // cross-check — tests/analysis-marriages.test.ts asserts the two produce the same count on the
  // real sample (a golden-agreement test). Do not merge them onto a shared helper.
  const ftzIdOfUuid = (id: UUID) => tree.persons[id]?.ftzId;
  let cousinMarriageCountSource = 0;
  for (const family of Object.values(tree.families)) {
    if (!family.husbandId || !family.wifeId) continue;
    const a = ancestorFtzSet(tree, family.husbandId, ftzIdOfUuid);
    const b = ancestorFtzSet(tree, family.wifeId, ftzIdOfUuid);
    if ([...a].some((x) => b.has(x))) cousinMarriageCountSource++;
  }

  let cousinMarriageCountGedcom = 0;
  for (const family of gFamilies.values()) {
    if (!family.husb || !family.wife) continue;
    const a = ancestorFtzSetFromGedcom(gFamilies, gPersons, family.husb);
    const b = ancestorFtzSetFromGedcom(gFamilies, gPersons, family.wife);
    if ([...a].some((x) => b.has(x))) cousinMarriageCountGedcom++;
  }

  const personCountMatches = gPersons.size === Object.keys(tree.persons).length;
  const familyCountMatches =
    gFamilies.size === Object.keys(tree.families).length;
  const cousinMarriagesMatch =
    cousinMarriageCountSource === cousinMarriageCountGedcom;

  return {
    personCountMatches,
    familyCountMatches,
    sourcePersonCount: Object.keys(tree.persons).length,
    gedcomIndiCount: gPersons.size,
    sourceFamilyCount: Object.keys(tree.families).length,
    gedcomFamCount: gFamilies.size,
    relationshipMismatches,
    noteCountMismatches,
    duplicateIndividuals,
    cousinMarriageCountSource,
    cousinMarriageCountGedcom,
    cousinMarriagesMatch,
    passed:
      personCountMatches &&
      familyCountMatches &&
      relationshipMismatches.length === 0 &&
      noteCountMismatches.length === 0 &&
      duplicateIndividuals.length === 0 &&
      cousinMarriagesMatch,
  };
}
