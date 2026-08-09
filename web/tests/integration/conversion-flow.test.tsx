import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/App.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "..", "..", "Family Tree FTZ", "FamilyTree.ftz");
// Real personal family data — gitignored, not present in CI. See CONTRIBUTING.md.
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

/**
 * The real "end-to-end conversion test": renders the actual <App/>, uploads the actual
 * sample FTZ file used throughout this project, and drives the full upload -> validate ->
 * convert -> download flow through real UI interactions. Runs against the real parser and
 * exporter (via the mock worker — see tests/mocks/mockWorker.ts), not fixtures or stubs.
 */
describe("End-to-end conversion flow (real sample FTZ)", () => {
  it.skipIf(!SAMPLE_EXISTS)(
    "uploads, validates, converts, and produces a downloadable GEDCOM file",
    async () => {
      const bytes = await readFile(SAMPLE_PATH);
      const file = new File([bytes], "FamilyTree.ftz", { type: "application/zip" });

      render(<App />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);

      // Validation summary should show the real counts from Milestone 2/3's analysis.
      // "473"/"136" legitimately appear twice once validated (top summary bar + export
      // sidebar), so assert on the unique "ready" status text instead.
      expect(
        await screen.findByText(/ready for export/i, {}, { timeout: 5000 })
      ).toBeInTheDocument();
      expect(screen.getAllByText("473").length).toBeGreaterThan(0);
      expect(screen.getAllByText("136").length).toBeGreaterThan(0);

      await userEvent.click(screen.getByRole("button", { name: /export gedcom/i }));

      expect(
        await screen.findByText(/conversion successful/i, {}, { timeout: 5000 })
      ).toBeInTheDocument();

      const link = screen.getByRole("link", { name: /download familytree\.ged/i });
      expect(link).toHaveAttribute("download", "FamilyTree.ged");
      expect(link.getAttribute("href")).toBeTruthy();
    },
    15000
  );

  it("rejects a non-FTZ file with a friendly error, without touching the worker", async () => {
    render(<App />);
    const wrongFile = new File(["not an ftz"], "notes.txt", { type: "text/plain" });

    // Drag-and-drop (unlike the file input's `accept` attribute) has no built-in extension
    // filtering in a real browser, so this is the realistic path for a wrong-extension file.
    const dropzone = screen.getByText(/drag and drop your/i).closest("label")!;
    const dataTransfer = { files: [wrongFile] } as unknown as DataTransfer;
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true,
    }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    dropzone.dispatchEvent(dropEvent);

    expect(await screen.findByText(/doesn't look like an ftz file/i)).toBeInTheDocument();
  });
});
