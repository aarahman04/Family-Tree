/**
 * Print poster layout model. Deliberately independent of the interactive explorer's
 * React Flow + dagre pipeline (see docs/poster-architecture.md) -- this is a dedicated
 * layout engine for a single, whole-tree, print-ready page.
 */

import type { UUID } from "../models/types.js";

export interface PosterNode {
  personId: UUID;
  generation: number;
  /** Center x position, in layout units (1 unit = one sibling-slot; see pageSize.ts for the
   * unit -> physical-size conversion). */
  x: number;
  name: string;
  birthYear?: number;
  deathYear?: number;
  gender: "male" | "female" | "unknown";
}

export interface MarriageConnector {
  kind: "marriage";
  personIds: [UUID, UUID];
}

/** Dashed line from a spouse's true (already-rendered-elsewhere) canonical position to the
 * marriage point of a family they're part of but aren't the anchor of -- see layout.ts's
 * "cousin marriage" handling. */
export interface CrossBranchConnector {
  kind: "cross-branch";
  fromPersonId: UUID;
  toMarriageAnchorId: UUID;
}

/** One shared branch per sibling group: a stub down from the parent(s)' midpoint to a
 * horizontal bus, then one stub per child -- never a separate line per child from the
 * parents themselves. `parentPersonIds` has 1 entry when only one spouse is rendered at
 * this marriage point (the other via a CrossBranchConnector, or simply absent). */
export interface DescentConnector {
  kind: "descent";
  parentPersonIds: UUID[];
  childPersonIds: UUID[];
}

export type PosterConnector = MarriageConnector | CrossBranchConnector | DescentConnector;

export interface PosterLayout {
  nodes: PosterNode[];
  connectors: PosterConnector[];
  /** Number of generation rows, i.e. 1 + the maximum generation index present in `nodes`. */
  generationCount: number;
  /** Widest generation row, in layout units -- drives the page's physical width. */
  maxRowWidth: number;
}

export type PosterTheme = "print"; // single theme for the "Focused" scope; see poster-architecture.md

export interface PosterStyleOptions {
  fontFamily: string;
  nameFontSize: number; // pt
  yearFontSize: number; // pt
  nodeWidth: number; // pt
  nodeHeight: number; // pt
  siblingSpacing: number; // pt, gap between adjacent sibling/marriage units
  generationSpacing: number; // pt, vertical gap between generation rows
  lineThickness: number; // pt
  marginPt: number; // pt, page margin on all sides
  textColor: string;
  lineColor: string;
  crossBranchColor: string;
  backgroundColor: string;
  maleIndicatorColor: string;
  femaleIndicatorColor: string;
}

export const DEFAULT_POSTER_STYLE: PosterStyleOptions = {
  fontFamily: "Helvetica, Arial, sans-serif",
  nameFontSize: 11,
  yearFontSize: 8.5,
  nodeWidth: 130,
  nodeHeight: 46,
  siblingSpacing: 24,
  generationSpacing: 70,
  lineThickness: 1.25,
  marginPt: 36,
  textColor: "#1a1a1a",
  lineColor: "#555555",
  crossBranchColor: "#b3541e",
  backgroundColor: "#ffffff",
  maleIndicatorColor: "#2b6cb0",
  femaleIndicatorColor: "#b83280",
};

export interface PosterPageSize {
  /** Page dimensions in points (1/72 inch), matching PDF/SVG conventions. */
  widthPt: number;
  heightPt: number;
  widthIn: number;
  heightIn: number;
}
