# Deployment Guide

This document is the complete, one-time setup reference for pushing this repository to GitHub
and connecting it to Vercel. After the steps in this document are done once, ongoing
deployment is fully automatic — push to `main` deploys to production, every pull request gets
its own preview URL, and no one needs to touch this document again for routine work.

## What you need to do

1. **Push this repository to GitHub** (it already has a `main` branch and an `origin` remote
   configured — see `git remote -v`).
2. **Connect the repository to Vercel**:
   - [vercel.com/new](https://vercel.com/new) → Import Git Repository → select this repo.
   - Vercel will detect `vercel.json` at the repo root and use it directly. Leave Install
     Command and Build Command on their `vercel.json` defaults. **Framework Preset and Root
     Directory don't matter** — `vercel.json`'s `buildCommand` detects which one it got at
     build time and adapts (see below), specifically because picking "Vite" in the import
     wizard leads Vercel to set Root Directory to `web` for you, and fighting that with a
     dashboard override is more fragile than just handling both cases.
   - Click **Deploy**.
3. **Wait for the deployment to finish** (typically well under a minute — see
   `docs/performance-report.md` for build timing).
4. **Open the live URL** Vercel gives you.

That's the entire manual process. Nothing below this point is a required step — it's
reference material for branch protection (recommended, but a GitHub setting only a repo owner
can apply) and background on why the automatic parts work the way they do.

## Why zero configuration is enough

- **`vercel.json`** (repo root) gives Vercel an explicit `installCommand` (`npm ci`) and a
  self-adapting `buildCommand`:
  ```
  if [ -d web ]; then cd web && npm run build && rm -rf ../dist && mv dist ../dist; else npm run build; fi
  ```
  This exists because of a real, observed failure: Vercel's "Root Directory" project setting
  can end up set to `web` (the import wizard suggests it when you pick Vite as the framework,
  since that's genuinely where the Vite app's `package.json` lives) or left at the repo root,
  and *which one* isn't something `vercel.json` can detect in advance — it depends on a
  dashboard setting, not the repo. The command checks whether a `web` directory exists
  relative to wherever the build actually starts: if so, it's at the repo root and needs to
  `cd` in; if not, it's already inside `web/` (Root Directory was set to `web`) and runs the
  build directly. Either way, the build output is normalized to `outputDirectory: "dist"`
  interpreted relative to wherever the build started (moving `web/dist` up one level in the
  repo-root case) — one static `outputDirectory` value that's correct in both cases. This is
  the same command CI effectively validates too (`.github/workflows/ci.yml`'s `build` job runs
  `npm run build` from inside `web/` directly), so there's no separate "how Vercel builds it"
  to drift out of sync with "how CI validates it." `"framework": null` disables Vercel's
  zero-config framework detection so it doesn't try to guess at settings on top of this.
- **No SPA rewrite rules are needed.** The app uses hash-based routing (`#/about`, `#/privacy`
  — see `web/src/router.ts`), not the History API, so every route is really just `/` with a
  different URL fragment. There's no server-side routing concern to configure.
- **No environment variables are needed** (see below), so there's nothing to fill in on
  Vercel's Environment Variables screen before the first deploy.

## Environment variables

**None are required.** This application has no backend, no API keys, and no build-time
configuration that varies by environment — see `docs/security-privacy-review.md` for the
verified (not just claimed) breakdown of what the app does and doesn't do over the network
(nothing). If a future feature genuinely needs a build-time value (an API base URL, a feature
flag), it should be added here with its purpose documented before it's introduced — this
section exists so that requirement is never silently assumed.

## Automatic deployments

Once the repository is connected via Vercel's GitHub integration (step 2 above):

- **Every push to `main`** triggers a production deployment automatically.
- **Every pull request** gets its own preview deployment automatically, with a unique URL
  posted as a comment/check on the PR, and updated on every new commit to that PR.

Both of these are native behavior of Vercel's GitHub App integration — **no GitHub Actions
workflow is used or needed for deployment itself.** This is a deliberate choice, not an
oversight: a custom "deploy via GitHub Actions" workflow would need a `VERCEL_TOKEN` secret
and project ID configured in GitHub, which is exactly the kind of manual setup step this
project is trying to avoid. `.github/workflows/ci.yml` exists purely for the *checks* below —
it never deploys anything.

## Branch protection (recommended — apply once the repo is on GitHub)

GitHub branch protection can't be configured from this repository's files; it's a repo
setting only an owner/admin can apply, at **Settings → Branches → Add branch protection rule**
for `main`. Recommended configuration:

| Setting | Value |
|---|---|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ |
| Require status checks to pass before merging | ✅ |
| Required status checks | `Lint`, `Type check`, `Unit tests`, `Accessibility checks`, `Production build` (the five jobs in `.github/workflows/ci.yml` — each only appears in the list of available checks after it has run at least once, so open one throwaway PR first if the list is empty) |
| Require branches to be up to date before merging | ✅ |
| Do not allow bypassing the above settings | Recommended, even for admins |

This is what makes "failing checks prevent merges" real: with this configured, a PR with a
red `Lint` or `Accessibility checks` job physically cannot be merged through GitHub's UI,
regardless of who's reviewing it.

## Verifying it worked

After connecting the repo, Vercel's first deployment log should show, in order: `npm ci`
installing both the root and `web` workspace, then `tsc -b && vite build` running (either
directly or after a `cd web`, depending on the Root Directory case above — both are correct),
then a summary of the built output (matching what `docs/performance-report.md` documents
locally: ~160KB gzipped JS+CSS). If the build fails with something like
`cd: web: No such file or directory`, that means an *older* version of `vercel.json` (one
that assumed a fixed Root Directory rather than detecting it) is deployed — pull the latest
`main` and redeploy; the current `buildCommand` is written specifically not to make that
assumption. If a build still fails after that, check the dashboard's Build/Output/Install
Command fields under Settings → General — if any of them have been manually overridden away
from "inherit from `vercel.json`" (via `... Override` toggles), clear the override rather than
editing the value, so `vercel.json` is back in full control.
