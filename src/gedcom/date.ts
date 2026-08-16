import type { DatePart } from "../models/types.js";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/**
 * Formats a (possibly partial) date into GEDCOM 5.5.1 DATE value syntax.
 * Returns undefined when the date can't be represented (e.g. month/day known but no year) —
 * callers must surface an UNFORMATTABLE_DATE warning in that case rather than silently
 * dropping the event, per the data-preservation requirement.
 */
export function formatGedcomDate(date: DatePart | undefined): string | undefined {
  if (!date) return undefined;
  const { year, month, day } = date;

  if (!year) return undefined; // GEDCOM DATE has no standard day/month-without-year form

  const monthAbbrev = month && month >= 1 && month <= 12 ? MONTHS[month - 1] : undefined;

  if (day && monthAbbrev) return `${String(day).padStart(2, "0")} ${monthAbbrev} ${year}`;
  if (monthAbbrev) return `${monthAbbrev} ${year}`;
  return `${year}`;
}
