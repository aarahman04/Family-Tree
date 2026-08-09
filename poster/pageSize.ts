/**
 * Converts an abstract PosterLayout (positions in "sibling slot" units) into one
 * auto-sized physical page -- no named presets, no tiling: per the confirmed "Focused"
 * scope, the page is exactly as wide and as tall as the tree needs to keep names readable,
 * however wide that turns out to be. See docs/poster-architecture.md.
 */

import type { PosterLayout, PosterPageSize, PosterStyleOptions } from "./types.js";

const PT_PER_IN = 72;

export function computePosterPageSize(
  layout: PosterLayout,
  style: PosterStyleOptions
): PosterPageSize {
  const slotWidth = style.nodeWidth + style.siblingSpacing;
  const rowHeight = style.nodeHeight + style.generationSpacing;

  const contentWidth = Math.max(style.nodeWidth, layout.maxRowWidth * slotWidth - style.siblingSpacing);
  const contentHeight = Math.max(
    style.nodeHeight,
    layout.generationCount * rowHeight - style.generationSpacing
  );

  const widthPt = contentWidth + style.marginPt * 2;
  const heightPt = contentHeight + style.marginPt * 2;

  return {
    widthPt,
    heightPt,
    widthIn: widthPt / PT_PER_IN,
    heightIn: heightPt / PT_PER_IN,
  };
}
