/**
 * Dedicated print-poster layout engine -- see docs/poster-architecture.md.
 *
 * Deliberately NOT the interactive explorer's layout (React Flow + dagre, bounded to a
 * neighborhood around one focus person). This engine lays out the WHOLE tree at once, on
 * one continuous page, using a genealogy-chart-specific algorithm:
 *
 *  1. Canonical placement (`placementOf`): every person gets exactly one home position --
 *     under their own blood parents if known, otherwise as a standalone root/isolated node,
 *     otherwise adjacent to whichever spouse anchors their first recorded marriage. This is
 *     the single source of truth that guarantees no person is ever duplicated.
 *  2. Generation assignment (`generationOf`): memoized recursion over placement, O(n).
 *  3. Subtree width (`subtreeWidth`): bottom-up, in abstract "sibling slot" units, O(n) with
 *     memoization -- each person is a "child" of at most one family (their famcId), so this
 *     recursion visits every person exactly once regardless of how many spouses they have.
 *  4. Position assignment (`assignPositions`): top-down walk placing each family's children
 *     left-to-right within the width their subtree reserved, O(n).
 *
 * Cousin marriages / shared ancestors: when both spouses in a family have their own known
 * blood parents, the "anchor" (husband, by convention, else wife) keeps the children; the
 * other spouse is NOT re-rendered at the marriage point -- they already have a canonical
 * position under their own parents elsewhere in the layout -- instead a CrossBranchConnector
 * links their real position to the marriage point. This is what lets the same handful of
 * shared ancestors marry into multiple branches without ever duplicating a node.
 *
 * Overall complexity: O(n + f) where n = person count, f = family count, all four passes
 * memoized/single-pass -- no exponential blowup, verified with a 5,000-person synthetic tree
 * in tests/poster-layout.test.ts.
 */

import type { FamilyTree, Family, Person, UUID } from "../models/types.js";
import type { DescentConnector, PosterConnector, PosterLayout, PosterNode } from "./types.js";

const MAX_WALK = 20000; // cycle-guard budget, matching validation/integrity.ts's MAX_ANCESTRY_WALK spirit

type Placement =
  | { kind: "child"; familyId: UUID }
  | { kind: "top" }
  | { kind: "adjacent"; homeFamilyId: UUID };

function anchorIdOf(tree: FamilyTree, family: Family): UUID | undefined {
  const { husbandId, wifeId } = family;
  if (husbandId && !wifeId) return husbandId;
  if (wifeId && !husbandId) return wifeId;
  if (!husbandId && !wifeId) return undefined;
  const husband = tree.persons[husbandId!];
  const wife = tree.persons[wifeId!];
  const husbandHasBlood = !!husband?.famcId;
  const wifeHasBlood = !!wife?.famcId;
  if (wifeHasBlood && !husbandHasBlood) return wifeId;
  return husbandId; // husband by convention: both-blood (cousin marriage) or neither
}

function otherSpouseOf(family: Family, personId: UUID): UUID | undefined {
  if (family.husbandId === personId) return family.wifeId;
  if (family.wifeId === personId) return family.husbandId;
  return undefined;
}

function buildPlacements(tree: FamilyTree): Map<UUID, Placement> {
  const placements = new Map<UUID, Placement>();
  const isAnchorOf = new Map<UUID, UUID>(); // personId -> first family they anchor

  for (const family of Object.values(tree.families)) {
    const anchor = anchorIdOf(tree, family);
    if (anchor && !isAnchorOf.has(anchor)) isAnchorOf.set(anchor, family.id);
  }

  for (const person of Object.values(tree.persons)) {
    if (person.famcId && tree.families[person.famcId]) {
      placements.set(person.id, { kind: "child", familyId: person.famcId });
      continue;
    }
    if (isAnchorOf.has(person.id) || person.famsIds.length === 0) {
      placements.set(person.id, { kind: "top" });
      continue;
    }
    // Never an anchor: home to the first recorded marriage; any other marriage is a
    // cross-branch connector back to this position (see resolveCrossBranchConnectors).
    placements.set(person.id, { kind: "adjacent", homeFamilyId: person.famsIds[0]! });
  }

  return placements;
}

function makeGenerationResolver(tree: FamilyTree, placements: Map<UUID, Placement>) {
  const memo = new Map<UUID, number>();
  const visiting = new Set<UUID>();

  function resolve(personId: UUID): number {
    const cached = memo.get(personId);
    if (cached !== undefined) return cached;
    if (visiting.has(personId)) return 0; // corrupted-data cycle guard
    visiting.add(personId);

    const placement = placements.get(personId);
    let gen = 0;
    if (placement?.kind === "child") {
      const family = tree.families[placement.familyId];
      const parentIds = [family?.husbandId, family?.wifeId].filter((id): id is UUID => !!id);
      gen = parentIds.length ? 1 + Math.max(...parentIds.map(resolve)) : 0;
    } else if (placement?.kind === "adjacent") {
      const family = tree.families[placement.homeFamilyId];
      const anchor = family ? anchorIdOf(tree, family) : undefined;
      gen = anchor ? resolve(anchor) : 0;
    }
    visiting.delete(personId);
    memo.set(personId, gen);
    return gen;
  }

  return resolve;
}

/** True iff `spouseId` is rendered as an adjacent box at `family`'s marriage point (as
 * opposed to having their own canonical position elsewhere, reached only via a
 * CrossBranchConnector). */
function isAdjacentHere(placements: Map<UUID, Placement>, spouseId: UUID, familyId: UUID): boolean {
  const placement = placements.get(spouseId);
  return placement?.kind === "adjacent" && placement.homeFamilyId === familyId;
}

function anchoredFamiliesOf(tree: FamilyTree, personId: UUID): Family[] {
  const person = tree.persons[personId];
  if (!person) return [];
  const families: Family[] = [];
  for (const famId of person.famsIds) {
    const family = tree.families[famId];
    if (family && anchorIdOf(tree, family) === personId) families.push(family);
  }
  return families;
}

function personLabel(person: Person | undefined): { name: string; birthYear?: number; deathYear?: number; gender: "male" | "female" | "unknown" } {
  return {
    name: person?.name ?? "Unknown",
    birthYear: person?.birth?.date?.year,
    deathYear: person?.death?.date?.year,
    gender: person?.gender ?? "unknown",
  };
}

export function computePosterLayout(tree: FamilyTree): PosterLayout {
  const placements = buildPlacements(tree);
  const generationOf = makeGenerationResolver(tree, placements);

  function familyBlockWidth(family: Family, personId: UUID, widthMemo: Map<UUID, number>): number {
    if (family.childrenIds.length > 0) {
      let sum = 0;
      for (const childId of family.childrenIds) sum += subtreeWidth(childId, widthMemo);
      return sum;
    }
    const spouseId = otherSpouseOf(family, personId);
    return spouseId && isAdjacentHere(placements, spouseId, family.id) ? 1 : 0;
  }

  function subtreeWidth(personId: UUID, memo: Map<UUID, number>): number {
    const cached = memo.get(personId);
    if (cached !== undefined) return cached;
    memo.set(personId, 1); // placeholder guards a corrupted-data cycle from recursing forever
    let total = 0;
    for (const family of anchoredFamiliesOf(tree, personId)) {
      total += familyBlockWidth(family, personId, memo);
    }
    const width = Math.max(1, total);
    memo.set(personId, width);
    return width;
  }

  const widthMemo = new Map<UUID, number>();
  const nodes: PosterNode[] = [];
  const connectors: PosterConnector[] = [];
  const placed = new Set<UUID>();
  let maxRowWidth = 0;
  const rowSpan = new Map<number, { min: number; max: number }>();

  function addNode(personId: UUID, x: number) {
    const gen = generationOf(personId);
    nodes.push({ personId, generation: gen, x, ...personLabel(tree.persons[personId]) });
    const span = rowSpan.get(gen);
    if (!span) rowSpan.set(gen, { min: x, max: x });
    else {
      span.min = Math.min(span.min, x);
      span.max = Math.max(span.max, x);
    }
  }

  function place(personId: UUID, leftEdge: number, steps: number) {
    if (placed.has(personId) || steps > MAX_WALK) return; // corrupted-data safety net
    placed.add(personId);
    const width = subtreeWidth(personId, widthMemo);
    const selfX = leftEdge + width / 2;
    let cursor = leftEdge;
    let adjacentSpouseIndex = 0;
    const descentByFamily: DescentConnector[] = [];

    for (const family of anchoredFamiliesOf(tree, personId)) {
      const blockWidth = familyBlockWidth(family, personId, widthMemo);
      const spouseId = otherSpouseOf(family, personId);
      const spouseAdjacent = spouseId !== undefined && isAdjacentHere(placements, spouseId, family.id);

      if (blockWidth > 0 && family.childrenIds.length > 0) {
        let cc = cursor;
        for (const childId of family.childrenIds) {
          const w = subtreeWidth(childId, widthMemo);
          place(childId, cc, steps + 1);
          cc += w;
        }
      }
      if (spouseAdjacent) {
        adjacentSpouseIndex += 1;
        // Offset each adjacent spouse away from the person's own (fixed) position so
        // remarriages fan out rather than overlapping; the marriage/descent connectors
        // read actual node x's at render time, so this offset never has to be exact.
        addNode(spouseId!, selfX + 0.6 * adjacentSpouseIndex);
        placed.add(spouseId!);
        connectors.push({ kind: "marriage", personIds: [personId, spouseId!] });
      }
      cursor += blockWidth;

      if (family.childrenIds.length > 0) {
        const parentPersonIds: UUID[] = spouseAdjacent ? [personId, spouseId!] : [personId];
        descentByFamily.push({ kind: "descent", parentPersonIds, childPersonIds: [...family.childrenIds] });
      }
      if (spouseId && !spouseAdjacent) {
        connectors.push({ kind: "cross-branch", fromPersonId: spouseId, toMarriageAnchorId: personId });
      }
    }

    addNode(personId, selfX);
    connectors.push(...descentByFamily);
  }

  const topLevelRoots = Object.keys(tree.persons)
    .filter((id) => placements.get(id)?.kind === "top")
    .sort(); // deterministic order, independent of object key iteration order

  let cursor = 0;
  for (const rootId of topLevelRoots) {
    const width = subtreeWidth(rootId, widthMemo);
    place(rootId, cursor, 0);
    cursor += width;
  }

  // Safety net for corrupted data an anchor chain can't reach -- e.g. a family missing
  // BOTH parents (so anchorIdOf has nothing to return) whose children still carry a famcId
  // pointing at it. Anyone left unplaced after the normal walk is force-placed as its own
  // standalone root rather than silently vanishing from the poster.
  for (const personId of Object.keys(tree.persons).sort()) {
    if (placed.has(personId)) continue;
    const width = subtreeWidth(personId, widthMemo);
    place(personId, cursor, 0);
    cursor += width;
  }

  for (const span of rowSpan.values()) {
    maxRowWidth = Math.max(maxRowWidth, span.max - span.min + 1);
  }

  const generationCount = nodes.reduce((max, n) => Math.max(max, n.generation + 1), 0);

  return { nodes, connectors, generationCount, maxRowWidth };
}
