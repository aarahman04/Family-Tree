import dagre from "dagre";
import type { FamilyTree, UUID } from "../../../models/types.js";
import { getRelationships } from "../../../parser/relationships.js";

const DEFAULT_DEPTH = 2; // grandparents/parents/focus/children/grandchildren, siblings, spouses

/**
 * Hard cap on how many people a single neighborhood computation will include, independent
 * of depth. Depth alone doesn't bound size: a person with a very large sibling group (real
 * families in the wild have 8-10+ siblings, each with their own spouse and children) can
 * still pull in hundreds of people within 2 hops. This cap is what actually guarantees
 * "smooth interaction" regardless of family structure, not just depth-limiting.
 */
const MAX_NEIGHBORHOOD_SIZE = 150;

export interface NeighborhoodEdge {
  type: "parent-child" | "spouse";
  from: UUID;
  to: UUID;
}

export interface Neighborhood {
  nodeIds: UUID[];
  edges: NeighborhoodEdge[];
  /** People in the neighborhood who have at least one relation not yet shown — render an expand affordance for these. */
  expandable: Set<UUID>;
  /** True if MAX_NEIGHBORHOOD_SIZE cut the BFS short — surfaced rather than silently dropping people. */
  truncated: boolean;
}

function relatedIds(tree: FamilyTree, id: UUID): UUID[] {
  const rel = getRelationships(tree, id);
  return [rel.father, rel.mother, ...rel.spouses, ...rel.children, ...rel.siblings].filter(
    (x): x is UUID => Boolean(x)
  );
}

/**
 * Computes the bounded subgraph to actually render: a fixed-depth neighborhood around the
 * focus person, plus a 1-hop neighborhood around every explicitly-expanded person. This is
 * what makes performance independent of total tree size (see docs/explorer-architecture.md
 * "Performance considerations") — a 10,000-person tree and a 200-person tree cost the same
 * to lay out and render, because we never touch more than the visible neighborhood.
 */
export function computeNeighborhood(
  tree: FamilyTree,
  focusId: UUID,
  expandedIds: ReadonlySet<UUID>
): Neighborhood {
  if (!tree.persons[focusId])
    return { nodeIds: [], edges: [], expandable: new Set(), truncated: false };

  const included = new Set<UUID>();
  let truncated = false;

  function bfsInclude(startId: UUID, depth: number) {
    if (!tree.persons[startId]) return;
    included.add(startId);
    let frontier = [startId];
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next: UUID[] = [];
      for (const id of frontier) {
        for (const n of relatedIds(tree, id)) {
          if (included.has(n)) continue;
          if (included.size >= MAX_NEIGHBORHOOD_SIZE) {
            truncated = true;
            continue;
          }
          included.add(n);
          next.push(n);
        }
      }
      frontier = next;
    }
  }

  bfsInclude(focusId, DEFAULT_DEPTH);
  for (const id of expandedIds) bfsInclude(id, 1);

  const edges: NeighborhoodEdge[] = [];
  const spouseSeen = new Set<string>();
  for (const id of included) {
    const rel = getRelationships(tree, id);
    for (const childId of rel.children) {
      if (included.has(childId)) edges.push({ type: "parent-child", from: id, to: childId });
    }
    for (const spouseId of rel.spouses) {
      if (!included.has(spouseId)) continue;
      const key = [id, spouseId].sort().join("|");
      if (spouseSeen.has(key)) continue;
      spouseSeen.add(key);
      edges.push({ type: "spouse", from: id, to: spouseId });
    }
  }

  const expandable = new Set<UUID>();
  for (const id of included) {
    if (relatedIds(tree, id).some((r) => !included.has(r))) expandable.add(id);
  }

  return { nodeIds: [...included], edges, expandable, truncated };
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 72;

/** Lays out the (already-bounded) neighborhood with dagre. Spouse edges use minlen:0 so dagre is free to place couples on the same rank without forcing it. */
export function layoutNeighborhood(
  nodeIds: UUID[],
  edges: NeighborhoodEdge[]
): Map<UUID, LayoutPosition> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of nodeIds) g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) {
    if (e.type === "parent-child") {
      g.setEdge(e.from, e.to, { weight: 1 });
    } else {
      g.setEdge(e.from, e.to, { minlen: 0, weight: 2 });
    }
  }

  dagre.layout(g);

  const positions = new Map<UUID, LayoutPosition>();
  for (const id of nodeIds) {
    const n = g.node(id);
    if (!n) continue;
    positions.set(id, { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 });
  }
  return positions;
}
