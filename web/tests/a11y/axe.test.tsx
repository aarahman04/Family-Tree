import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { AboutPage } from "../../src/pages/AboutPage.js";
import { PrivacyPage } from "../../src/pages/PrivacyPage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.join(__dirname, "..", "..", "..", "Family Tree FTZ", "FamilyTree.ftz");
// Real personal family data — gitignored, not present in CI. See CONTRIBUTING.md.
const SAMPLE_EXISTS = existsSync(SAMPLE_PATH);

describe("Accessibility (axe smoke tests)", () => {
  // The hash router persists window.location.hash across tests in a file (jsdom doesn't reset
  // it), so a test that navigated to #/editor would otherwise start the next one there.
  beforeEach(() => {
    window.location.hash = "";
  });

  it("Home page (idle, no file selected) has no detectable a11y violations", async () => {
    const { container } = render(<App />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("About page has no detectable a11y violations", async () => {
    const { container } = render(<AboutPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Privacy page has no detectable a11y violations", async () => {
    const { container } = render(<PrivacyPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it.skipIf(!SAMPLE_EXISTS)(
    "Home page after validation, real sample (person/family summary shown) has no violations",
    async () => {
      const bytes = await readFile(SAMPLE_PATH);
      const file = new File([bytes], "FamilyTree.ftz", { type: "application/zip" });
      const { container } = render(<App />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);
      await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 });

      expect(await axe(container)).toHaveNoViolations();
    },
    15000
  );

  it("Home page after validation, synthetic file (always runs in CI) has no violations", async () => {
    const zip = new JSZip();
    const nodeFtt = [
      "1\t0\t1",
      "1\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t\tTest Person\t\t\t2\t0\t0\t0\t2\t0\t0\t0\t1\t\t\t\t",
    ].join("\n");
    zip.file("Test/node.ftt", nodeFtt);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "synthetic.ftz", { type: "application/zip" });

    const { container } = render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 });

    expect(await axe(container)).toHaveNoViolations();
  }, 15000);

  it("Full-screen editor route has no violations", async () => {
    window.location.hash = "";
    const zip = new JSZip();
    const nodeFtt = [
      "1\t0\t1",
      "1\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t\tTest Person\t\t\t2\t0\t0\t0\t2\t0\t0\t0\t1\t\t\t\t",
    ].join("\n");
    zip.file("Test/node.ftt", nodeFtt);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "synthetic.ftz", { type: "application/zip" });

    const { container } = render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await userEvent.click(
      await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 })
    );
    await screen.findByLabelText(/search people/i);

    expect(await axe(container)).toHaveNoViolations();
  }, 15000);

  it("Home page error state has no violations", async () => {
    const { container } = render(<App />);
    // Drag-and-drop bypasses the file input's `accept` filter, same as a real browser.
    const dropzone = screen.getByText(/drag & drop your/i).closest("label")!;
    const wrongFile = new File(["x"], "notes.txt", { type: "text/plain" });
    const dataTransfer = { files: [wrongFile] } as unknown as DataTransfer;
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true,
    }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    dropzone.dispatchEvent(dropEvent);
    await screen.findByText(/isn't a supported file/i);

    expect(await axe(container)).toHaveNoViolations();
  });
});
