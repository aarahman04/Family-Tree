export type Theme = "light" | "dark";

// App-shell theme only. Kept SEPARATE from appearancePrefs (which is poster appearance) — a theme
// is chrome, not part of the tree or its poster. The poster/renderer never reads this.
const KEY = "familyTree.theme.v1";

/** The user's explicit choice, or null to follow the OS setting. */
export function loadThemePref(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function saveThemePref(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private-mode / quota — a non-persisted toggle still works for the session */
  }
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Stored choice wins; otherwise follow the OS. */
export function resolveInitialTheme(): Theme {
  return loadThemePref() ?? (systemPrefersDark() ? "dark" : "light");
}

/** The one place the theme reaches the DOM: a `dark` class + color-scheme on <html>. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}
