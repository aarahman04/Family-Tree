/**
 * Recursive "balanced" poster layout -- see docs/poster-architecture.md.
 *
 * Goal: a publication-quality genealogy poster, not just a narrow one. The flat engine draws a
 * correct but extreme strip (65:1 for the real sample); the single-level stacked engine helps
 * but still lets one huge branch dominate the width. This engine recursively rebalances: at
 * every couple it chooses, per node, whether to lay its children out in a ROW (classic bus) or
 * a stacked COLUMN (spine) -- whichever keeps that subtree's bounding box closest to square.
 * Wide branches are therefore split internally and recursively, minimising the overall aspect
 * ratio while every couple stays together and every parent stays directly above its children.
 *
 * The oldest root couple is the visual anchor: it sits at the TOP CENTRE and its branches fan
 * outward to the left AND right, so the poster expands from the centre rather than off one edge.
 *
 * This does NOT re-run placement geometry from scratch. It calls the
 * trusted flat engine once (for measured boxes, cousin chips, adjacency and the parent/child
 * graph), then RELOCATES each couple + subtree as rigid blocks. That keeps every guarantee the
 * flat engine already proves -- every person once, couples adjacent, cousin marriages as local
 * chips with children under a single anchor, no box overlaps -- while changing only arrangement.
 */

import type { FamilyTree, UUID } from "../models/types.js";
import { computePosterLayout } from "./layout.js";
import { heuristicTextMeasurer, type TextMeasurer } from "./textMeasure.js";
import {
  DEFAULT_POSTER_STYLE,
  type PosterChip,
  type PosterConnector,
  type PosterLayout,
  type PosterNode,
  type PosterStyleOptions,
} from "./types.js";

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const EMPTY: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
function extend(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
function boxOf(it: { x: number; y: number; width: number; height: number }): BBox {
  return { minX: it.x - it.width / 2, minY: it.y - it.height / 2, maxX: it.x + it.width / 2, maxY: it.y + it.height / 2 };
}

/** All nodes + chips a subtree owns, so it can be relocated as one rigid block. */
interface Block {
  headId: UUID;
  nodes: PosterNode[];
  chips: PosterChip[];
  bbox: BBox;
}
function blockBBox(b: Block): BBox {
  let bb = EMPTY;
  for (const n of b.nodes) bb = extend(bb, boxOf(n));
  for (const c of b.chips) bb = extend(bb, boxOf(c));
  return bb;
}
function translateBlock(b: Block, dx: number, dy: number) {
  for (const n of b.nodes) { n.x += dx; n.y += dy; }
  for (const c of b.chips) { c.x += dx; c.y += dy; }
  b.bbox = { minX: b.bbox.minX + dx, minY: b.bbox.minY + dy, maxX: b.bbox.maxX + dx, maxY: b.bbox.maxY + dy };
}
function mirrorBlockInPlace(b: Block) {
  // reflect horizontally about the block's own centre, so the head that sat near the left edge
  // now sits near the right edge -- used for the root's left wing so its head hugs the centre
  // spine and its descendants grow leftward (outward). All connectors are node-derived, so
  // they follow automatically.
  const axis = (b.bbox.minX + b.bbox.maxX) / 2;
  for (const n of b.nodes) n.x = 2 * axis - n.x;
  for (const c of b.chips) c.x = 2 * axis - c.x;
}

export function computeBalancedPosterLayout(
  tree: FamilyTree,
  style: PosterStyleOptions = DEFAULT_POSTER_STYLE,
  measure: TextMeasurer = heuristicTextMeasurer,
  /** Forwarded to `computePosterLayout` for the age-based living presumption -- see its note. */
  now: number = new Date().getFullYear()
): PosterLayout {
  const flat = computePosterLayout(tree, style, measure, now);
  const nodeById = new Map(flat.nodes.map((n) => [n.personId, n]));

  // ---- relationships extracted from the flat layout's own output ----
  const childrenOf = new Map<UUID, UUID[]>(); // anchor (first parent) -> blood children
  const partnerOf = new Map<UUID, UUID>(); // marriage-connector spouse (the adjacent, married-in one)
  const chipsByHost = new Map<UUID, PosterChip[]>();
  for (const c of flat.connectors) {
    if (c.kind === "descent") childrenOf.set(c.parentPersonIds[0]!, [...c.childPersonIds]);
    else if (c.kind === "marriage") {
      partnerOf.set(c.personIds[0], c.personIds[1]);
      partnerOf.set(c.personIds[1], c.personIds[0]);
    }
  }
  for (const chip of flat.chips) {
    const list = chipsByHost.get(chip.anchorPersonId);
    if (list) list.push(chip);
    else chipsByHost.set(chip.anchorPersonId, [chip]);
  }

  const GEN_GAP = style.generationSpacing; // parent row -> children row
  const SIB_GAP = style.horizontalSpacing * 1.6; // between sibling blocks in a row
  const BAND_GAP = style.generationSpacing * 0.7; // between stacked child blocks in a column
  const SPINE_STUB = 26; // spine trunk -> child head left edge
  const newConnectors: PosterConnector[] = flat.connectors.filter((c) => c.kind === "marriage");

  // The couple "header" = the anchor person + their adjacent spouse (if any) + any chips they
  // host (cousin-marriage spouse names). Kept rigid; relative offsets come from the flat run.
  function headerBlock(anchorId: UUID): Block {
    const nodes: PosterNode[] = [nodeById.get(anchorId)!];
    const partner = partnerOf.get(anchorId);
    if (partner && nodeById.has(partner) && !childrenOf.has(partner)) nodes.push(nodeById.get(partner)!);
    const chips = chipsByHost.get(anchorId) ?? [];
    const b: Block = { headId: anchorId, nodes, chips, bbox: EMPTY };
    b.bbox = blockBBox(b);
    return b;
  }

  const owned = new Set<UUID>();

  /** Lay out `anchorId`'s whole subtree with its own arrangement chosen for balance, leaving
   * the anchor's node at the block's current (unnormalised) coordinates; returns the block. */
  function layout(anchorId: UUID): Block {
    owned.add(anchorId);
    const header = headerBlock(anchorId);
    for (const n of header.nodes) owned.add(n.personId);
    const kids = (childrenOf.get(anchorId) ?? []).filter((k) => nodeById.has(k));
    if (kids.length === 0) return header;

    // Recurse first so each child's block is already internally balanced and measured.
    const childBlocks = kids.map((k) => layout(k));

    // Candidate 1: a single ROW of children (classic descent bus).
    const rowW = childBlocks.reduce((s, b) => s + (b.bbox.maxX - b.bbox.minX), 0) + SIB_GAP * (childBlocks.length - 1);
    const rowH = Math.max(...childBlocks.map((b) => b.bbox.maxY - b.bbox.minY));
    // Candidate 2: a COLUMN of children (spine).
    const colW = Math.max(...childBlocks.map((b) => b.bbox.maxX - b.bbox.minX));
    const colH = childBlocks.reduce((s, b) => s + (b.bbox.maxY - b.bbox.minY), 0) + BAND_GAP * (childBlocks.length - 1);

    const headerBB = header.bbox;
    const headerW = headerBB.maxX - headerBB.minX;
    const headerH = headerBB.maxY - headerBB.minY;
    const headCx = (headerBB.minX + headerBB.maxX) / 2;

    // Whole-block dimensions for each arrangement; pick the one closest to square.
    const rowBlockW = Math.max(headerW, rowW);
    const rowBlockH = headerH + GEN_GAP + rowH;
    const colBlockW = Math.max(headerW, SPINE_STUB + colW);
    const colBlockH = headerH + GEN_GAP + colH;
    const rowScore = Math.max(rowBlockW, rowBlockH);
    const colScore = Math.max(colBlockW, colBlockH);
    // Single child: never a spine (a bus reads cleaner). Otherwise minimise the larger side.
    const stack = childBlocks.length > 1 && colScore < rowScore;

    const bandTop = headerBB.maxY + GEN_GAP;
    if (!stack) {
      let cursor = headCx - rowW / 2;
      for (const cb of childBlocks) {
        const w = cb.bbox.maxX - cb.bbox.minX;
        translateBlock(cb, cursor - cb.bbox.minX, bandTop - cb.bbox.minY);
        cursor += w + SIB_GAP;
      }
      const parents = header.nodes.length > 1 ? [anchorId, header.nodes[1]!.personId] : [anchorId];
      newConnectors.push({ kind: "descent", parentPersonIds: parents, childPersonIds: kids });
    } else {
      // Stacked column: children hang to the RIGHT of the anchor's trunk (its centre x), so the
      // node-derived spine's vertical trunk never crosses them.
      const anchorX = nodeById.get(anchorId)!.x;
      const colLeft = anchorX + SPINE_STUB;
      let cursorY = bandTop;
      for (const cb of childBlocks) {
        const h = cb.bbox.maxY - cb.bbox.minY;
        translateBlock(cb, colLeft - cb.bbox.minX, cursorY - cb.bbox.minY);
        cursorY += h + BAND_GAP;
      }
      newConnectors.push({ kind: "spine", fromPersonId: anchorId, toPersonIds: kids });
    }

    const block: Block = { headId: anchorId, nodes: header.nodes, chips: header.chips, bbox: EMPTY };
    for (const cb of childBlocks) { block.nodes.push(...cb.nodes); block.chips.push(...cb.chips); }
    block.bbox = blockBBox(block);
    return block;
  }

  // ---- primary root: the generation-0 person with the most descendants ----
  const gen0 = flat.nodes.filter((n) => n.generation === 0);
  const descendantCount = (id: UUID): number => {
    const seen = new Set<UUID>();
    const walk = (pid: UUID) => {
      for (const k of childrenOf.get(pid) ?? []) if (!seen.has(k)) { seen.add(k); walk(k); }
    };
    walk(id);
    return seen.size;
  };
  const rootId = gen0.map((n) => ({ id: n.personId, c: descendantCount(n.personId) }))
    .sort((a, b) => b.c - a.c || (a.id < b.id ? -1 : 1))[0]?.id;

  if (!rootId) return flat;

  const rootKids = (childrenOf.get(rootId) ?? []).filter((k) => nodeById.has(k));

  // With no branches to balance, fall back to the plain balanced subtree from the root.
  if (rootKids.length < 2) {
    const only = layout(rootId);
    return finalize(only.nodes, only.chips);
  }

  // Root is the anchor at TOP CENTRE; its branches fan out to both sides. Lay out each branch
  // block, then split them left/right (largest first, always to the shorter side) so the two
  // wings stay balanced in height.
  const rootHeader = headerBlock(rootId);
  for (const n of rootHeader.nodes) owned.add(n.personId);
  owned.add(rootId);

  const branches = rootKids
    .map((k) => layout(k))
    .sort((a, b) => (b.bbox.maxY - b.bbox.minY) - (a.bbox.maxY - a.bbox.minY));

  const rootBB = rootHeader.bbox;
  const rootX = nodeById.get(rootId)!.x; // trunk of the (node-derived) root spine
  const wingTop = rootBB.maxY + GEN_GAP;
  const GUTTER = style.horizontalSpacing * 2; // clear gutter on each side of the centre trunk

  const heads: UUID[] = [];
  let leftY = wingTop, rightY = wingTop;
  for (const br of branches) {
    if (rightY <= leftY) {
      // right wing: head hugs the trunk, descendants grow rightward
      translateBlock(br, rootX + GUTTER - br.bbox.minX, rightY - br.bbox.minY);
      rightY = br.bbox.maxY + BAND_GAP;
    } else {
      // left wing: mirror so the head hugs the trunk, descendants grow leftward
      mirrorBlockInPlace(br);
      translateBlock(br, rootX - GUTTER - br.bbox.maxX, leftY - br.bbox.minY);
      leftY = br.bbox.maxY + BAND_GAP;
    }
    heads.push(br.headId);
  }
  newConnectors.push({ kind: "spine", fromPersonId: rootId, toPersonIds: heads });

  return finalize(flat.nodes, flat.chips);

  function finalize(nodes: PosterNode[], chips: PosterChip[]): PosterLayout {
    // Bounding box of the main chart = everything the recursive walk actually placed.
    let bb = EMPTY;
    for (const n of nodes) if (owned.has(n.personId)) bb = extend(bb, boxOf(n));
    for (const c of chips) if (owned.has(c.anchorPersonId)) bb = extend(bb, boxOf(c));

    // Any people the walk never owned (disconnected fragments) keep their flat arrangement but are
    // moved as one rigid block to sit BELOW the main chart, left-aligned to it — so they never
    // overlap it and never clip off the top/left edge. (Left in their flat positions they'd retain
    // coordinates that can collide with the relocated chart, or fall at negative offsets.)
    const fragNodes = nodes.filter((n) => !owned.has(n.personId));
    const fragChips = chips.filter((c) => !owned.has(c.anchorPersonId));
    if (bb.minX !== Infinity && (fragNodes.length > 0 || fragChips.length > 0)) {
      let fragBB = EMPTY;
      for (const n of fragNodes) fragBB = extend(fragBB, boxOf(n));
      for (const c of fragChips) fragBB = extend(fragBB, boxOf(c));
      const dx = bb.minX - fragBB.minX;
      const dy = bb.maxY + GEN_GAP - fragBB.minY;
      for (const n of fragNodes) { n.x += dx; n.y += dy; }
      for (const c of fragChips) { c.x += dx; c.y += dy; }
    }

    const minX = bb.minX === Infinity ? 0 : bb.minX;
    const minY = bb.minY === Infinity ? 0 : bb.minY;
    for (const n of nodes) { n.x -= minX; n.y -= minY; }
    for (const c of chips) { c.x -= minX; c.y -= minY; }

    let final = EMPTY;
    for (const n of nodes) final = extend(final, boxOf(n));
    for (const c of chips) final = extend(final, boxOf(c));
    return {
      nodes,
      chips,
      connectors: newConnectors,
      generationCount: flat.generationCount,
      contentWidth: final.maxX === -Infinity ? 0 : final.maxX,
      contentHeight: final.maxY === -Infinity ? 0 : final.maxY,
    };
  }
}
