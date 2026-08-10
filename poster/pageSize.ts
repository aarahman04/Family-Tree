/**
 * Converts a computed PosterLayout into physical page dimensions -- no named presets, no
 * tiling: per the confirmed scope, the page is exactly as wide and as tall as the tree
 * needs to keep names readable, however wide that turns out to be. See
 * docs/poster-architecture.md.
 */

import { PDF_MAX_DIMENSION_PT, type PosterLayout, type PosterPageSize, type PosterStyleOptions } from "./types.js";

const PT_PER_IN = 72;
const MM_PER_IN = 25.4;

export function computePosterPageSize(
  layout: PosterLayout,
  style: PosterStyleOptions
): PosterPageSize {
  const widthPt = Math.max(style.nodeMinWidth, layout.contentWidth) + style.marginPt * 2;
  const heightPt = Math.max(style.nodeMinHeight, layout.contentHeight) + style.marginPt * 2;

  // The true size is never capped -- that's what the SVG export encodes directly. The PDF
  // format itself caps a page at 14,400pt (200in) per side (confirmed against jsPDF, which
  // otherwise silently clamps and clips content); when the tree genuinely needs more than
  // that, the PDF is generated at a uniform scale-down so it stays valid, fully vector, and
  // losslessly rescalable by a print shop -- see docs/poster-architecture.md.
  const largestDimension = Math.max(widthPt, heightPt);
  const pdfScale = largestDimension > PDF_MAX_DIMENSION_PT ? PDF_MAX_DIMENSION_PT / largestDimension : 1;

  return {
    widthPt,
    heightPt,
    widthIn: widthPt / PT_PER_IN,
    heightIn: heightPt / PT_PER_IN,
    widthMm: (widthPt / PT_PER_IN) * MM_PER_IN,
    heightMm: (heightPt / PT_PER_IN) * MM_PER_IN,
    pdfScale,
    pdfWidthPt: widthPt * pdfScale,
    pdfHeightPt: heightPt * pdfScale,
  };
}
