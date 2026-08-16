import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "../../src/components/Header.js";

// The mobile menu's links are rendered only while open, so a closed menu leaves no duplicate
// nav links in the DOM — these tests assert that lifecycle plus the open/close affordances.
describe("Header mobile menu", () => {
  it("opens and closes via the hamburger, exposing the nav + appearance controls only while open", async () => {
    render(<Header current="home" />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Appearance/ })).toBeNull();

    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: /Appearance/ })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /Appearance/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("closes the menu when a nav link is chosen", async () => {
    render(<Header current="home" />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const panel = screen.getByRole("button", { name: /Appearance/ }).closest("nav")!;
    await userEvent.click(within(panel).getByRole("link", { name: "About" }));
    expect(screen.queryByRole("button", { name: /Appearance/ })).toBeNull();
  });

  it("toggles the theme from the appearance row and keeps the menu open", async () => {
    render(<Header current="home" />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const before = screen.getByRole("button", { name: /Appearance/ }).getAttribute("aria-pressed");
    await userEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    const after = screen.getByRole("button", { name: /Appearance/ }).getAttribute("aria-pressed");
    expect(after).not.toBe(before);
  });
});
