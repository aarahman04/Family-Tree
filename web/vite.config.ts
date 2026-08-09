import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// This app imports the existing parser/gedcom/validation/models packages directly from
// the repository root (no duplicated business logic) — fs.allow lets the dev server serve
// those source files even though they live outside web/'s own root.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
