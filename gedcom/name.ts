/**
 * Splits a single free-text name string into GEDCOM's given-name/surname convention
 * ("Given /Surname/"). This is a heuristic (last whitespace-separated token = surname) —
 * flagged as a risk, not a loss, in docs/gedcom-mapping.md: the full original string is
 * always preserved as the GIVN+SURN combination re-reads back to the input, and the
 * un-split original is never discarded (it's still on Person.name in the internal model).
 */
export function splitName(name: string): { given: string; surname: string } {
  const trimmed = name.trim();
  if (!trimmed) return { given: "", surname: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { given: parts[0]!, surname: "" };
  const surname = parts[parts.length - 1]!;
  const given = parts.slice(0, -1).join(" ");
  return { given, surname };
}

export function formatGedcomName(name: string): string {
  const { given, surname } = splitName(name);
  return `${given} /${surname}/`.trim();
}
