import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CousinMarriagesPanel } from "../../../src/components/editor/CousinMarriagesPanel.js";
import { parseNodeFtt } from "../../../../src/parser/index.js";
import { analyzeTree } from "../../../../src/analysis/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";
import type { FamilyTree } from "../../../../src/models/types.js";

const idOf = (t: FamilyTree, name: string) =>
  Object.values(t.persons).find((p) => p.name === name)!.id;

/** One first-cousin marriage (CousinA x CousinB), plus their child. */
function cousinTree(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Grandpa", gender: 1 }),
        personRow({ id: 2, name: "Grandma", gender: 2 }),
        personRow({ id: 3, name: "DadA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "DadB", famc: 10, gender: 1 }),
        personRow({ id: 5, name: "MomA", gender: 2 }),
        personRow({ id: 6, name: "CousinA", famc: 20, gender: 1 }),
        personRow({ id: 7, name: "MomB", gender: 2 }),
        personRow({ id: 8, name: "CousinB", famc: 30, gender: 2 }),
        personRow({ id: 9, name: "GrandchildAB", famc: 40 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3, wife: 5 }),
        familyRow({ id: 30, husband: 4, wife: 7 }),
        familyRow({ id: 40, husband: 6, wife: 8 }),
      ]
    )
  ).tree;
}

function noCousinTree(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [personRow({ id: 1, name: "Dad", gender: 1 }), personRow({ id: 2, name: "Mom", gender: 2 })],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    )
  ).tree;
}

function renderPanel(t: FamilyTree, onSelect = vi.fn()) {
  render(<CousinMarriagesPanel tree={t} analysis={analyzeTree(t, 2026)} onSelect={onSelect} />);
  return onSelect;
}

describe("CousinMarriagesPanel", () => {
  it("is collapsed until opened, matching the Export panel pattern", async () => {
    renderPanel(cousinTree());
    const toggle = screen.getByRole("button", { name: /all cousin marriages/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the count of cousin marriages on the header without being opened", () => {
    renderPanel(cousinTree());
    expect(screen.getByRole("button", { name: /all cousin marriages/i })).toHaveTextContent("1");
  });

  it("lists every cousin marriage with both names and its degree", async () => {
    renderPanel(cousinTree());
    await userEvent.click(screen.getByRole("button", { name: /all cousin marriages/i }));

    const list = screen.getByRole("list", { name: /cousin marriages/i });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(/CousinA/);
    expect(rows[0]).toHaveTextContent(/CousinB/);
    expect(rows[0]).toHaveTextContent(/first cousins/i);
  });

  it("selects the person when their name is clicked", async () => {
    const t = cousinTree();
    const onSelect = renderPanel(t);
    await userEvent.click(screen.getByRole("button", { name: /all cousin marriages/i }));

    await userEvent.click(screen.getByRole("button", { name: /view cousina/i }));
    expect(onSelect).toHaveBeenCalledWith(idOf(t, "CousinA"));
  });

  it("says so plainly when the tree has no cousin marriages at all", async () => {
    renderPanel(noCousinTree());
    await userEvent.click(screen.getByRole("button", { name: /all cousin marriages/i }));
    expect(screen.getByText(/no cousin marriages/i)).toBeInTheDocument();
  });

  it("renders a multi-generation run as one chain, oldest generation first", async () => {
    // A genuine 2-deep run needs the PARENTS' union to be a cousin marriage too:
    //   GG1 x GG2 -> X, Y
    //   X -> Ali, Omar   |   Y -> Fatima          (Ali & Fatima are first cousins)
    //   Ali x Fatima -> Hassan                    <- depth 1
    //   Omar -> Zainab                            (Hassan & Zainab are first cousins)
    //   Hassan x Zainab                           <- depth 2
    const deep = parseNodeFtt(
      buildNodeFtt(
        [
          personRow({ id: 1, name: "GG1", gender: 1 }),
          personRow({ id: 2, name: "GG2", gender: 2 }),
          personRow({ id: 3, name: "X", famc: 100, gender: 1 }),
          personRow({ id: 4, name: "Y", famc: 100, gender: 2 }),
          personRow({ id: 5, name: "XW", gender: 2 }),
          personRow({ id: 6, name: "Ali", famc: 101, gender: 1 }),
          personRow({ id: 7, name: "Omar", famc: 101, gender: 1 }),
          personRow({ id: 8, name: "YH", gender: 1 }),
          personRow({ id: 9, name: "Fatima", famc: 102, gender: 2 }),
          personRow({ id: 10, name: "Hassan", famc: 103, gender: 1 }),
          personRow({ id: 11, name: "OmarW", gender: 2 }),
          personRow({ id: 12, name: "Zainab", famc: 104, gender: 2 }),
        ],
        [
          familyRow({ id: 100, husband: 1, wife: 2 }),
          familyRow({ id: 101, husband: 3, wife: 5 }),
          familyRow({ id: 102, husband: 8, wife: 4 }),
          familyRow({ id: 103, husband: 6, wife: 9 }),
          familyRow({ id: 104, husband: 7, wife: 11 }),
          familyRow({ id: 105, husband: 10, wife: 12 }),
        ]
      )
    ).tree;

    const analysis = analyzeTree(deep, 2026);
    expect(analysis.chains.maxChainDepth).toBe(2); // fixture really does exercise a run

    render(<CousinMarriagesPanel tree={deep} analysis={analysis} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /all cousin marriages/i }));

    const chain = screen.getByRole("list", { name: /longest chain/i });
    const steps = within(chain).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent(/Ali/); // oldest generation first
    expect(steps[1]).toHaveTextContent(/Hassan/);
  });
});
