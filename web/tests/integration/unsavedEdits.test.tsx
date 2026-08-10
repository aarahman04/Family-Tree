import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";
import { setHasUnsavedEdits } from "../../src/lib/unsavedEdits.js";

async function buildFixtureFile(folderName: string, personName: string): Promise<File> {
  const nodeFtt = buildNodeFtt([personRow({ id: 1, name: personName, gender: 1 })], []);
  const zip = new JSZip();
  zip.file(`${folderName}/node.ftt`, nodeFtt);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], `${folderName}.ftz`, { type: "application/zip" });
}

/** Upload a file and stay on Home (where the Clear / Replace controls live). */
async function uploadOnHome(personName = "Original Person") {
  render(<App />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, await buildFixtureFile("Fixture", personName));
  await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 });
}

/** Upload a file and follow the handoff into the full-screen editor (where editing lives). */
async function uploadIntoEditor(personName = "Original Person") {
  await uploadOnHome(personName);
  await userEvent.click(screen.getByRole("link", { name: /open editor/i }));
  await screen.findByLabelText(/search people/i, {}, { timeout: 5000 });
}

async function selectTheOnlyPerson() {
  const searchBox = screen.getByLabelText(/search people/i);
  await userEvent.type(searchBox, "Person");
  const option = await screen.findByRole("option");
  await userEvent.click(option.querySelector("button")!);
}

async function makeOneEdit(newName: string) {
  await selectTheOnlyPerson();
  const nameInput = screen.getByLabelText("Name");
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, newName);
  await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
  await screen.findByRole("heading", { name: newName });
}

// jsdom doesn't implement confirm()/alert() (they log "not implemented" and no-op) --
// every test that reaches a guarded action must stub these explicitly.
beforeEach(() => {
  vi.spyOn(window, "confirm");
  vi.spyOn(window, "alert").mockImplementation(() => {});
  // window.location.hash persists across tests within a file (jsdom doesn't reset it), and a
  // prior test's navigation would otherwise leak into the next test's fresh render.
  window.location.hash = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  setHasUnsavedEdits(false); // tests unmount without the editor's own unmount cleanup running
});

describe("beforeunload — registered only while there are unsaved edits (in the editor)", () => {
  it("does not warn before unload when there are no edits", async () => {
    await uploadIntoEditor();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("warns before unload once an edit has been made, and stops warning once cleared", async () => {
    await uploadIntoEditor();
    await makeOneEdit("Edited Person");

    const duringEdit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(duringEdit);
    expect(duringEdit.defaultPrevented).toBe(true);

    // Undo removes the only edit -- editCount returns to 0, so the warning should lift.
    await userEvent.click(screen.getByRole("button", { name: /undo last edit/i }));
    await screen.findByRole("heading", { name: "Original Person" });

    const afterUndo = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterUndo);
    expect(afterUndo.defaultPrevented).toBe(false);
  });
});

describe("Navigation away from the editor — destructive action confirmation", () => {
  it("cancelling the confirmation keeps the user in the editor with the edit intact", async () => {
    await uploadIntoEditor();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(false);
    await userEvent.click(screen.getByRole("link", { name: "About" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Edited Person" })).toBeInTheDocument();
  });

  it("confirming allows navigation away", async () => {
    await uploadIntoEditor();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(true);
    await userEvent.click(screen.getByRole("link", { name: "About" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    await screen.findByRole("heading", { name: /about this project/i });
  });

  it("does not prompt at all when there are no unsaved edits", async () => {
    await uploadIntoEditor();
    await userEvent.click(screen.getByRole("link", { name: "About" }));
    expect(window.confirm).not.toHaveBeenCalled();
    await screen.findByRole("heading", { name: /about this project/i });
  });
});

describe("Home — Clear and Replace controls", () => {
  it("Clear returns to the empty upload screen", async () => {
    await uploadOnHome();
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /open editor/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/drag & drop your/i)).toBeInTheDocument();
  });

  it("a failed replacement leaves the current file untouched and alerts instead of erroring", async () => {
    await uploadOnHome();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(["not a zip"], "bad.ftz", { type: "application/zip" });
    await userEvent.upload(input, badFile);

    await waitFor(() => expect(window.alert).toHaveBeenCalledOnce());
    // Still the original file loaded -- not an error screen, not wiped.
    expect(screen.getByText("Fixture.ftz")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("a successful replacement swaps in the new file", async () => {
    await uploadOnHome();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await buildFixtureFile("Other", "Someone Else"));

    expect(await screen.findByText("Other.ftz")).toBeInTheDocument();
    expect(screen.queryByText("Fixture.ftz")).not.toBeInTheDocument();
  });
});
