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
const NOTE_FONT_RATIO = 0.82; // the "children shown in X's branch" note is smaller than the name

export interface MeasuredBox {
  width: number;
  height: number;
  lines: string[];
  /** A smaller, visually distinct line (see renderSvg.ts) pointing to where this person's
   * descendants are actually shown -- only set for the non-anchor spouse of a cousin
   * marriage. Never a placeholder: always names the real person their descendants are
   * grouped under. */
  noteLine?: string;
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
  branchNoteAnchorName: string | undefined,
  style: PosterStyleOptions,
  measure: TextMeasurer = heuristicTextMeasurer
): MeasuredBox {
  const rtl = isRtlText(name);
  const { lines, widestLineWidth } = wrappedLinesFor(name, style.nameFontSize, style.nodeMaxWidth, measure);

  const noteLine = branchNoteAnchorName ? `children shown in ${branchNoteAnchorName}'s branch` : undefined;
  const noteFontSize = style.yearFontSize * NOTE_FONT_RATIO;
  const noteWidth = noteLine ? measure(noteLine, noteFontSize) + PADDING_X * 2 : 0;

  const width = Math.max(style.nodeMinWidth, widestLineWidth, noteWidth);

  const nameLineHeight = style.nameFontSize * LINE_HEIGHT_RATIO;
  const yearLineHeight = yearText ? style.yearFontSize * LINE_HEIGHT_RATIO : 0;
  const noteLineHeight = noteLine ? noteFontSize * LINE_HEIGHT_RATIO : 0;
  const height = Math.max(
    style.nodeMinHeight,
    PADDING_Y * 2 + lines.length * nameLineHeight + yearLineHeight + noteLineHeight
  );

  return { width, height, lines, noteLine, rtl };
}

/** Chips use a smaller font and a tighter max width than a full person box -- they're a
 * compact pointer to a real record, not a second copy of it. Content is the person's actual
 * name only (prefixed with a marriage glyph) -- never a "Spouse:" / "(see own entry)"
 * placeholder-style label. */
export function computeChipBox(
  spouseName: string,
  style: PosterStyleOptions,
  measure: TextMeasurer = heuristicTextMeasurer
): MeasuredBox {
  const chipFontSize = style.yearFontSize;
  const chipMaxWidth = Math.max(style.nodeMinWidth * 0.85, style.nodeMaxWidth * 0.65);
  const displayText = `⚭ ${spouseName}`;

  const rtl = isRtlText(spouseName);
  const { lines, widestLineWidth } = wrappedLinesFor(displayText, chipFontSize, chipMaxWidth, measure);
  const width = Math.max(style.nodeMinWidth * 0.6, widestLineWidth);

  const lineHeight = chipFontSize * LINE_HEIGHT_RATIO;
  const height = Math.max(style.nodeMinHeight * 0.55, PADDING_Y * 2 + lines.length * lineHeight);

  return { width, height, lines, rtl };
}
