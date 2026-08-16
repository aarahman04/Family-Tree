# AUD-13 — native scrollbar renders light on dark pages (deferred, in progress)

**Filed 2026-08-16.** Reported with a screenshot: on dark pages (visible on HomePage) the native
browser scrollbar shows a light-gray track/thumb against the dark background. Not covered by the
shell dark-mode audit.

## Scope

The affected scrollbar is the **inner `<main>` scroller** in `web/src/components/Layout.tsx:30`
(`mx-auto w-full max-w-3xl flex-1 overflow-y-auto …`), not the window scrollbar — in the screenshot
it sits off the right edge of the centered `max-w-3xl` column with the dark body showing on both
sides. The full-bleed editor route uses `overflow-hidden` instead, so this is the non-editor pages.

## What's already in place

`web/src/index.css` sets `color-scheme: light` on `:root` and `color-scheme: dark` on `:root.dark`,
and `applyTheme()` (`web/src/lib/theme.ts:38`) also sets `root.style.colorScheme`. `color-scheme`
inherits, so `<main>` computes `dark` — which *should* dark-theme its scrollbar in Chromium. The
audit's fix demonstrably covers the **root** scroller; this nested scroller still renders light in
the reported browser, so there is a real gap to confirm.

## Next steps (NOT yet done)

1. **Reproduce & confirm root cause.** Serve the app (`vite --port 5199`), toggle dark, inspect
   `getComputedStyle(document.querySelector('#main-content')).colorScheme` and the rendered
   scrollbar via Playwright. Confirm whether the inner scroller actually computes `dark` and why
   the scrollbar stays light (browser/version? overlay vs classic? a reset somewhere?).
2. **Apply the minimal fix.** Most likely an explicit, standard `scrollbar-color: <thumb> <track>`
   on `:root.dark` (and/or the scroll containers) in `index.css` — cross-browser (Firefox +
   Chromium 121+) and independent of the `color-scheme` inheritance quirk. Keep it to the token
   palette (e.g. slate-700 thumb / slate-900 track in dark).
3. **Verify** with real light+dark screenshots of HomePage, then run root+web gates.

Tracking id: **AUD-13**. Fix will land on its own branch/commit after the AUD-6/8/9/10/11/12 PR.
