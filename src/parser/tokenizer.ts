import type { ValidationIssue } from "../models/types.js";
import { FtzParseError } from "./errors.js";

export const PERSON_FIELD_COUNT = 29;
export const FAMILY_FIELD_COUNT = 12;

export interface TokenizeResult {
  personLines: string[][];
  familyLines: string[][];
  /** Lines that matched neither known shape in fallback mode — preserved verbatim, never dropped. */
  unrecognizedLines: string[][];
  anchorId: number;
  issues: ValidationIssue[];
}

/**
 * Splits node.ftt into its header and data lines, then partitions the data lines into
 * Person / Family groups.
 *
 * Design decision (see docs/parser-implementation.md "grouping strategy"): the header's
 * declared counts are used as the primary partition *when they are internally consistent*
 * (personCount + familyCount === total data lines) — this is what lets a Person row with
 * extra trailing columns (future schema growth) still be recognized as a Person row instead
 * of being misclassified by exact field-count matching. When the header is NOT internally
 * consistent, we fall back to exact field-count matching (29 vs 12) as the safety net, and
 * flag the mismatch so a human notices before trusting the output.
 */
export function tokenizeNodeFtt(text: string): TokenizeResult {
  const rawLines = text.split(/\r\n|\n/);
  while (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }
  if (rawLines.length === 0) {
    throw new FtzParseError("unrecognized node.ftt: file is empty");
  }

  const headerLine = rawLines[0] as string;
  const headerFields = headerLine.split("\t");
  if (headerFields.length !== 3 || headerFields.some((f) => !/^-?\d+$/.test(f.trim()))) {
    throw new FtzParseError(
      "unrecognized node.ftt header: expected 3 tab-separated integers (personCount, familyCount, anchorId)"
    );
  }
  const personCount = parseInt(headerFields[0] as string, 10);
  const familyCount = parseInt(headerFields[1] as string, 10);
  const anchorId = parseInt(headerFields[2] as string, 10);

  const dataLines = rawLines.slice(1).map((l) => l.split("\t"));
  const issues: ValidationIssue[] = [];

  if (personCount + familyCount === dataLines.length && personCount >= 0 && familyCount >= 0) {
    const personLines = dataLines.slice(0, personCount);
    const familyLines = dataLines.slice(personCount, personCount + familyCount);
    return { personLines, familyLines, unrecognizedLines: [], anchorId, issues };
  }

  // Header counts don't add up — fall back to exact field-count grouping.
  const personLines = dataLines.filter((l) => l.length === PERSON_FIELD_COUNT);
  const familyLines = dataLines.filter((l) => l.length === FAMILY_FIELD_COUNT);
  const unrecognizedLines = dataLines.filter(
    (l) => l.length !== PERSON_FIELD_COUNT && l.length !== FAMILY_FIELD_COUNT
  );

  issues.push({
    severity: "warning",
    code: "UNKNOWN_RECORD_GROUP",
    message: `node.ftt header claims ${personCount} person / ${familyCount} family records (sum ${
      personCount + familyCount
    }), but the file has ${dataLines.length} data line(s). Fell back to exact field-count grouping: ${
      personLines.length
    } row(s) with ${PERSON_FIELD_COUNT} fields treated as Person, ${
      familyLines.length
    } row(s) with ${FAMILY_FIELD_COUNT} fields treated as Family, ${
      unrecognizedLines.length
    } row(s) matched neither shape and were preserved verbatim (not classified as Person or Family): ${JSON.stringify(
      unrecognizedLines
    )}`,
    relatedIds: [],
  });

  return { personLines, familyLines, unrecognizedLines, anchorId, issues };
}
