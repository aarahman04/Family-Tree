import type { FamilyTree, UUID } from "../models/types.js";
import {
  childrenOf,
  fatherOf,
  motherOf,
  spousesOf,
} from "../parser/relationships.js";

/**
 * Tree-timeline estimation — "how far back does this family tree actually reach?"
 *
 * The previous estimate (in `web/src/lib/insights.ts`) was
 * `min(birthYear − generation × 30)`: a hardcoded 30-year generation gap, applied to whichever
 * single person happened to produce the smallest number. Two problems. The gap was assumed when
 * the tree contains the data to measure it, and one mistyped birth year anywhere set the answer
 * for the whole tree.
 *
 * This module measures the gap from the tree's own parent→child pairs, then propagates birth-year
 * estimates outward from every recorded date, so each person is estimated from the CLOSEST real
 * datum rather than from a global extreme. Every output carries the evidence it rests on
 * (`gapSampleSize`, `recordedBirthCount`, per-person `hops`) so the UI can label the estimate
 * honestly instead of presenting a bare number as fact.
 *
 * Pure and framework-free. `now` is injected rather than read from the clock so results are
 * reproducible — see the determinism test in `tests/analysis-timeline.test.ts`.
 */

/** Used when the tree has too few measurable parent→child gaps to derive its own. */
export const DEFAULT_GENERATION_GAP = 30;
/** Parent→child gaps outside this window are treated as data errors, not as evidence. */
export const MIN_PLAUSIBLE_GAP = 12;
export const MAX_PLAUSIBLE_GAP = 60;
/** Below this many usable samples the measured median isn't trustworthy; fall back. */
const MIN_GAP_SAMPLES = 2;

export interface BirthEstimate {
  year: number;
  /** 0 = the person's own recorded birth year. Higher = more relatives away from a real date. */
  hops: number;
}

export interface TreeTimeline {
  /** Median parent→child gap measured from this tree, or `DEFAULT_GENERATION_GAP`. */
  generationGap: number;
  /** How many plausible parent→child pairs the gap was measured from. */
  gapSampleSize: number;
  /** True when the sample was too small and the default gap was substituted. */
  gapIsFallback: boolean;
  /** Recorded or estimated birth year per person. Absent for anyone with no dated relative. */
  birthYears: Map<UUID, BirthEstimate>;
  /** How many people carry a real recorded birth year. */
  recordedBirthCount: number;
  totalPeople: number;
  /** Earliest birth year anywhere in the tree, recorded or estimated. */
  earliestBirthYear?: number;
  /** `now − earliestBirthYear`. */
  treeAgeYears?: number;
  /** Derived from the evidence, never asserted. */
  confidence: "high" | "medium" | "low";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Even counts average the middle pair; the caller rounds, so a .5 never reaches the UI.
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function parentsOf(tree: FamilyTree, personId: UUID): UUID[] {
  return [fatherOf(tree, personId), motherOf(tree, personId)].filter(
    (id): id is UUID => id !== undefined,
  );
}

/**
 * Median of every plausible parent→child birth-year difference in the tree. The median (not the
 * mean) is deliberate: genealogy data reliably contains a few transcription errors, and a mean
 * follows them while a median ignores them.
 */
function measureGenerationGap(tree: FamilyTree): {
  gap: number;
  sampleSize: number;
  isFallback: boolean;
} {
  const gaps: number[] = [];
  for (const person of Object.values(tree.persons)) {
    const childYear = person.birth?.date?.year;
    if (childYear === undefined) continue;
    for (const parentId of parentsOf(tree, person.id)) {
      const parentYear = tree.persons[parentId]?.birth?.date?.year;
      if (parentYear === undefined) continue;
      const gap = childYear - parentYear;
      if (gap >= MIN_PLAUSIBLE_GAP && gap <= MAX_PLAUSIBLE_GAP) gaps.push(gap);
    }
  }
  if (gaps.length < MIN_GAP_SAMPLES) {
    return {
      gap: DEFAULT_GENERATION_GAP,
      sampleSize: gaps.length,
      isFallback: true,
    };
  }
  return {
    gap: Math.round(median(gaps)),
    sampleSize: gaps.length,
    isFallback: false,
  };
}

/**
 * Breadth-first propagation outward from every recorded birth year. BFS (not DFS) is what makes
 * "nearest real datum wins" hold: the first time a person is reached is necessarily via the
 * shortest hop path, so a later, more distant route can never overwrite a closer estimate.
 */
function estimateBirthYears(
  tree: FamilyTree,
  gap: number,
): Map<UUID, BirthEstimate> {
  const estimates = new Map<UUID, BirthEstimate>();
  let frontier: UUID[] = [];

  for (const person of Object.values(tree.persons)) {
    const year = person.birth?.date?.year;
    if (year !== undefined) {
      estimates.set(person.id, { year, hops: 0 });
      frontier.push(person.id);
    }
  }

  let hops = 0;
  while (frontier.length > 0) {
    hops += 1;
    const next: UUID[] = [];
    for (const personId of frontier) {
      const from = estimates.get(personId)!;
      // A parent is one gap older, a child one gap younger, a spouse roughly contemporary.
      const neighbours: Array<[UUID, number]> = [
        ...parentsOf(tree, personId).map(
          (id): [UUID, number] => [id, from.year - gap],
        ),
        ...childrenOf(tree, personId).map(
          (id): [UUID, number] => [id, from.year + gap],
        ),
        ...spousesOf(tree, personId).map(
          (id): [UUID, number] => [id, from.year],
        ),
      ];
      for (const [neighbourId, year] of neighbours) {
        if (!tree.persons[neighbourId] || estimates.has(neighbourId)) continue;
        estimates.set(neighbourId, { year, hops });
        next.push(neighbourId);
      }
    }
    frontier = next;
  }

  return estimates;
}

/** Whole-tree timeline analysis. */
export function analyzeTimeline(
  tree: FamilyTree,
  now: number = new Date().getFullYear(),
): TreeTimeline {
  const { gap, sampleSize, isFallback } = measureGenerationGap(tree);
  const birthYears = estimateBirthYears(tree, gap);

  const people = Object.values(tree.persons);
  const totalPeople = people.length;
  const recordedBirthCount = people.filter(
    (p) => p.birth?.date?.year !== undefined,
  ).length;

  let earliestBirthYear: number | undefined;
  for (const { year } of birthYears.values()) {
    if (earliestBirthYear === undefined || year < earliestBirthYear)
      earliestBirthYear = year;
  }

  // Confidence tracks how much of the answer is real data. Both inputs matter, but an assumed
  // gap is the more serious weakness: when the tree couldn't supply its own gap, EVERY multi-hop
  // estimate hangs off a guessed constant, so a fallback gap plus sparse dates is "low" however
  // the share alone might read.
  const recordedShare =
    totalPeople === 0 ? 0 : recordedBirthCount / totalPeople;
  let confidence: TreeTimeline["confidence"];
  if (!isFallback && recordedShare >= 0.5) confidence = "high";
  else if (!isFallback || recordedShare >= 0.5) confidence = "medium";
  else confidence = "low";

  return {
    generationGap: gap,
    gapSampleSize: sampleSize,
    gapIsFallback: isFallback,
    birthYears,
    recordedBirthCount,
    totalPeople,
    earliestBirthYear,
    treeAgeYears:
      earliestBirthYear === undefined ? undefined : now - earliestBirthYear,
    confidence,
  };
}
