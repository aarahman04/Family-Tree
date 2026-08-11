import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  loadThemePref,
  resolveInitialTheme,
  saveThemePref,
  type Theme,
} from "../lib/theme.js";

/** App-shell theme state. Applies the theme to <html>, follows the OS live while the user has no
 * explicit preference, and persists a manual toggle so it wins across reloads. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      // Only track the OS while the user hasn't overridden it.
      if (loadThemePref() === null) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((cur) => {
      const next: Theme = cur === "dark" ? "light" : "dark";
      saveThemePref(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
