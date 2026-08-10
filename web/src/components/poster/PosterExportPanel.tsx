import { useMemo, useRef, useState } from "react";
import type { FamilyTree } from "../../../../models/types.js";
import { computePosterLayout } from "../../../../poster/layout.js";
import { computeBalancedPosterLayout } from "../../../../poster/layoutBalanced.js";
import { computePosterPageSize } from "../../../../poster/pageSize.js";
import { renderPosterSvg } from "../../../../poster/renderSvg.js";
import { DEFAULT_POSTER_STYLE, type PosterStyleOptions } from "../../../../poster/types.js";
import { makeCanvasTextMeasurer } from "../../lib/canvasTextMeasure.js";
import { posterSvgToPdfBlob, posterSvgToSvgBlob } from "../../lib/posterExport.js";

interface PosterExportPanelProps {
  tree: FamilyTree;
  sourceFileName: string;
}

function posterFileName(sourceFileName: string, ext: string): string {
  const base = sourceFileName.replace(/\.ftz$/i, "");
  return `${base || "family-tree"}-poster.${ext}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function formatMeters(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)}m` : `${Math.round(mm)}mm`;
}

/**
 * The dedicated print-poster feature: a whole-tree, single continuously-sized page (no A4
 * presets, no tiling -- "print as wide as it goes" per the confirmed scope), built entirely
 * on the poster/ package's multi-pass, collision-aware layout engine rather than the
 * interactive explorer's React Flow + dagre layout. See docs/poster-architecture.md.
 */
export function PosterExportPanel({ tree, sourceFileName }: PosterExportPanelProps) {
  const [style, setStyle] = useState<PosterStyleOptions>(DEFAULT_POSTER_STYLE);
  const [layoutMode, setLayoutMode] = useState<"balanced" | "flat">("balanced");
  const [zoomPercent, setZoomPercent] = useState(10);
  const [pdfStage, setPdfStage] = useState<"idle" | "generating" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | undefined>(undefined);
  const previewRef = useRef<HTMLDivElement>(null);

  // A canvas.measureText-backed measurer gives pixel-accurate box sizing against the actual
  // rendered font in the browser -- poster/'s own default (used by tests and any non-browser
  // caller) is a character-width heuristic that can't do this. Both feed the exact same
  // layout algorithm; only the measurement precision differs.
  const measurer = useMemo(() => makeCanvasTextMeasurer(style.fontFamily), [style.fontFamily]);

  const layout = useMemo(
    () =>
      layoutMode === "balanced"
        ? computeBalancedPosterLayout(tree, style, measurer)
        : computePosterLayout(tree, style, measurer),
    [tree, style, measurer, layoutMode]
  );
  const page = useMemo(() => computePosterPageSize(layout, style), [layout, style]);
  const svg = useMemo(() => renderPosterSvg(layout, page, style), [layout, page, style]);

  function updateStyle<K extends keyof PosterStyleOptions>(key: K, value: PosterStyleOptions[K]) {
    setStyle((prev) => ({ ...prev, [key]: value }));
  }

  function handleDownloadSvg() {
    downloadBlob(posterSvgToSvgBlob(svg), posterFileName(sourceFileName, "svg"));
  }

  async function handleDownloadPdf() {
    setPdfStage("generating");
    setPdfError(undefined);
    try {
      const blob = await posterSvgToPdfBlob(svg, page);
      downloadBlob(blob, posterFileName(sourceFileName, "pdf"));
      setPdfStage("idle");
    } catch (err) {
      setPdfStage("error");
      setPdfError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleFitToPage() {
    const available = previewRef.current?.clientWidth;
    if (!available || page.widthPt === 0) return;
    const fitPercent = Math.max(1, Math.floor((available / page.widthPt) * 100));
    setZoomPercent(Math.min(fitPercent, 100));
  }

  const scale = zoomPercent / 100;
  const isScaledForPdf = page.pdfScale < 1;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Print poster</h2>
        <p className="mt-1 text-xs text-slate-600">
          One continuous page sized to fit the whole tree at a readable name size — no A4 splitting,
          no shrinking to fit.{" "}
          <strong className="font-semibold text-slate-800">Download the SVG</strong> and take it
          straight to a print shop: it is fully vector, has no size limit, and prints crisp at any
          width, however long the tree needs to be.
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium text-slate-700">Layout</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              [
                "balanced",
                "Balanced",
                "Recommended — root centered, branches balanced for a hangable poster",
              ],
              ["flat", "Single row", "One continuous top-down chart — very wide for large trees"],
            ] as const
          ).map(([mode, label, hint]) => (
            <label
              key={mode}
              className={`flex-1 min-w-[180px] cursor-pointer rounded-md border px-3 py-2 text-xs ${
                layoutMode === mode
                  ? "border-blue-500 bg-blue-50 text-slate-900"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="poster-layout"
                value={mode}
                checked={layoutMode === mode}
                onChange={() => setLayoutMode(mode)}
                className="sr-only"
              />
              <span className="font-semibold">{label}</span>
              {layoutMode === mode && <span className="ml-1 text-blue-700">✓</span>}
              <span className="mt-0.5 block text-slate-500">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs text-slate-600">
        <dt>People</dt>
        <dd className="col-span-2 font-medium text-slate-900">{layout.nodes.length}</dd>
        <dt>Generations</dt>
        <dd className="col-span-2 font-medium text-slate-900">{layout.generationCount}</dd>
        <dt>Poster size</dt>
        <dd className="col-span-2 font-medium text-slate-900">
          {formatMeters(page.widthMm)} × {formatMeters(page.heightMm)}
          <span className="ml-1 text-slate-500">
            ({page.widthIn.toFixed(1)}in × {page.heightIn.toFixed(1)}in)
          </span>
        </dd>
      </dl>

      {isScaledForPdf && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This tree needs a poster larger than the PDF format's own page-size limit (200in / 5.08m
          per side), so the PDF download is generated at{" "}
          <strong>{Math.round(page.pdfScale * 10000) / 100}% scale</strong> — fully vector, so a
          print shop can scale it back up to {formatMeters(page.widthMm)} ×{" "}
          {formatMeters(page.heightMm)} with zero quality loss, the same way oversized architectural
          drawings are printed. The SVG download has no such limit and encodes the true full size
          directly — prefer it if your print shop accepts SVG.
        </p>
      )}

      <details className="rounded-md border border-slate-200 bg-slate-50 text-sm">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-slate-700 hover:text-slate-900">
          Customize appearance
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 px-3 py-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Name font size (pt)
            <input
              type="number"
              min={6}
              max={24}
              value={style.nameFontSize}
              onChange={(e) => updateStyle("nameFontSize", Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Min box width (pt)
            <input
              type="number"
              min={60}
              max={400}
              value={style.nodeMinWidth}
              onChange={(e) => updateStyle("nodeMinWidth", Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Max box width before wrapping (pt)
            <input
              type="number"
              min={100}
              max={600}
              value={style.nodeMaxWidth}
              onChange={(e) => updateStyle("nodeMaxWidth", Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Spacing between boxes (pt)
            <input
              type="number"
              min={4}
              max={100}
              value={style.horizontalSpacing}
              onChange={(e) => updateStyle("horizontalSpacing", Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Generation spacing (pt)
            <input
              type="number"
              min={20}
              max={200}
              value={style.generationSpacing}
              onChange={(e) => updateStyle("generationSpacing", Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Line thickness (pt)
            <input
              type="number"
              min={0.5}
              max={5}
              step={0.25}
              value={style.lineThickness}
              onChange={(e) => updateStyle("lineThickness", Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Margin (pt)
            <input
              type="number"
              min={0}
              max={144}
              value={style.marginPt}
              onChange={(e) => updateStyle("marginPt", Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Text color
            <input
              type="color"
              value={style.textColor}
              onChange={(e) => updateStyle("textColor", e.target.value)}
              className="h-8 rounded border border-slate-300"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Line color
            <input
              type="color"
              value={style.lineColor}
              onChange={(e) => updateStyle("lineColor", e.target.value)}
              className="h-8 rounded border border-slate-300"
            />
          </label>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="poster-zoom" className="text-xs text-slate-600">
          Preview zoom
        </label>
        <input
          id="poster-zoom"
          type="range"
          min={1}
          max={100}
          value={zoomPercent}
          onChange={(e) => setZoomPercent(Number(e.target.value))}
          className="w-32"
        />
        <span className="w-10 text-xs tabular-nums text-slate-600">{zoomPercent}%</span>
        <button
          type="button"
          onClick={handleFitToPage}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Fit to view
        </button>
        <button
          type="button"
          onClick={() => setZoomPercent(100)}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Actual size
        </button>
      </div>

      <div
        ref={previewRef}
        className="max-h-[60vh] overflow-auto rounded border border-slate-200 bg-slate-50"
        aria-label="Poster preview"
      >
        <div style={{ width: page.widthPt * scale, height: page.heightPt * scale }}>
          <div
            style={{
              width: page.widthPt,
              height: page.heightPt,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            // The renderer's own output -- see poster/renderSvg.ts's escapeXml -- not
            // arbitrary user HTML, so this mirrors the trust boundary already accepted for
            // exported GEDCOM/SVG downloads elsewhere in the app.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleDownloadSvg}
          className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Download SVG
        </button>
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
          Recommended for printing
        </span>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={pdfStage === "generating"}
          className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {pdfStage === "generating"
            ? "Generating PDF…"
            : isScaledForPdf
              ? "Download PDF (scaled copy)"
              : "Download PDF"}
        </button>
      </div>

      {pdfStage === "error" && (
        <p className="text-xs text-red-700" role="alert">
          Couldn't generate the PDF{pdfError ? `: ${pdfError}` : "."} Try the SVG download instead —
          most print shops and vector editors accept it directly.
        </p>
      )}
    </div>
  );
}
