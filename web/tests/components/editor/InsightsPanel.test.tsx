import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TreeInsights } from "../../../src/lib/insights.js";
import { InsightsPanel } from "../../../src/components/editor/InsightsPanel.js";

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
});
