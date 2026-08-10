import type { FamilyTree, UUID } from "../../../models/types.js";

/**
 * Pure, framework-free analysis of a family tree for the editor's "Insights" panel. Every
 * value here is derived only from the tree data passed in — no I/O, no globals — so it's
 * trivially unit-testable (see tests/lib/insights.test.ts) and reusable outside the browser.
 *
 * Estimates (earliest year / tree span) are clearly separated from exact counts and must be
 * presented to the user as estimates, never as historical fact.
 */

/** Years assumed between one generation and the next when extrapolating unknown birth years. */
const AVG_GENERATION_GAP = 30;
/** Nobody is treated as still living past this age — guards "oldest living person" from absurd values. */
const MAX_PLAUSIBLE_AGE = 110;

export interface NamedCount {
  name: string;
  count: number;
}

export interface TreeInsights {
  // General
  totalMembers: number;
  maleCount: number;
  femaleCount: number;
  unknownCount: number;
  /** Percent of *known-gender* members, rounded to a whole number. */
  malePercent: number;
  femalePercent: number;
  livingCount: number;
  deceasedCount: number;

  // Family structure
  familyCount: number;
  marriageCount: number;
  generationCount: number;
  largestGeneration?: { generation: number; count: number };
  averageChildrenPerFamily: number; // one decimal place
  largestFamily?: { parents: string; childCount: number };
  disconnectedGroups: number;

  // Timeline (ESTIMATED — label as such in the UI)
  estimatedEarliestYear?: number;
  estimatedEarliestDecade?: number;
  latestKnownYear?: number;
  estimatedSpanYears?: number;

  // Lifespan
  averageLifespan?: number;
  longestLived?: { name: string; years: number };
  oldestLiving?: { name: string; age: number };
  youngestLiving?: { name: string; age: number };

  // Names
  mostCommonSurname?: NamedCount;
  mostCommonFirstName?: NamedCount;
}

function parentIdsOf(tree: FamilyTree, id: UUID): UUID[] {
  const famcId = tree.persons[id]?.famcId;
  const fam = famcId ? tree.families[famcId] : undefined;
  if (!fam) return [];
  return [fam.husbandId, fam.wifeId].filter((p): p is UUID => !!p && !!tree.persons[p]);
}

/** Generation number per person: 0 for people with no recorded parents, otherwise one more
 * than the deepest known parent. Memoized with a cycle guard (malformed data can loop). */
function computeGenerations(tree: FamilyTree): Map<UUID, number> {
  const memo = new Map<UUID, number>();
  const visiting = new Set<UUID>();
  function gen(id: UUID): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let g = 0;
    for (const parent of parentIdsOf(tree, id)) g = Math.max(g, gen(parent) + 1);
    visiting.delete(id);
    memo.set(id, g);
    return g;
  }
  for (const id of Object.keys(tree.persons)) gen(id);
  return memo;
}

/** Number of connected components, treating parent-child and spouse links as edges. */
function countDisconnectedGroups(tree: FamilyTree): number {
  const parent = new Map<UUID, UUID>();
  const find = (x: UUID): UUID => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const union = (a: UUID, b: UUID) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of Object.keys(tree.persons)) parent.set(id, id);
  for (const fam of Object.values(tree.families)) {
    const members = [fam.husbandId, fam.wifeId, ...fam.childrenIds].filter(
      (p): p is UUID => !!p && !!tree.persons[p]
    );
    for (let i = 1; i < members.length; i++) union(members[0]!, members[i]!);
  }
  const roots = new Set<UUID>();
  for (const id of Object.keys(tree.persons)) roots.add(find(id));
  return roots.size;
}

function topCount(counts: Map<string, number>): NamedCount | undefined {
  let best: NamedCount | undefined;
  for (const [name, count] of counts) {
    if (!best || count > best.count) best = { name, count };
  }
  return best;
}

function displayName(name: string): string {
  return name.trim() || "(no name)";
}

export function computeTreeInsights(
  tree: FamilyTree,
  now: number = new Date().getFullYear()
): TreeInsights {
  const persons = Object.values(tree.persons);
  const families = Object.values(tree.families);
  const totalMembers = persons.length;

  let maleCount = 0;
  let femaleCount = 0;
  let unknownCount = 0;
  let livingCount = 0;
  let deceasedCount = 0;

  const lifespans: number[] = [];
  let longestLived: { name: string; years: number } | undefined;
  let oldestLiving: { name: string; age: number } | undefined;
  let youngestLiving: { name: string; age: number } | undefined;

  const firstNames = new Map<string, number>();
  const surnames = new Map<string, number>();

  for (const p of persons) {
    if (p.gender === "male") maleCount++;
    else if (p.gender === "female") femaleCount++;
    else unknownCount++;

    const birthYear = p.birth?.date?.year;
    const deathYear = p.death?.date?.year;
    const isDeceased =
      p.death !== undefined || (birthYear !== undefined && now - birthYear > MAX_PLAUSIBLE_AGE);
    if (isDeceased) deceasedCount++;
    else livingCount++;

    if (birthYear !== undefined && deathYear !== undefined) {
      const years = deathYear - birthYear;
      if (years >= 0 && years <= 120) {
        lifespans.push(years);
        if (!longestLived || years > longestLived.years)
          longestLived = { name: displayName(p.name), years };
      }
    }
    if (!isDeceased && birthYear !== undefined) {
      const age = now - birthYear;
      if (age >= 0 && age <= MAX_PLAUSIBLE_AGE) {
        if (!oldestLiving || age > oldestLiving.age)
          oldestLiving = { name: displayName(p.name), age };
        if (!youngestLiving || age < youngestLiving.age)
          youngestLiving = { name: displayName(p.name), age };
      }
    }

    const tokens = p.name.trim().split(/\s+/).filter(Boolean);
    if (tokens.length >= 1) firstNames.set(tokens[0]!, (firstNames.get(tokens[0]!) ?? 0) + 1);
    if (tokens.length >= 2) {
      const surname = tokens[tokens.length - 1]!;
      surnames.set(surname, (surnames.get(surname) ?? 0) + 1);
    }
  }

  const knownGender = maleCount + femaleCount;
  const malePercent = knownGender > 0 ? Math.round((maleCount / knownGender) * 100) : 0;
  const femalePercent = knownGender > 0 ? Math.round((femaleCount / knownGender) * 100) : 0;

  // Family structure
  const familyCount = families.length;
  let marriageCount = 0;
  let totalChildren = 0;
  let largestFamily: { parents: string; childCount: number } | undefined;
  for (const fam of families) {
    if (fam.husbandId && fam.wifeId) marriageCount++;
    totalChildren += fam.childrenIds.length;
    if (!largestFamily || fam.childrenIds.length > largestFamily.childCount) {
      const h = fam.husbandId ? tree.persons[fam.husbandId]?.name : undefined;
      const w = fam.wifeId ? tree.persons[fam.wifeId]?.name : undefined;
      const parents = [h, w].filter(Boolean).map(displayName).join(" & ") || "(unknown couple)";
      largestFamily = { parents, childCount: fam.childrenIds.length };
    }
  }
  const averageChildrenPerFamily =
    familyCount > 0 ? Math.round((totalChildren / familyCount) * 10) / 10 : 0;
  if (largestFamily && largestFamily.childCount === 0) largestFamily = undefined;

  // Generations
  const generations = computeGenerations(tree);
  const perGen = new Map<number, number>();
  let maxGen = -1;
  for (const g of generations.values()) {
    perGen.set(g, (perGen.get(g) ?? 0) + 1);
    if (g > maxGen) maxGen = g;
  }
  const generationCount = totalMembers > 0 ? maxGen + 1 : 0;
  let largestGeneration: { generation: number; count: number } | undefined;
  for (const [generation, count] of perGen) {
    if (!largestGeneration || count > largestGeneration.count)
      largestGeneration = { generation, count };
  }

  // Timeline estimate
  let estimatedEarliestYear: number | undefined;
  let latestKnownYear: number | undefined;
  for (const p of persons) {
    const g = generations.get(p.id) ?? 0;
    const birthYear = p.birth?.date?.year;
    const deathYear = p.death?.date?.year;
    if (birthYear !== undefined) {
      const est = birthYear - g * AVG_GENERATION_GAP;
      if (estimatedEarliestYear === undefined || est < estimatedEarliestYear)
        estimatedEarliestYear = est;
      if (latestKnownYear === undefined || birthYear > latestKnownYear) latestKnownYear = birthYear;
    }
    if (deathYear !== undefined && (latestKnownYear === undefined || deathYear > latestKnownYear))
      latestKnownYear = deathYear;
  }
  const estimatedEarliestDecade =
    estimatedEarliestYear !== undefined ? Math.floor(estimatedEarliestYear / 10) * 10 : undefined;
  const estimatedSpanYears =
    estimatedEarliestYear !== undefined && latestKnownYear !== undefined
      ? latestKnownYear - estimatedEarliestYear
      : undefined;

  const averageLifespan =
    lifespans.length > 0
      ? Math.round(lifespans.reduce((s, x) => s + x, 0) / lifespans.length)
      : undefined;

  return {
    totalMembers,
    maleCount,
    femaleCount,
    unknownCount,
    malePercent,
    femalePercent,
    livingCount,
    deceasedCount,
    familyCount,
    marriageCount,
    generationCount,
    largestGeneration,
    averageChildrenPerFamily,
    largestFamily,
    disconnectedGroups: countDisconnectedGroups(tree),
    estimatedEarliestYear,
    estimatedEarliestDecade,
    latestKnownYear,
    estimatedSpanYears,
    averageLifespan,
    longestLived,
    oldestLiving,
    youngestLiving,
    mostCommonSurname: topCount(surnames),
    mostCommonFirstName: topCount(firstNames),
  };
}
