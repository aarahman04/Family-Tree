import type { FamilyTree, UUID } from "../../../src/models/types.js";
import { isPresumedLiving } from "./insights.js";
import type { TreeAnalysis } from "../../../src/analysis/index.js";
import {
  BADGE_COUSIN_MARRIAGE,
  BADGE_INCOMPLETE_RECORD,
  BRANCH_MERGE_CLASS_NAME,
  type PosterAnalytics,
  type PosterFamilyAnalytics,
  type PosterNodeAnalytics,
} from "../../../src/poster/types.js";

export interface PosterAnalyticsOptions {
  /**
   * Whether the relationship overlay may be drawn for people who are only PRESUMED living
   * (`isPresumedLiving`). Deliberately required, not defaulted: this is a privacy control, and a
   * new call site that forgets it should fail to compile rather than silently leak.
   *
   * It covers EVERY visual that announces the sensitive fact, not just the per-person badge: the
   * cousin/consanguinity accent colour and the branch-merge glyph name the same couple just as
   * plainly, so all three are withheld together. (Gating only the badge left the glyph on the
   * exported poster while the UI promised otherwise — CP5.8 review.)
   *
   * `true` in the private, local editor — nothing leaves the device. `false` at every export
   * boundary (SVG/PDF/shared artifact) unless the user explicitly opts in, because cousin
   * marriage is a socially- and sometimes legally-sensitive attribute in which a living person
   * retains an interest that a deceased person, as historical record, does not. Non-sensitive
   * data-quality badges (incomplete record) are never withheld.
   *
   * D-2 known limitation: this rests on a heuristic, so a living person misclassified as deceased
   * (e.g. a missing death record) can still have a sensitive overlay exported. `poster/layout.ts`
   * derives its own living dot from `death === undefined` with no age cap, so the two can disagree
   * for a person born over `MAX_PLAUSIBLE_AGE` ago with no death record — see the continuity doc.
   */
  sensitiveBadgesForLiving: boolean;
  /** Opt in to generation bands. Only pass `true` under the ROW layout (D-13). */
  generationBands?: boolean;
  /** Current year, for the presumptive-living rule. Defaults to now. */
  now?: number;
}

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

/**
 * Translates a `TreeAnalysis` into the `PosterAnalytics` overlay that `renderPosterSvg` consumes
 * (CP5.7). This is the single producer for both the editor's insight mode and the export panel's
 * overlay toggles (CP5.8), so on-screen and exported posters can never disagree about what a
 * given colour or badge means.
 *
 * Generation bands are row-layout only (D-13), so `generationBands` is the CALLER's call: the
 * editor never passes it (`computeBalancedPosterLayout` stacks wings and leaves same-generation
 * nodes interleaved vertically, so a horizontal band would shade a slab containing almost none of
 * its generation), and `PosterExportPanel` passes it only while its row layout is selected.
 */
export function buildPosterAnalytics(
  tree: FamilyTree,
  analysis: TreeAnalysis,
  options: PosterAnalyticsOptions
): PosterAnalytics {
  const now = options.now ?? new Date().getFullYear();
  const badgeAllowed = (personId: UUID) => {
    if (options.sensitiveBadgesForLiving) return true;
    const person = tree.persons[personId];
    // An unknown id is treated as living: withholding is the safe direction for a privacy gate.
    return person !== undefined && !isPresumedLiving(person, now);
  };
  // Every family-level overlay is gated on BOTH spouses, since one glyph/colour names the couple
  // as a unit — unlike a per-person badge, it cannot be shown for only the deceased half.
  const familyAllowed = (familyId: UUID) => {
    const family = tree.families[familyId];
    if (!family) return false;
    return [family.husbandId, family.wifeId].every((id) => id !== undefined && badgeAllowed(id));
  };

  const byFamily = new Map<UUID, PosterFamilyAnalytics>();
  for (const familyId of Object.keys(tree.families)) {
    if (!familyAllowed(familyId)) continue;
    const color = familyColor(analysis, familyId);
    if (color) byFamily.set(familyId, { color });
  }
  // A marriage that bridges two branches of the same family gets the branch-merge glyph. It is
  // set after the colour pass so a family that is both keeps its cousin-degree colour AND the
  // glyph; `className` is only ever compared against BRANCH_MERGE_CLASS_NAME by the renderer, so
  // there is no class token to lose here.
  for (const bridge of analysis.branches.marriageBridges) {
    if (!familyAllowed(bridge.familyId)) continue;
    byFamily.set(bridge.familyId, {
      ...byFamily.get(bridge.familyId),
      className: BRANCH_MERGE_CLASS_NAME,
    });
  }

  const byNode = new Map<UUID, PosterNodeAnalytics>();
  const addBadge = (personId: UUID, badge: string) => {
    const existing = byNode.get(personId);
    // Deduped: someone in two cousin marriages earns ONE badge, not two identical glyphs side by
    // side, which would read as a different and stronger signal (CP5.8 review).
    if (existing) {
      if (!existing.badges!.includes(badge)) existing.badges!.push(badge);
    } else byNode.set(personId, { badges: [badge] });
  };
  // Incomplete-record first so it takes the leading badge slot consistently, ahead of the
  // relationship badge, whichever combination a person happens to have.
  for (const record of analysis.quality.incompleteRecords)
    addBadge(record.personId, BADGE_INCOMPLETE_RECORD);
  for (const marriage of analysis.cousinMarriages) {
    // Per-spouse, not per-couple: a deceased person's badge is not withheld just because their
    // surviving spouse's is.
    if (badgeAllowed(marriage.husbandId)) addBadge(marriage.husbandId, BADGE_COUSIN_MARRIAGE);
    if (badgeAllowed(marriage.wifeId)) addBadge(marriage.wifeId, BADGE_COUSIN_MARRIAGE);
  }

  return options.generationBands
    ? { byFamily, byNode, showGenerationBands: true }
    : { byFamily, byNode };
}
