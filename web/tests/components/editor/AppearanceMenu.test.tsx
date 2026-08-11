import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppearanceMenu } from "../../../src/components/editor/AppearanceMenu.js";
import { DEFAULT_APPEARANCE_PREFS } from "../../../src/lib/appearancePrefs.js";

describe("AppearanceMenu", () => {
  it("changes the display mode via onChange", async () => {
    const onChange = vi.fn();
    render(<AppearanceMenu prefs={DEFAULT_APPEARANCE_PREFS} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /appearance/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /photo cards/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ displayMode: "photoCards" }));
  });

  it("toggles the living indicator", async () => {
    const onChange = vi.fn();
    render(<AppearanceMenu prefs={DEFAULT_APPEARANCE_PREFS} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /appearance/i }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /living indicator/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showLivingIndicator: true }));
  });
});
