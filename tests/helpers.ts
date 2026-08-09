/**
 * Builds valid-shaped Person/Family row strings for fixtures, so tests describe intent
 * (field names) rather than opaque tab-separated positions. See docs/ftz-format-spec.md
 * for the column layout these encode.
 */

export interface PersonRowOptions {
  id: number;
  famc?: number;
  birthOrder?: number;
  nickname?: string;
  name?: string;
  gender?: number;
  birthYear?: number;
  birthMonth?: number;
  birthDay?: number;
  deathYear?: number;
  deathMonth?: number;
  deathDay?: number;
  note?: string;
  eventNote?: string;
  extra?: string[];
  truncateTo?: number;
}

export function personRow(opts: PersonRowOptions): string {
  const f = Array(29).fill("0");
  f[0] = String(opts.id);
  f[2] = String(opts.famc ?? 0);
  f[3] = String(opts.birthOrder ?? 0);
  f[12] = opts.nickname ?? "";
  f[13] = opts.name ?? "";
  f[16] = "2";
  f[17] = String(opts.birthYear ?? 0);
  f[18] = String(opts.birthMonth ?? 0);
  f[19] = String(opts.birthDay ?? 0);
  f[20] = "2";
  f[21] = String(opts.deathYear ?? 0);
  f[22] = String(opts.deathMonth ?? 0);
  f[23] = String(opts.deathDay ?? 0);
  f[24] = String(opts.gender ?? 0);
  f[25] = opts.eventNote ?? "";
  f[28] = opts.note ?? "";
  let fields: string[] = [...f, ...(opts.extra ?? [])];
  if (opts.truncateTo !== undefined) fields = fields.slice(0, opts.truncateTo);
  return fields.join("\t");
}

export interface FamilyRowOptions {
  id: number;
  husband?: number;
  wife?: number;
  extra?: string[];
  truncateTo?: number;
}

export function familyRow(opts: FamilyRowOptions): string {
  const f = Array(12).fill("0");
  f[0] = String(opts.id);
  f[2] = String(opts.husband ?? 0);
  f[4] = String(opts.wife ?? 0);
  let fields: string[] = [...f, ...(opts.extra ?? [])];
  if (opts.truncateTo !== undefined) fields = fields.slice(0, opts.truncateTo);
  return fields.join("\t");
}

export function buildNodeFtt(
  persons: string[],
  families: string[],
  opts?: { anchorId?: number; personCountOverride?: number; familyCountOverride?: number }
): string {
  const personCount = opts?.personCountOverride ?? persons.length;
  const familyCount = opts?.familyCountOverride ?? families.length;
  const anchorId = opts?.anchorId ?? 0;
  return [`${personCount}\t${familyCount}\t${anchorId}`, ...persons, ...families].join("\n");
}
