import type { PosterPageSize } from "../../../poster/types.js";

/**
 * jsPDF + svg2pdf.js are dynamically imported so their ~100KB+ (gzipped) footprint only
 * loads for users who actually open the poster export screen, never in the main bundle.
 * Both convert the SAME svgString the preview renders (poster/renderSvg.ts), so the
 * downloaded PDF is guaranteed to match what was previewed -- there's no second rendering
 * backend that could silently drift. See docs/poster-architecture.md.
 */
export async function posterSvgToPdfBlob(svgString: string, page: PosterPageSize): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  const doc = new jsPDF({
    orientation: page.widthPt >= page.heightPt ? "landscape" : "portrait",
    unit: "pt",
    format: [page.widthPt, page.heightPt],
  });

  const svgElement = new DOMParser().parseFromString(svgString, "image/svg+xml").documentElement;
  await doc.svg(svgElement, { x: 0, y: 0, width: page.widthPt, height: page.heightPt });
  return doc.output("blob");
}

export function posterSvgToSvgBlob(svgString: string): Blob {
  return new Blob([svgString], { type: "image/svg+xml" });
}
