/**
 * Print poster layout model (V2) -- see docs/poster-architecture.md.
 *
 * Deliberately independent of the interactive explorer's React Flow + dagre pipeline -- this
 * is a dedicated, publication-quality layout engine for a single, whole-tree, print-ready
 * page. All physical measurements are in points (1/72 inch), matching PDF/SVG conventions.
 */

import type { UUID } from "../models/types.js";

export type DisplayMode = "minimal" | "compact" | "photoCards";
export type PhotoShape = "square" | "rounded" | "circle";

export interface PosterNode {
  personId: UUID;
  generation: number;
  /** Center coordinates, in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  /** Word-wrapped display lines for `name` -- see poster/boxSizing.ts. Never empty. */
  nameLines: string[];
  yearLine?: string;
  /** Set only when this person is the non-anchor spouse of a cousin marriage: a small,
   * visually distinct pointer ("children shown in <anchor>'s branch") on their OWN box,
   * naming the real person their descendants are grouped under -- never a placeholder. */
  noteLine?: string;
  rtl: boolean;
  gender: "male" | "female" | "unknown";
  /** True when no death event is recorded. Derived, does not affect geometry. */
  living?: boolean;
}

/**
 * A compact annotation, not a person box: rendered at a cousin-marriage's non-canonical
 * marriage point instead of a second copy of that spouse's node or a connector line spanning
 * the poster. The spouse still has exactly one real node elsewhere (under their own blood
 * parents) -- this chip only names them and points there. See poster/layout.ts's "Cousin
 * marriage handling".
 */
export interface PosterChip {
  familyId: UUID;
  anchorPersonId: UUID;
  spousePersonId: UUID;
  generation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  rtl: boolean;
}

export interface MarriageConnector {
  kind: "marriage";
  personIds: [UUID, UUID];
}

/** One shared branch per sibling group: a stub down from the parent(s)' midpoint to a
 * horizontal bus, then one stub per child -- never a separate line per child from the
 * parents themselves. `parentPersonIds` has 1 entry when the other spouse at this marriage
 * point is a chip rather than a rendered node (or when only one parent is known). */
export interface DescentConnector {
  kind: "descent";
  parentPersonIds: UUID[];
  childPersonIds: UUID[];
}

/** A "spine" bracket used by the balanced layout to connect one ancestor (`fromPersonId`) down
 * to branch heads (`toPersonIds`) stacked in a column instead of a row. Rendered node-derived
 * (no stored coordinates, so it moves with the nodes): a vertical trunk dropping from the
 * ancestor, with a short horizontal stub to each head's near edge -- heads may sit on either
 * side of the trunk (the root's two wings), and the stub always enters from the facing side,
 * so the spine never crosses band content the way a top-down descent bus would. */
export interface SpineConnector {
  kind: "spine";
  fromPersonId: UUID;
  toPersonIds: UUID[];
}

export type PosterConnector = MarriageConnector | DescentConnector | SpineConnector;

export interface PosterLayout {
  nodes: PosterNode[];
  chips: PosterChip[];
  connectors: PosterConnector[];
  generationCount: number;
  /** Tight bounding box of every node/chip, in points -- before margins. */
  contentWidth: number;
  contentHeight: number;
}

export type PosterTheme = "print";

export interface PosterStyleOptions {
  fontFamily: string;
  nameFontSize: number; // pt
  yearFontSize: number; // pt
  /** A box never shrinks below this width even for a short name. */
  nodeMinWidth: number; // pt
  /** A box grows to fit a name up to this width before it wraps to a second line -- the
   * "increase width before height" rule. A single unbreakable word can still exceed this
   * (the box widens further rather than clipping text). */
  nodeMaxWidth: number; // pt
  nodeMinHeight: number; // pt
  /** Minimum gap enforced between any two boxes/chips, both by initial placement and by the
   * collision-resolution pass. */
  horizontalSpacing: number; // pt
  generationSpacing: number; // pt, vertical gutter between generation rows
  lineThickness: number; // pt
  marginPt: number; // pt, page margin on all sides
  textColor: string;
  lineColor: string;
  chipBorderColor: string;
  chipFillColor: string;
  backgroundColor: string;
  maleIndicatorColor: string;
  femaleIndicatorColor: string;
  /** Card style. "compact" reproduces the original box exactly. */
  displayMode: DisplayMode;
  /** Clip shape applied to photos and photo placeholders. */
  photoShape: PhotoShape;
  /** Show a small living/deceased status dot on photo cards. */
  showLivingIndicator: boolean;
}

export const DEFAULT_POSTER_STYLE: PosterStyleOptions = {
  fontFamily: "Helvetica, Arial, sans-serif",
  nameFontSize: 11,
  yearFontSize: 8.5,
  nodeMinWidth: 100,
  nodeMaxWidth: 220,
  nodeMinHeight: 40,
  horizontalSpacing: 22,
  generationSpacing: 64,
  lineThickness: 1.25,
  marginPt: 40,
  textColor: "#1a1a1a",
  lineColor: "#555555",
  chipBorderColor: "#b3541e",
  chipFillColor: "#fdf3ea",
  backgroundColor: "#ffffff",
  maleIndicatorColor: "#2b6cb0",
  femaleIndicatorColor: "#b83280",
  displayMode: "compact",
  photoShape: "rounded",
  showLivingIndicator: false,
};

/** PDF page geometry is capped at 14,400pt (200in) per side by the PDF format itself --
 * jsPDF silently clamps to this and would otherwise clip content. See pageSize.ts. */
export const PDF_MAX_DIMENSION_PT = 14400;

/**
 * Optional analysis overlay for `renderPosterSvg` (Phase 5, CP5.1). Threading this through is
 * purely additive: every consumer (CP5.2-5.8) looks up entries defensively (a missing family/node
 * id means "no overlay"), and `renderPosterSvg` with `analytics` omitted entirely must produce
 * byte-identical output to before this type existed -- CP5.1's own contract, proven against the
 * existing `poster-render`/`poster-layout` test suites plus the real 473-person sample.
 */
export interface PosterFamilyAnalytics {
  /** Cousin-marriage classification token (e.g. "first-cousins") for chip/connector styling. */
  className?: string;
  /** Stroke/fill override for this family's marriage connector or chip. */
  color?: string;
}

export interface PosterNodeAnalytics {
  /** Badge glyphs rendered via the `renderCardExtras` extension point. */
  badges?: string[];
  /** Card background tint override. */
  tint?: string;
}

export interface PosterAnalytics {
  byFamily?: ReadonlyMap<UUID, PosterFamilyAnalytics>;
  byNode?: ReadonlyMap<UUID, PosterNodeAnalytics>;
  /** Whole-poster overlay toggles, e.g. generation bands. */
  showGenerationBands?: boolean;
}

export interface PosterPageSize {
  /** The tree's true required size -- never capped, whatever it takes to keep names
   * readable. This is exactly what the SVG export uses. */
  widthPt: number;
  heightPt: number;
  widthIn: number;
  heightIn: number;
  widthMm: number;
  heightMm: number;
  /** 1 if the true size is within the PDF format's page-size limit; otherwise the uniform
   * factor the PDF is scaled down by to fit, and pdfWidthPt/pdfHeightPt is what that scaled
   * PDF page is actually generated at. The content stays fully vector either way -- a print
   * shop can scale the PDF back up to `widthPt`/`heightPt` with zero quality loss, exactly
   * like an architectural drawing printed from a scaled plot. */
  pdfScale: number;
  pdfWidthPt: number;
  pdfHeightPt: number;
}
