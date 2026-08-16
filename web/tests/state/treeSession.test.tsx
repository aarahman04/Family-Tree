import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree } from "../../../src/models/types.js";
import { TreeSessionProvider, useTreeSession } from "../../src/state/treeSession.js";

const tree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: {},
  families: {},
  validation: { validatedAt: "", issues: [], isValid: true },
};

function Probe() {
  const { session, setSession } = useTreeSession();
  return (
    <div>
      <span>fn:{session?.fileName ?? "none"}</span>
      <button onClick={() => setSession({ tree, fileName: "A.ged" })}>set</button>
    </div>
  );
}

describe("TreeSessionProvider", () => {
  it("stores and exposes the session", async () => {
    render(
      <TreeSessionProvider>
        <Probe />
      </TreeSessionProvider>
    );
    expect(screen.getByText("fn:none")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "set" }));
    expect(screen.getByText("fn:A.ged")).toBeInTheDocument();
  });
});
