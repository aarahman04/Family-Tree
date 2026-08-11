import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { computeBalancedPosterLayout } from "../../../../poster/layoutBalanced.js";
import { computePosterPageSize } from "../../../../poster/pageSize.js";
import { renderPosterSvg } from "../../../../poster/renderSvg.js";
import { posterLayoutKey } from "../../../../poster/layoutKey.js";
import type { PosterNode } from "../../../../poster/types.js";
import { makeCanvasTextMeasurer } from "../../lib/canvasTextMeasure.js";
import { hitTestNode } from "../../lib/canvasHitTest.js";
import { immediateRelatives } from "../../lib/relatives.js";
import { buildPhotoMap } from "../../lib/resolvePhoto.js";
import { appearanceToStyle, type AppearancePrefs } from "../../lib/appearancePrefs.js";

interface EditorCanvasProps {
  tree: FamilyTree;
  /** Display mode / photo shape / living indicator — drives the shared poster style. */
  appearance: AppearancePrefs;
  selectedPersonId?: UUID;
  onSelectPerson: (id: UUID | undefined) => void;
  /** When this changes, the canvas re-centers on that person and briefly pulses them. */
  focusPersonId?: UUID;
  /** Notified whenever focus mode toggles, so the toolbar's View menu can reflect its state. */
  onFocusModeChange?: (focusMode: boolean) => void;
}

/** Imperative view actions the toolbar's View menu drives — keeps the toolbar decoupled from
 * the rendering internals. All of these only mutate the pan/zoom transform; none recompute the
 * layout or regenerate the SVG. */
export interface EditorCanvasHandle {
  fitTree(): void;
  fitWidth(): void;
  fitHeight(): void;
  posterScale(): void;
  centerSelection(): void;
  resetView(): void;
  toggleFocus(): void;
}

interface Transform {
  tx: number;
  ty: number;
  s: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 4;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const MINIMAP_MAX = { w: 160, h: 120 };

/**
 * The interactive tree view. Deliberately renders the EXACT SVG the Print Poster uses
 * (computeBalancedPosterLayout -> renderPosterSvg), then layers pan/zoom, click-to-select, a
 * minimap and a search pulse on top of it — so the editor and the poster can never drift apart.
 * The heavy work (layout, SVG string) is memoized on the tree; panning, zooming, selecting and
 * pulsing never regenerate it.
 */
// Wrapped in memo so unrelated editor state (toast, sidebar, unsaved indicator) never re-renders
// the canvas; it only re-renders when its own props change. Layout/SVG are additionally memoized
// on the tree, so even a real re-render never regenerates them unless the tree itself changed.
export const EditorCanvas = memo(
  forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
    { tree, appearance, selectedPersonId, onSelectPerson, focusPersonId, onFocusModeChange },
    ref
  ) {
    const style = useMemo(() => appearanceToStyle(appearance), [appearance]);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<Transform>({ tx: 0, ty: 0, s: 1 });
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [pulseId, setPulseId] = useState<UUID | undefined>(undefined);
    const [focusMode, setFocusModeState] = useState(false);

    const setFocusMode = useCallback(
      (next: boolean) => {
        setFocusModeState(next);
        onFocusModeChange?.(next);
      },
      [onFocusModeChange]
    );

    const hasPeople = Object.keys(tree.persons).length > 0;

    // In focus mode, everyone outside the selected person's immediate family dims. Computed in
    // content space, so the dim overlays live inside the transformed layer and don't recompute
    // on every pan/zoom.
    const relatives = useMemo(
      () =>
        focusMode && selectedPersonId ? immediateRelatives(tree, selectedPersonId) : undefined,
      [focusMode, selectedPersonId, tree]
    );

    const measurer = useMemo(() => makeCanvasTextMeasurer(style.fontFamily), [style.fontFamily]);
    // Memoize layout on the STRUCTURAL signature, not the tree object: a photo edit produces a new
    // tree but an unchanged key, so it reuses this (expensive) layout and only the SVG regenerates.
    // A geometry-affecting edit (name, dates incl. death year, display mode) changes the key.
    const layoutKey = useMemo(() => posterLayoutKey(tree, style), [tree, style]);
    const layout = useMemo(
      () => (hasPeople ? computeBalancedPosterLayout(tree, style, measurer) : undefined),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on layoutKey, not tree/style identity
      [layoutKey, measurer, hasPeople]
    );
    const page = useMemo(
      () => (layout ? computePosterPageSize(layout, style) : undefined),
      [layout, style]
    );
    // Photos are passed separately from layout (opaque hrefs), so changing them never re-runs
    // layout. Only built in photoCards mode; thumb quality in the editor (print is export-only).
    const photos = useMemo(
      () => (style.displayMode === "photoCards" ? buildPhotoMap(tree, "thumb") : undefined),
      [tree, style.displayMode]
    );
    const svg = useMemo(
      () => (layout && page ? renderPosterSvg(layout, page, style, photos) : ""),
      [layout, page, style, photos]
    );

    const nodeById = useMemo(() => {
      const m = new Map<UUID, PosterNode>();
      if (layout) for (const n of layout.nodes) m.set(n.personId, n);
      return m;
    }, [layout]);

    // Track the viewport size so fit / center / minimap all react to layout changes and resizes.
    useLayoutEffect(() => {
      const el = viewportRef.current;
      if (!el) return;
      const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const fitToView = useCallback(() => {
      if (!page || size.w === 0 || size.h === 0) return;
      const s = clampScale(Math.min(size.w / page.widthPt, size.h / page.heightPt) * 0.9);
      setTransform({
        s,
        tx: (size.w - page.widthPt * s) / 2,
        ty: (size.h - page.heightPt * s) / 2,
      });
    }, [page, size]);

    const centerOn = useCallback(
      (personId: UUID) => {
        const node = nodeById.get(personId);
        if (!node || size.w === 0 || size.h === 0) return;
        setTransform((prev) => ({
          s: prev.s,
          tx: size.w / 2 - (style.marginPt + node.x) * prev.s,
          ty: size.h / 2 - (style.marginPt + node.y) * prev.s,
        }));
      },
      [nodeById, size, style.marginPt]
    );

    // Fit once the layout/viewport is ready.
    useLayoutEffect(() => {
      fitToView();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, size.w, size.h]);

    // Re-center + pulse when the caller asks to focus someone (search / selection navigation).
    useEffect(() => {
      if (!focusPersonId) return;
      centerOn(focusPersonId);
      setPulseId(focusPersonId);
      const t = setTimeout(() => setPulseId(undefined), 2500);
      return () => clearTimeout(t);
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
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transform.tx,
        ty: transform.ty,
        moved: false,
      };
    }
    function onPointerMove(e: React.PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.moved) setTransform((prev) => ({ ...prev, tx: d.tx + dx, ty: d.ty + dy }));
    }
    function personAt(clientX: number, clientY: number): UUID | undefined {
      const el = viewportRef.current;
      if (!el || !layout) return undefined;
      const rect = el.getBoundingClientRect();
      const contentX = (clientX - rect.left - transform.tx) / transform.s;
      const contentY = (clientY - rect.top - transform.ty) / transform.s;
      return hitTestNode(layout.nodes, contentX, contentY, style.marginPt);
    }
    function onPointerUp(e: React.PointerEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || d.moved) return;
      onSelectPerson(personAt(e.clientX, e.clientY));
    }
    function onDoubleClick(e: React.MouseEvent) {
      const id = personAt(e.clientX, e.clientY);
      if (id) centerOn(id);
    }

    function zoomBy(factor: number) {
      setTransform((prev) => {
        const s = clampScale(prev.s * factor);
        const k = s / prev.s;
        return {
          s,
          tx: size.w / 2 - (size.w / 2 - prev.tx) * k,
          ty: size.h / 2 - (size.h / 2 - prev.ty) * k,
        };
      });
    }
    function centerSelection() {
      if (selectedPersonId && nodeById.has(selectedPersonId)) centerOn(selectedPersonId);
      else fitToView();
    }

    // View presets — transform-only, so they never recompute the layout or regenerate the SVG.
    function fitWidth() {
      if (!page || size.w === 0) return;
      const s = clampScale((size.w / page.widthPt) * 0.95);
      setTransform({ s, tx: (size.w - page.widthPt * s) / 2, ty: 16 });
    }
    function fitHeight() {
      if (!page || size.h === 0) return;
      const s = clampScale((size.h / page.heightPt) * 0.95);
      setTransform({ s, tx: 16, ty: (size.h - page.heightPt * s) / 2 });
    }
    function posterScale() {
      // Natural poster dimensions (1pt -> 1px); start at the top-left and pan across with the
      // existing viewport — no browser scrollbars, no second rendering path.
      setTransform({ s: 1, tx: 16, ty: 16 });
    }
    function resetView() {
      setFocusMode(false);
      fitToView();
    }

    useImperativeHandle(ref, () => ({
      fitTree: fitToView,
      fitWidth,
      fitHeight,
      posterScale,
      centerSelection,
      resetView,
      toggleFocus: () => setFocusMode(!focusMode),
    }));

    function overlayRect(personId: UUID) {
      const n = nodeById.get(personId);
      if (!n) return undefined;
      return {
        left: transform.tx + transform.s * (style.marginPt + n.x - n.width / 2),
        top: transform.ty + transform.s * (style.marginPt + n.y - n.height / 2),
        width: transform.s * n.width,
        height: transform.s * n.height,
      };
    }

    if (!hasPeople) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">This tree has no people yet.</p>
          <p className="text-sm text-slate-500">
            Use <span className="font-medium text-slate-700">Add person</span> in the toolbar to add
            the first one.
          </p>
        </div>
      );
    }

    const selRect = selectedPersonId ? overlayRect(selectedPersonId) : undefined;
    const pulseRect = pulseId ? overlayRect(pulseId) : undefined;

    // Minimap geometry.
    const mmScale = page
      ? Math.min(MINIMAP_MAX.w / page.widthPt, MINIMAP_MAX.h / page.heightPt)
      : 0;
    const mmW = page ? page.widthPt * mmScale : 0;
    const mmH = page ? page.heightPt * mmScale : 0;
    const viewRect =
      page && transform.s > 0
        ? {
            left: (-transform.tx / transform.s) * mmScale,
            top: (-transform.ty / transform.s) * mmScale,
            width: (size.w / transform.s) * mmScale,
            height: (size.h / transform.s) * mmScale,
          }
        : undefined;

    return (
      <div className="relative h-full w-full overflow-hidden bg-slate-50">
        <div
          ref={viewportRef}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          aria-label="Family tree canvas"
          role="application"
        >
          <div
            className="relative"
            style={{
              transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.s})`,
              transformOrigin: "0 0",
              width: page?.widthPt,
              height: page?.heightPt,
            }}
          >
            <div
              className="absolute inset-0"
              // The renderer's own trusted output (see poster/renderSvg.ts), never arbitrary
              // user HTML — the same trust boundary already used by PosterExportPanel's preview.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            {relatives &&
              layout?.nodes
                .filter((n) => !relatives.has(n.personId))
                .map((n) => (
                  <div
                    key={n.personId}
                    data-testid="focus-dim"
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-md bg-slate-50/75"
                    style={{
                      left: style.marginPt + n.x - n.width / 2,
                      top: style.marginPt + n.y - n.height / 2,
                      width: n.width,
                      height: n.height,
                    }}
                  />
                ))}
          </div>
          {selRect && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-md ring-2 ring-blue-500 ring-offset-1"
              style={selRect}
            />
          )}
          {pulseRect && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute animate-ping rounded-md ring-4 ring-emerald-400"
              style={pulseRect}
            />
          )}
        </div>

        {page && mmW > 0 && (
          <div
            aria-hidden="true"
            className="absolute bottom-3 left-3 overflow-hidden rounded border border-slate-300 bg-white/90 shadow-sm"
            style={{ width: mmW, height: mmH }}
          >
            {viewRect && (
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/10"
                style={{
                  left: Math.max(0, viewRect.left),
                  top: Math.max(0, viewRect.top),
                  width: Math.min(mmW, viewRect.width),
                  height: Math.min(mmH, viewRect.height),
                }}
              />
            )}
          </div>
        )}

        <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.2)}
            className="h-8 w-8 rounded text-lg text-slate-700 hover:bg-slate-100"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.2)}
            className="h-8 w-8 rounded text-lg text-slate-700 hover:bg-slate-100"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Center on selection"
            onClick={centerSelection}
            className="h-8 w-8 rounded text-sm text-slate-700 hover:bg-slate-100"
          >
            ⊙
          </button>
          <button
            type="button"
            aria-label="Focus mode"
            aria-pressed={focusMode}
            onClick={() => setFocusMode(!focusMode)}
            className={`h-8 w-8 rounded text-sm hover:bg-slate-100 ${
              focusMode ? "bg-emerald-100 text-emerald-700" : "text-slate-700"
            }`}
          >
            ◎
          </button>
          <button
            type="button"
            aria-label="Fit to view"
            onClick={fitToView}
            className="h-8 w-8 rounded text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Fit
          </button>
        </div>
      </div>
    );
  })
);
