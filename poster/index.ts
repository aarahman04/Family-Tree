export { computePosterLayout } from "./layout.js";
export { computePosterPageSize } from "./pageSize.js";
export { renderPosterSvg } from "./renderSvg.js";
export { DEFAULT_POSTER_STYLE, PDF_MAX_DIMENSION_PT } from "./types.js";
export { heuristicTextMeasurer, isRtlText, wrapText } from "./textMeasure.js";
export type { TextMeasurer } from "./textMeasure.js";
export { computePersonBox, computeChipBox } from "./boxSizing.js";
export type { MeasuredBox } from "./boxSizing.js";
export type {
  PosterChip,
  PosterConnector,
  PosterLayout,
  PosterNode,
  PosterPageSize,
  PosterStyleOptions,
  PosterTheme,
  MarriageConnector,
  DescentConnector,
} from "./types.js";
