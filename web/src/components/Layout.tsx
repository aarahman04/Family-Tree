import type { ReactNode } from "react";
import type { Route } from "../router.js";
import { Header } from "./Header.js";
import { Footer } from "./Footer.js";

interface LayoutProps {
  current: Route;
  children: ReactNode;
  /** Full-viewport mode (the editor): no width clamp, no padding, no footer. */
  fullBleed?: boolean;
}

export function Layout({ current, children, fullBleed }: LayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow dark:focus:bg-slate-800 dark:focus:text-slate-100"
      >
        Skip to main content
      </a>
      <Header current={current} />
      {fullBleed ? (
        <main id="main-content" className="min-h-0 flex-1 overflow-hidden">
          {children}
        </main>
      ) : (
        <main
          id="main-content"
          className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-8 sm:px-6"
        >
          {children}
        </main>
      )}
      {!fullBleed && <Footer />}
    </div>
  );
}
