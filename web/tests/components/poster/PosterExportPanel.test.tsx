import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PosterExportPanel } from "../../../src/components/poster/PosterExportPanel.js";
import { parseNodeFtt } from "../../../../parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";

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

describe("PosterExportPanel", () => {
  it("renders a preview with every person exactly once and shows page/generation stats", () => {
    const tree = cousinMarriageTree();
    render(<PosterExportPanel tree={tree} sourceFileName="family.ftz" />);

    const peopleCount = screen.getByText("People").nextElementSibling;
    expect(peopleCount?.textContent).toBe("6");

    // Shared ancestors from a cousin marriage must still render exactly once each.
    expect(screen.getAllByText("Grandpa")).toHaveLength(1);
    expect(screen.getAllByText("Grandma")).toHaveLength(1);
    expect(screen.getByText("Poster size")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download svg/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeEnabled();
  });

  it("updates the preview when a style knob changes", async () => {
    const tree = cousinMarriageTree();
    render(<PosterExportPanel tree={tree} sourceFileName="family.ftz" />);

    await userEvent.click(screen.getByText(/customize appearance/i));
    const nameFontSize = screen.getByLabelText(/name font size/i);
    await userEvent.clear(nameFontSize);
    await userEvent.type(nameFontSize, "18");

    expect(document.querySelector('text[font-size="18"]')).not.toBeNull();
  });
});
