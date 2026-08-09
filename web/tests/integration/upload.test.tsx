import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/App.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "..", "..", "Family Tree FTZ", "FamilyTree.ftz");
// Real personal family data — gitignored, not present in CI. See CONTRIBUTING.md.
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

async function realFtzFile(): Promise<File> {
  const bytes = await readFile(SAMPLE_PATH);
  return new File([bytes], "FamilyTree.ftz", { type: "application/zip" });
}

describe.skipIf(!SAMPLE_EXISTS)("Upload interactions", () => {
  it("supports drag-and-drop onto the drop zone", async () => {
    render(<App />);
    const file = await realFtzFile();
    const dropzone = screen.getByText(/drag and drop your/i).closest("label")!;

    const dataTransfer = { files: [file] } as unknown as DataTransfer;
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true,
    }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    dropzone.dispatchEvent(dropEvent);

    // "473" legitimately appears twice once validated (top summary bar + export sidebar) —
    // assert on the unique "ready" status instead of a specific count text.
    expect(await screen.findByText(/ready for export/i, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("supports replacing an already-selected file", async () => {
    render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await realFtzFile());

    await screen.findByText("FamilyTree.ftz");
    const secondFile = new File(["not an ftz"], "other.ftz", { type: "application/zip" });
    // A second userEvent.upload() on the same input after React re-renders the "currentFile"
    // branch is flaky in jsdom; fireEvent.change is the direct, reliable way to simulate this.
    fireEvent.change(input, { target: { files: [secondFile] } });

    expect(await screen.findByText("other.ftz")).toBeInTheDocument();
  });

  it("supports clearing a selected file back to the empty drop zone", async () => {
    render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await realFtzFile());

    await screen.findByText("FamilyTree.ftz");
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    expect(screen.queryByText("FamilyTree.ftz")).not.toBeInTheDocument();
    expect(screen.getByText(/browse files/i)).toBeInTheDocument();
  });
});
