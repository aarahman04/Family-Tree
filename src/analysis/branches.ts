import type { FamilyTree, UUID } from "../models/types.js";
import { isPresumedLiving } from "../models/living.js";
import {
  childrenOf,
  fatherOf,
  motherOf,
  spousesOf,
} from "../parser/relationships.js";

/**
 * Branch overlap / vitality analysis (spec §3C/§3E, plan §CP3.2). "Branch" = the subtree under
 * each direct child of a component's primary anchor — the same conceptual root-with-most-
 * descendants pick `poster/layoutBalanced.ts` uses to place the poster's visual branches (D-4),
 * reimplemented here as a plain graph walk (not the poster's pixel-layout machinery) since this
 * package is framework-free and must not depend on `poster/`. When a tree has more than one
 * connected component (D-4's "no single clean anchor" case), each component gets its own local
 * anchor and branches — nothing is discarded, only the biggest component's anchor is reported as
 * the tree-level `primaryRootId`.
 * See docs/superpowers/plans/2026-08-16-family-tree-insights-v2.md, decision D-4.
 */


/**
 * Children a person "owns" for anchor-selection purposes. At the root edge, each family credits
 * children to exactly ONE parent (husbandId, falling back to wifeId), mirroring
 * `layoutBalanced.ts`'s `parentPersonIds[0]` ownership convention. After the first owned child is
 * already inside that root's lineage, the walk is allowed to continue through that person's own
 * spouse family when the spouse also has recorded parents (a bridge between two recorded
 * lineages), even when the spouse is the conventional family owner; otherwise any descent chain
 * through a daughter/wife is severed at her marriage. If the spouse has no recorded parents, the
 * spouse is itself the competing top-level owner for that family, so the walk does not let the
 * spouse's in-laws claim it. Used ONLY to pick the anchor; branch membership itself (below)
 * deliberately stays bidirectional, since a cross-branch marriage's child legitimately belonging
 * to BOTH branches is exactly the overlap signal this module measures.
 */
function ownedChildrenOf(
  tree: FamilyTree,
  personId: UUID,
  continueThroughSpouseFamily: boolean,
): UUID[] {
  const person = tree.persons[personId];
  if (!person) return [];
  const result: UUID[] = [];
  for (const famId of person.famsIds) {
    const family = tree.families[famId];
    if (!family) continue;
    const ownerId = family.husbandId ?? family.wifeId;
    const isParentInFamily =
      family.husbandId === personId || family.wifeId === personId;
    const otherParentId =
      family.husbandId === personId ? family.wifeId : family.husbandId;
    const otherParentHasRecordedParents = otherParentId
      ? fatherOf(tree, otherParentId) !== undefined ||
        motherOf(tree, otherParentId) !== undefined
      : false;
    if (
      ownerId === personId ||
      (continueThroughSpouseFamily &&
        isParentInFamily &&
        otherParentHasRecordedParents)
    )
      result.push(...family.childrenIds);
  }
  return result;
}

/** Descendant count via `ownedChildrenOf` only — see its doc comment for why. */
function ownedDescendantCount(tree: FamilyTree, rootId: UUID): number {
  const visited = new Set<UUID>([rootId]);
  let frontier: Array<{ id: UUID; pastRootEdge: boolean }> = [
    { id: rootId, pastRootEdge: false },
  ];
  while (frontier.length > 0) {
    const next: Array<{ id: UUID; pastRootEdge: boolean }> = [];
    for (const { id, pastRootEdge } of frontier) {
      for (const childId of ownedChildrenOf(tree, id, pastRootEdge)) {
        if (!visited.has(childId)) {
          visited.add(childId);
          next.push({ id: childId, pastRootEdge: true });
        }
      }
    }
    frontier = next;
  }
  return visited.size - 1;
}

/** Connected components of the family graph (parent + spouse + child edges, undirected). */
function connectedComponents(tree: FamilyTree): UUID[][] {
  const visited = new Set<UUID>();
  const components: UUID[][] = [];
  for (const start of Object.keys(tree.persons)) {
    if (visited.has(start)) continue;
    const comp: UUID[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const id = queue.shift()!;
      comp.push(id);
      const neighbors = [
        fatherOf(tree, id),
        motherOf(tree, id),
        ...spousesOf(tree, id),
        ...childrenOf(tree, id),
      ];
      for (const n of neighbors) {
        if (n && tree.persons[n] && !visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

export interface DescendantClosure {
  /** `rootId` plus every descendant reachable through `childrenOf`, transitively. */
  members: Set<UUID>;
  /** Longest chain of generations below the root (0 if the root has no children). */
  depth: number;
  /** Largest number of people in any single generation row below the root (0 if none). */
  maxBreadth: number;
}

/** BFS descendant closure from `rootId`. Dedupes within this one walk (cycle-safe on malformed
 * data) but is called independently per branch, so a person shared by two lineages (e.g. via a
 * cross-branch marriage) legitimately appears in more than one branch's closure — that overlap is
 * exactly what `analyzeBranches` measures. */
export function descendantsOf(
  tree: FamilyTree,
  rootId: UUID,
): DescendantClosure {
  const members = new Set<UUID>([rootId]);
  let depth = 0;
  let maxBreadth = 0;
  let frontier: UUID[] = [rootId];
  while (frontier.length > 0) {
    const next: UUID[] = [];
    for (const id of frontier) {
      for (const childId of childrenOf(tree, id)) {
        if (!members.has(childId)) {
          members.add(childId);
          next.push(childId);
        }
      }
    }
    if (next.length > 0) {
      depth++;
      maxBreadth = Math.max(maxBreadth, next.length);
    }
    frontier = next;
  }
  return { members, depth, maxBreadth };
}

export interface Branch {
  /** The primary anchor's direct child that heads this branch. */
  rootPersonId: UUID;
  memberIds: Set<UUID>;
  descendantCount: number;
  livingDescendantCount: number;
  depth: number;
  maxBreadth: number;
  /** Marriages linking this branch to a different branch (set after `marriageBridges`). */
  bridgeCount: number;
}

export interface BranchOverlap {
  branchA: UUID;
  branchB: UUID;
  sharedDescendantIds: UUID[];
}

/** A marriage between two people who each belong to exactly one (different) branch — the outside
 * spouse a branch member marries in is deliberately NOT a bridge, since they aren't reachable
 * from any other branch's own root. */
export interface MarriageBridge {
  familyId: UUID;
  branchA: UUID;
  branchB: UUID;
}

export interface BranchAnalysis {
  /** The anchor of the largest connected component, or undefined for an empty tree. */
  primaryRootId: UUID | undefined;
  branches: Branch[];
  overlaps: BranchOverlap[];
  /** (sum of branch sizes − distinct people across all branches) / distinct people, as a
   * whole-number percent — how much double-counting cross-branch descendants cause. */
  overlapPercent: number;
  marriageBridges: MarriageBridge[];
}

/** Whole-tree branch-overlap analysis. */
export function analyzeBranches(tree: FamilyTree): BranchAnalysis {
  const branches: Branch[] = [];
  let primaryRootId: UUID | undefined;
  let bestComponentSize = -1;

  for (const comp of connectedComponents(tree)) {
    const rootCandidates = comp.filter(
      (id) =>
        fatherOf(tree, id) === undefined && motherOf(tree, id) === undefined,
    );
    if (rootCandidates.length === 0) continue; // no clean anchor in this component (D-4)

    let anchor = rootCandidates[0]!;
    let anchorDescendants = -1;
    for (const candidate of rootCandidates) {
      const count = ownedDescendantCount(tree, candidate);
      if (
        count > anchorDescendants ||
        (count === anchorDescendants && candidate < anchor)
      ) {
        anchor = candidate;
        anchorDescendants = count;
      }
    }

    if (comp.length > bestComponentSize) {
      bestComponentSize = comp.length;
      primaryRootId = anchor;
    }

    for (const childId of childrenOf(tree, anchor)) {
      const closure = descendantsOf(tree, childId);
      let living = 0;
      for (const id of closure.members) {
        if (id === childId) continue;
        const person = tree.persons[id];
        if (person && isPresumedLiving(person)) living++;
      }
      branches.push({
        rootPersonId: childId,
        memberIds: closure.members,
        descendantCount: closure.members.size - 1,
        livingDescendantCount: living,
        depth: closure.depth,
        maxBreadth: closure.maxBreadth,
        bridgeCount: 0,
      });
    }
  }

  const overlaps: BranchOverlap[] = [];
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      const a = branches[i]!;
      const b = branches[j]!;
      const shared = [...a.memberIds].filter((id) => b.memberIds.has(id));
      if (shared.length > 0) {
        overlaps.push({
          branchA: a.rootPersonId,
          branchB: b.rootPersonId,
          sharedDescendantIds: shared,
        });
      }
    }
  }
  const unionAll = new Set<UUID>();
  let sumSizes = 0;
  for (const b of branches) {
    sumSizes += b.memberIds.size;
    for (const id of b.memberIds) unionAll.add(id);
  }
  const overlapPercent =
    unionAll.size > 0
      ? Math.round(((sumSizes - unionAll.size) / unionAll.size) * 100)
      : 0;

  const branchesOf = (personId: UUID) =>
    branches.filter((b) => b.memberIds.has(personId));
  const marriageBridges: MarriageBridge[] = [];
  for (const fam of Object.values(tree.families)) {
    if (!fam.husbandId || !fam.wifeId) continue;
    const hb = branchesOf(fam.husbandId);
    const wb = branchesOf(fam.wifeId);
    if (
      hb.length === 1 &&
      wb.length === 1 &&
      hb[0]!.rootPersonId !== wb[0]!.rootPersonId
    ) {
      marriageBridges.push({
        familyId: fam.id,
        branchA: hb[0]!.rootPersonId,
        branchB: wb[0]!.rootPersonId,
      });
    }
  }
  for (const bridge of marriageBridges) {
    for (const b of branches) {
      if (
        b.rootPersonId === bridge.branchA ||
        b.rootPersonId === bridge.branchB
      )
        b.bridgeCount++;
    }
  }

  return { primaryRootId, branches, overlaps, overlapPercent, marriageBridges };
}
