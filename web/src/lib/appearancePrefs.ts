import {
  DEFAULT_POSTER_STYLE,
  type DisplayMode,
  type PhotoShape,
  type PosterStyleOptions,
} from "../../../poster/types.js";

export interface AppearancePrefs {
  displayMode: DisplayMode;
  photoShape: PhotoShape;
  showLivingIndicator: boolean;
}

export const DEFAULT_APPEARANCE_PREFS: AppearancePrefs = {
  displayMode: "compact",
  photoShape: "rounded",
  showLivingIndicator: false,
};

const KEY = "familyTree.appearance.v1";

export function loadAppearancePrefs(): AppearancePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_APPEARANCE_PREFS;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    return {
      displayMode: parsed.displayMode ?? DEFAULT_APPEARANCE_PREFS.displayMode,
      photoShape: parsed.photoShape ?? DEFAULT_APPEARANCE_PREFS.photoShape,
      showLivingIndicator:
        parsed.showLivingIndicator ?? DEFAULT_APPEARANCE_PREFS.showLivingIndicator,
    };
  } catch {
    return DEFAULT_APPEARANCE_PREFS;
  }
}

export function saveAppearancePrefs(prefs: AppearancePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort — storage may be unavailable or full. Ignore.
  }
}

export function appearanceToStyle(prefs: AppearancePrefs): PosterStyleOptions {
  return {
    ...DEFAULT_POSTER_STYLE,
    displayMode: prefs.displayMode,
    photoShape: prefs.photoShape,
    showLivingIndicator: prefs.showLivingIndicator,
  };
}
