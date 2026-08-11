import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  loadThemePref,
  resolveInitialTheme,
  saveThemePref,
  systemPrefersDark,
} from "../../src/lib/theme.js";

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

describe("theme persistence + resolution", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns null when no preference is stored", () => {
    expect(loadThemePref()).toBeNull();
  });

  it("round-trips a saved preference", () => {
    saveThemePref("dark");
    expect(loadThemePref()).toBe("dark");
    expect(localStorage.getItem("familyTree.theme.v1")).toBe("dark");
  });

  it("ignores a garbage stored value", () => {
    localStorage.setItem("familyTree.theme.v1", "chartreuse");
    expect(loadThemePref()).toBeNull();
  });

  it("resolveInitialTheme: a stored preference wins over the OS setting", () => {
    stubMatchMedia(true); // OS says dark
    saveThemePref("light"); // user overrode to light
    expect(resolveInitialTheme()).toBe("light");
  });

  it("resolveInitialTheme: falls back to the OS setting when nothing is stored", () => {
    stubMatchMedia(true);
    expect(resolveInitialTheme()).toBe("dark");
    stubMatchMedia(false);
    expect(resolveInitialTheme()).toBe("light");
  });

  it("systemPrefersDark reflects the media query", () => {
    stubMatchMedia(true);
    expect(systemPrefersDark()).toBe(true);
    stubMatchMedia(false);
    expect(systemPrefersDark()).toBe(false);
  });

  it("applyTheme toggles the root `dark` class and color-scheme", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
