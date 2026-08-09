import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDiscardIfUnsaved, setHasUnsavedEdits } from "../../src/lib/unsavedEdits.js";

beforeEach(() => {
  vi.spyOn(window, "confirm");
});

afterEach(() => {
  vi.restoreAllMocks();
  setHasUnsavedEdits(false); // module-level state persists across tests otherwise
});

describe("confirmDiscardIfUnsaved", () => {
  it("returns true without prompting when there are no unsaved edits", () => {
    setHasUnsavedEdits(false);
    expect(confirmDiscardIfUnsaved("discard?")).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("prompts and returns the user's answer when there are unsaved edits", () => {
    setHasUnsavedEdits(true);
    vi.mocked(window.confirm).mockReturnValue(true);
    expect(confirmDiscardIfUnsaved("discard?")).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith("discard?");

    vi.mocked(window.confirm).mockReturnValue(false);
    expect(confirmDiscardIfUnsaved("discard?")).toBe(false);
  });
});
