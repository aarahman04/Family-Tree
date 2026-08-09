import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { computeNeighborhood, layoutNeighborhood } from "../../lib/neighborhood.js";
import { PersonNode, type PersonNodeData } from "./PersonNode.js";

const nodeTypes = { person: PersonNode };

export interface FamilyTreeCanvasProps {
  tree: FamilyTree;
  focusPersonId: UUID;
  expandedIds: ReadonlySet<UUID>;
  selectedPersonId?: UUID;
  onSelectPerson: (id: UUID) => void;
  onExpand: (id: UUID) => void;
}

function CanvasInner({
  tree,
  focusPersonId,
  expandedIds,
  selectedPersonId,
  onSelectPerson,
  onExpand,
}: FamilyTreeCanvasProps) {
  const { fitView } = useReactFlow();

  const {
    nodeIds,
    edges: rawEdges,
    expandable,
    truncated,
  } = useMemo(
    () => computeNeighborhood(tree, focusPersonId, expandedIds),
    [tree, focusPersonId, expandedIds]
  );
  const positions = useMemo(() => layoutNeighborhood(nodeIds, rawEdges), [nodeIds, rawEdges]);

  const warningPersonIds = useMemo(() => {
    const ids = new Set<UUID>();
    for (const issue of tree.validation.issues) {
      for (const id of issue.relatedIds) ids.add(id);
    }
    return ids;
  }, [tree.validation]);

  const nodes: Node<PersonNodeData>[] = useMemo(
    () =>
      nodeIds.map((id) => {
        const person = tree.persons[id]!;
        const pos = positions.get(id) ?? { x: 0, y: 0 };
        return {
          id,
          type: "person",
          position: pos,
          data: {
            label: person.name.trim() || "(no name)",
            gender: person.gender,
            birthYear: person.birth?.date?.year,
            deathYear: person.death?.date?.year,
            selected: id === selectedPersonId,
            expandable: expandable.has(id),
            hasWarning: warningPersonIds.has(id),
            onSelect: () => onSelectPerson(id),
            onExpand: () => onExpand(id),
          },
        };
      }),
    [
      nodeIds,
      positions,
      tree,
      selectedPersonId,
      expandable,
      warningPersonIds,
      onSelectPerson,
      onExpand,
    ]
  );

  const edges: Edge[] = useMemo(
    () =>
      rawEdges.map((e, i) => {
        if (e.type === "parent-child") {
          return {
            id: `pc-${i}-${e.from}-${e.to}`,
            source: e.from,
            target: e.to,
            sourceHandle: "b",
            targetHandle: "t",
            type: "smoothstep",
            style: { stroke: "#94a3b8", strokeWidth: 1.5 },
          };
        }
        const posA = positions.get(e.from);
        const posB = positions.get(e.to);
        const fromIsLeft = !posA || !posB || posA.x <= posB.x;
        const [leftId, rightId] = fromIsLeft ? [e.from, e.to] : [e.to, e.from];
        return {
          id: `sp-${i}-${e.from}-${e.to}`,
          source: leftId,
          target: rightId,
          sourceHandle: "r",
          targetHandle: "l",
          type: "straight",
          style: { stroke: "#db2777", strokeWidth: 2, strokeDasharray: "4 3" },
        };
      }),
    [rawEdges, positions]
  );

  // Re-frame whenever the focus person changes, or the neighborhood re-lays-out (e.g. after
  // an expand click) — this is how "center the view on any individual" (including from
  // search) is implemented. Fits the WHOLE current neighborhood into view (not just a fixed
  // zoom around the focus point): a depth-2 neighborhood routinely spans more vertical/
  // horizontal space than fits at zoom 1, which used to leave grandparents, spouses, or
  // children just off-screen (and, since onlyRenderVisibleElements culls off-screen nodes
  // from the DOM entirely, not even rendered) right after a search or navigation — the user
  // would see one card with dangling edges and have to manually zoom out to see who they
  // connect to. maxZoom keeps a lone person from being zoomed in absurdly close.
  useEffect(() => {
    if (positions.size === 0) return;
    fitView({ padding: 0.15, duration: 400, maxZoom: 1 });
  }, [focusPersonId, positions, fitView]);

  return (
    // Absolutely positioned against the nearest positioned ancestor (FamilyTreeCanvas's
    // div, which is itself sized via flex-grow) rather than sized via height:100% — a
    // flex-item's flex-grow-derived size is not treated as "definite" for a further
    // height:100% descendant to resolve against in Chromium, which silently collapsed
    // this to 0 height on narrow (mobile) viewports. inset-0 sidesteps that percentage-
    // resolution ambiguity entirely with a hard pixel box instead.
    <div className="absolute inset-0">
      {truncated && (
        <p
          role="status"
          className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-800 shadow"
        >
          Showing a partial view — this area of the tree is very densely connected. Use search to
          jump elsewhere.
        </p>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        aria-label="Family tree visualization"
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

/** React Flow's imperative viewport API (setCenter etc.) only works inside a ReactFlowProvider. */
export function FamilyTreeCanvas(props: FamilyTreeCanvasProps) {
  return (
    <div className="relative min-h-0 flex-1 w-full">
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
