import { useEffect, useId, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Route } from "../router.js";
import { routeHref } from "../router.js";
import { confirmDiscardIfUnsaved } from "../lib/unsavedEdits.js";
import { useCloseOnEscape } from "../lib/useCloseOnEscape.js";
import { useTheme } from "../hooks/useTheme.js";
import { ThemeToggle } from "./ThemeToggle.js";

const LINKS: { route: Route; label: string }[] = [
  { route: "home", label: "Home" },
  { route: "about", label: "About" },
  { route: "privacy", label: "Privacy" },
];

interface HeaderProps {
  current: Route;
}

// The full-screen editor (#/editor) keeps the only in-page edit state (see
// web/src/lib/unsavedEdits.ts) -- navigating away from it via one of these plain hash links
// unmounts it and discards that state instantly, with no beforeunload involved (a hash change
// isn't a page unload). Guard every link uniformly rather than special-casing "only when
// leaving the editor": the guard is a no-op with nothing to lose in every other case, so this
// stays correct without Header having to track where the unsaved state actually lives.
function guardNavigation(e: MouseEvent<HTMLAnchorElement>, target: Route, current: Route) {
  if (target === current) return; // no navigation actually happens; nothing to confirm
  if (
    !confirmDiscardIfUnsaved(
      "You have unsaved edits that will be lost if you leave this page. Continue?"
    )
  ) {
    e.preventDefault();
  }
}

export function Header({ current }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useCloseOnEscape(menuOpen, () => setMenuOpen(false));

  // Dismiss the mobile menu on a tap/click anywhere outside the header (the panel and its
  // trigger both live inside wrapRef). Only wired while open, so it costs nothing at rest.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <header
      ref={wrapRef}
      className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-x-4 px-4 py-3 sm:px-6 sm:py-4">
        <a
          href={routeHref("home")}
          onClick={(e) => guardNavigation(e, "home", current)}
          className="text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100"
        >
          FTZ → GEDCOM
        </a>

        {/* Desktop nav (>= sm): inline links + theme toggle. Hidden on phones, where the
            hamburger below takes over. */}
        <div className="hidden items-center gap-4 sm:flex">
          <nav aria-label="Main navigation">
            <ul className="flex gap-4 text-sm">
              {LINKS.map((link) => (
                <li key={link.route}>
                  <a
                    href={routeHref(link.route)}
                    onClick={(e) => guardNavigation(e, link.route, current)}
                    aria-current={current === link.route ? "page" : undefined}
                    className={
                      current === link.route
                        ? "font-semibold text-blue-700 dark:text-blue-400"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
        </div>

        {/* Mobile hamburger (< sm): a single 44px target. The panel's links are rendered only
            while open (below), so there are never duplicate links in the DOM at rest. */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="-mr-1.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 sm:hidden dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {menuOpen ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <MobileMenu id={menuId} current={current} onNavigate={() => setMenuOpen(false)} />
      )}
    </header>
  );
}

/** The phone-width dropdown panel: large tap targets for the pages, then a labelled theme row.
 *  Mounted only while open, with a brief slide/fade-in (see .header-menu-in in index.css). */
function MobileMenu({
  id,
  current,
  onNavigate,
}: {
  id: string;
  current: Route;
  onNavigate: () => void;
}) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <div
      id={id}
      className="header-menu-in border-t border-slate-200 sm:hidden dark:border-slate-800"
    >
      <nav aria-label="Main navigation" className="mx-auto max-w-3xl px-2 py-2">
        <ul className="flex flex-col">
          {LINKS.map((link) => {
            const active = current === link.route;
            return (
              <li key={link.route}>
                <a
                  href={routeHref(link.route)}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    guardNavigation(e, link.route, current);
                    if (!e.defaultPrevented) onNavigate();
                  }}
                  className={
                    "flex min-h-11 items-center rounded-lg px-3 text-base " +
                    (active
                      ? "font-semibold text-blue-700 dark:text-blue-400"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800")
                  }
                >
                  {link.label}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
        <button
          type="button"
          onClick={toggle}
          aria-pressed={dark}
          className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-base text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span>Appearance</span>
          <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            {dark ? "Dark" : "Light"}
            {dark ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </span>
        </button>
      </nav>
    </div>
  );
}
