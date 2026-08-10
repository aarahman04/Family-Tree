import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";
import { setHasUnsavedEdits } from "../../src/lib/unsavedEdits.js";

async function fixtureFile(): Promise<File> {
  const nodeFtt = buildNodeFtt([personRow({ id: 1, name: "Root Person", gender: 1 })], []);
  const zip = new JSZip();
  zip.file("Fixture/node.ftt", nodeFtt);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], "fixture.ftz", { type: "application/zip" });
}

async function openEditorAndSelectRoot() {
  render(<App />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, await fixtureFile());
  await userEvent.click(
    await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 })
  );
  const searchBox = await screen.findByLabelText(/search people/i, {}, { timeout: 5000 });
  await userEvent.type(searchBox, "Root");
  await userEvent.click((await screen.findByRole("option")).querySelector("button")!);
  await screen.findByRole("heading", { name: "Root Person" });
}

describe("Editor interactions", () => {
  beforeEach(() => {
    window.location.hash = "";
  });
  afterEach(() => {
    setHasUnsavedEdits(false); // this file makes edits; don't leak the flag to other files
  });

  it("Quick add creates and selects a new relative", async () => {
    await openEditorAndSelectRoot();
    await userEvent.click(screen.getByRole("button", { name: "+ Child" }));
    // The new child is auto-selected, so the inspector now shows it.
    expect(await screen.findByRole("heading", { name: "New person" })).toBeInTheDocument();
  });

  it("Escape clears the current selection", async () => {
    await openEditorAndSelectRoot();
    expect(screen.getByRole("heading", { name: "Root Person" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Root Person" })).not.toBeInTheDocument();
    expect(screen.getByText(/select a person on the canvas/i)).toBeInTheDocument();
  });

  it("Ctrl+Z undoes the last edit", async () => {
    await openEditorAndSelectRoot();
    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { name: "Renamed" });

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(await screen.findByRole("heading", { name: "Root Person" })).toBeInTheDocument();
  });
});
