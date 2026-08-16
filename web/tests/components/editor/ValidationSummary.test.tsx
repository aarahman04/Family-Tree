import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ValidationIssue } from "../../../../src/models/types.js";
import { ValidationSummary } from "../../../src/components/editor/ValidationSummary.js";

describe("ValidationSummary", () => {
  it("renders nothing when there are no issues", () => {
    const { container } = render(<ValidationSummary issues={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists issues and jumps to the related person on click", async () => {
    const issues: ValidationIssue[] = [
      {
        severity: "warning",
        code: "FAMILY_MISSING_PARENT",
        message: "Family is missing a parent.",
        relatedIds: ["fam1"],
      },
      {
        severity: "error",
        code: "SELF_MARRIAGE",
        message: "A person is married to themselves.",
        relatedIds: ["p9"],
      },
    ];
    const onSelect = vi.fn();
    render(<ValidationSummary issues={issues} onSelect={onSelect} />);

    expect(screen.getByText(/married to themselves/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /missing a parent/i }));
    expect(onSelect).toHaveBeenCalledWith("fam1");
  });
});
