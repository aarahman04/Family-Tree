/**
 * Per-person and per-chip box auto-sizing -- see docs/poster-architecture.md's "Text
 * layout" section. Implements the "increase box width before increasing box height" rule:
 * a name only wraps to a second line once it would exceed `nodeMaxWidth` on one line, and a
 * single unbreakable word that still doesn't fit after wrapping widens the box further
 * rather than clipping (never overflow, never a clipped node).
 */

import { heuristicTextMeasurer, isRtlText, wrapText, type TextMeasurer } from "./textMeasure.js";
import type { PosterStyleOptions } from "./types.js";

const PADDING_X = 10; // pt, inside a box on each side
const PADDING_Y = 6;
const LINE_HEIGHT_RATIO = 1.25;

export interface MeasuredBox {
  width: number;
  height: number;
  lines: string[];
  rtl: boolean;
}

function wrappedLinesFor(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: TextMeasurer
): { lines: string[]; widestLineWidth: number } {
  const fullWidth = measure(text, fontSize) + PADDING_X * 2;
  if (fullWidth <= maxWidth) {
    return { lines: [text], widestLineWidth: fullWidth };
  }
  const lines = wrapText(text, maxWidth - PADDING_X * 2, fontSize, measure);
  const widestLineWidth = Math.max(...lines.map((l) => measure(l, fontSize) + PADDING_X * 2));
  return { lines, widestLineWidth };
}

export function computePersonBox(
  name: string,
  yearText: string | undefined,
  style: PosterStyleOptions,
  measure: TextMeasurer = heuristicTextMeasurer
): MeasuredBox {
  const rtl = isRtlText(name);
  const { lines, widestLineWidth } = wrappedLinesFor(name, style.nameFontSize, style.nodeMaxWidth, measure);
  const width = Math.max(style.nodeMinWidth, widestLineWidth);

  const nameLineHeight = style.nameFontSize * LINE_HEIGHT_RATIO;
  const yearLineHeight = yearText ? style.yearFontSize * LINE_HEIGHT_RATIO : 0;
  const height = Math.max(
    style.nodeMinHeight,
    PADDING_Y * 2 + lines.length * nameLineHeight + yearLineHeight
  );

  return { width, height, lines, rtl };
}

/** Chips use a smaller font and a tighter max width than a full person box -- they're a
 * pointer, not a record. */
export function computeChipBox(
  spouseName: string,
  style: PosterStyleOptions,
  measure: TextMeasurer = heuristicTextMeasurer
): MeasuredBox {
  const chipFontSize = style.yearFontSize;
  const chipMaxWidth = Math.max(style.nodeMinWidth * 0.85, style.nodeMaxWidth * 0.65);
  const label = "Spouse:";
  const pointer = "(see own entry)";

  const rtl = isRtlText(spouseName);
  const { lines: nameLines, widestLineWidth: nameWidth } = wrappedLinesFor(
    spouseName,
    chipFontSize,
    chipMaxWidth,
    measure
  );
  const labelWidth = measure(label, chipFontSize) + PADDING_X * 2;
  const pointerWidth = measure(pointer, chipFontSize * 0.9) + PADDING_X * 2;
  const width = Math.max(style.nodeMinWidth * 0.7, labelWidth, nameWidth, pointerWidth);

  const lineHeight = chipFontSize * LINE_HEIGHT_RATIO;
  const pointerLineHeight = chipFontSize * 0.9 * LINE_HEIGHT_RATIO;
  const lines = [label, ...nameLines, pointer];
  const height = Math.max(
    style.nodeMinHeight * 0.7,
    PADDING_Y * 2 + (1 + nameLines.length) * lineHeight + pointerLineHeight
  );

  return { width, height, lines, rtl };
}
