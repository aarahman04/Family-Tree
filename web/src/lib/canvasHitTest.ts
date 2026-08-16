import type { PosterNode } from "../../../src/poster/types.js";
import type { UUID } from "../../../src/models/types.js";

/**
 * Returns the id of the node whose box contains the given point, or undefined. Point
 * coordinates are in the poster's own content space (the same space `renderPosterSvg` draws
 * in): a node is centered at `(marginPt + node.x, marginPt + node.y)` with half-extents
 * `width/2` and `height/2`. Iterates in reverse so that, on overlap, the last-drawn (topmost)
 * node wins — matching how the SVG stacks nodes.
 */
export function hitTestNode(
  nodes: readonly PosterNode[],
  contentX: number,
  contentY: number,
  marginPt: number
): UUID | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const cx = marginPt + node.x;
    const cy = marginPt + node.y;
    if (Math.abs(contentX - cx) <= node.width / 2 && Math.abs(contentY - cy) <= node.height / 2) {
      return node.personId;
    }
  }
  return undefined;
}
