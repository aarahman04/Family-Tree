/**
 * Text measurement for box auto-sizing -- see docs/poster-architecture.md's "Text layout"
 * section. `poster/` is framework-free (no DOM/canvas dependency, so it stays importable by
 * plain Node tests), so the default measurer here is a character-width heuristic rather than
 * a real font metric. `computePosterLayout` accepts a `TextMeasurer` override; the web app
 * passes a `canvas.measureText`-backed one (web/src/lib/canvasTextMeasure.ts) for pixel-
 * accurate wrapping against the actual rendered font, while tests get fully deterministic
 * behavior from the heuristic without needing a DOM.
 */

export type TextMeasurer = (text: string, fontSizePt: number) => number;

const ARABIC_RANGES: Array<[number, number]> = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
];

export function isRtlText(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ARABIC_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) return true;
  }
  return false;
}

/** Average glyph advance width, as a fraction of font size (em). Rough but stable across
 * environments; see the module doc comment for why this isn't real font metrics. */
function charWidthEm(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === " " || ch === "\t") return 0.28;
  if (ARABIC_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) return 0.52;
  if (code >= 0x4e00 && code <= 0x9fff) return 1.0; // CJK -- defensive fallback, not a target script
  if (ch >= "A" && ch <= "Z") return 0.72;
  if (ch >= "0" && ch <= "9") return 0.55;
  if ("mwMW".includes(ch)) return 0.85;
  if ("iIl.,;:'|!".includes(ch)) return 0.3;
  if (/[a-z]/.test(ch)) return 0.5;
  return 0.45; // punctuation and anything else unclassified
}

export const heuristicTextMeasurer: TextMeasurer = (text, fontSizePt) => {
  let widthEm = 0;
  for (const ch of text) widthEm += charWidthEm(ch);
  return widthEm * fontSizePt;
};

/** Greedy word-wrap: packs words onto a line until the next word would exceed maxWidth, per
 * the measurer supplied. A single word wider than maxWidth on its own occupies its own line
 * unsplit (see poster/boxSizing.ts for how the box then widens rather than clipping it). */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSizePt: number,
  measure: TextMeasurer
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (measure(candidate, fontSizePt) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}
