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

async function uploadFixture(personName = "Original Person") {
  render(<App />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, await buildFixtureFile("Fixture", personName));
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
  // window.location.hash persists across tests within a file (jsdom doesn't reset it), and
  // a prior test's navigation to #/about would otherwise leak into the next test's fresh
  // render, landing it on the wrong page before it ever touches the app under test.
  window.location.hash = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  setHasUnsavedEdits(false); // tests unmount without HomePage's own unmount cleanup running
});

describe("beforeunload — registered only while there are unsaved edits", () => {
  it("does not warn before unload when there are no edits", async () => {
    await uploadFixture();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("warns before unload once an edit has been made, and stops warning once cleared", async () => {
    await uploadFixture();
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

describe("Clear — destructive action confirmation", () => {
  it("cancelling the confirmation preserves the current session completely", async () => {
    await uploadFixture();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    expect(window.confirm).toHaveBeenCalledOnce();
    // Still on the explorer, still showing the edit -- nothing was discarded.
    expect(screen.getByRole("heading", { name: "Edited Person" })).toBeInTheDocument();
    expect(screen.getByLabelText(/search people/i)).toBeInTheDocument();
  });

  it("confirming discards the session and returns to the upload screen", async () => {
    await uploadFixture();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    expect(window.confirm).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByLabelText(/search people/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/drag & drop your/i)).toBeInTheDocument();
  });

  it("does not prompt at all when there are no unsaved edits", async () => {
    await uploadFixture();
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByText(/drag & drop your/i)).toBeInTheDocument();
  });
});

describe("Replace file — parse-before-replace and confirmation", () => {
  it("cancelling the confirmation leaves the current tree completely untouched", async () => {
    await uploadFixture();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(false);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await buildFixtureFile("Other", "Someone Else"));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Edited Person" })).toBeInTheDocument();
  });

  it("a failed replacement leaves the existing tree and edits untouched, and alerts instead of erroring the whole page", async () => {
    await uploadFixture();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(true);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(["not a zip"], "bad.ftz", { type: "application/zip" });
    await userEvent.upload(input, badFile);

    await waitFor(() => expect(window.alert).toHaveBeenCalledOnce());
    // Still the original, edited tree -- not an error screen, not wiped.
    expect(screen.getByRole("heading", { name: "Edited Person" })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("a successful replacement swaps in the new tree and resets the edit count", async () => {
    await uploadFixture();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(true);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await buildFixtureFile("Other", "Someone Else"));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Edited Person" })).not.toBeInTheDocument();
    });
    const searchBox = await screen.findByLabelText(/search people/i);
    await userEvent.type(searchBox, "Someone");
    expect(await screen.findByRole("option", { name: "Someone Else" })).toBeInTheDocument();

    expect(screen.getByText("Edits made this session").nextElementSibling?.textContent).toBe("0");
  });

  it("does not prompt at all when there are no unsaved edits", async () => {
    await uploadFixture();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await buildFixtureFile("Other", "Someone Else"));
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

describe("Navigation away from Home — destructive action confirmation", () => {
  it("cancelling the confirmation keeps the user on Home with the session intact", async () => {
    await uploadFixture();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(false);
    await userEvent.click(screen.getByRole("link", { name: "About" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Edited Person" })).toBeInTheDocument();
  });

  it("confirming allows navigation away (and the session is gone on return, as expected)", async () => {
    await uploadFixture();
    await makeOneEdit("Edited Person");

    vi.mocked(window.confirm).mockReturnValue(true);
    await userEvent.click(screen.getByRole("link", { name: "About" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    await screen.findByRole("heading", { name: /about this project/i });
  });

  it("does not prompt at all when there are no unsaved edits", async () => {
    await uploadFixture();
    await userEvent.click(screen.getByRole("link", { name: "About" }));
    expect(window.confirm).not.toHaveBeenCalled();
    await screen.findByRole("heading", { name: /about this project/i });
  });
});
