import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PosterExportPanel } from "../../../src/components/poster/PosterExportPanel.js";
import { parseNodeFtt } from "../../../../parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";
import type { FamilyTree, PersonPhoto } from "../../../../models/types.js";

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

function treeWithPhotoOnGrandpa(photo: PersonPhoto): FamilyTree {
  const t = cousinMarriageTree();
  const id = Object.values(t.persons).find((p) => p.name === "Grandpa")!.id;
  return { ...t, persons: { ...t.persons, [id]: { ...t.persons[id]!, photo } } };
}

const THUMB = "data:image/webp;base64,TT";
const PRINT = "data:image/webp;base64,PP";

async function openAppearance() {
  await userEvent.click(screen.getByText(/customize appearance/i));
}

describe("PosterExportPanel", () => {
  it("includes photo images only when Include photos is on, honoring the quality choice", async () => {
    render(
      <PosterExportPanel
        tree={treeWithPhotoOnGrandpa({ thumb: THUMB, print: PRINT })}
        sourceFileName="x.ftz"
      />
    );
    await openAppearance();

    // Off by default → compact, no <image>.
    expect(document.querySelector("image")).toBeNull();

    await userEvent.click(screen.getByLabelText(/include photos/i));
    // Optimized (thumb) is the default quality.
    expect(document.querySelector("[data-testid='poster-preview']")!.innerHTML).toContain(THUMB);

    await userEvent.click(screen.getByLabelText(/high quality/i));
    const html = document.querySelector("[data-testid='poster-preview']")!.innerHTML;
    expect(html).toContain(PRINT);
    expect(html).not.toContain(THUMB);
  });

  it("warns and never embeds thumb bytes when High quality is chosen but print is missing", async () => {
    // A reloaded photo: thumb survived localStorage, print was stripped (Task 5 decision).
    render(
      <PosterExportPanel tree={treeWithPhotoOnGrandpa({ thumb: THUMB })} sourceFileName="x.ftz" />
    );
    await openAppearance();
    await userEvent.click(screen.getByLabelText(/include photos/i));
    await userEvent.click(screen.getByLabelText(/high quality/i));

    // Explicit, non-silent warning naming the affected count.
    expect(screen.getByText(/1 photo/i)).toBeInTheDocument();
    // The thumb must NOT sneak into a high-quality export — those persons get placeholders.
    expect(document.querySelector("[data-testid='poster-preview']")!.innerHTML).not.toContain(THUMB);

    // Switching back to Optimized includes it (at thumb res) and clears the warning.
    await userEvent.click(screen.getByLabelText(/optimized/i));
    expect(screen.queryByText(/1 photo/i)).not.toBeInTheDocument();
    expect(document.querySelector("[data-testid='poster-preview']")!.innerHTML).toContain(THUMB);
  });

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
