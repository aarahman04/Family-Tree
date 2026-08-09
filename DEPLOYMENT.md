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
   - Vercel will detect `vercel.json` at the repo root and use it directly. **Leave every
     other setting at its default** — do not set a custom Root Directory, Build Command,
     Output Directory, or Install Command in the dashboard; `vercel.json` already specifies
     all of them and dashboard overrides would only risk drifting out of sync with it.
   - Click **Deploy**.
3. **Wait for the deployment to finish** (typically well under a minute — see
   `docs/performance-report.md` for build timing).
4. **Open the live URL** Vercel gives you.

That's the entire manual process. Nothing below this point is a required step — it's
reference material for branch protection (recommended, but a GitHub setting only a repo owner
can apply) and background on why the automatic parts work the way they do.

## Why zero configuration is enough

- **`vercel.json`** (repo root) gives Vercel explicit `installCommand` (`npm ci`),
  `buildCommand` (`cd web && npm run build`), and `outputDirectory` (`web/dist`) — the same
  commands CI runs, so there's no separate "how Vercel builds it" to drift out of sync with
  "how CI validates it." `"framework": null` disables Vercel's zero-config framework
  detection so it doesn't try to guess at settings for what looks like an unusual repo layout
  (an npm-workspaces monorepo with the deployable app in `web/`) — everything it needs is
  already explicit.
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
installing both the root and `web` workspace, then `cd web && npm run build` running
`tsc -b && vite build`, then a summary of the built `web/dist` output (matching what
`docs/performance-report.md` documents locally: ~160KB gzipped JS+CSS). If any of that looks
different, the dashboard's Root Directory or Build/Output settings have likely been manually
overridden — clear them back to "inherit from vercel.json" rather than editing them directly.
