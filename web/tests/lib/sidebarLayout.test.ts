import { describe, expect, it } from "vitest";
import {
  SIDEBAR_AUTO_OPEN_MIN_WIDTH,
  shouldSidebarStartOpen,
} from "../../src/lib/sidebarLayout.js";

// E1: the editor sidebar is a fixed 384px (w-96) panel that leaves layout flow entirely when
// closed. Hardcoding it open crushed the canvas to nothing on phones/tablets. It now seeds from
// viewport width — open only where the canvas keeps a usable width beside it.

describe("shouldSidebarStartOpen", () => {
  it("starts closed on phone widths", () => {
    expect(shouldSidebarStartOpen(375)).toBe(false);
    expect(shouldSidebarStartOpen(390)).toBe(false);
    expect(shouldSidebarStartOpen(428)).toBe(false);
  });

  it("starts closed on tablet portrait, where a 384px panel would still crush the canvas", () => {
    expect(shouldSidebarStartOpen(768)).toBe(false);
  });

  it("starts open on laptop/desktop widths", () => {
    expect(shouldSidebarStartOpen(1024)).toBe(true);
    expect(shouldSidebarStartOpen(1280)).toBe(true);
    expect(shouldSidebarStartOpen(1920)).toBe(true);
  });

  it("switches exactly at the lg (1024px) breakpoint", () => {
    expect(SIDEBAR_AUTO_OPEN_MIN_WIDTH).toBe(1024);
    expect(shouldSidebarStartOpen(SIDEBAR_AUTO_OPEN_MIN_WIDTH - 1)).toBe(false);
    expect(shouldSidebarStartOpen(SIDEBAR_AUTO_OPEN_MIN_WIDTH)).toBe(true);
  });

  it("defaults to open when width is unknown (0/NaN), matching the safe desktop-first fallback", () => {
    // A non-positive or NaN width means we couldn't read the viewport; prefer the historical
    // open default rather than hiding the panel on a real desktop.
    expect(shouldSidebarStartOpen(0)).toBe(true);
    expect(shouldSidebarStartOpen(Number.NaN)).toBe(true);
  });
});
