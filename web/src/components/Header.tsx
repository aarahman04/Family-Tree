import type { Route } from "../router.js";
import { routeHref } from "../router.js";

const LINKS: { route: Route; label: string }[] = [
  { route: "home", label: "Home" },
  { route: "about", label: "About" },
  { route: "privacy", label: "Privacy" },
];

interface HeaderProps {
  current: Route;
}

export function Header({ current }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <a href={routeHref("home")} className="text-sm font-semibold text-slate-900 sm:text-base">
          FTZ → GEDCOM
        </a>
        <nav aria-label="Main navigation">
          <ul className="flex gap-4 text-sm">
            {LINKS.map((link) => (
              <li key={link.route}>
                <a
                  href={routeHref(link.route)}
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
