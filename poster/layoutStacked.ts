/**
 * Stacked ("balanced") poster layout -- see docs/poster-architecture.md.
 *
 * A whole-tree top-down chart of a large, bushy family is inherently a very wide, very short
 * strip (473 people over 6 generations is ~580in x 9in -- a 65:1 ratio nobody can hang). This
 * layout keeps every guarantee of the flat engine but rearranges the result into a hangable
 * poster: the oldest root couple sits at the top, and each of their child-branches is stacked
 * as its own band down the page, joined to the root by a left-hand spine.
 *
 * It deliberately does NOT re-run placement. It calls the trusted flat engine
 * (computePosterLayout) once, then RELOCATES each branch as a rigid block. That is safe
 * because the flat engine already lays out each sibling branch as a disjoint, self-contained,
 * collision-free region, and cousin marriages are drawn with local chips + notes (never a line
 * between the two spouses) -- so moving a whole branch to its own band cannot create an
 * overlap, duplicate a person, or break a cross-branch cousin marriage.
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

const BAND_GAP = 90; // pt of vertical breathing room between stacked branch bands
const SPINE_GUTTER = 44; // pt from the spine trunk to the left edge of the band content

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function bboxOf(items: Box[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.x - it.width / 2);
    maxX = Math.max(maxX, it.x + it.width / 2);
    minY = Math.min(minY, it.y - it.height / 2);
    maxY = Math.max(maxY, it.y + it.height / 2);
  }
  return { minX, minY, maxX, maxY };
}

/** The child of the primary root under whom `personId` is canonically placed, or "root" for
 * the root couple itself, or "other" for anyone in a disconnected lineage. Derived from the
 * flat layout's OWN connector graph (not tree ancestry) so it matches exactly where each
 * person was actually drawn -- important for cousin-marriage children, which are placed under
 * a single anchor parent. */
function classifyBands(
  flat: PosterLayout,
  rootId: UUID,
  rootSpouseIds: Set<UUID>,
  branchHeadIds: UUID[]
): Map<UUID, string> {
  const parentToChildren = new Map<UUID, UUID[]>();
  const marriagePairs: [UUID, UUID][] = [];
  for (const c of flat.connectors) {
    if (c.kind === "descent") {
      for (const p of c.parentPersonIds) {
        const list = parentToChildren.get(p);
        if (list) list.push(...c.childPersonIds);
        else parentToChildren.set(p, [...c.childPersonIds]);
      }
    } else if (c.kind === "marriage") {
      marriagePairs.push([c.personIds[0], c.personIds[1]]);
    }
  }

  const band = new Map<UUID, string>();
  band.set(rootId, "root");
  for (const s of rootSpouseIds) band.set(s, "root");

  // BFS down each branch head's blood subtree.
  for (const head of branchHeadIds) {
    if (band.has(head)) continue;
    const queue = [head];
    band.set(head, head);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const child of parentToChildren.get(cur) ?? []) {
        if (!band.has(child)) {
          band.set(child, head);
          queue.push(child);
        }
      }
    }
  }

  // Married-in spouses inherit their partner's band (fixpoint -- a spouse chain is short).
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const [a, b] of marriagePairs) {
      if (band.has(a) && !band.has(b)) { band.set(b, band.get(a)!); changed = true; }
      else if (band.has(b) && !band.has(a)) { band.set(a, band.get(b)!); changed = true; }
    }
    if (!changed) break;
  }

  // Anyone still unclassified belongs to a disconnected lineage -> one shared "other" band.
  for (const n of flat.nodes) if (!band.has(n.personId)) band.set(n.personId, "other");
  return band;
}

export function computeStackedPosterLayout(
  tree: FamilyTree,
  style: PosterStyleOptions = DEFAULT_POSTER_STYLE,
  measure: TextMeasurer = heuristicTextMeasurer
): PosterLayout {
  // Left-aligned so each branch head sits at the top-LEFT of its subtree -- right next to the
  // spine after we relocate the band, keeping the spine connector short.
  const flat = computePosterLayout(tree, style, measure, "left");
  const nodeById = new Map(flat.nodes.map((n) => [n.personId, n]));

  // Primary root = the generation-0 person with the most descendants.
  const gen0 = flat.nodes.filter((n) => n.generation === 0);
  const descendantCount = (id: UUID): number => {
    const seen = new Set<UUID>();
    const walk = (pid: UUID) => {
      const p = tree.persons[pid];
      if (!p) return;
      for (const fid of p.famsIds) {
        for (const c of tree.families[fid]?.childrenIds ?? []) {
          if (!seen.has(c)) { seen.add(c); walk(c); }
        }
      }
    };
    walk(id);
    return seen.size;
  };
  const primary = gen0
    .map((n) => ({ id: n.personId, count: descendantCount(n.personId) }))
    .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1))[0];

  const rootId = primary?.id;
  const rootPerson = rootId ? tree.persons[rootId] : undefined;
  const rootSpouseIds = new Set<UUID>();
  const branchHeadIds: UUID[] = [];
  if (rootId && rootPerson) {
    for (const fid of rootPerson.famsIds) {
      const fam = tree.families[fid];
      if (!fam) continue;
      const spouse = fam.husbandId === rootId ? fam.wifeId : fam.husbandId;
      if (spouse) rootSpouseIds.add(spouse);
      for (const c of fam.childrenIds) if (nodeById.has(c)) branchHeadIds.push(c);
    }
  }

  // Nothing to stack (small/degenerate tree): return the flat layout untouched.
  if (!rootId || branchHeadIds.length < 2) return flat;

  // Order branches left-to-right by where the flat engine placed each head -- i.e. sibling
  // (birth) order -- so the stack reads in the same order as a normal chart.
  branchHeadIds.sort((a, b) => nodeById.get(a)!.x - nodeById.get(b)!.x);

  const band = classifyBands(flat, rootId, rootSpouseIds, branchHeadIds);

  // Gather each band's nodes + chips. Chips follow their host node's band.
  const chipBoxes = flat.chips.map((c) => ({ chip: c, box: c as unknown as Box }));
  type Group = { key: string; nodes: PosterNode[]; chips: PosterChip[] };
  const groups = new Map<string, Group>();
  const groupFor = (key: string): Group => {
    let g = groups.get(key);
    if (!g) { g = { key, nodes: [], chips: [] }; groups.set(key, g); }
    return g;
  };
  for (const n of flat.nodes) groupFor(band.get(n.personId) ?? "other").nodes.push(n);
  for (const { chip } of chipBoxes) groupFor(band.get(chip.anchorPersonId) ?? "other").chips.push(chip);

  // Stack order: root, then each branch head in sibling order, then the shared "other" band.
  const order = ["root", ...branchHeadIds, "other"].filter((k) => groups.has(k));

  const bandLeft = SPINE_GUTTER + 24; // content sits to the right of the spine trunk
  let cursorY = 0;
  for (const key of order) {
    const g = groups.get(key)!;
    const boxes: Box[] = [...g.nodes, ...g.chips];
    if (boxes.length === 0) continue;
    const bb = bboxOf(boxes);
    const dx = bandLeft - bb.minX;
    const dy = cursorY - bb.minY;
    for (const n of g.nodes) { n.x += dx; n.y += dy; }
    for (const c of g.chips) { c.x += dx; c.y += dy; }
    cursorY += bb.maxY - bb.minY + BAND_GAP;
  }

  // Rebuild connectors: drop the root couple's top-down descent to its children (that becomes
  // the spine); keep every other connector (all intra-band now, so still correct after the
  // rigid moves); add the spine from the root down to each branch head.
  const rootParents = new Set<UUID>([rootId, ...rootSpouseIds]);
  const connectors: PosterConnector[] = flat.connectors.filter(
    (c) => !(c.kind === "descent" && c.parentPersonIds.some((p) => rootParents.has(p)))
  );
  connectors.push({ kind: "spine", spineX: SPINE_GUTTER, fromPersonId: rootId, toPersonIds: branchHeadIds });

  // Normalize so the tight content box (nodes, chips AND the spine trunk) starts at (0,0).
  const allBoxes: Box[] = [...flat.nodes, ...flat.chips];
  const bb = bboxOf(allBoxes);
  const minX = Math.min(bb.minX, SPINE_GUTTER);
  const minY = bb.minY;
  for (const n of flat.nodes) { n.x -= minX; n.y -= minY; }
  for (const c of flat.chips) { c.x -= minX; c.y -= minY; }
  for (const c of connectors) if (c.kind === "spine") c.spineX -= minX;

  return {
    nodes: flat.nodes,
    chips: flat.chips,
    connectors,
    generationCount: flat.generationCount,
    contentWidth: bb.maxX - minX,
    contentHeight: bb.maxY - minY,
  };
}
