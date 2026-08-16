import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree } from "../../../../src/models/types.js";
import { ExportMenu } from "../../../src/components/editor/ExportMenu.js";

const tree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: {},
  families: {},
  validation: { validatedAt: "", issues: [], isValid: true },
};

describe("ExportMenu", () => {
  it("reveals GEDCOM and poster export controls when opened", async () => {
    render(
      <ExportMenu
        tree={tree}
        sourceFileName="A.ged"
        editCount={0}
        exportState={{ stage: "idle" }}
        runExport={vi.fn()}
        resetExport={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /^export$/i }));
    expect(screen.getByRole("button", { name: /export gedcom/i })).toBeInTheDocument();
    expect(screen.getByText(/download the svg/i)).toBeInTheDocument();
  });
});
