import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadArea } from "../../src/components/UploadArea.js";

function makeFile(name: string, content = "x") {
  return new File([content], name, { type: "application/octet-stream" });
}

const HINT = "Supported: Quick Family Tree (.ftz)";

describe("UploadArea", () => {
  it("renders a drop zone with browse instructions and the format hint when no file is selected", () => {
    render(<UploadArea onFileSelected={vi.fn()} onClear={vi.fn()} accept=".ftz" hint={HINT} />);
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("calls onFileSelected when a file is chosen via the input", async () => {
    const onFileSelected = vi.fn();
    render(<UploadArea onFileSelected={onFileSelected} onClear={vi.fn()} accept=".ftz" hint={HINT} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("FamilyTree.ftz");

    await userEvent.upload(input, file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("shows the selected filename and size, with Replace/Clear actions", () => {
    render(
      <UploadArea
        onFileSelected={vi.fn()}
        onClear={vi.fn()}
        accept=".ftz"
        hint={HINT}
        currentFile={{ name: "FamilyTree.ftz", size: 2048 }}
      />
    );
    expect(screen.getByText("FamilyTree.ftz")).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replace file/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("calls onClear when Clear is clicked", async () => {
    const onClear = vi.fn();
    render(
      <UploadArea
        onFileSelected={vi.fn()}
        onClear={onClear}
        accept=".ftz"
        hint={HINT}
        currentFile={{ name: "FamilyTree.ftz", size: 2048 }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("calls onFileSelected on drag-and-drop (synthetic file — always runs in CI)", () => {
    const onFileSelected = vi.fn();
    render(<UploadArea onFileSelected={onFileSelected} onClear={vi.fn()} accept=".ftz" hint={HINT} />);
    const dropzone = screen.getByText(/drag & drop your/i).closest("label")!;
    const file = makeFile("FamilyTree.ftz");

    const dataTransfer = { files: [file] } as unknown as DataTransfer;
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    dropzone.dispatchEvent(dropEvent);

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("disables interaction while disabled=true", () => {
    render(
      <UploadArea
        onFileSelected={vi.fn()}
        onClear={vi.fn()}
        accept=".ftz"
        hint={HINT}
        currentFile={{ name: "FamilyTree.ftz", size: 2048 }}
        disabled
      />
    );
    expect(screen.getByRole("button", { name: /replace file/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
  });
});
