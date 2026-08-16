import type { FamilyTree, Metadata, ParseResult, ValidationIssue } from "../models/types.js";
import { runIntegrityChecks } from "../validation/integrity.js";
import { buildTree } from "./build.js";
import { parseFamilyRow, parsePersonRow } from "./rows.js";
import { tokenizeNodeFtt } from "./tokenizer.js";
import { extractNodeFtt } from "./zip.js";

export * from "../models/types.js";
export * from "./errors.js";
export * from "./relationships.js";
export { runIntegrityChecks } from "../validation/integrity.js";

/**
 * Full pipeline: FTZ archive bytes -> internal model.
 * Throws FtzParseError only for structural problems (not a zip, no node.ftt, unrecognized
 * header). Everything else is reported via ParseResult.validation.issues.
 */
export async function parseFtzFile(
  data: ArrayBuffer | Uint8Array,
  sourceFileName?: string
): Promise<ParseResult> {
  const text = await extractNodeFtt(data);
  return parseNodeFtt(text, sourceFileName);
}

/**
 * Parses already-extracted node.ftt text into the internal model. Split out from
 * parseFtzFile so the text-parsing pipeline is testable without building zip archives.
 */
export function parseNodeFtt(text: string, sourceFileName?: string): ParseResult {
  const tokenized = tokenizeNodeFtt(text);
  const issues: ValidationIssue[] = [...tokenized.issues];

  const personRows = tokenized.personLines.map((fields, i) => parsePersonRow(fields, i));
  const familyRows = tokenized.familyLines.map((fields, i) => parseFamilyRow(fields, i));
  for (const { issues: rowIssues } of personRows) issues.push(...rowIssues);
  for (const { issues: rowIssues } of familyRows) issues.push(...rowIssues);

  const built = buildTree(
    personRows.map((r) => r.row),
    familyRows.map((r) => r.row)
  );
  issues.push(...built.issues);

  const metadata: Metadata = {
    sourceFormat: "ftz",
    sourceFileName,
    importedAt: new Date().toISOString(),
    ftzAnchorId: Number.isFinite(tokenized.anchorId) ? tokenized.anchorId : undefined,
  };

  const tree: FamilyTree = {
    metadata,
    persons: built.persons,
    families: built.families,
    validation: { validatedAt: "", issues: [], isValid: true }, // placeholder, replaced below
  };

  issues.push(...runIntegrityChecks(tree));

  const validation = {
    validatedAt: new Date().toISOString(),
    issues,
    isValid: !issues.some((i) => i.severity === "error"),
  };
  tree.validation = validation;

  return { tree, validation };
}
