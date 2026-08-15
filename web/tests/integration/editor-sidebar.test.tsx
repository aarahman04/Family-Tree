import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { App } from "../../src/App.js";
import { buildNodeFtt, personRow } from "../../../tests/helpers.js";
import { setHasUnsavedEdits } from "../../src/lib/unsavedEdits.js";
import { clearSavedSession } from "../../src/lib/autosave.js";

// E1: the editor sidebar seeds its open state from viewport width. On narrow screens it must start
// CLOSED so the fixed 384px panel doesn't crush the canvas; on desktop it starts open as before.

async function fixtureFile(): Promise<File> {
  const nodeFtt = buildNodeFtt([personRow({ id: 1, name: "Root Person", gender: 1 })], []);
  const zip = new JSZip();
  zip.file("Fixture/node.ftt", nodeFtt);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], "fixture.ftz", { type: "application/zip" });
}

async function openEditorAtWidth(width: number) {
  // The seed reads window.innerWidth in the useState initializer, so set it before mounting.
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
  render(<App />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, await fixtureFile());
  await userEvent.click(
    await screen.findByRole("link", { name: /open editor/i }, { timeout: 5000 })
  );
  await screen.findByLabelText(/search people/i, {}, { timeout: 5000 });
}

const DEFAULT_WIDTH = window.innerWidth;

describe("editor sidebar seeds from viewport width (E1)", () => {
  beforeEach(() => {
    window.location.hash = "";
  });
  afterEach(() => {
    setHasUnsavedEdits(false);
    clearSavedSession();
    Object.defineProperty(window, "innerWidth", {
      value: DEFAULT_WIDTH,
      configurable: true,
      writable: true,
    });
  });

  it("starts closed on a phone width — the panel is out of the DOM, toggle offers to show it", async () => {
    await openEditorAtWidth(390);
    // "complementary" is the implicit role of <aside>; it must not be rendered at all (the crush
    // fix depends on it leaving layout flow, not just hiding).
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show panel/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hide panel/i })).not.toBeInTheDocument();
  });

  it("starts open on a desktop width — the panel is present and can be hidden", async () => {
    await openEditorAtWidth(1280);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide panel/i })).toBeInTheDocument();
  });

  it("the toggle still works after a narrow-seeded start (user can open the panel on a phone)", async () => {
    await openEditorAtWidth(390);
    await userEvent.click(screen.getByRole("button", { name: /show panel/i }));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide panel/i })).toBeInTheDocument();
  });
});
