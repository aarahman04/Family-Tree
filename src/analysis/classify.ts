import type { FamilyTree, UUID } from "../models/types.js";
import { spousesOf } from "../parser/relationships.js";
import { computeAncestorMap, type CommonAncestor } from "./ancestry.js";

/**
 * Relationship-distance classification (spec §9). Pure `classifyPair` (distances → degree/
 * removal/label) plus `countIndependentLines` (needs the tree, for double-cousin detection).
 * See docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md §C.
 */

export type RelKind =
  | "self"
  | "direct-lineage"
  | "siblings"
  | "avuncular"
  | "cousins"
  | "unrelated";

export interface PairClass {
  kind: RelKind;
  /** 1 = first cousins, 2 = second, … (only for kind "cousins"). */
  cousinDegree?: number;
  /** Generational offset between the two sides (0 = same generation). */
  removal?: number;
  /** Number of independent common-ancestor lines (≥2 ⇒ double/triple…). */
  lines: number;
  /** The closest shared ancestor that governs the label, or null when unrelated. */
  closest: CommonAncestor | null;
  /** Human-readable label, e.g. "First cousins once removed", "Double first cousins". */
  label: string;
}

const ORDINALS = [
  "",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
];

/**
 * D-19 (supersedes D-1's label collapse): name the degree however deep it goes. D-1 folded
 * everything past third cousins into "Distant cousins", which hides precisely the distinction
 * someone tracing repeated cousin marriages across generations is looking for. Past the written
 * ordinals a numeric one keeps the label honest rather than vague. D-1's DEPTH_CAP still stands.
 */
function ordinal(n: number): string {
  const word = ORDINALS[n];
  if (word) return word;
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
const MULTIPLICITY = ["", "", "Double ", "Triple "];

function removalSuffix(removal: number): string {
  if (removal <= 0) return "";
  if (removal === 1) return " once removed";
  if (removal === 2) return " twice removed";
  if (removal === 3) return " three times removed";
  return ` ${removal} times removed`;
}

/** Pick the closest common ancestor: smallest min-distance, tie-broken by smallest max-distance. */
function closestOf(commons: CommonAncestor[]): CommonAncestor | null {
  let best: CommonAncestor | null = null;
  for (const c of commons) {
    if (!best) {
      best = c;
      continue;
    }
    const cm = Math.min(c.distA, c.distB);
    const bm = Math.min(best.distA, best.distB);
    if (
      cm < bm ||
      (cm === bm &&
        Math.max(c.distA, c.distB) < Math.max(best.distA, best.distB))
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * Classify a relationship from its shared ancestors and the number of independent lines.
 * `lines` comes from `countIndependentLines` (or 1 for a single-couple share).
 */
export function classifyPair(
  commons: CommonAncestor[],
  lines: number,
): PairClass {
  const closest = closestOf(commons);
  if (!closest)
    return {
      kind: "unrelated",
      lines: 0,
      closest: null,
      label: "No shared ancestor",
    };

  const m = Math.min(closest.distA, closest.distB);
  const M = Math.max(closest.distA, closest.distB);

  if (m === 0)
    return {
      kind: "direct-lineage",
      lines,
      closest,
      label: "Direct ancestor / descendant",
    };
  if (m === 1 && M === 1)
    return { kind: "siblings", lines, closest, label: "Siblings" };
  if (m === 1)
    return {
      kind: "avuncular",
      lines,
      closest,
      label: "Aunt/uncle – niece/nephew",
    };

  const cousinDegree = m - 1;
  const removal = M - m;
  const prefix = MULTIPLICITY[lines] ?? "";
  const base = `${ordinal(cousinDegree)} cousins`;
  // "Double"/"Triple" reads naturally only on a lowercased ordinal ("Double first cousins").
  const labelBody = prefix
    ? prefix + base[0]!.toLowerCase() + base.slice(1)
    : base;
  const label = labelBody + removalSuffix(removal);

  return { kind: "cousins", cousinDegree, removal, lines, closest, label };
}

/**
 * Number of independent common-ancestor lines between two people (D-3). Reduces the shared
 * ancestors to their most-recent members (dropping any that are an ancestor of another shared
 * ancestor), then unions spouses / co-parents into one line; the number of resulting groups is
 * the count. Two brothers marrying two sisters ⇒ 2 lines (double cousins); one shared couple ⇒ 1.
 */
export function countIndependentLines(
  tree: FamilyTree,
  commons: CommonAncestor[],
): number {
  const ids = commons.map((c) => c.ancestorId);
  if (ids.length === 0) return 0;

  // Keep only the "lowest" shared ancestors: drop any that is an ancestor of another shared one.
  const idSet = new Set(ids);
  const ancestorMaps = new Map<UUID, ReturnType<typeof computeAncestorMap>>();
  const mapFor = (id: UUID) => {
    let m = ancestorMaps.get(id);
    if (!m) {
      m = computeAncestorMap(tree, id);
      ancestorMaps.set(id, m);
    }
    return m;
  };
  const mrca = ids.filter((id) => {
    for (const other of ids) {
      if (other !== id && idSet.has(other) && mapFor(other).has(id))
        return false; // id is above `other`
    }
    return true;
  });

  // Union-find over the MRCAs; union spouses / co-parents (same family) into one line.
  const parent = new Map<UUID, UUID>(mrca.map((id) => [id, id]));
  const find = (x: UUID): UUID => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: UUID, b: UUID) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const mrcaSet = new Set(mrca);
  for (const id of mrca) {
    for (const sp of spousesOf(tree, id)) {
      if (mrcaSet.has(sp)) union(id, sp);
    }
  }
  return new Set(mrca.map(find)).size;
}
