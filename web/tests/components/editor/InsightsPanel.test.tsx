import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TreeInsights } from "../../../src/lib/insights.js";
import { InsightsPanel } from "../../../src/components/editor/InsightsPanel.js";
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

describe("InsightsPanel", () => {
  it("renders headline figures and labels estimates", () => {
    render(<InsightsPanel insights={insights} />);
    expect(screen.getByText("Total members")).toBeInTheDocument();
    expect(screen.getByText("~1900s")).toBeInTheDocument();
    expect(screen.getByText("~70 years")).toBeInTheDocument();
    expect(screen.getByText(/Smith \(5\)/)).toBeInTheDocument();
    // Estimated figures are badged.
    expect(screen.getAllByText(/^est\.$/i).length).toBeGreaterThan(0);
  });

  it("omits the family-health section when no analysis/tree is supplied", () => {
    render(<InsightsPanel insights={insights} />);
    expect(screen.queryByText(/family health/i)).not.toBeInTheDocument();
  });

  it("shows family-health stats when analysis and tree are supplied", () => {
    // One first-cousin marriage (CousinA x CousinB) among 4 marriages -> 25%.
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
    const analysis = analyzeTree(tree);
    render(<InsightsPanel insights={insights} analysis={analysis} tree={tree} />);
    expect(screen.getByText(/family health/i)).toBeInTheDocument();
    expect(screen.getByText("Cousin marriages")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 (25%)")).toBeInTheDocument();
    expect(screen.getByText(/most influential ancestor/i)).toBeInTheDocument();
    expect(screen.getByText(/most connected person/i)).toBeInTheDocument();
  });

  it("shows data-quality stats when analysis and tree are supplied (CP4.3)", () => {
    // Two "Jane Doe"s (duplicate name), one isolated ("Jane Doe" has no family links), plus the
    // cousin marriage from the fixture above (confidence "likely" -> a low-confidence warning).
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
        personRow({ id: 9, name: "Jane Doe", gender: 2 }),
        personRow({ id: 10, name: "Jane Doe", gender: 2 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3, wife: 5 }),
        familyRow({ id: 30, husband: 4, wife: 7 }),
        familyRow({ id: 40, husband: 6, wife: 8 }),
      ]
    );
    const tree = parseNodeFtt(text).tree;
    const analysis = analyzeTree(tree);
    render(<InsightsPanel insights={insights} analysis={analysis} tree={tree} />);
    expect(screen.getByText(/data quality/i)).toBeInTheDocument();
    expect(screen.getByText(/duplicate names/i)).toBeInTheDocument();
    expect(screen.getByText(/isolated records/i)).toBeInTheDocument();
    expect(screen.getByText(/low-confidence cousin marriages/i)).toBeInTheDocument();
  });

  it("omits the data-quality section when no analysis/tree is supplied", () => {
    render(<InsightsPanel insights={insights} />);
    expect(screen.queryByText(/data quality/i)).not.toBeInTheDocument();
  });
});
