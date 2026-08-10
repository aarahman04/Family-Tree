/**
 * Dedicated print-poster layout engine (V2) -- see docs/poster-architecture.md.
 *
 * Deliberately NOT the interactive explorer's layout (React Flow + dagre, bounded to a
 * neighborhood around one focus person). This engine lays out the WHOLE tree at once, on
 * one continuous page, in seven stages:
 *
 *  1. Hierarchy -- canonical placement (`buildPlacements`): every person gets exactly one
 *     home position, so no one is ever duplicated (see "Cousin marriage handling" below).
 *  2. Box measurement -- every person's (and every cousin-marriage chip's) box is sized from
 *     its actual text content before any position is decided (poster/boxSizing.ts).
 *  3. Initial placement -- generation rows are assigned real heights from the tallest box in
 *     each row; x-coordinates come from a bottom-up subtree-width reservation (Reingold-
 *     Tilford-style) using each box's REAL measured width, not a constant.
 *  4-5. Collision detection + shift -- a left-to-right sweep per generation row that pushes
 *     any two clusters (a person plus its attached spouse/chip) apart to the configured
 *     minimum spacing, cascading the same shift down through every descendant so relative
 *     structure is preserved.
 *  6. Connector routing -- resolved lazily, by ID, at render time from the final coordinates
 *     computed above, so it never needs a separate recomputation step.
 *  7. Convergence -- stages 4-5 repeat until a full pass produces no further shifts (in
 *     practice this is exactly one productive pass, since a shift only ever cascades
 *     downward to already-unprocessed rows -- see docs/poster-architecture.md for the proof
 *     this terminates and is complete).
 *
 * Cousin marriages / shared ancestors: when both spouses in a family have their own known
 * blood parents, the "anchor" (husband, by convention, else wife) keeps the children. The
 * other spouse is never re-rendered as a second node at the marriage point -- they already
 * have a canonical position under their own parents elsewhere in the layout. Instead, a
 * compact `PosterChip` ("Spouse: <name>") sits at the marriage point with no line connecting
 * it back across the poster to their real node, per the confirmed design: identify who they
 * are, without duplicating them, their descendants, or any relationship line a second time.
 *
 * Complexity: stages 1-3 are O(n + f). Stage 4-5's sweep is O(n log n) for the per-row sorts;
 * each shift cascades to a subtree, and the sum of all subtree sizes shifted across one full
 * top-down pass is bounded by O(n) (a node is shifted at most once per pass, by the row that
 * contains it or an ancestor's row). With a small fixed cap on convergence passes, the whole
 * algorithm stays O(n log n) -- verified against a 5,000+-person synthetic tree in
 * tests/poster-layout.test.ts.
 */

import type { FamilyTree, Family, Person, UUID } from "../models/types.js";
import { computeChipBox, computePersonBox, type MeasuredBox } from "./boxSizing.js";
import { heuristicTextMeasurer, type TextMeasurer } from "./textMeasure.js";
import {
  DEFAULT_POSTER_STYLE,
  type PosterChip,
  type PosterConnector,
  type PosterLayout,
  type PosterNode,
  type PosterStyleOptions,
} from "./types.js";

const MAX_WALK = 20000; // cycle-guard budget, matching validation/integrity.ts's MAX_ANCESTRY_WALK spirit
const MAX_COLLISION_PASSES = 4;

type Placement =
  | { kind: "child"; familyId: UUID }
  | { kind: "top" }
  | { kind: "adjacent"; homeFamilyId: UUID };

// ---------------------------------------------------------------------------------------
// Stage 1: hierarchy
// ---------------------------------------------------------------------------------------

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
    // Never an anchor: home to the first recorded marriage; any other marriage becomes a
    // chip back to this position (see chipsByFamily below).
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

function yearLineFor(person: Person | undefined): string | undefined {
  const birth = person?.birth?.date?.year;
  const death = person?.death?.date?.year;
  if (birth === undefined && death === undefined) return undefined;
  return `${birth ?? "?"}–${death ?? ""}`;
}

interface ChipInfo {
  familyId: UUID;
  anchorId: UUID;
  spouseId: UUID;
  box: MeasuredBox;
}

export function computePosterLayout(
  tree: FamilyTree,
  style: PosterStyleOptions = DEFAULT_POSTER_STYLE,
  measure: TextMeasurer = heuristicTextMeasurer
): PosterLayout {
  const placements = buildPlacements(tree);
  const generationOf = makeGenerationResolver(tree, placements);

  // ------------------------------------------------------------------------------------
  // Stage 2: box measurement
  // ------------------------------------------------------------------------------------
  const personBoxes = new Map<UUID, MeasuredBox>();
  for (const person of Object.values(tree.persons)) {
    personBoxes.set(person.id, computePersonBox(person.name, yearLineFor(person), style, measure));
  }

  const chipsByFamily = new Map<UUID, ChipInfo>();
  for (const family of Object.values(tree.families)) {
    const anchor = anchorIdOf(tree, family);
    if (!anchor) continue;
    const spouseId = otherSpouseOf(family, anchor);
    if (spouseId && !isAdjacentHere(placements, spouseId, family.id)) {
      const spouseName = tree.persons[spouseId]?.name ?? "Unknown";
      chipsByFamily.set(family.id, {
        familyId: family.id,
        anchorId: anchor,
        spouseId,
        box: computeChipBox(spouseName, style, measure),
      });
    }
  }

  // Row heights: the tallest box (person or chip) in each generation, then cumulative Y.
  const rowMaxHeight = new Map<number, number>();
  function bumpRow(gen: number, height: number) {
    rowMaxHeight.set(gen, Math.max(rowMaxHeight.get(gen) ?? 0, height));
  }
  for (const person of Object.values(tree.persons)) {
    bumpRow(generationOf(person.id), personBoxes.get(person.id)!.height);
  }
  for (const chip of chipsByFamily.values()) {
    bumpRow(generationOf(chip.anchorId), chip.box.height);
  }
  const generationCount =
    rowMaxHeight.size === 0 ? 0 : Math.max(...[...rowMaxHeight.keys()].map((g) => g + 1));
  const rowY = new Map<number, number>();
  {
    let cumulativeY = 0;
    for (let g = 0; g < generationCount; g++) {
      const h = rowMaxHeight.get(g) ?? style.nodeMinHeight;
      rowY.set(g, cumulativeY + h / 2);
      cumulativeY += h + style.generationSpacing;
    }
  }

  // ------------------------------------------------------------------------------------
  // Stage 3: initial placement (subtree width + position assignment)
  // ------------------------------------------------------------------------------------
  const widthMemo = new Map<UUID, number>();

  /** This family's own extra "lane" width beyond the anchor's own box: the wider of its
   * attachment (adjacent spouse box, or chip) and the total width its children need. */
  function laneWidth(family: Family, anchorId: UUID): number {
    const spouseId = otherSpouseOf(family, anchorId);
    let attachmentWidth = 0;
    if (spouseId && isAdjacentHere(placements, spouseId, family.id)) {
      attachmentWidth = personBoxes.get(spouseId)!.width;
    } else {
      const chip = chipsByFamily.get(family.id);
      if (chip) attachmentWidth = chip.box.width;
    }
    let childrenWidth = 0;
    if (family.childrenIds.length > 0) {
      childrenWidth =
        family.childrenIds.reduce((sum, id) => sum + subtreeWidth(id), 0) +
        style.horizontalSpacing * (family.childrenIds.length - 1);
    }
    return Math.max(attachmentWidth, childrenWidth);
  }

  function subtreeWidth(personId: UUID): number {
    const cached = widthMemo.get(personId);
    if (cached !== undefined) return cached;
    const ownWidth = personBoxes.get(personId)?.width ?? style.nodeMinWidth;
    widthMemo.set(personId, ownWidth); // placeholder guards a corrupted-data cycle
    const families = anchoredFamiliesOf(tree, personId);
    let width = ownWidth;
    if (families.length > 0) {
      const lanes = families.map((f) => laneWidth(f, personId));
      width = ownWidth + lanes.reduce((sum, w) => sum + w + style.horizontalSpacing, 0);
    }
    widthMemo.set(personId, width);
    return width;
  }

  const nodes: PosterNode[] = [];
  const chips: PosterChip[] = [];
  const nodesById = new Map<UUID, PosterNode>();
  const chipsByFamilyId = new Map<UUID, PosterChip>();
  const placed = new Set<UUID>();
  const clusterLeadersByGen = new Map<number, UUID[]>();
  /** For cascading collision shifts: a cluster leader's directly-placed children, and its
   * attached spouse/chip (see shiftClusterBy). */
  const childrenOfPerson = new Map<UUID, UUID[]>();
  const attachedSpousesOf = new Map<UUID, UUID[]>();
  const attachedChipFamiliesOf = new Map<UUID, UUID[]>();

  function addNode(personId: UUID, x: number, y: number) {
    const box = personBoxes.get(personId)!;
    const person = tree.persons[personId];
    const node: PosterNode = {
      personId,
      generation: generationOf(personId),
      x,
      y,
      width: box.width,
      height: box.height,
      name: person?.name ?? "Unknown",
      nameLines: box.lines,
      yearLine: yearLineFor(person),
      rtl: box.rtl,
      gender: person?.gender ?? "unknown",
    };
    nodes.push(node);
    nodesById.set(personId, node);
  }

  function addChip(info: ChipInfo, x: number, y: number) {
    const chip: PosterChip = {
      familyId: info.familyId,
      anchorPersonId: info.anchorId,
      spousePersonId: info.spouseId,
      generation: generationOf(info.anchorId),
      x,
      y,
      width: info.box.width,
      height: info.box.height,
      lines: info.box.lines,
      rtl: info.box.rtl,
    };
    chips.push(chip);
    chipsByFamilyId.set(info.familyId, chip);
  }

  const connectors: PosterConnector[] = [];

  function place(personId: UUID, leftEdge: number, steps: number) {
    if (placed.has(personId) || steps > MAX_WALK) return; // corrupted-data safety net
    placed.add(personId);

    const gen = generationOf(personId);
    const y = rowY.get(gen) ?? 0;
    const ownBox = personBoxes.get(personId)!;
    const ownX = leftEdge + ownBox.width / 2;
    addNode(personId, ownX, y);

    const genList = clusterLeadersByGen.get(gen);
    if (genList) genList.push(personId);
    else clusterLeadersByGen.set(gen, [personId]);

    let cursor = leftEdge + ownBox.width;
    const directChildren: UUID[] = [];

    for (const family of anchoredFamiliesOf(tree, personId)) {
      cursor += style.horizontalSpacing;
      const lane = laneWidth(family, personId);
      const spouseId = otherSpouseOf(family, personId);
      const spouseAdjacent = spouseId !== undefined && isAdjacentHere(placements, spouseId, family.id);
      const chipInfo = chipsByFamily.get(family.id);

      const attachmentCenterX = cursor + lane / 2;
      let parentPersonIds: UUID[] = [personId];

      if (spouseAdjacent) {
        addNode(spouseId!, attachmentCenterX, y);
        placed.add(spouseId!);
        const spouseList = attachedSpousesOf.get(personId);
        if (spouseList) spouseList.push(spouseId!);
        else attachedSpousesOf.set(personId, [spouseId!]);
        connectors.push({ kind: "marriage", personIds: [personId, spouseId!] });
        parentPersonIds = [personId, spouseId!];
      } else if (chipInfo) {
        addChip(chipInfo, attachmentCenterX, y);
        const list = attachedChipFamiliesOf.get(personId);
        if (list) list.push(family.id);
        else attachedChipFamiliesOf.set(personId, [family.id]);
      }

      if (family.childrenIds.length > 0) {
        const childWidths = family.childrenIds.map((id) => subtreeWidth(id));
        const childrenTotalWidth =
          childWidths.reduce((a, b) => a + b, 0) + style.horizontalSpacing * (family.childrenIds.length - 1);
        let cc = cursor + (lane - childrenTotalWidth) / 2;
        for (const childId of family.childrenIds) {
          const w = subtreeWidth(childId);
          place(childId, cc, steps + 1);
          cc += w + style.horizontalSpacing;
          directChildren.push(childId);
        }
        connectors.push({ kind: "descent", parentPersonIds, childPersonIds: [...family.childrenIds] });
      }

      cursor += lane;
    }

    if (directChildren.length > 0) childrenOfPerson.set(personId, directChildren);
  }

  const topLevelRoots = Object.keys(tree.persons)
    .filter((id) => placements.get(id)?.kind === "top")
    .sort(); // deterministic order, independent of object key iteration order

  {
    let cursor = 0;
    for (const rootId of topLevelRoots) {
      const width = subtreeWidth(rootId);
      place(rootId, cursor, 0);
      cursor += width + style.horizontalSpacing;
    }

    // Safety net for corrupted data an anchor chain can't reach -- e.g. a family missing
    // BOTH parents (so anchorIdOf has nothing to return) whose children still carry a famcId
    // pointing at it. Anyone left unplaced after the normal walk is force-placed as its own
    // standalone root rather than silently vanishing from the poster.
    for (const personId of Object.keys(tree.persons).sort()) {
      if (placed.has(personId)) continue;
      const width = subtreeWidth(personId);
      place(personId, cursor, 0);
      cursor += width + style.horizontalSpacing;
    }
  }

  // ------------------------------------------------------------------------------------
  // Stages 4-7: collision detection, shift, repeat until stable
  // ------------------------------------------------------------------------------------
  function shiftClusterBy(personId: UUID, delta: number) {
    const node = nodesById.get(personId);
    if (!node) return;
    node.x += delta;
    for (const spouseId of attachedSpousesOf.get(personId) ?? []) {
      const spouseNode = nodesById.get(spouseId);
      if (spouseNode) spouseNode.x += delta;
    }
    for (const famId of attachedChipFamiliesOf.get(personId) ?? []) {
      const chip = chipsByFamilyId.get(famId);
      if (chip) chip.x += delta;
    }
    for (const childId of childrenOfPerson.get(personId) ?? []) {
      shiftClusterBy(childId, delta);
    }
  }

  function clusterBounds(personId: UUID): { left: number; right: number } {
    const node = nodesById.get(personId)!;
    let left = node.x - node.width / 2;
    let right = node.x + node.width / 2;
    for (const spouseId of attachedSpousesOf.get(personId) ?? []) {
      const spouseNode = nodesById.get(spouseId);
      if (spouseNode) {
        left = Math.min(left, spouseNode.x - spouseNode.width / 2);
        right = Math.max(right, spouseNode.x + spouseNode.width / 2);
      }
    }
    for (const famId of attachedChipFamiliesOf.get(personId) ?? []) {
      const chip = chipsByFamilyId.get(famId);
      if (chip) {
        left = Math.min(left, chip.x - chip.width / 2);
        right = Math.max(right, chip.x + chip.width / 2);
      }
    }
    return { left, right };
  }

  function sweepRow(gen: number): number {
    const items = clusterLeadersByGen.get(gen);
    if (!items || items.length < 2) return 0;
    items.sort((a, b) => nodesById.get(a)!.x - nodesById.get(b)!.x);
    let totalShift = 0;
    for (let i = 1; i < items.length; i++) {
      const prevBounds = clusterBounds(items[i - 1]!);
      const curBounds = clusterBounds(items[i]!);
      const minAllowedLeft = prevBounds.right + style.horizontalSpacing;
      if (curBounds.left < minAllowedLeft) {
        const delta = minAllowedLeft - curBounds.left;
        shiftClusterBy(items[i]!, delta);
        totalShift += delta;
      }
    }
    return totalShift;
  }

  for (let pass = 0; pass < MAX_COLLISION_PASSES; pass++) {
    let passShift = 0;
    for (let g = 0; g < generationCount; g++) passShift += sweepRow(g);
    if (passShift < 0.01) break; // converged: no meaningful overlap remains
  }

  // Tight content bounding box, in points -- pageSize.ts adds margins on top of this.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.width / 2);
    maxX = Math.max(maxX, n.x + n.width / 2);
    minY = Math.min(minY, n.y - n.height / 2);
    maxY = Math.max(maxY, n.y + n.height / 2);
  }
  for (const c of chips) {
    minX = Math.min(minX, c.x - c.width / 2);
    maxX = Math.max(maxX, c.x + c.width / 2);
    minY = Math.min(minY, c.y - c.height / 2);
    maxY = Math.max(maxY, c.y + c.height / 2);
  }
  const contentWidth = nodes.length > 0 ? maxX - minX : 0;
  const contentHeight = nodes.length > 0 ? maxY - minY : 0;

  // Normalize so the layout's own bounding box starts at (0,0) -- pageSize/render then only
  // need to add the margin, regardless of how placement's internal cursor accounting ran.
  if (nodes.length > 0) {
    for (const n of nodes) {
      n.x -= minX;
      n.y -= minY;
    }
    for (const c of chips) {
      c.x -= minX;
      c.y -= minY;
    }
  }

  return { nodes, chips, connectors, generationCount, contentWidth, contentHeight };
}
