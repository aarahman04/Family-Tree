import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";

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

describe("Editor view menu + unsaved indicator", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("toggling Focus mode from the View menu updates the canvas control", async () => {
    await openEditorAndSelectRoot();
    expect(screen.getByRole("button", { name: "Focus mode" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await userEvent.click(screen.getByRole("button", { name: /^view/i }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /focus mode/i }));
    expect(screen.getByRole("button", { name: "Focus mode" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows an unsaved-changes indicator after an edit", async () => {
    await openEditorAndSelectRoot();
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Child" }));
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });
});
