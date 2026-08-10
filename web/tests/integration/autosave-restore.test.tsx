import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree } from "../../../models/types.js";
import { App } from "../../src/App.js";
import { clearSavedSession, loadSavedSession, saveSession } from "../../src/lib/autosave.js";

const savedTree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: {
    p1: { id: "p1", name: "Saved Person", gender: "female", notes: [], media: [], famsIds: [] },
  },
  families: {},
  validation: { validatedAt: "", issues: [], isValid: true },
};

describe("Autosave restore", () => {
  beforeEach(() => {
    window.location.hash = "";
    clearSavedSession();
  });

  it("offers to restore a saved session and opens the editor on restore", async () => {
    saveSession({ tree: savedTree, fileName: "Saved.ged" });
    render(<App />);

    expect(await screen.findByText(/restore previous editing session/i)).toBeInTheDocument();
    expect(screen.getByText("Saved.ged")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => expect(window.location.hash).toBe("#/editor"));
    const searchBox = await screen.findByLabelText(/search people/i);
    await userEvent.type(searchBox, "Saved");
    expect(await screen.findByRole("option", { name: "Saved Person" })).toBeInTheDocument();
  });

  it("discards a saved session and hides the banner", async () => {
    saveSession({ tree: savedTree, fileName: "Saved.ged" });
    render(<App />);

    await screen.findByText(/restore previous editing session/i);
    await userEvent.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(screen.queryByText(/restore previous editing session/i)).not.toBeInTheDocument();
    expect(loadSavedSession()).toBeUndefined();
  });
});
