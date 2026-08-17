import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonPicker } from "../../../src/components/explorer/PersonPicker.js";
import { buildSearchIndex } from "../../../src/lib/search.js";
import { parseNodeFtt } from "../../../../src/parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";

function tree() {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Ayesha", gender: 2 }),
        personRow({ id: 2, name: "Bilal", gender: 1 }),
      ],
      [familyRow({ id: 10, husband: 2, wife: 1 })]
    )
  ).tree;
}

function renderPicker() {
  const t = tree();
  return render(
    <PersonPicker
      tree={t}
      index={buildSearchIndex(t)}
      label="Compare with"
      onPick={vi.fn()}
      onCreateNew={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

/** Every colour utility must carry a dark: partner, per invariant 2. */
function assertThemedText(el: Element, what: string) {
  const cls = el.className;
  expect(cls, `${what} needs an explicit light text colour`).toMatch(/(^|\s)text-\w+-\d{3}(\s|$)/);
  expect(cls, `${what} needs a dark: text colour`).toMatch(/dark:text-\w+-\d{3}/);
}

describe("PersonPicker contrast", () => {
  it("gives every result option an explicit text colour in BOTH themes", async () => {
    // The bug: options had no text colour at all, so they inherited the app's light dark-mode
    // text onto the picker's hardcoded white panel — white on white, unreadable.
    const { container } = renderPicker();
    await userEvent.type(container.querySelector("input")!, "a");
    const options = container.querySelectorAll("ul button");
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) assertThemedText(option, "a picker result");
  });

  it("gives the panel itself a dark background so it is not a white card in dark mode", () => {
    const { container } = renderPicker();
    const panel = container.firstElementChild!;
    expect(panel.className).toMatch(/dark:bg-/);
    expect(panel.className).toMatch(/dark:border-/);
  });

  it("themes the search input and its label", () => {
    const { container } = renderPicker();
    assertThemedText(screen.getByText("Compare with"), "the label");
    const input = container.querySelector("input")!;
    expect(input.className).toMatch(/dark:bg-/);
    expect(input.className).toMatch(/dark:text-/);
  });

  it("keeps the hover state readable rather than relying on the light-mode hover alone", async () => {
    const { container } = renderPicker();
    await userEvent.type(container.querySelector("input")!, "a");
    const option = container.querySelector("ul button")!;
    expect(option.className).toMatch(/dark:hover:bg-/);
  });
});
