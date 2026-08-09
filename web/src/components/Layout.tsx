import type { ReactNode } from "react";
import type { Route } from "../router.js";
import { Header } from "./Header.js";
import { Footer } from "./Footer.js";

interface LayoutProps {
  current: Route;
  children: ReactNode;
}

export function Layout({ current, children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <Header current={current} />
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
