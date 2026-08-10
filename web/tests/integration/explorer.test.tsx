import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, familyRow, personRow } from "../../../tests/helpers.js";
import { setHasUnsavedEdits } from "../../src/lib/unsavedEdits.js";
import { clearSavedSession } from "../../src/lib/autosave.js";

/**
 *   Grandpa(1) x Grandma(2)
 *          |
 *         Dad(3) x Mom(4)
 *          |          \
 *        Kid(5)     Sibling(6)
 *          x
 *    KidSpouse(7)
 *          |
 *    Grandchild(8)
 *
 * Chosen so "Kid" alone exercises every navigation relation: parents, grandparents,
 * siblings, spouse, and children.
 */
async function buildFixtureFile(): Promise<File> {
  const nodeFtt = buildNodeFtt(
    [
      personRow({ id: 1, name: "Grandpa", gender: 1 }),
      personRow({ id: 2, name: "Grandma", gender: 2 }),
      personRow({ id: 3, name: "Dad", famc: 10, gender: 1 }),
      personRow({ id: 4, name: "Mom", gender: 2 }),
      personRow({ id: 5, name: "Kid", famc: 20, gender: 1, note: "Original note" }),
      personRow({ id: 6, name: "Sibling", famc: 20, gender: 2 }),
      personRow({ id: 7, name: "KidSpouse", gender: 2 }),
      personRow({ id: 8, name: "Grandchild", famc: 30 }),
    ],
    [
      familyRow({ id: 10, husband: 1, wife: 2 }),
      familyRow({ id: 20, husband: 3, wife: 4 }),
      familyRow({ id: 30, husband: 5, wife: 7 }),
    ]
  );
  const zip = new JSZip();
  zip.file("Fixture/node.ftt", nodeFtt);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], "fixture.ftz", { type: "application/zip" });
}

async function uploadFixture() {
  render(<App />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, await buildFixtureFile());
  // Editing now lives on the full-screen #/editor route — follow the handoff into it.
  await userEvent.click(
    await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 })
  );
  await screen.findByLabelText(/search people/i, {}, { timeout: 5000 });
}

/** GEDCOM export lives behind the sidebar's collapsible "Export" panel. */
async function openExport() {
  const toggle = screen.getByRole("button", { name: /^export$/i });
  if (toggle.getAttribute("aria-expanded") !== "true") await userEvent.click(toggle);
}

async function selectViaSearch(name: string) {
  const searchBox = screen.getByLabelText(/search people/i);
  await userEvent.type(searchBox, name);
  const option = await screen.findByRole("option", { name });
  // The click handler lives on the <button> inside the <li role="option">, not the li
  // itself — a click event dispatched at an ancestor never reaches a descendant's handler.
  await userEvent.click(within(option).getByRole("button", { name }));
}

describe("Tree explorer — full integration (synthetic fixture)", () => {
  beforeEach(() => {
    window.location.hash = "";
  });
  afterEach(() => {
    // This file makes edits; don't leak the unsaved flag or an autosave to other files.
    setHasUnsavedEdits(false);
    clearSavedSession();
  });

  it("search finds a person and opens the inspector for them", async () => {
    await uploadFixture();
    await selectViaSearch("Kid");
    expect(await screen.findByRole("heading", { name: "Kid" })).toBeInTheDocument();
  });

  it("editing a person's name updates the tree everywhere (inspector, search)", async () => {
    await uploadFixture();
    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });

    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Kiddo");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("heading", { name: "Kiddo" })).toBeInTheDocument();

    // The renamed person is now findable by their new name via search.
    const searchBox = screen.getByLabelText(/search people/i);
    await userEvent.clear(searchBox);
    await userEvent.type(searchBox, "Kiddo");
    expect(await screen.findByRole("option", { name: "Kiddo" })).toBeInTheDocument();
  });

  it("navigation: parents, grandparents, siblings, spouse, and children all jump correctly", async () => {
    await uploadFixture();
    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });

    // Parent
    await userEvent.click(screen.getByRole("button", { name: "Dad" }));
    expect(await screen.findByRole("heading", { name: "Dad" })).toBeInTheDocument();

    // Extended family: Dad's own parent (Kid's paternal grandfather) via Dad's inspector
    await userEvent.click(screen.getByRole("button", { name: "Grandpa" }));
    expect(await screen.findByRole("heading", { name: "Grandpa" })).toBeInTheDocument();

    // Back to Kid via search, then check sibling/spouse/children nav
    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });

    const siblingsSection = screen.getByText("Siblings").closest("section")!;
    await userEvent.click(within(siblingsSection).getByRole("button", { name: "Sibling" }));
    expect(await screen.findByRole("heading", { name: "Sibling" })).toBeInTheDocument();

    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });
    const spousesSection = screen.getByText("Spouses").closest("section")!;
    await userEvent.click(within(spousesSection).getByRole("button", { name: "KidSpouse" }));
    expect(await screen.findByRole("heading", { name: "KidSpouse" })).toBeInTheDocument();

    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });
    const childrenSection = screen.getByText("Children").closest("section")!;
    await userEvent.click(within(childrenSection).getByRole("button", { name: "Grandchild" }));
    expect(await screen.findByRole("heading", { name: "Grandchild" })).toBeInTheDocument();
  });

  it("undo/redo reverses and reapplies an edit through the full UI", async () => {
    await uploadFixture();
    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });

    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Kiddo");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { name: "Kiddo" });

    await userEvent.click(screen.getByRole("button", { name: /undo last edit/i }));
    expect(await screen.findByRole("heading", { name: "Kid" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /redo last undone edit/i }));
    expect(await screen.findByRole("heading", { name: "Kiddo" })).toBeInTheDocument();
  });

  it("undo resyncs the edit form itself, not just the heading, while the same person stays selected", async () => {
    await uploadFixture();
    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });

    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Kiddo");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { name: "Kiddo" });
    expect(screen.getByLabelText("Name")).toHaveValue("Kiddo");

    await userEvent.click(screen.getByRole("button", { name: /undo last edit/i }));
    await screen.findByRole("heading", { name: "Kid" });
    // The Name input is a separate draft from the live tree — it must reflect the undo too,
    // otherwise clicking "Save changes" again with no further typing would silently redo it.
    expect(screen.getByLabelText("Name")).toHaveValue("Kid");
  });

  it("validation updates live: removing the only recorded parent produces a visible warning", async () => {
    await uploadFixture();
    await selectViaSearch("Dad");
    await screen.findByRole("heading", { name: "Dad" });

    // Dad+Mom's family (20) currently has both parents — remove Mom, leaving it missing one.
    const spousesSection = screen.getByText("Spouses").closest("section")!;
    await userEvent.click(within(spousesSection).getByRole("button", { name: /remove/i }));

    // FAMILY_MISSING_PARENT is a warning, not an error — export must remain possible.
    // The count is split across sibling text nodes by JSX (e.g. "{n} validation {word}."),
    // so check the status region's accumulated textContent rather than a literal phrase match.
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("1 validation warning");
    });
    await openExport();
    expect(screen.getByRole("button", { name: /export gedcom/i })).toBeEnabled();
  });

  it("export after editing reflects the edit, not the original imported data", async () => {
    await uploadFixture();
    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });

    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Kiddo Renamed");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { name: "Kiddo Renamed" });

    const spy = vi.spyOn(URL, "createObjectURL");
    await openExport();
    await userEvent.click(screen.getByRole("button", { name: /export gedcom/i }));
    await screen.findByText(/conversion successful/i, {}, { timeout: 5000 });

    expect(spy).toHaveBeenCalled();
    const blob = spy.mock.calls[0]![0] as Blob;
    const text = await blob.text();
    // GEDCOM NAME formatting splits given/surname as "Given /Surname/" — the edit is in there.
    expect(text).toContain("1 NAME Kiddo /Renamed/");
    expect(text).not.toMatch(/\n1 NAME Kid\b/); // the pre-edit name is gone, not just supplemented
  }, 15000);

  it("editing is paused while an export is in flight, so the download can't silently miss a late edit", async () => {
    await uploadFixture();
    await selectViaSearch("Kid");
    await screen.findByRole("heading", { name: "Kid" });

    // Make a real edit first so Undo is independently enabled beforehand — otherwise
    // seeing it disabled during export wouldn't prove the export-specific guard did it.
    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Kiddo");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { name: "Kiddo" });
    expect(screen.getByRole("button", { name: /undo last edit/i })).toBeEnabled();

    await openExport();
    await userEvent.click(screen.getByRole("button", { name: /export gedcom/i }));

    // While the export worker round-trip is still in flight (see mocks/mockWorker.ts's
    // artificial delay on the export path), the inspector's Save button and the toolbar's
    // Undo button must be disabled, or a save/undo landing in this window could change the
    // tree after the export already captured its snapshot. Checked together in one waitFor
    // so both are asserted against the same render, not two renders apart.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /undo last edit/i })).toBeDisabled();
    });

    await screen.findByText(/conversion successful/i, {}, { timeout: 5000 });
  });

  it("exposes the whole-tree print-poster preview via the Export menu", async () => {
    await uploadFixture();
    await openExport();

    // The poster panel lists the whole-tree "People" count as a <dt>/<dd> pair (distinct from
    // the Insights panel's "People" section heading, hence the tag-name filter).
    const peopleDt = screen.getAllByText("People").find((el) => el.tagName === "DT")!;
    expect(peopleDt.nextElementSibling?.textContent).toBe("8"); // Grandpa, Grandma, Dad, Mom, Kid, Sibling, KidSpouse, Grandchild
    expect(screen.getByRole("button", { name: /download svg/i })).toBeInTheDocument();

    // The canvas (which uses the same poster layout) stays available alongside it.
    expect(screen.getByLabelText(/search people/i)).toBeInTheDocument();
  });
});
