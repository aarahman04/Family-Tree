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

## Step 2 execution — combined styling + dark pass (2026-08-15)

Merged phase: desktop styling bugs, mobile responsiveness, and dark-mode Step 2, done surface by
surface. Shipped so far: V1 (render-identity guard extended to viewport), global batch (token
vocab in `docs/dark-mode-tokens.md` + AA gate `theme-contrast.test.ts` + FOUC pre-hydration +
Layout/Header/Footer), emerald CTA AA fix, E1 (sidebar seeds from viewport width).

### Deferred INTO the menu/picker batch (moved out of the EditorPage-chrome checkpoint)
Discovered while implementing E2: the toolbar can't become a horizontal-scroll strip without
touching the Add/View/Appearance menu components (measured at 390px — the 3 menus are 233px and
can't be pinned within the 358px usable width; and an `overflow-x-auto` strip clips their
`absolute` dropdowns, confirmed empirically by screenshot). So E2/E3 have a hard dependency on the
menu components and move to that batch. **The menu/picker batch is therefore NO LONGER a routine
`dark:` sweep — it now carries a real structural decision + a layout change. Treat it as its own
standalone checkpoint, and bring the chosen approach back for review BEFORE building (same gate as
C1 and E1).**

- **E2 — toolbar horizontal scroll.** Once it lands, the priority order is: **tree name, search,
  and the panel toggle stay pinned/always-visible; undo/redo and status go in the scrollable
  region.** The menus' pinned-vs-scrollable behavior is the open structural decision (portal/fixed
  dropdowns, icon-collapse on mobile, or a combined "Tools" menu) — pick one and get sign-off first.
- **E3 — status `ml-auto`.** The auto-margin misbehaves once the toolbar row wraps; it's only
  meaningful relative to E2's final layout, so it rides with E2. Resolves for free inside E2's
  final structure: status moves into the scroll strip, where `ml-auto` pushes it to the right on
  desktop (content narrower than the strip) and collapses harmlessly on mobile (content overflows
  and scrolls) — no wrap, so no broken auto-margin.

#### E2 dropdown-behavior recommendation (2026-08-15) — RECOMMENDED: Option A (portal), awaiting sign-off
The menus can't be pinned (233px > fits) and can't sit in an `overflow-x-auto` strip (clips their
`absolute` dropdowns — verified by screenshot). Three ways out:
- **A — Anchored/portaled dropdowns (RECOMMENDED).** Extract a small `useAnchoredDropdown` hook:
  the trigger keeps a ref; the panel renders `position: fixed` at a computed rect (right-aligning
  near the viewport edge) and CLOSES on toolbar scroll (no reposition-on-scroll needed). Then the
  whole control run lives in one horizontal-scroll strip; menus keep full text labels and simply
  scroll a swipe away. Fixes dropdown-clipping as a class (reusable for SearchBox/PersonPicker
  later). Cost: touches the 3 menu components' panel rendering once, via a shared hook.
- **B — Icon-collapse below `sm`.** Add/View/Appearance become icon-only triggers (~120px total),
  so they stay pinned and dropdowns stay `absolute`/unclipped. Cost: responsive icon+aria on 3
  triggers; discoverability hit (what icon = "Appearance"?).
- **C — Combined "Tools ▾" menu below `sm`.** One trigger composes all three menus' items. Minimal
  pinned width, but the heaviest build (new composing component) and an extra tap to any View
  action on mobile.
Recommendation rationale: A keeps text labels, removes a latent bug class, and is the most
reusable; menus scrolling (not pinned) is acceptable and standard on mobile toolbars. B is the
fallback if menus must stay always-visible. Bring the final pick back before building.

### About/Privacy dark-mode follow-up (deferred surface — must land before final verification)
`web/src/pages/AboutPage.tsx` and `web/src/pages/PrivacyPage.tsx` currently have **zero `dark:`
treatment** — they render light in dark mode, the same gap the landing/import surfaces had before
step 7. They were skipped by the earlier passes (not in any checkpoint's surface list). They need
their own small `dark:` pass, done **before** the final verification checkpoint so the both-theme
smoke can cover them. Add "about, privacy" to the checkpoint's touched-surface smoke list when this
lands. Scope: chrome/text tokens only — no `poster/` touch, render-identity guard stays green.

### Final verification checkpoint (to run after PosterExportPanel, before the pass closes)
Formally part of the plan so it can't compress away at the end. Full both-workspace gates; the AA
contrast gate; the render-identity guard; a real-browser smoke of BOTH themes at 375/768/1280
across every touched surface (landing, editor, inspector, canvas, menus, export); confirm the FOUC
script still runs pre-hydration; confirm no body horizontal-scroll at any breakpoint. Produce the
before/after theme screenshots as the closing evidence, and reconcile the deferred backlog
(AUD-8/9/10) is still tracked and untouched.

### EditorPage-chrome checkpoint as actually shipped
E4 (dark treatment) + E5 (empty state) only — on the current (wrapping) toolbar structure. The 3
menu triggers, SearchBox, PersonInspector (own checkpoint), and ExportMenu/PosterExportPanel (own
checkpoint) stay light in dark mode as accepted intermediates until their checkpoints; nothing
ships mid-pass.
