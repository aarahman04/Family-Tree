# Shell-only dark mode — plan

Approved 2026-08-11 (all four forks per recommendation). Post-arc; touches NO `poster/` file.

## Invariant (load-bearing)
`renderPosterSvg` is theme-blind — it takes no theme argument and reads no DOM. The poster keeps
its fixed paper palette in every theme, so **SVG/PDF export is byte-identical** regardless of
theme. This is the same single-source-of-truth property the Person Cards arc protected. Guarded
by tests, not just asserted.

## Decisions (locked)
1. **Toggle UX:** both — default to OS `prefers-color-scheme` on first load; a manual toggle
   overrides and persists.
2. **Home + persistence:** sun/moon button in the app shell header; persisted under a **separate**
   `familyTree.theme.v1` key (NOT folded into `appearancePrefs`, which is poster appearance).
3. **Canvas backdrop:** darkens with the shell (pure CSS on the wrapper); the poster SVG stays
   paper-white — a light page floats on a dark canvas.
4. **Export panel:** chrome darkens; the poster **preview swatch stays paper-white** (WYSIWYG).

## Mechanism
Tailwind v4 class-based dark variant: `@custom-variant dark (&:where(.dark, .dark *));` in
`index.css`; toggle a `dark` class + `color-scheme` on `<html>`. Shell surfaces get `dark:`
utilities. No semantic-token refactor (out of scope for shell-only).

## Steps (sequential, both-workspace gates each)
1. **Mechanism + toggle + persistence + tests.** `index.css` variant; `lib/theme.ts` (load/save
   `familyTree.theme.v1`, `systemPrefersDark`, `resolveInitialTheme`, `applyTheme`); `useTheme`
   hook (apply on mount, live-follow OS only when no explicit pref, `toggle()`); a header
   sun/moon button. Tests: theme-logic (stored wins over system; system used when unset;
   round-trip; applyTheme toggles the class) + the **render-identity guard** (renderPosterSvg
   output identical with/without `.dark`; export SVG string unaffected).
2. **Shell surface `dark:` passes.** Mechanical, batched by area. → SHOW the area groupings to
   the user ONCE before running the pass (sanity check, esp. PersonInspector + PosterExportPanel).
   Includes the render-identity guard staying green.
3. **Gates + manual smoke in both themes.**

## Out of scope
Any `poster/` change; the two backlogged AUD-5 items; a semantic-token refactor; AUD-6; AUD-8
(ViewMenu `menuitemcheckbox` misuse — behavioral a11y, deferred out of the styling phase).
