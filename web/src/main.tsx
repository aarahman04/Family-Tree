import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { applyTheme, resolveInitialTheme } from "./lib/theme.js";

// Apply the theme before first paint so there's no light-to-dark flash. useTheme re-applies it
// (idempotently) once React mounts.
applyTheme(resolveInitialTheme());

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
