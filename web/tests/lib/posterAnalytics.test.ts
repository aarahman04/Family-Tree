import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../../../src/models/types.js";
import { analyzeTree } from "../../../src/analysis/index.js";
import {
  BADGE_COUSIN_MARRIAGE,
  BADGE_INCOMPLETE_RECORD,
  BRANCH_MERGE_CLASS_NAME,
} from "../../../src/poster/types.js";
import { buildPosterAnalytics } from "../../src/lib/posterAnalytics.js";

const P = (id: string, o: Partial<Person> = {}): Person => ({
  id,
  name: id,
  gender: "unknown",
  notes: [],
  media: [],
  famsIds: [],
  ...o,
});

/** gpa/gma -> dadA/dadB (siblings) -> cousinA x cousinB, a first-cousin marriage. */
const cousinTree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: {
    gpa: P("gpa", { name: "Gpa", gender: "male", famsIds: ["f1"] }),
    gma: P("gma", { name: "Gma", gender: "female", famsIds: ["f1"] }),
    dadA: P("dadA", { name: "DadA", gender: "male", famcId: "f1", famsIds: ["f2"] }),
    dadB: P("dadB", { name: "DadB", gender: "male", famcId: "f1", famsIds: ["f3"] }),
    momA: P("momA", { name: "MomA", gender: "female", famsIds: ["f2"] }),
    momB: P("momB", { name: "MomB", gender: "female", famsIds: ["f3"] }),
    cousinA: P("cousinA", { name: "CousinA", gender: "male", famcId: "f2", famsIds: ["f4"] }),
    cousinB: P("cousinB", { name: "CousinB", gender: "female", famcId: "f3", famsIds: ["f4"] }),
  } as Record<UUID, Person>,
  families: {
    f1: { id: "f1", husbandId: "gpa", wifeId: "gma", childrenIds: ["dadA", "dadB"] },
    f2: { id: "f2", husbandId: "dadA", wifeId: "momA", childrenIds: ["cousinA"] },
    f3: { id: "f3", husbandId: "dadB", wifeId: "momB", childrenIds: ["cousinB"] },
    f4: { id: "f4", husbandId: "cousinA", wifeId: "cousinB", childrenIds: [] },
  } as Record<UUID, Family>,
  validation: { validatedAt: "", issues: [], isValid: true },
};

/** The private, on-screen editor shows every relationship badge (plan: "Badge visibility"). */
const EDITOR_OPTS = { sensitiveBadgesForLiving: true, now: 2026 };
/** The export boundary withholds them for presumed-living people unless opted in (CP5.8). */
const EXPORT_OPTS = { sensitiveBadgesForLiving: false, now: 2026 };

describe("buildPosterAnalytics", () => {
  it("colors a cousin-marriage family and leaves unrelated families untouched (CP5.7)", () => {
    const a = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree), EDITOR_OPTS);

    expect(a.byFamily?.get("f4")?.color).toBeTruthy();
    // f2/f3 are ordinary unrelated marriages — no entry at all, so the renderer's defensive
    // lookups fall back to the plain poster palette.
    expect(a.byFamily?.get("f2")).toBeUndefined();
    expect(a.byFamily?.get("f3")).toBeUndefined();
  });

  it("badges both spouses of a cousin marriage, and nobody else (CP5.7)", () => {
    const a = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree), EDITOR_OPTS);

    expect(a.byNode?.get("cousinA")?.badges).toContain(BADGE_COUSIN_MARRIAGE);
    expect(a.byNode?.get("cousinB")?.badges).toContain(BADGE_COUSIN_MARRIAGE);
    expect(a.byNode?.get("dadA")?.badges ?? []).not.toContain(BADGE_COUSIN_MARRIAGE);
  });

  it("badges every person the quality analysis flags as an incomplete record (CP5.7)", () => {
    const analysis = analyzeTree(cousinTree);
    const a = buildPosterAnalytics(cousinTree, analysis, EDITOR_OPTS);

    expect(analysis.quality.incompleteRecords.length).toBeGreaterThan(0); // fixture exercises it
    for (const record of analysis.quality.incompleteRecords) {
      expect(a.byNode?.get(record.personId)?.badges).toContain(BADGE_INCOMPLETE_RECORD);
    }
  });

  it("flags a marriage-bridge family with the branch-merge class name (CP5.7)", () => {
    const analysis = analyzeTree(cousinTree);
    const a = buildPosterAnalytics(cousinTree, analysis, EDITOR_OPTS);

    expect(analysis.branches.marriageBridges.length).toBeGreaterThan(0); // fixture exercises it
    for (const bridge of analysis.branches.marriageBridges) {
      expect(a.byFamily?.get(bridge.familyId)?.className).toBe(BRANCH_MERGE_CLASS_NAME);
    }
  });

  it("never requests generation bands — they are row-layout only and the editor is balanced (D-13)", () => {
    const a = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree), EDITOR_OPTS);
    expect(a.showGenerationBands).toBeUndefined();
  });

  it("returns empty maps rather than throwing for a tree with no relationships at all", () => {
    const solo: FamilyTree = {
      metadata: { sourceFormat: "manual", importedAt: "" },
      persons: { a: P("a", { name: "A" }) } as Record<UUID, Person>,
      families: {} as Record<UUID, Family>,
      validation: { validatedAt: "", issues: [], isValid: true },
    };
    const a = buildPosterAnalytics(solo, analyzeTree(solo), EDITOR_OPTS);
    expect(a.byFamily?.size).toBe(0);
  });

  it("withholds the cousin-marriage badge from PRESUMED-LIVING spouses at the export boundary (CP5.8)", () => {
    // cousinA/cousinB have no death event and no birth year -> presumed living.
    const a = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree), EXPORT_OPTS);
    expect(a.byNode?.get("cousinA")?.badges ?? []).not.toContain(BADGE_COUSIN_MARRIAGE);
    expect(a.byNode?.get("cousinB")?.badges ?? []).not.toContain(BADGE_COUSIN_MARRIAGE);
  });

  it("still shows the cousin-marriage badge for DECEASED spouses at the export boundary (CP5.8)", () => {
    const deceased: FamilyTree = {
      ...cousinTree,
      persons: {
        ...cousinTree.persons,
        cousinA: { ...cousinTree.persons["cousinA"]!, death: { id: "dA", type: "death" } },
        cousinB: { ...cousinTree.persons["cousinB"]!, death: { id: "dB", type: "death" } },
      },
    };
    const a = buildPosterAnalytics(deceased, analyzeTree(deceased), EXPORT_OPTS);
    expect(a.byNode?.get("cousinA")?.badges).toContain(BADGE_COUSIN_MARRIAGE);
    expect(a.byNode?.get("cousinB")?.badges).toContain(BADGE_COUSIN_MARRIAGE);
  });

  it("never withholds the non-sensitive incomplete-record badge, living or not (CP5.8)", () => {
    const analysis = analyzeTree(cousinTree);
    const a = buildPosterAnalytics(cousinTree, analysis, EXPORT_OPTS);
    for (const record of analysis.quality.incompleteRecords) {
      expect(a.byNode?.get(record.personId)?.badges).toContain(BADGE_INCOMPLETE_RECORD);
    }
  });

  it("sets showGenerationBands only when the caller asks for it (D-13)", () => {
    const on = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree), {
      ...EXPORT_OPTS,
      generationBands: true,
    });
    expect(on.showGenerationBands).toBe(true);
  });

  it("withholds the family-level cousin overlay too, not just the badge, for a living couple (CP5.8 review)", () => {
    // The badge gate alone was not enough: the branch-merge glyph and the cousin-degree accent
    // announce the SAME sensitive fact about the same couple, and the export UI copy promises
    // they are withheld. cousinA/cousinB are presumed living.
    const analysis = analyzeTree(cousinTree);
    const a = buildPosterAnalytics(cousinTree, analysis, EXPORT_OPTS);
    expect(a.byFamily?.get("f4")).toBeUndefined();
    // The editor (private) still shows it.
    expect(
      buildPosterAnalytics(cousinTree, analysis, EDITOR_OPTS).byFamily?.get("f4")?.color
    ).toBeTruthy();
  });

  it("keeps the family overlay for a DECEASED couple at the export boundary (CP5.8 review)", () => {
    const deceased: FamilyTree = {
      ...cousinTree,
      persons: {
        ...cousinTree.persons,
        cousinA: { ...cousinTree.persons["cousinA"]!, death: { id: "dA", type: "death" } },
        cousinB: { ...cousinTree.persons["cousinB"]!, death: { id: "dB", type: "death" } },
      },
    };
    expect(
      buildPosterAnalytics(deceased, analyzeTree(deceased), EXPORT_OPTS).byFamily?.get("f4")?.color
    ).toBeTruthy();
  });

  it("badges a person in two cousin marriages once, not once per marriage (CP5.8 review)", () => {
    // A widower remarrying another cousin is realistic in the consanguineous trees this targets;
    // two identical glyphs side by side read as a different, stronger signal than intended.
    const twice: FamilyTree = {
      ...cousinTree,
      persons: {
        ...cousinTree.persons,
        cousinA: { ...cousinTree.persons["cousinA"]!, famsIds: ["f4", "f5"] },
        cousinC: P("cousinC", { name: "CousinC", gender: "female", famcId: "f3", famsIds: ["f5"] }),
      },
      families: {
        ...cousinTree.families,
        f3: { ...cousinTree.families["f3"]!, childrenIds: ["cousinB", "cousinC"] },
        f5: { id: "f5", husbandId: "cousinA", wifeId: "cousinC", childrenIds: [] },
      },
    };
    const analysis = analyzeTree(twice);
    expect(analysis.cousinMarriages.filter((m) => m.husbandId === "cousinA")).toHaveLength(2);

    const badges = buildPosterAnalytics(twice, analysis, EDITOR_OPTS).byNode?.get(
      "cousinA"
    )?.badges;
    expect(badges?.filter((b) => b === BADGE_COUSIN_MARRIAGE)).toHaveLength(1);
  });
});
