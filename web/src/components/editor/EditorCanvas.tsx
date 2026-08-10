import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { computeBalancedPosterLayout } from "../../../../poster/layoutBalanced.js";
import { computePosterPageSize } from "../../../../poster/pageSize.js";
import { renderPosterSvg } from "../../../../poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE } from "../../../../poster/types.js";
import { makeCanvasTextMeasurer } from "../../lib/canvasTextMeasure.js";
import { hitTestNode } from "../../lib/canvasHitTest.js";

interface EditorCanvasProps {
  tree: FamilyTree;
  selectedPersonId?: UUID;
  onSelectPerson: (id: UUID | undefined) => void;
  /** When this changes, the canvas re-centers on that person (e.g. after a search). */
  focusPersonId?: UUID;
}

interface Transform {
  tx: number;
  ty: number;
  s: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 4;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * The interactive tree view. Deliberately renders the EXACT SVG the Print Poster uses
 * (computeBalancedPosterLayout -> renderPosterSvg), then layers pan/zoom and click-to-select
 * on top of it — so the editor and the poster can never drift apart. The heavy work (layout,
 * SVG string) is memoized on the tree; panning, zooming and selecting never regenerate it.
 */
export function EditorCanvas({
  tree,
  selectedPersonId,
  onSelectPerson,
  focusPersonId,
}: EditorCanvasProps) {
  const style = DEFAULT_POSTER_STYLE;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ tx: 0, ty: 0, s: 1 });

  const hasPeople = Object.keys(tree.persons).length > 0;

  const measurer = useMemo(() => makeCanvasTextMeasurer(style.fontFamily), [style.fontFamily]);
  const layout = useMemo(
    () => (hasPeople ? computeBalancedPosterLayout(tree, style, measurer) : undefined),
    [tree, style, measurer, hasPeople]
  );
  const page = useMemo(
    () => (layout ? computePosterPageSize(layout, style) : undefined),
    [layout, style]
  );
  const svg = useMemo(
    () => (layout && page ? renderPosterSvg(layout, page, style) : ""),
    [layout, page, style]
  );

  const fitToView = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !page) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw === 0 || vh === 0) return;
    const s = clampScale(Math.min(vw / page.widthPt, vh / page.heightPt) * 0.9);
    setTransform({
      s,
      tx: (vw - page.widthPt * s) / 2,
      ty: (vh - page.heightPt * s) / 2,
    });
  }, [page]);

  const centerOn = useCallback(
    (personId: UUID) => {
      const el = viewportRef.current;
      const node = layout?.nodes.find((n) => n.personId === personId);
      if (!el || !node) return;
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      if (vw === 0 || vh === 0) return;
      setTransform((prev) => {
        const cx = style.marginPt + node.x;
        const cy = style.marginPt + node.y;
        return { s: prev.s, tx: vw / 2 - cx * prev.s, ty: vh / 2 - cy * prev.s };
      });
    },
    [layout, style.marginPt]
  );

  // Fit once the layout/viewport is ready.
  useLayoutEffect(() => {
    fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Re-center when the caller asks to focus someone (search/selection navigation).
  useEffect(() => {
    if (focusPersonId) centerOn(focusPersonId);
  }, [focusPersonId, centerOn]);

  // Wheel zoom toward the cursor. Attached natively (non-passive) so preventDefault works and
  // the page itself never scrolls while zooming the canvas.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setTransform((prev) => {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const s = clampScale(prev.s * factor);
        const k = s / prev.s;
        return { s, tx: mx - (mx - prev.tx) * k, ty: my - (my - prev.ty) * k };
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Drag to pan; a pointer-up that barely moved is treated as a click (hit-test to select).
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(
    null
  );
  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setTransform((prev) => ({ ...prev, tx: d.tx + dx, ty: d.ty + dy }));
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved || !layout) return;
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const contentX = (e.clientX - rect.left - transform.tx) / transform.s;
    const contentY = (e.clientY - rect.top - transform.ty) / transform.s;
    onSelectPerson(hitTestNode(layout.nodes, contentX, contentY, style.marginPt));
  }

  function zoomBy(factor: number) {
    const el = viewportRef.current;
    const vw = el?.clientWidth ?? 0;
    const vh = el?.clientHeight ?? 0;
    setTransform((prev) => {
      const s = clampScale(prev.s * factor);
      const k = s / prev.s;
      // Zoom around the viewport center.
      return { s, tx: vw / 2 - (vw / 2 - prev.tx) * k, ty: vh / 2 - (vh / 2 - prev.ty) * k };
    });
  }

  const selectedNode = selectedPersonId
    ? layout?.nodes.find((n) => n.personId === selectedPersonId)
    : undefined;

  if (!hasPeople) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        This tree has no people to display.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50">
      <div
        ref={viewportRef}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Family tree canvas"
        role="application"
      >
        <div
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.s})`,
            transformOrigin: "0 0",
            width: page?.widthPt,
            height: page?.heightPt,
          }}
          // The renderer's own trusted output (see poster/renderSvg.ts), never arbitrary
          // user HTML — the same trust boundary already used by PosterExportPanel's preview.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {selectedNode && page && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-md ring-2 ring-blue-500 ring-offset-1"
            style={{
              left: transform.tx + transform.s * (style.marginPt + selectedNode.x - selectedNode.width / 2),
              top: transform.ty + transform.s * (style.marginPt + selectedNode.y - selectedNode.height / 2),
              width: transform.s * selectedNode.width,
              height: transform.s * selectedNode.height,
            }}
          />
        )}
      </div>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.2)} className="h-8 w-8 rounded text-lg text-slate-700 hover:bg-slate-100">
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)} className="h-8 w-8 rounded text-lg text-slate-700 hover:bg-slate-100">
          −
        </button>
        <button type="button" aria-label="Fit to view" onClick={fitToView} className="h-8 w-8 rounded text-xs font-medium text-slate-700 hover:bg-slate-100">
          Fit
        </button>
      </div>
    </div>
  );
}
