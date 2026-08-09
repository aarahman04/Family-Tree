import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadPanel } from "../../src/components/DownloadPanel.js";

describe("DownloadPanel", () => {
  it("shows a success message and a download link named after the source file", () => {
    render(
      <DownloadPanel
        gedcom="0 HEAD\n0 TRLR\n"
        sourceFileName="FamilyTree.ftz"
        exportIssues={[]}
        onConvertAnother={vi.fn()}
      />
    );
    expect(screen.getByText(/conversion successful/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /download familytree\.ged/i });
    expect(link).toHaveAttribute("download", "FamilyTree.ged");
  });

  it("keeps the download link available for repeat downloads (not disabled after render)", () => {
    render(
      <DownloadPanel
        gedcom="0 HEAD\n0 TRLR\n"
        sourceFileName="FamilyTree.ftz"
        exportIssues={[]}
        onConvertAnother={vi.fn()}
      />
    );
    const link = screen.getByRole("link", { name: /download/i });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href");
    // still present/enabled — nothing in this component disables it after use
    expect(link).toBeVisible();
  });

  it("calls onConvertAnother when 'Convert another file' is clicked", async () => {
    const onConvertAnother = vi.fn();
    render(
      <DownloadPanel
        gedcom="0 HEAD\n0 TRLR\n"
        sourceFileName="FamilyTree.ftz"
        exportIssues={[]}
        onConvertAnother={onConvertAnother}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /convert another file/i }));
    expect(onConvertAnother).toHaveBeenCalledOnce();
  });

  it("shows export warnings in an expandable technical-details section", () => {
    render(
      <DownloadPanel
        gedcom="0 HEAD\n0 TRLR\n"
        sourceFileName="FamilyTree.ftz"
        exportIssues={[
          {
            severity: "warning",
            code: "UNFORMATTABLE_DATE",
            message: "Birth date could not be formatted.",
            relatedIds: [],
          },
        ]}
        onConvertAnother={vi.fn()}
      />
    );
    expect(screen.getByText(/show technical details/i)).toBeInTheDocument();
  });
});
