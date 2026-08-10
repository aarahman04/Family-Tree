import { useEffect, useState } from "react";

export type Route = "home" | "about" | "privacy" | "editor";

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "about") return "about";
  if (hash === "privacy") return "privacy";
  if (hash === "editor") return "editor";
  return "home";
}

/**
 * Minimal hash-based router. Only 3 static pages with no params or nested routes, so a
 * full routing library would be more machinery than the app needs — plain anchors
 * (href="#/about") work with zero JS, and this hook just reflects the current hash as
 * state for the active-nav-link styling.
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

export function routeHref(route: Route): string {
  return route === "home" ? "#/" : `#/${route}`;
}
