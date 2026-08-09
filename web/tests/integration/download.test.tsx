import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/App.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "..", "..", "Family Tree FTZ", "FamilyTree.ftz");
// Real personal family data — gitignored, not present in CI. See CONTRIBUTING.md.
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

async function convertRealSample() {
  const bytes = await readFile(SAMPLE_PATH);
  const file = new File([bytes], "FamilyTree.ftz", { type: "application/zip" });
  render(<App />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, file);
  await screen.findByText(/ready for export/i, {}, { timeout: 5000 });
  await userEvent.click(screen.getByRole("button", { name: /export gedcom/i }));
  await screen.findByText(/conversion successful/i, {}, { timeout: 5000 });
}

describe.skipIf(!SAMPLE_EXISTS)("Download", () => {
  it("creates the GEDCOM blob URL via URL.createObjectURL", async () => {
    const spy = vi.spyOn(URL, "createObjectURL");
    await convertRealSample();
    expect(spy).toHaveBeenCalled();
    const blobArg = spy.mock.calls[0]![0] as Blob;
    expect(blobArg.type).toContain("text/plain");
  }, 15000);

  it("allows repeat downloads without re-uploading — the link stays present and enabled", async () => {
    await convertRealSample();
    const link = screen.getByRole("link", { name: /download familytree\.ged/i });

    // The link is a plain <a download> — nothing in this app disables or removes it after
    // a "click", so it remains available for as many downloads as the user wants.
    expect(link).toBeVisible();
    const href1 = link.getAttribute("href");
    expect(link).toBeVisible();
    const href2 = link.getAttribute("href");
    expect(href1).toBe(href2);
  }, 15000);

  it("returns to the export summary (still within the same editing session, tree still loaded) without a new upload", async () => {
    await convertRealSample();
    await userEvent.click(screen.getByRole("button", { name: /back to export summary/i }));

    // Still in the explorer, with the same tree — not bounced back to the upload screen.
    expect(screen.queryByText(/conversion successful/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export gedcom/i })).toBeInTheDocument();
    expect(screen.queryByText(/browse files/i)).not.toBeInTheDocument();
  }, 15000);
});
