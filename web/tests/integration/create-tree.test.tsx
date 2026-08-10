import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/App.js";
import { clearSavedSession } from "../../src/lib/autosave.js";

describe("Create new family tree", () => {
  beforeEach(() => {
    window.location.hash = "";
    clearSavedSession();
  });

  it("walks the wizard and lands in the editor with the new root person", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /create new family tree/i }));
    await userEvent.type(screen.getByLabelText(/tree name/i), "My Family");
    await userEvent.click(screen.getByRole("button", { name: /next: first person/i }));

    await userEvent.type(screen.getByLabelText(/first name/i), "Root");
    await userEvent.type(screen.getByLabelText(/last name/i), "Person");
    await userEvent.click(screen.getByRole("button", { name: /create tree/i }));

    await waitFor(() => expect(window.location.hash).toBe("#/editor"));
    // The editor shows the tree name and finds the root person via search.
    expect(screen.getByText("My Family")).toBeInTheDocument();
    const searchBox = await screen.findByLabelText(/search people/i);
    await userEvent.type(searchBox, "Root");
    expect(await screen.findByRole("option", { name: "Root Person" })).toBeInTheDocument();
  });

  it("keeps the upload flow available under Import existing tree", async () => {
    render(<App />);
    expect(screen.getByText(/drag & drop your/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /create new family tree/i }));
    // Switching to create hides the drop zone…
    expect(screen.queryByText(/drag & drop your/i)).not.toBeInTheDocument();
    // …and back to import restores it.
    await userEvent.click(screen.getByRole("button", { name: /import existing tree/i }));
    expect(screen.getByText(/drag & drop your/i)).toBeInTheDocument();
  });
});
