import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FamilyTreeCanvas } from "../../../src/components/explorer/FamilyTreeCanvas.js";
import { parseNodeFtt } from "../../../../parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";

function tree() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Dad", gender: 1 }),
        personRow({ id: 2, name: "Mom", gender: 2 }),
        personRow({ id: 3, name: "Kid", famc: 10 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    )
  ).tree;
}

/**
 *          Grandpa(1) x Grandma(2)
 *           /                  \
 *    ParentA(3)                ParentB(4)
 *        |                          |
 *    CousinX(5) x---------- CousinY(6)   <- cousin marriage, shared ancestors 1 & 2
 */
function cousinMarriageTree() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Grandpa", gender: 1 }),
        personRow({ id: 2, name: "Grandma", gender: 2 }),
        personRow({ id: 3, name: "ParentA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "ParentB", famc: 10, gender: 2 }),
        personRow({ id: 5, name: "CousinX", famc: 20, gender: 1 }),
        personRow({ id: 6, name: "CousinY", famc: 30, gender: 2 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3 }),
        familyRow({ id: 30, wife: 4 }),
        familyRow({ id: 40, husband: 5, wife: 6 }),
      ]
    )
  ).tree;
}

describe("FamilyTreeCanvas (smoke)", () => {
  it("renders without throwing and shows person nodes", () => {
    const t = tree();
    const dad = Object.values(t.persons).find((p) => p.name === "Dad")!.id;
    render(
      <FamilyTreeCanvas
        tree={t}
        focusPersonId={dad}
        expandedIds={new Set()}
        onSelectPerson={vi.fn()}
        onExpand={vi.fn()}
      />
    );
    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(screen.getByText("Mom")).toBeInTheDocument();
    expect(screen.getByText("Kid")).toBeInTheDocument();
  });

  it("renders a shared ancestor once, not duplicated, when a cousin marriage brings two lines back together", () => {
    const t = cousinMarriageTree();
    const cousinX = Object.values(t.persons).find((p) => p.name === "CousinX")!.id;
    render(
      <FamilyTreeCanvas
        tree={t}
        focusPersonId={cousinX}
        expandedIds={new Set()}
        onSelectPerson={vi.fn()}
        onExpand={vi.fn()}
      />
    );
    // Both spouses' ancestor lines lead back to Grandpa/Grandma — the internal model must
    // never duplicate a person, so the canvas must render exactly one node per person.
    expect(screen.getAllByText("Grandpa")).toHaveLength(1);
    expect(screen.getAllByText("Grandma")).toHaveLength(1);
    expect(screen.getByText("ParentA")).toBeInTheDocument();
    expect(screen.getByText("ParentB")).toBeInTheDocument();
    expect(screen.getByText("CousinY")).toBeInTheDocument();
  });
});
