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
/**
 * Below this many usable samples the measured median isn't trustworthy, and the default gap is
 * substituted with `gapIsFallback` set. Calibrated against the real 473-person tree, where only
 * 7 people carry a recorded birth year and just 3 parent-child pairs are measurable: a median
 * over 3 points is not a measurement, and reporting it as one overstated the estimate's footing.
 */
export const MIN_GAP_SAMPLES = 10;

export interface BirthEstimate {
  /** Point estimate — the midpoint of the range below. Never present this without the range. */
  year: number;
  /** Conservative lower bound. Equals `year` only for a recorded birth year. */
  earliest: number;
  /** Conservative upper bound. */
  latest: number;
  /** 0 = the person's own recorded birth year. Higher = more relatives away from a real date. */
  hops: number;
  /** How much weight this individual estimate carries. */
  confidence: EstimateConfidence;
}

export type EstimateConfidence = "confirmed" | "likely" | "possible" | "unknown";

/**
 * Years of slack added per hop away from a recorded date. Generation gaps in real families vary
 * by well over a decade, so each inferred step widens the window rather than pretending the
 * measured median applies exactly. Deliberately generous: a range that is too wide is honest,
 * a range that is too narrow is wrong.
 */
const SLACK_PER_HOP_MEASURED = 8;
/** Wider still when the gap itself was assumed rather than measured from this tree. */
const SLACK_PER_HOP_ASSUMED = 14;

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
  /** Earliest birth year anywhere in the tree, recorded or estimated (midpoint). */
  earliestBirthYear?: number;
  /** The period the oldest known ancestor was most likely born in — a window, not a year. */
  earliestBirthRange?: { from: number; to: number };
  /** `now − earliestBirthYear` (midpoint). */
  treeAgeYears?: number;
  /** How far back the tree reaches, as a range. */
  treeAgeRange?: { min: number; max: number };
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
  slackPerHop: number,
): Map<UUID, BirthEstimate> {
  const estimates = new Map<UUID, BirthEstimate>();
  let frontier: UUID[] = [];

  for (const person of Object.values(tree.persons)) {
    const year = person.birth?.date?.year;
    if (year !== undefined) {
      estimates.set(person.id, {
        year,
        earliest: year,
        latest: year,
        hops: 0,
        confidence: "confirmed",
      });
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
        // Slack accumulates with distance, so the window genuinely widens the further the
        // estimate travels from real evidence.
        const slack = slackPerHop * hops;
        estimates.set(neighbourId, {
          year,
          earliest: year - slack,
          latest: year + slack,
          hops,
          confidence: confidenceForHops(hops),
        });
        next.push(neighbourId);
      }
    }
    frontier = next;
  }

  return estimates;
}

/** Past a few relatives from any real date, an estimate stops being worth quoting as a year. */
function confidenceForHops(hops: number): EstimateConfidence {
  if (hops === 0) return "confirmed";
  if (hops <= 2) return "likely";
  if (hops <= 4) return "possible";
  return "unknown";
}

/** Whole-tree timeline analysis. */
export function analyzeTimeline(
  tree: FamilyTree,
  now: number = new Date().getFullYear(),
): TreeTimeline {
  const { gap, sampleSize, isFallback } = measureGenerationGap(tree);
  const slackPerHop = isFallback ? SLACK_PER_HOP_ASSUMED : SLACK_PER_HOP_MEASURED;
  const birthYears = estimateBirthYears(tree, gap, slackPerHop);

  const people = Object.values(tree.persons);
  const totalPeople = people.length;
  const recordedBirthCount = people.filter(
    (p) => p.birth?.date?.year !== undefined,
  ).length;

  // The oldest ancestor is reported as the WINDOW around the earliest estimate, not a year: on a
  // sparse tree the earliest person is usually many hops from any real date, and quoting their
  // midpoint alone would be the most confident-looking number in the panel and the least earned.
  let earliestBirthYear: number | undefined;
  let earliestBirthRange: { from: number; to: number } | undefined;
  for (const estimate of birthYears.values()) {
    if (earliestBirthYear === undefined || estimate.year < earliestBirthYear) {
      earliestBirthYear = estimate.year;
      earliestBirthRange = { from: estimate.earliest, to: estimate.latest };
    }
  }

  // Confidence tracks how much of the answer is real data. Both inputs matter, but an assumed
  // gap is the more serious weakness: when the tree couldn't supply its own gap, EVERY multi-hop
  // estimate hangs off a guessed constant. A real genealogy file is usually mostly undated -- the
  // reference tree has 7 recorded births in 473 people -- so these thresholds are set where a
  // sparse tree honestly reports "low" rather than flattering itself.
  const recordedShare =
    totalPeople === 0 ? 0 : recordedBirthCount / totalPeople;
  let confidence: TreeTimeline["confidence"];
  if (!isFallback && recordedShare >= 0.5) confidence = "high";
  else if (!isFallback && recordedShare >= 0.2) confidence = "medium";
  else confidence = "low";

  return {
    generationGap: gap,
    gapSampleSize: sampleSize,
    gapIsFallback: isFallback,
    birthYears,
    recordedBirthCount,
    totalPeople,
    earliestBirthYear,
    earliestBirthRange,
    treeAgeYears:
      earliestBirthYear === undefined ? undefined : now - earliestBirthYear,
    // An older earliest-birth means a LONGER span, so the range inverts: the oldest plausible
    // birth gives the maximum age.
    treeAgeRange:
      earliestBirthRange === undefined
        ? undefined
        : { min: now - earliestBirthRange.to, max: now - earliestBirthRange.from },
    confidence,
  };
}
