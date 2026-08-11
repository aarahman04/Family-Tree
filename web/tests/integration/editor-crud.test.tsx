import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";
import { setHasUnsavedEdits } from "../../src/lib/unsavedEdits.js";
import { clearSavedSession } from "../../src/lib/autosave.js";

async function fixtureFile(): Promise<File> {
  const nodeFtt = buildNodeFtt([personRow({ id: 1, name: "Root Person", gender: 1 })], []);
  const zip = new JSZip();
  zip.file("Fixture/node.ftt", nodeFtt);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], "fixture.ftz", { type: "application/zip" });
}

async function openEditor() {
  render(<App />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, await fixtureFile());
  await userEvent.click(
    await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 })
  );
  await screen.findByLabelText(/search people/i, {}, { timeout: 5000 });
}

async function selectRoot() {
  const searchBox = screen.getByLabelText(/search people/i);
  await userEvent.type(searchBox, "Root");
  await userEvent.click((await screen.findByRole("option")).querySelector("button")!);
  await screen.findByRole("heading", { name: "Root Person" });
}

describe("Editor create/delete", () => {
  beforeEach(() => {
    window.location.hash = "";
  });
  afterEach(() => {
    setHasUnsavedEdits(false);
    clearSavedSession();
  });

  it("adds a new independent person from the toolbar menu", async () => {
    await openEditor();
    await userEvent.click(screen.getByRole("button", { name: /add person/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /new independent person/i }));
    // The new person is auto-selected for renaming.
    expect(await screen.findByRole("heading", { name: "New person" })).toBeInTheDocument();
  });

  it("deletes the selected person and can undo via the toast", async () => {
    await openEditor();
    await selectRoot();

    await userEvent.click(screen.getByRole("button", { name: /delete person/i }));
    expect(screen.getByText("Person deleted")).toBeInTheDocument();
    // The person is gone from the inspector.
    expect(screen.queryByRole("heading", { name: "Root Person" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    // Undo restores the person — findable again by search.
    const searchBox = screen.getByLabelText(/search people/i);
    await userEvent.type(searchBox, "Root");
    expect(await screen.findByRole("option", { name: "Root Person" })).toBeInTheDocument();
  });

  it("deletes the selected person with the Delete key", async () => {
    await openEditor();
    await selectRoot();
    await userEvent.keyboard("{Delete}");
    await waitFor(() => expect(screen.getByText("Person deleted")).toBeInTheDocument());
  });
});
