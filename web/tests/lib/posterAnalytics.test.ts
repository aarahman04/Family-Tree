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

describe("buildPosterAnalytics", () => {
  it("colors a cousin-marriage family and leaves unrelated families untouched (CP5.7)", () => {
    const a = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree));

    expect(a.byFamily?.get("f4")?.color).toBeTruthy();
    // f2/f3 are ordinary unrelated marriages — no entry at all, so the renderer's defensive
    // lookups fall back to the plain poster palette.
    expect(a.byFamily?.get("f2")).toBeUndefined();
    expect(a.byFamily?.get("f3")).toBeUndefined();
  });

  it("badges both spouses of a cousin marriage, and nobody else (CP5.7)", () => {
    const a = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree));

    expect(a.byNode?.get("cousinA")?.badges).toContain(BADGE_COUSIN_MARRIAGE);
    expect(a.byNode?.get("cousinB")?.badges).toContain(BADGE_COUSIN_MARRIAGE);
    expect(a.byNode?.get("dadA")?.badges ?? []).not.toContain(BADGE_COUSIN_MARRIAGE);
  });

  it("badges every person the quality analysis flags as an incomplete record (CP5.7)", () => {
    const analysis = analyzeTree(cousinTree);
    const a = buildPosterAnalytics(cousinTree, analysis);

    expect(analysis.quality.incompleteRecords.length).toBeGreaterThan(0); // fixture exercises it
    for (const record of analysis.quality.incompleteRecords) {
      expect(a.byNode?.get(record.personId)?.badges).toContain(BADGE_INCOMPLETE_RECORD);
    }
  });

  it("flags a marriage-bridge family with the branch-merge class name (CP5.7)", () => {
    const analysis = analyzeTree(cousinTree);
    const a = buildPosterAnalytics(cousinTree, analysis);

    expect(analysis.branches.marriageBridges.length).toBeGreaterThan(0); // fixture exercises it
    for (const bridge of analysis.branches.marriageBridges) {
      expect(a.byFamily?.get(bridge.familyId)?.className).toBe(BRANCH_MERGE_CLASS_NAME);
    }
  });

  it("never requests generation bands — they are row-layout only and the editor is balanced (D-13)", () => {
    const a = buildPosterAnalytics(cousinTree, analyzeTree(cousinTree));
    expect(a.showGenerationBands).toBeUndefined();
  });

  it("returns empty maps rather than throwing for a tree with no relationships at all", () => {
    const solo: FamilyTree = {
      metadata: { sourceFormat: "manual", importedAt: "" },
      persons: { a: P("a", { name: "A" }) } as Record<UUID, Person>,
      families: {} as Record<UUID, Family>,
      validation: { validatedAt: "", issues: [], isValid: true },
    };
    const a = buildPosterAnalytics(solo, analyzeTree(solo));
    expect(a.byFamily?.size).toBe(0);
  });
});
