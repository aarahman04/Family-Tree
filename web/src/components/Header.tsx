import type { MouseEvent } from "react";
import type { Route } from "../router.js";
import { routeHref } from "../router.js";
import { confirmDiscardIfUnsaved } from "../lib/unsavedEdits.js";

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
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <a
          href={routeHref("home")}
          onClick={(e) => guardNavigation(e, "home", current)}
          className="text-sm font-semibold text-slate-900 sm:text-base"
        >
          FTZ → GEDCOM
        </a>
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
                      ? "font-semibold text-blue-700"
                      : "text-slate-600 hover:text-slate-900"
                  }
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
