import type { FamilyTree, UUID } from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";
import {
  type AncestorMap,
  computeAncestorMap,
  findCommonAncestors,
  type CommonAncestor,
  isDirectLineage,
} from "./ancestry.js";
import {
  type PairClass,
  classifyPair,
  countIndependentLines,
  governingCommons,
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
  /** Coarse bucket for counting/filtering — see `RelationCategory`. */
  category: RelationCategory;
  /** For an avuncular link, the spouse standing a generation above the other. */
  elderId?: UUID;
  youngerId?: UUID;
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

/**
 * How ANY two people in the tree are related (S-1) — not just spouses or a child's two parents.
 *
 * Composes the same primitives `classifyCouple` uses, so the answer the calculator gives for a
 * couple is by construction the answer the relationship panel gives: one classifier, one
 * confidence rule, no second opinion to drift.
 *
 * Beyond `CoupleRelation` it reports the shared ancestors it found and whether more than one
 * independent line leads to the link — full first cousins share two grandparents, and saying so
 * is the difference between "you are cousins" and "you are cousins twice over".
 */
export interface PairRelation extends CoupleRelation {
  aId: UUID;
  bId: UUID;
  /** Every shared ancestor, closest first. Empty when unrelated. */
  commonAncestors: CommonAncestor[];
  /** True when the pair are linked through more than one independent ancestral line. */
  multiplePaths: boolean;
  /**
   * For a generationally lopsided link (aunt/uncle to niece/nephew), which of the two stands
   * closer to the shared ancestor. Without this the app can say "avuncular" but not whether
   * someone married their NIECE or their UNCLE -- and those read very differently.
   * Undefined when both sides sit the same distance from the ancestor, or when unrelated.
   */
  elderId?: UUID;
  youngerId?: UUID;
  /** Coarse bucket for counting and filtering marriages by kind. */
  category: RelationCategory;
}

export type RelationCategory =
  | "cousins"
  | "avuncular"
  | "siblings"
  | "half-siblings"
  | "direct"
  | "unrelated";

function categoryOf(kind: PairRelation["relation"]["kind"]): RelationCategory {
  switch (kind) {
    case "cousins":
      return "cousins";
    case "avuncular":
      return "avuncular";
    case "siblings":
      return "siblings";
    case "half-siblings":
      return "half-siblings";
    case "direct-lineage":
    case "self":
      return "direct";
    default:
      return "unrelated";
  }
}

export function relatePair(
  tree: FamilyTree,
  aId: UUID,
  bId: UUID,
): PairRelation {
  // An unknown id has no ancestry, so it simply comes back unrelated rather than throwing --
  // the picker can be cleared or point at a person who was since removed.
  const mapOf = makeMapCache(tree);
  const base = classifyCouple(tree, aId, bId, mapOf);
  const commonAncestors = findCommonAncestors(mapOf(aId), mapOf(bId)).sort(
    (x, y) =>
      Math.min(x.distA, x.distB) - Math.min(y.distA, y.distB) ||
      Math.max(x.distA, x.distB) - Math.max(y.distA, y.distB),
  );
  // elder/younger and category already come from classifyCouple, so the calculator and the
  // marriage analysis can never disagree about who the aunt is.
  return {
    ...base,
    aId,
    bId,
    commonAncestors,
    multiplePaths: countIndependentLines(tree, governingCommons(commonAncestors)) > 1,
  };
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

  // Full vs half siblings turns on how many PARENTS are shared, which `lines` cannot express
  // (D-3 counts a shared parent couple as one line either way).
  const parentsA = new Set(
    [fatherOf(tree, aId), motherOf(tree, aId)].filter((id): id is UUID => !!id),
  );
  const sharedParentCount = [fatherOf(tree, bId), motherOf(tree, bId)].filter(
    (id): id is UUID => !!id && parentsA.has(id),
  ).length;

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
    // Lines are counted only among the ancestors at the governing remove -- see governingCommons.
    relation = classifyPair(
      commons,
      countIndependentLines(tree, governingCommons(commons)),
      sharedParentCount,
    );
  }

  const confidence = classifyConfidence({
    tree,
    personA: aId,
    personB: bId,
    kind: relation.kind,
    closest: relation.closest,
  });

  const closest = relation.closest;
  let elderId: UUID | undefined;
  let youngerId: UUID | undefined;
  if (closest && closest.distA !== closest.distB) {
    const aIsElder = closest.distA < closest.distB;
    elderId = aIsElder ? aId : bId;
    youngerId = aIsElder ? bId : aId;
  }

  return {
    relation,
    category: categoryOf(relation.kind),
    elderId,
    youngerId,
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
