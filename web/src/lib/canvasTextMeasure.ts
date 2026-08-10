import type { TextMeasurer } from "../../../poster/textMeasure.js";

/**
 * Pixel-accurate text measurement for the poster layout engine, backed by a real
 * `CanvasRenderingContext2D.measureText` against the actual configured font -- used only in
 * the browser (poster/ itself stays framework-free and falls back to a heuristic measurer
 * for Node/tests; see poster/textMeasure.ts).
 *
 * CSS defines 1pt = 4/3 CSS px (both are fixed ratios of the CSS inch, unrelated to device
 * pixel density) -- setting `ctx.font` in "pt" renders the glyph at the correct physical
 * size for the poster's point-based coordinate system, but `measureText` still returns its
 * width in CSS px, so the result is converted back to points (px * 0.75) before returning.
 * Skipping this conversion would under-measure every box by a third and reintroduce exactly
 * the text-overflow bug this measurer exists to avoid.
 */
const PT_PER_PX = 0.75;

export function makeCanvasTextMeasurer(fontFamily: string): TextMeasurer {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  return (text, fontSizePt) => {
    if (!ctx) return text.length * fontSizePt * 0.55; // defensive fallback if canvas 2d is unavailable
    ctx.font = `${fontSizePt}pt ${fontFamily}`;
    return ctx.measureText(text).width * PT_PER_PX;
  };
}
