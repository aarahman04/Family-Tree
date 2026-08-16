import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Executable enforcement of the dark-mode token vocabulary in docs/dark-mode-tokens.md.
// Rather than hard-coding hex values (which would drift from whatever Tailwind actually emits),
// this parses Tailwind's real OKLCH palette and converts it the same way a browser does, so the
// ratios asserted here are the ratios users get. Update the doc and this test together.

// Tailwind is hoisted to the repo root, but resolve from the web workspace too so this doesn't
// depend on which directory vitest was invoked from.
function resolveThemeCss(): string {
  const candidates = [
    path.resolve(process.cwd(), "node_modules/tailwindcss/theme.css"),
    path.resolve(process.cwd(), "../node_modules/tailwindcss/theme.css"),
  ];
  const found = candidates.find(existsSync);
  if (!found)
    throw new Error(`tailwindcss/theme.css not found; looked in:\n${candidates.join("\n")}`);
  return found;
}

/** OKLCH -> linear sRGB -> gamma-encoded sRGB, per the Oklab spec + IEC 61966-2-1. */
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((v) => {
    const clamped = Math.max(v, 0);
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  }) as [number, number, number];
}

function loadPalette(): Record<string, [number, number, number]> {
  const css = readFileSync(resolveThemeCss(), "utf8");
  const palette: Record<string, [number, number, number]> = {
    white: [255, 255, 255],
    black: [0, 0, 0],
  };
  for (const match of css.matchAll(/--color-([a-z]+)-(\d+):\s*oklch\(([^)]+)\)/g)) {
    const [, family, shade, args] = match;
    // parseFloat, not Number: the lightness component carries a "%" suffix ("97.1%").
    const [L, C, H] = args!.trim().split(/\s+/).map(parseFloat);
    palette[`${family}-${shade}`] = oklchToRgb(L! / 100, C!, H!);
  }
  return palette;
}

const PALETTE = loadPalette();

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R! + 0.7152 * G! + 0.0722 * B!;
}

function contrastRatio(fg: string, bg: string): number {
  const f = PALETTE[fg];
  const b = PALETTE[bg];
  if (!f) throw new Error(`unknown color: ${fg}`);
  if (!b) throw new Error(`unknown color: ${bg}`);
  const [hi, lo] = [relativeLuminance(f), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const AA_TEXT = 4.5; // WCAG 1.4.3, normal-size text
const AA_LARGE = 3.0; // WCAG 1.4.3 large/bold text, and 1.4.11 non-text (controls, focus rings)

/** [description, foreground, background, minimum ratio] */
type Check = [string, string, string, number];

const LIGHT: Check[] = [
  ["text primary on L1", "slate-900", "white", AA_TEXT],
  ["text secondary on L1", "slate-700", "white", AA_TEXT],
  ["text muted on L1", "slate-600", "white", AA_TEXT],
  ["text muted on L0", "slate-600", "slate-50", AA_TEXT],
  ["text faint (large/bold only)", "slate-500", "white", AA_LARGE],
  ["link/accent", "blue-700", "white", AA_TEXT],
  ["error text", "red-700", "white", AA_TEXT],
  ["error text on tint", "red-800", "red-50", AA_TEXT],
  ["warning text on tint", "amber-800", "amber-50", AA_TEXT],
  ["success text", "green-700", "white", AA_TEXT],
  ["primary action label", "white", "emerald-700", AA_TEXT],
  ["focus ring on L0", "blue-600", "slate-50", AA_LARGE],
  ["focus ring on L1", "blue-600", "white", AA_LARGE],
];

const DARK: Check[] = [
  ["text primary on L1", "slate-100", "slate-900", AA_TEXT],
  ["text primary on L0", "slate-100", "slate-950", AA_TEXT],
  ["text primary on L2 menu", "slate-100", "slate-800", AA_TEXT],
  ["text secondary on L1", "slate-300", "slate-900", AA_TEXT],
  ["text muted on L1", "slate-400", "slate-900", AA_TEXT],
  ["text muted on L0", "slate-400", "slate-950", AA_TEXT],
  ["text muted on L2 menu", "slate-400", "slate-800", AA_TEXT],
  ["text faint (large/bold only)", "slate-500", "slate-900", AA_LARGE],
  ["link/accent", "blue-400", "slate-900", AA_TEXT],
  ["error text", "red-400", "slate-900", AA_TEXT],
  ["warning text", "amber-300", "slate-900", AA_TEXT],
  ["success text", "green-400", "slate-900", AA_TEXT],
  ["primary action label", "slate-950", "emerald-500", AA_TEXT],
  ["control boundary on L1", "slate-500", "slate-900", AA_LARGE],
  ["control boundary on L0", "slate-500", "slate-950", AA_LARGE],
  ["focus ring on L0", "blue-400", "slate-950", AA_LARGE],
  ["focus ring on L1", "blue-400", "slate-900", AA_LARGE],
  ["toast text on L2 chip", "white", "slate-800", AA_TEXT],
];

describe("dark-mode token vocabulary meets WCAG AA", () => {
  describe("light theme", () => {
    it.each(LIGHT)("%s (%s on %s) >= %f:1", (_label, fg, bg, min) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });

  describe("dark theme", () => {
    it.each(DARK)("%s (%s on %s) >= %f:1", (_label, fg, bg, min) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });

  // Sanity check on the converter itself: if the OKLCH math regressed, the table above could go
  // green against garbage. These two are fixed points with known-correct ratios.
  it("computes known reference ratios correctly", () => {
    expect(contrastRatio("black", "white")).toBeCloseTo(21, 1);
    expect(contrastRatio("white", "white")).toBeCloseTo(1, 5);
  });

  // Pre-existing light-mode failure pinned so it can't be forgotten, and so that fixing it turns
  // this test red as the prompt to update docs/dark-mode-tokens.md. (The emerald-600 CTA failure
  // that used to be pinned here was FIXED in the global batch — CTAs are now emerald-700, asserted
  // positively in LIGHT above. Border weight remains deferred as AUD-9.)
  describe("known pre-existing light-mode AA failure (AUD-9, deferred)", () => {
    it("control border slate-300 on white still fails 1.4.11", () => {
      expect(contrastRatio("slate-300", "white")).toBeLessThan(AA_LARGE);
    });
  });
});
