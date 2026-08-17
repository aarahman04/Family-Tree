import type { FamilyTree, UUID } from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";
import {
  type AncestorMap,
  computeAncestorMap,
  findCommonAncestors,
  isDirectLineage,
} from "./ancestry.js";
import {
  type PairClass,
  classifyPair,
  countIndependentLines,
} from "./classify.js";
import { type ConfidenceResult, classifyConfidence } from "./confidence.js";

/**
 * Marriage-level relationship analysis — the composition layer over ancestry + classify +
 * confidence. This is the signal the poster engine already *counts* (gedcom/verify.ts) but never
 * classifies or surfaces; here it becomes a typed, confidence-rated result per couple.
 * See docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md §D.
 */

export interface CoupleRelation {
  relation: PairClass;
  confidence: ConfidenceResult;
  /** True when the two people share at least one common ancestor (verify.ts parity metric). */
  sharesCommonAncestor: boolean;
  /** True when the relationship classifies specifically as cousins (collateral shared ancestry). */
  isCousinMarriage: boolean;
}

export interface MarriageAnalysis extends CoupleRelation {
  familyId: UUID;
  husbandId: UUID;
  wifeId: UUID;
}

export interface ParentsRelation extends CoupleRelation {
  fatherId: UUID;
  motherId: UUID;
  /** True when the parents are related (cousins/siblings/avuncular). */
  related: boolean;
}

/** A memoizer so a whole-tree pass computes each person's ancestor map exactly once. */
function makeMapCache(tree: FamilyTree): (id: UUID) => AncestorMap {
  const cache = new Map<UUID, AncestorMap>();
  return (id: UUID) => {
    let m = cache.get(id);
    if (!m) {
      m = computeAncestorMap(tree, id);
      cache.set(id, m);
    }
    return m;
  };
}

/** Classify the relationship between two people (spouses, or a child's two parents). */
function classifyCouple(
  tree: FamilyTree,
  aId: UUID,
  bId: UUID,
  mapOf: (id: UUID) => AncestorMap,
): CoupleRelation {
  const mapA = mapOf(aId);
  const mapB = mapOf(bId);
  const commons = findCommonAncestors(mapA, mapB);

  let relation: PairClass;
  if (isDirectLineage(aId, bId, mapA, mapB)) {
    // One is an ancestor of the other — excluded from "cousin" classification (spec §9).
    relation = {
      kind: "direct-lineage",
      lines: 0,
      closest: null,
      label: "Direct ancestor / descendant",
    };
  } else {
    relation = classifyPair(commons, countIndependentLines(tree, commons));
  }

  const confidence = classifyConfidence({
    tree,
    personA: aId,
    personB: bId,
    kind: relation.kind,
    closest: relation.closest,
  });

  return {
    relation,
    confidence,
    sharesCommonAncestor: commons.length > 0,
    isCousinMarriage: relation.kind === "cousins",
  };
}

/** Analyse one family's marriage, or `undefined` when it isn't a two-spouse couple. */
export function classifyMarriage(
  tree: FamilyTree,
  familyId: UUID,
  mapOf: (id: UUID) => AncestorMap = makeMapCache(tree),
): MarriageAnalysis | undefined {
  const fam = tree.families[familyId];
  if (!fam?.husbandId || !fam.wifeId) return undefined;
  if (!tree.persons[fam.husbandId] || !tree.persons[fam.wifeId])
    return undefined;
  return {
    familyId,
    husbandId: fam.husbandId,
    wifeId: fam.wifeId,
    ...classifyCouple(tree, fam.husbandId, fam.wifeId, mapOf),
  };
}

/** Analyse every two-spouse marriage in the tree, keyed by family id. */
export function classifyAllMarriages(
  tree: FamilyTree,
): Map<UUID, MarriageAnalysis> {
  const mapOf = makeMapCache(tree);
  const out = new Map<UUID, MarriageAnalysis>();
  for (const familyId of Object.keys(tree.families)) {
    const m = classifyMarriage(tree, familyId, mapOf);
    if (m) out.set(familyId, m);
  }
  return out;
}

/** Whether a person's own parents are related (and how), or `undefined` if a parent is unknown. */
export function parentsRelated(
  tree: FamilyTree,
  personId: UUID,
  mapOf: (id: UUID) => AncestorMap = makeMapCache(tree),
): ParentsRelation | undefined {
  const fatherId = fatherOf(tree, personId);
  const motherId = motherOf(tree, personId);
  if (!fatherId || !motherId) return undefined;
  const couple = classifyCouple(tree, fatherId, motherId, mapOf);
  const related =
    couple.relation.kind === "cousins" ||
    couple.relation.kind === "siblings" ||
    couple.relation.kind === "avuncular";
  return { fatherId, motherId, related, ...couple };
}
