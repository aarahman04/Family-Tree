import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnchoredPanel, useAnchoredDropdown } from "../../src/lib/useAnchoredDropdown.js";

function Harness() {
  const dd = useAnchoredDropdown();
  return (
    <div>
      <button ref={dd.triggerRef} type="button" onClick={dd.toggle}>
        Menu
      </button>
      <AnchoredPanel
        open={dd.open}
        pos={dd.pos}
        panelRef={dd.panelRef}
        onClose={dd.close}
        className="w-52"
      >
        <button type="button" role="menuitem">
          Item
        </button>
      </AnchoredPanel>
    </div>
  );
}

describe("useAnchoredDropdown", () => {
  const realRect = Element.prototype.getBoundingClientRect;
  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
  });

  it("is closed initially and renders no panel", () => {
    render(<Harness />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens on trigger click and renders the panel into document.body (not inside the trigger's parent)", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    const panel = screen.getByRole("menu");
    expect(panel).toBeInTheDocument();
    expect(panel.parentElement).toBe(document.body); // portaled, so no overflow/stacking trap
    expect(panel).toHaveStyle({ position: "fixed" });
  });

  it("closes on a capture-phase scroll originating outside the panel (anchor moved)", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    // A scroll on some other element; scroll doesn't bubble, so this is only caught on capture.
    fireEvent.scroll(screen.getByRole("button", { name: "Menu" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does NOT close when the scroll originates inside the panel", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    const panel = screen.getByRole("menu");
    fireEvent.scroll(panel);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on viewport resize", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the panel on-screen: right-aligns near the viewport's right edge", async () => {
    // Trigger sits near the right edge; a left-aligned 208px (w-52) panel would overflow.
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 208 });
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 360,
        y: 8,
        width: 32,
        height: 24,
        top: 8,
        left: 360,
        right: 392,
        bottom: 32,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };
    try {
      render(<Harness />);
      await userEvent.click(screen.getByRole("button", { name: "Menu" }));
      const panel = screen.getByRole("menu");
      const left = parseFloat((panel as HTMLElement).style.left);
      // Must fit: left >= 8 margin and left + width <= innerWidth - margin.
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + 208).toBeLessThanOrEqual(400 - 8);
    } finally {
      delete (HTMLElement.prototype as unknown as { offsetWidth?: number }).offsetWidth;
      delete (window as unknown as { innerWidth?: number }).innerWidth;
    }
  });
});
