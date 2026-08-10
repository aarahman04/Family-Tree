/**
 * Dedicated print-poster layout engine (V3) -- see docs/poster-architecture.md.
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
 *     Tilford-style, CENTERED: a couple is always centered above the span their own
 *     children need, not left-aligned against it -- see `place()`), using each box's REAL
 *     measured width. Disconnected top-level lineages are ordered so the single largest one
 *     (almost always the tree's oldest/primary ancestor couple) sits in the middle, with any
 *     smaller unrelated fragments fanning out to both sides by size.
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
 * have a canonical position under their own parents elsewhere in the layout. Instead: a
 * short, local `PosterChip` naming them (never a placeholder -- always their real name) sits
 * beside the anchor with no line spanning the poster, AND their own real node (wherever it
 * is) gets a small "children shown in <anchor>'s branch" note so a reader arriving from
 * either direction can find the family. See "Cousin marriage handling" in the docs.
 *
 * Complexity: stages 1-3 are O(n + f). Stage 4-5's sweep is O(n log n) for the per-row sorts;
 * each shift cascades to a subtree, and the sum of all subtree sizes shifted across one full
 * top-down pass is bounded by O(n). With a small fixed cap on convergence passes, the whole
 * algorithm stays O(n log n) -- verified against a 4,000+-person synthetic tree in
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

/** The name to actually print in a person's box. A blank `name` field (111 of the 473
 * people in the real sample carry one) must never render as an empty box -- fall back to the
 * person's nickname, then to "Unknown", matching how chips/branch-notes already resolve a
 * missing name (see the `|| "Unknown"` sites below). */
function displayNameOf(person: Person | undefined): string {
  return person?.name?.trim() || person?.nickname?.trim() || "Unknown";
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

  // Pre-pass over families: for every cousin marriage (both spouses have their own blood
  // parents), the non-anchor spouse needs a short "children shown in <anchor>'s branch" note
  // on THEIR OWN box -- computed before boxes so it's included in that box's own sizing.
  interface ChipDef {
    familyId: UUID;
    anchorId: UUID;
    spouseId: UUID;
  }
  const chipDefs: ChipDef[] = [];
  const branchNoteAnchorNameFor = new Map<UUID, string>(); // spousePersonId -> anchor's name
  for (const family of Object.values(tree.families)) {
    const anchor = anchorIdOf(tree, family);
    if (!anchor) continue;
    const spouseId = otherSpouseOf(family, anchor);
    if (spouseId && !isAdjacentHere(placements, spouseId, family.id)) {
      chipDefs.push({ familyId: family.id, anchorId: anchor, spouseId });
      // displayNameOf (name -> nickname -> "Unknown") guarantees a real label after the
      // marriage glyph: a genuinely empty name field must never leave the chip/note blank --
      // exactly the "empty spouse label" this rule exists to rule out.
      branchNoteAnchorNameFor.set(spouseId, displayNameOf(tree.persons[anchor]));
    }
  }

  const personBoxes = new Map<UUID, MeasuredBox>();
  for (const person of Object.values(tree.persons)) {
    personBoxes.set(
      person.id,
      computePersonBox(displayNameOf(person), yearLineFor(person), branchNoteAnchorNameFor.get(person.id), style, measure)
    );
  }

  const chipsByFamily = new Map<UUID, ChipInfo>();
  for (const def of chipDefs) {
    const spouseName = displayNameOf(tree.persons[def.spouseId]); // see displayNameOf's note above
    chipsByFamily.set(def.familyId, { ...def, box: computeChipBox(spouseName, style, measure) });
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
  // Stage 3: initial placement (subtree width + CENTERED position assignment)
  // ------------------------------------------------------------------------------------
  const widthMemo = new Map<UUID, number>();

  /** The width of whatever sits beside `personId` at this marriage point: an adjacent
   * (married-in) spouse's real box, or a cousin-marriage chip naming the absent spouse. 0 if
   * neither (e.g. only one parent recorded for this family). */
  function attachmentWidthOf(family: Family, personId: UUID): number {
    const spouseId = otherSpouseOf(family, personId);
    if (spouseId && isAdjacentHere(placements, spouseId, family.id)) {
      return personBoxes.get(spouseId)!.width;
    }
    const chip = chipsByFamily.get(family.id);
    return chip ? chip.box.width : 0;
  }

  function childrenWidthOf(family: Family): number {
    if (family.childrenIds.length === 0) return 0;
    return (
      family.childrenIds.reduce((sum, id) => sum + subtreeWidth(id), 0) +
      style.horizontalSpacing * (family.childrenIds.length - 1)
    );
  }

  /** The reserved span for `personId`'s FIRST (primary) marriage: `coupleWidth` is their own
   * box plus, if present, the attachment beside it -- this is what gets centered within
   * `reserved`, which is the wider of the couple and their children. Every ancestor is
   * centered above their own descendants because of this -- see place() below. */
  function primaryReserved(personId: UUID, family: Family): { coupleWidth: number; reserved: number } {
    const ownWidth = personBoxes.get(personId)!.width;
    const attachmentW = attachmentWidthOf(family, personId);
    const coupleWidth = attachmentW > 0 ? ownWidth + style.horizontalSpacing + attachmentW : ownWidth;
    const childrenWidth = childrenWidthOf(family);
    return { coupleWidth, reserved: Math.max(coupleWidth, childrenWidth) };
  }

  /** A second (or third...) marriage's own lane, appended beside the primary reserved span --
   * remarriage is rare enough that this isn't re-centered against the person's own box (see
   * docs/poster-architecture.md's "Known limitations"), only internally consistent. */
  function extraLaneWidth(family: Family, personId: UUID): number {
    return Math.max(attachmentWidthOf(family, personId), childrenWidthOf(family));
  }

  function subtreeWidth(personId: UUID): number {
    const cached = widthMemo.get(personId);
    if (cached !== undefined) return cached;
    const ownWidth = personBoxes.get(personId)?.width ?? style.nodeMinWidth;
    widthMemo.set(personId, ownWidth); // placeholder guards a corrupted-data cycle
    const families = anchoredFamiliesOf(tree, personId);
    let width = ownWidth;
    if (families.length > 0) {
      width = primaryReserved(personId, families[0]!).reserved;
      for (let i = 1; i < families.length; i++) {
        width += style.horizontalSpacing + extraLaneWidth(families[i]!, personId);
      }
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
      name: displayNameOf(person),
      nameLines: box.lines,
      yearLine: yearLineFor(person),
      noteLine: box.noteLine,
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

  function registerClusterLeader(personId: UUID, gen: number) {
    const genList = clusterLeadersByGen.get(gen);
    if (genList) genList.push(personId);
    else clusterLeadersByGen.set(gen, [personId]);
  }

  const connectors: PosterConnector[] = [];

  /** Places `family`'s attachment (adjacent spouse or chip) centered at `centerX`, and
   * returns the parent id(s) a descent connector for this family should originate from. */
  function placeAttachment(family: Family, personId: UUID, centerX: number, y: number): UUID[] {
    const spouseId = otherSpouseOf(family, personId);
    if (spouseId && isAdjacentHere(placements, spouseId, family.id)) {
      addNode(spouseId, centerX, y);
      placed.add(spouseId);
      const list = attachedSpousesOf.get(personId);
      if (list) list.push(spouseId);
      else attachedSpousesOf.set(personId, [spouseId]);
      connectors.push({ kind: "marriage", personIds: [personId, spouseId] });
      return [personId, spouseId];
    }
    const chip = chipsByFamily.get(family.id);
    if (chip) {
      addChip(chip, centerX, y);
      const list = attachedChipFamiliesOf.get(personId);
      if (list) list.push(family.id);
      else attachedChipFamiliesOf.set(personId, [family.id]);
    }
    return [personId];
  }

  /** Centers `family`'s children within [spanLeft, spanLeft + spanWidth), recursing into
   * each, and records the shared descent connector for the whole sibling group. */
  function placeChildrenRow(
    family: Family,
    spanLeft: number,
    spanWidth: number,
    parentPersonIds: UUID[],
    steps: number,
    directChildren: UUID[]
  ) {
    if (family.childrenIds.length === 0) return;
    const childrenTotalWidth = childrenWidthOf(family);
    let cc = spanLeft + (spanWidth - childrenTotalWidth) / 2;
    for (const childId of family.childrenIds) {
      const w = subtreeWidth(childId);
      place(childId, cc, steps + 1);
      cc += w + style.horizontalSpacing;
      directChildren.push(childId);
    }
    connectors.push({ kind: "descent", parentPersonIds, childPersonIds: [...family.childrenIds] });
  }

  function place(personId: UUID, leftEdge: number, steps: number) {
    if (placed.has(personId) || steps > MAX_WALK) return; // corrupted-data safety net
    placed.add(personId);

    const gen = generationOf(personId);
    const y = rowY.get(gen) ?? 0;
    const ownBox = personBoxes.get(personId)!;
    const families = anchoredFamiliesOf(tree, personId);
    const directChildren: UUID[] = [];

    if (families.length === 0) {
      addNode(personId, leftEdge + ownBox.width / 2, y);
      registerClusterLeader(personId, gen);
      return;
    }

    const primaryFamily = families[0]!;
    const { coupleWidth, reserved } = primaryReserved(personId, primaryFamily);
    // The couple (this person + their attachment, if any) is CENTERED within `reserved` --
    // the wider of the couple's own footprint and the span their children need -- rather
    // than left-aligned against it. This is what keeps every ancestor (including the oldest,
    // most-centered-of-all root couple) positioned directly above their own descendant fan
    // instead of drifting toward the left edge of it.
    const coupleLeft = leftEdge + (reserved - coupleWidth) / 2;
    const ownX = coupleLeft + ownBox.width / 2;
    addNode(personId, ownX, y);
    registerClusterLeader(personId, gen);

    const attachmentW = attachmentWidthOf(primaryFamily, personId);
    let parentPersonIds = [personId];
    if (attachmentW > 0) {
      const attachCenterX = coupleLeft + ownBox.width + style.horizontalSpacing + attachmentW / 2;
      parentPersonIds = placeAttachment(primaryFamily, personId, attachCenterX, y);
    }
    placeChildrenRow(primaryFamily, leftEdge, reserved, parentPersonIds, steps, directChildren);

    let cursor = leftEdge + reserved;
    for (let i = 1; i < families.length; i++) {
      cursor += style.horizontalSpacing;
      const family = families[i]!;
      const lane = extraLaneWidth(family, personId);
      const laneAttachmentW = attachmentWidthOf(family, personId);
      let laneParentIds = [personId];
      if (laneAttachmentW > 0) {
        laneParentIds = placeAttachment(family, personId, cursor + lane / 2, y);
      }
      placeChildrenRow(family, cursor, lane, laneParentIds, steps, directChildren);
      cursor += lane;
    }

    if (directChildren.length > 0) childrenOfPerson.set(personId, directChildren);
  }

  const topLevelRootIds = Object.keys(tree.persons).filter((id) => placements.get(id)?.kind === "top");

  // Order disconnected top-level lineages so the single LARGEST one -- almost always the
  // tree's real oldest/primary ancestor couple -- sits in the horizontal middle, with any
  // smaller unrelated fragments fanning out to both sides by descending size. In the common
  // case (one connected family tree) there's only one such root, which trivially ends up
  // centered over the whole poster once combined with the couple-centering fix above.
  const orderedRootIds: UUID[] = [];
  {
    const withWidth = topLevelRootIds
      .map((id) => ({ id, width: subtreeWidth(id) }))
      .sort((a, b) => b.width - a.width || (a.id < b.id ? -1 : 1)); // descending, deterministic tiebreak
    const left: UUID[] = [];
    const right: UUID[] = [];
    withWidth.slice(1).forEach((r, i) => (i % 2 === 0 ? right : left).push(r.id));
    if (withWidth.length > 0) orderedRootIds.push(...left.reverse(), withWidth[0]!.id, ...right);
  }

  {
    let cursor = 0;
    for (const rootId of orderedRootIds) {
      const width = subtreeWidth(rootId); // memoized above; free to call again
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
