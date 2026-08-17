import type { Person } from "./types.js";

/**
 * The project's single living/deceased rule.
 *
 * Family-tree data almost never records who is still alive — people fill in births and marriages
 * and leave death blank whether the person died or not. So "living" here is a PRESUMPTION from
 * the recorded data, never a fact, and everything built on it must be labelled as an estimate.
 *
 * This lives in `models/` rather than `analysis/` deliberately: `poster/` and `analysis/` both
 * need it, and `poster/` must not take a dependency on `analysis/`. Before this module the rule
 * existed in three places with two different definitions (`web/src/lib/insights.ts` and
 * `src/analysis/branches.ts` capped the age; `src/poster/layout.ts` did not), which meant a
 * poster card could show a green "Living" dot for someone the insights panel counted as deceased.
 *
 * NOT to be used for the export privacy gate in `web/src/lib/posterAnalytics.ts`. That gate
 * deliberately requires a RECORDED death before it will reveal a sensitive relationship overlay,
 * because an age-based presumption would disclose a living centenarian's cousin marriage on an
 * export whose opt-in was switched off. See CP5.10 / decision D-18.
 */

/** Nobody is presumed to still be living past this age. */
export const MAX_PLAUSIBLE_AGE = 100;

/**
 * True when `person` should be presented as (presumed) living.
 *
 * A recorded death is decisive. Otherwise the age cap applies, using the person's own recorded
 * birth year when there is one and falling back to `estimatedBirthYear` — which is what lets
 * people with no dates of their own still be classified, via `analysis/timeline.ts`'s estimates.
 * With neither, the person is presumed living: an absent record is not evidence of death.
 */
export function isPresumedLiving(
  person: Person,
  now: number = new Date().getFullYear(),
  estimatedBirthYear?: number,
): boolean {
  if (person.death !== undefined) return false;
  const birthYear = person.birth?.date?.year ?? estimatedBirthYear;
  if (birthYear !== undefined && now - birthYear > MAX_PLAUSIBLE_AGE)
    return false;
  return true;
}
