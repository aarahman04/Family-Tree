import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "..", "..", "Family Tree FTZ", "FamilyTree.ftz");
// Real personal family data — gitignored, not present in CI. See CONTRIBUTING.md.
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

async function realFtzFile(): Promise<File> {
  const bytes = await readFile(SAMPLE_PATH);
  return new File([bytes], "FamilyTree.ftz", { type: "application/zip" });
}

async function syntheticFtzFile(fileName: string, personName: string): Promise<File> {
  const nodeFtt = buildNodeFtt([personRow({ id: 1, name: personName, gender: 1 })], []);
  const zip = new JSZip();
  zip.file("Replacement/node.ftt", nodeFtt);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], fileName, { type: "application/zip" });
}

describe.skipIf(!SAMPLE_EXISTS)("Upload interactions", () => {
  it("supports drag-and-drop onto the drop zone", async () => {
    render(<App />);
    const file = await realFtzFile();
    const dropzone = screen.getByText(/drag & drop your/i).closest("label")!;

    const dataTransfer = { files: [file] } as unknown as DataTransfer;
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true,
    }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    dropzone.dispatchEvent(dropEvent);

    // Once validated, Home shows the "Open editor" call-to-action.
    expect(
      await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 })
    ).toBeInTheDocument();
  });

  it("supports replacing an already-selected file with a valid new one", async () => {
    render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await realFtzFile());

    await screen.findByText("FamilyTree.ftz");
    const secondFile = await syntheticFtzFile("other.ftz", "Someone Else");
    // A second userEvent.upload() on the same input after React re-renders the "currentFile"
    // branch is flaky in jsdom; fireEvent.change is the direct, reliable way to simulate this.
    fireEvent.change(input, { target: { files: [secondFile] } });

    expect(await screen.findByText("other.ftz")).toBeInTheDocument();
  });

  // The old version of this test replaced with garbage bytes and expected the filename to
  // update anyway -- that was exactly the bug fixed in the v1.0 stabilization pass: a failed
  // replacement must never touch the current session. See web/tests/integration/
  // unsavedEdits.test.tsx for the fuller regression suite around this behavior.
  it("an invalid replacement file leaves the original file and tree completely untouched", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await realFtzFile());
    await screen.findByText("FamilyTree.ftz");

    const badFile = new File(["not an ftz"], "other.ftz", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(screen.getByText("FamilyTree.ftz")).toBeInTheDocument();
    expect(screen.queryByText("other.ftz")).not.toBeInTheDocument();
  });

  it("supports clearing a selected file back to the empty drop zone", async () => {
    render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await realFtzFile());

    await screen.findByText("FamilyTree.ftz");
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    expect(screen.queryByText("FamilyTree.ftz")).not.toBeInTheDocument();
    expect(screen.getByText("browse")).toBeInTheDocument();
  });
});

// Not gated on the real sample -- this exercises a completely independent code path
// (rejecting an oversized file before any parsing is attempted) and should run in CI too.
describe("Upload interactions — oversized archive", () => {
  it("shows a clear, specific message instead of the generic parse-failure fallback", async () => {
    const { MAX_ARCHIVE_BYTES } = await import("../../../parser/zip.js");
    render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const oversized = new File([new ArrayBuffer(MAX_ARCHIVE_BYTES + 1)], "huge.ftz", {
      type: "application/zip",
    });
    await userEvent.upload(input, oversized);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/file too large/i);
    // Not the generic fallback -- the specific, sized message reached the user.
    expect(alert).not.toHaveTextContent(/we couldn't read this file/i);
  });
});
