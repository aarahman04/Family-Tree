import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewMenu } from "../../../src/components/editor/ViewMenu.js";

function setup(focusMode = false) {
  const handlers = {
    onToggleShowPhotos: vi.fn(),
    onFitTree: vi.fn(),
    onFitWidth: vi.fn(),
    onFitHeight: vi.fn(),
    onPosterScale: vi.fn(),
    onCenterSelection: vi.fn(),
    onToggleFocus: vi.fn(),
    onResetView: vi.fn(),
  };
  render(<ViewMenu focusMode={focusMode} showPhotos={false} {...handlers} />);
  return handlers;
}

describe("ViewMenu", () => {
  it("shows all view presets and invokes the matching handler", async () => {
    const h = setup();
    await userEvent.click(screen.getByRole("button", { name: /view/i }));

    expect(screen.getByRole("menuitemcheckbox", { name: /show photos/i })).toBeInTheDocument();

    for (const name of [
      /fit tree/i,
      /fit width/i,
      /fit height/i,
      /poster scale/i,
      /center selection/i,
      /focus mode/i,
      /reset view/i,
    ]) {
      expect(screen.getByRole("menuitemcheckbox", { name })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /poster scale/i }));
    expect(h.onPosterScale).toHaveBeenCalledOnce();
  });

  it("marks Focus mode as checked when active", async () => {
    setup(true);
    await userEvent.click(screen.getByRole("button", { name: /view/i }));
    expect(screen.getByRole("menuitemcheckbox", { name: /focus mode/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});
