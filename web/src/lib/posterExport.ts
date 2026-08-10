import type { PosterPageSize } from "../../../poster/types.js";

/**
 * jsPDF + svg2pdf.js are dynamically imported so their ~100KB+ (gzipped) footprint only
 * loads for users who actually open the poster export screen, never in the main bundle.
 * Both convert the SAME svgString the preview renders (poster/renderSvg.ts), so the
 * downloaded PDF is guaranteed to match what was previewed -- there's no second rendering
 * backend that could silently drift. See docs/poster-architecture.md.
 *
 * Always builds the PDF page at `page.pdfWidthPt`/`pdfHeightPt`, not the true
 * `widthPt`/`heightPt` -- for most trees these are identical, but the PDF format itself caps
 * a page at 14,400pt (confirmed against jsPDF, which otherwise silently clamps and clips),
 * so `poster/pageSize.ts` pre-scales those two down together when needed. Using the raw,
 * uncapped `widthPt`/`heightPt` here would ask jsPDF for a page larger than it allows and
 * the SVG content would clip at the clamp boundary instead of scaling to fit.
 */
export async function posterSvgToPdfBlob(svgString: string, page: PosterPageSize): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  const doc = new jsPDF({
    orientation: page.pdfWidthPt >= page.pdfHeightPt ? "landscape" : "portrait",
    unit: "pt",
    format: [page.pdfWidthPt, page.pdfHeightPt],
  });

  const svgElement = new DOMParser().parseFromString(svgString, "image/svg+xml").documentElement;
  await doc.svg(svgElement, { x: 0, y: 0, width: page.pdfWidthPt, height: page.pdfHeightPt });
  return doc.output("blob");
}

export function posterSvgToSvgBlob(svgString: string): Blob {
  return new Blob([svgString], { type: "image/svg+xml" });
}
