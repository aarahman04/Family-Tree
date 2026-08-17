import type { FamilyTree, UUID } from "../../../src/models/types.js";
import type { TreeAnalysis } from "../../../src/analysis/index.js";
import {
  BADGE_COUSIN_MARRIAGE,
  BADGE_INCOMPLETE_RECORD,
  BRANCH_MERGE_CLASS_NAME,
  type PosterAnalytics,
  type PosterFamilyAnalytics,
  type PosterNodeAnalytics,
} from "../../../src/poster/types.js";

/**
 * Translates a `TreeAnalysis` into the `PosterAnalytics` overlay that `renderPosterSvg` consumes
 * (CP5.7). This is the single producer for both the editor's insight mode and the export panel's
 * overlay toggles (CP5.8), so on-screen and exported posters can never disagree about what a
 * given colour or badge means.
 *
 * Deliberately NOT set here: `showGenerationBands`. Bands are row-layout only (D-13) — the editor
 * always uses `computeBalancedPosterLayout`, which stacks wings and leaves same-generation nodes
 * interleaved vertically, so a horizontal band would shade a slab containing almost none of its
 * generation. `PosterExportPanel` sets the flag itself when its row layout is selected.
 */

/** Cousin-closeness accents, closest first. Poster palette (warm, keyed to `chipBorderColor`
 * #b3541e), NOT dark-mode tokens — the poster is theme-exempt (invariant 4). Anything beyond
 * third cousins reuses the last, faintest entry. */
const COUSIN_DEGREE_COLORS = ["#b3541e", "#c67c3f", "#d3a066"];

/** Non-cousin consanguinity (siblings/avuncular) still reunites bloodlines and still earns a
 * coloured chip, but in the neutral accent rather than a cousin-degree one. */
const CONSANGUINEOUS_COLOR = "#8a6a4f";

function familyColor(analysis: TreeAnalysis, familyId: UUID): string | undefined {
  const marriage = analysis.marriages.get(familyId);
  if (!marriage?.sharesCommonAncestor) return undefined;
  if (!marriage.isCousinMarriage) return CONSANGUINEOUS_COLOR;
  const degree = marriage.relation.cousinDegree ?? 1;
  return COUSIN_DEGREE_COLORS[Math.min(degree, COUSIN_DEGREE_COLORS.length) - 1];
}

export function buildPosterAnalytics(tree: FamilyTree, analysis: TreeAnalysis): PosterAnalytics {
  const byFamily = new Map<UUID, PosterFamilyAnalytics>();
  for (const familyId of Object.keys(tree.families)) {
    const color = familyColor(analysis, familyId);
    if (color) byFamily.set(familyId, { color });
  }
  // A marriage that bridges two branches of the same family gets the branch-merge glyph. It is
  // set after the colour pass so a family that is both keeps its cousin-degree colour AND the
  // glyph; `className` is only ever compared against BRANCH_MERGE_CLASS_NAME by the renderer, so
  // there is no class token to lose here.
  for (const bridge of analysis.branches.marriageBridges) {
    byFamily.set(bridge.familyId, {
      ...byFamily.get(bridge.familyId),
      className: BRANCH_MERGE_CLASS_NAME,
    });
  }

  const byNode = new Map<UUID, PosterNodeAnalytics>();
  const addBadge = (personId: UUID, badge: string) => {
    const existing = byNode.get(personId);
    if (existing) existing.badges!.push(badge);
    else byNode.set(personId, { badges: [badge] });
  };
  // Incomplete-record first so it takes the leading badge slot consistently, ahead of the
  // relationship badge, whichever combination a person happens to have.
  for (const record of analysis.quality.incompleteRecords)
    addBadge(record.personId, BADGE_INCOMPLETE_RECORD);
  for (const marriage of analysis.cousinMarriages) {
    addBadge(marriage.husbandId, BADGE_COUSIN_MARRIAGE);
    addBadge(marriage.wifeId, BADGE_COUSIN_MARRIAGE);
  }

  return { byFamily, byNode };
}
