# Privacy & Security Review

Performed as part of Milestone 7 (v1.0 release readiness). This document verifies the
project's privacy claims against the actual code, rather than restating them — every claim
below was checked directly, with the exact command or search used, not just asserted.

## Does all processing really happen locally? Yes — verified, not just claimed.

The app has no backend to send anything to in the first place:

```
$ grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon" web/src/
(no matches)

$ grep -rn "localStorage\|sessionStorage\|indexedDB" web/src/
(no matches)
```

There is no network call of any kind anywhere in the application source — no `fetch`, no
`XMLHttpRequest`, no `WebSocket`, no `navigator.sendBeacon`. There is also no browser storage
of any kind — no `localStorage`, `sessionStorage`, or `IndexedDB` usage — so nothing about an
uploaded file or a session's edits persists even *locally* between page loads, let alone gets
sent anywhere. `web/index.html` loads no external resources either (no CDN scripts, no
webfont links) — the favicon is a local SVG and the only script is the app's own bundle.

The one outbound link in the entire app is a plain `<a href="https://gramps-project.org">` on
the About page, pointing to the Gramps project's homepage as a mention of compatible software
— a normal hyperlink a user has to click themselves, not an automatic request.

**How this holds up architecturally, not just today:** the parser, validator, editor, and
GEDCOM exporter (`parser/`, `validation/`, `editor/`, `gedcom/`) are plain, framework-free
TypeScript with no I/O capability of their own — they take data in and return data out. The
web app runs them inside a Web Worker (`web/src/worker/ftzWorker.ts`) purely for UI
responsiveness on large files, not for any privacy reason, and that worker has no network
access configured or used. A future contributor adding a network call would have to do so
somewhere conspicuous (a new hook, a new fetch call) rather than there being some existing
plumbing to quietly extend — there's nothing to accidentally wire up.

## File handling

- A selected `.ftz` file is read via the browser's File API (`file.arrayBuffer()`) directly
  into memory — never written to disk by the app, never uploaded.
- The parsed result lives only in React state for the current page session.
- Editing (`editor/` via `useTreeEditor`) never touches the original uploaded bytes — it
  operates on the derived `FamilyTree` object. The original file object itself is not even
  held onto after parsing; there is no path back from the internal model to "re-serialize the
  original file," which is what makes "the original file is never modified" a structural fact
  rather than a discipline the code has to maintain.
- Refreshing or closing the tab discards everything — there is no browser storage to survive
  it (see above).

## Downloads

The generated GEDCOM file is exposed via a `Blob` + `URL.createObjectURL` (in
`web/src/components/DownloadPanel.tsx`), which creates a purely in-browser, in-memory object
URL — this never touches the network either. The object URL is correctly revoked in a
`useEffect` cleanup keyed on the URL itself, so repeated exports or navigating away don't leak
memory.

## Dependency safety

```
$ npm audit --omit=dev            (root package)
found 0 vulnerabilities

$ cd web && npm audit --omit=dev
found 0 vulnerabilities
```

**Zero vulnerabilities in production dependencies**, in both packages.

Including dev dependencies, both packages report vulnerabilities that trace to a single
source: `esbuild`'s known dev-server CORS issue
([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)), pulled in
transitively through `vite`/`vitest`. This is **dev-tooling-only** — it describes a request
any website could make to a locally-running `vite dev` server while a developer has one open,
which has no bearing on the production build users actually receive (there is no dev server in
production; `npm run build` produces static files with no server component at all). The
suggested fix (`npm audit fix --force`) would upgrade to Vite 8, which this project
deliberately avoids — Vite was pinned to 5.4.x earlier in development after a duplicate-
install TypeScript type-identity conflict surfaced with a newer version (see `git`/milestone
history). **Recommendation:** don't force this upgrade for a dev-only, no-production-impact
advisory; revisit the Vite version pin the next time there's an unrelated reason to touch
build tooling, and re-run `npm audit` at that point.

## Supply-chain considerations

- **No secrets in CI.** `.github/workflows/ci.yml` runs `npm ci`, typecheck, lint, test, and
  build — nothing in that pipeline reads a `secrets.*` value, and there is no deploy workflow
  with credentials to protect. A compromised CI run has nothing sensitive to exfiltrate.
- **No `postinstall`/`preinstall`/`prepare` scripts** in either `package.json` — nothing runs
  arbitrary code automatically on `npm install` beyond what npm's own dependency scripts do.
- **GitHub Actions are pinned to major-version tags** (`actions/checkout@v4`,
  `actions/setup-node@v4`) rather than full commit SHAs. This is standard practice for a
  project of this size using only official, widely-trusted actions; full-SHA pinning is a
  stricter hardening step worth adopting if the project's risk profile changes (e.g. a future
  deploy workflow with real credentials), not required today.
- **Dependencies are minimal and unsurprising** for a Vite + React + TypeScript project:
  React, Vite, Tailwind, `@xyflow/react` (visualization), `dagre` (graph layout), `jszip`
  (archive extraction). No dependency was added without a clear, single purpose tied to a
  specific milestone requirement.

## Recommendations

1. Keep the "zero network calls, zero browser storage" property covered by an explicit test
   going forward — currently verified by manual `grep` during this audit, not by an automated
   check that would fail CI if someone added a `fetch` call later. A lightweight ESLint rule or
   a grep-based CI step would make this a structural guarantee rather than a point-in-time
   finding. *(Not added in this milestone — flagged as a roadmap candidate, since adding new
   CI gates is a real decision outside "release readiness" scope.)*
2. Re-run `npm audit` (both packages) before each future release, and revisit the Vite version
   pin opportunistically rather than urgently.
3. If this project ever adds a feature that *does* need network access (e.g. checking for
   app updates), it should be opt-in and disclosed prominently on the Privacy page — the
   current "nothing leaves your device" claim is a core value proposition, not a footnote.
