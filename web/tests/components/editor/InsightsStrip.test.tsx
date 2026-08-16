import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TreeInsights } from "../../../src/lib/insights.js";
import { InsightsStrip } from "../../../src/components/editor/InsightsStrip.js";
import { parseNodeFtt } from "../../../../src/parser/index.js";
import { analyzeTree } from "../../../../src/analysis/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";

const insights: TreeInsights = {
  totalMembers: 6,
  maleCount: 3,
  femaleCount: 3,
  unknownCount: 0,
  malePercent: 50,
  femalePercent: 50,
  livingCount: 5,
  deceasedCount: 1,
  familyCount: 2,
  marriageCount: 2,
  generationCount: 3,
  largestGeneration: { generation: 0, count: 3 },
  averageChildrenPerFamily: 1.5,
  largestFamily: { parents: "Bob Smith & Mary Jones", childCount: 2 },
  disconnectedGroups: 1,
  estimatedEarliestYear: 1900,
  estimatedEarliestDecade: 1900,
  latestKnownYear: 1970,
  estimatedSpanYears: 70,
  averageLifespan: 70,
  longestLived: { name: "John Smith", years: 70 },
  oldestLiving: { name: "Mary Smith", age: 95 },
  youngestLiving: { name: "Tom Smith", age: 40 },
  mostCommonSurname: { name: "Smith", count: 5 },
  mostCommonFirstName: { name: "Mary", count: 2 },
};

function cousinTreeAnalysis() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Grandpa", gender: 1 }),
      personRow({ id: 2, name: "Grandma", gender: 2 }),
      personRow({ id: 3, name: "DadA", famc: 10, gender: 1 }),
      personRow({ id: 4, name: "DadB", famc: 10, gender: 1 }),
      personRow({ id: 5, name: "MomA", gender: 2 }),
      personRow({ id: 6, name: "CousinA", famc: 20, gender: 1 }),
      personRow({ id: 7, name: "MomB", gender: 2 }),
      personRow({ id: 8, name: "CousinB", famc: 30, gender: 2 }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 5 }),
      familyRow({ id: 30, husband: 4, wife: 7 }),
      familyRow({ id: 40, husband: 6, wife: 8 }),
    ]
  );
  const tree = parseNodeFtt(text).tree;
  return analyzeTree(tree);
}

describe("InsightsStrip", () => {
  it("renders the base headline chips without analysis", () => {
    render(<InsightsStrip insights={insights} />);
    expect(screen.getByText("members")).toBeInTheDocument();
    expect(screen.queryByText(/cousin marriages/i)).not.toBeInTheDocument();
  });

  it("adds a cousin-marriage chip when analysis shows any cousin marriages", () => {
    const analysis = cousinTreeAnalysis();
    render(<InsightsStrip insights={insights} analysis={analysis} />);
    expect(screen.getByText(/cousin marriages/i)).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });
});
