import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";

async function syntheticFtzFile(fileName: string, personName: string): Promise<File> {
  const nodeFtt = buildNodeFtt([personRow({ id: 1, name: personName, gender: 1 })], []);
  const zip = new JSZip();
  zip.file("Replacement/node.ftt", nodeFtt);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], fileName, { type: "application/zip" });
}

describe("Editor route handoff", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("navigates from upload to the full-screen editor and keeps the tree", async () => {
    render(<App />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, await syntheticFtzFile("Fam.ftz", "Alice Example"));

    const openEditor = await screen.findByRole("link", { name: /open editor/i });
    await userEvent.click(openEditor);

    await waitFor(() => expect(window.location.hash).toBe("#/editor"));
    expect(screen.getByLabelText(/search people/i)).toBeInTheDocument();
  });
});
