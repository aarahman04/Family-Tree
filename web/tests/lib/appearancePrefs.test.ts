import { beforeEach, describe, expect, it } from "vitest";
import {
  appearanceToStyle,
  DEFAULT_APPEARANCE_PREFS,
  loadAppearancePrefs,
  saveAppearancePrefs,
} from "../../src/lib/appearancePrefs.js";

beforeEach(() => localStorage.clear());

describe("appearancePrefs", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadAppearancePrefs()).toEqual(DEFAULT_APPEARANCE_PREFS);
  });

  it("persists across reload (save then load)", () => {
    saveAppearancePrefs({ displayMode: "photoCards", photoShape: "circle", showLivingIndicator: true });
    expect(loadAppearancePrefs()).toEqual({ displayMode: "photoCards", photoShape: "circle", showLivingIndicator: true });
  });

  it("merges prefs onto the poster style", () => {
    const style = appearanceToStyle({ displayMode: "photoCards", photoShape: "circle", showLivingIndicator: true });
    expect(style.displayMode).toBe("photoCards");
    expect(style.photoShape).toBe("circle");
    expect(style.showLivingIndicator).toBe(true);
    expect(style.nameFontSize).toBe(11); // untouched default carried through
  });
});
