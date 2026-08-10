import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TreeSessionProvider } from "../../src/state/treeSession.js";
import { EditorPage } from "../../src/pages/EditorPage.js";

describe("EditorPage", () => {
  it("shows an empty state when no tree is loaded", () => {
    render(
      <TreeSessionProvider>
        <EditorPage />
      </TreeSessionProvider>
    );
    expect(screen.getByText(/no tree loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upload/i })).toBeInTheDocument();
  });
});
