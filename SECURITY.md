# Security Policy

## The short version

This application has no backend. Your `.ftz` file is read, parsed, edited, and converted
entirely by JavaScript running in your own browser tab — there is no server for a file to be
uploaded to, no database, no API, and no account system. That structurally rules out an entire
category of vulnerability (server-side data breach, unauthorized access to stored files)
because there is no server-side data store in the first place. See
[`docs/security-privacy-review.md`](docs/security-privacy-review.md) for the full, verified
breakdown of what actually happens to your data.

That doesn't mean there's nothing to secure — a client-side bug (a crafted `.ftz` file that
breaks parsing in a dangerous way, a dependency with a known vulnerability, an XSS path
through a person's name or note field into the rendered UI) is still worth reporting
seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.** Use GitHub's private
vulnerability reporting instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, how to reproduce it, and its potential impact.

If GitHub's private reporting isn't available to you for some reason, open an issue asking for
an alternate private contact method — without describing the vulnerability itself.

**Please do not attach a real person's `.ftz`/`.ged` file to a vulnerability report.** If the
issue is data-shape-specific, build a small synthetic reproduction instead (see
`CONTRIBUTING.md`).

## What's in scope

- The parser (`parser/`), validation engine (`validation/`), editor (`editor/`), and GEDCOM
  exporter (`gedcom/`) — especially anything that could cause a crafted file to corrupt data,
  hang the browser, or execute unintended code.
- The web app (`web/`) — especially any path where user-controlled data (a name, a note, a
  file name) could end up interpreted as HTML/JS rather than displayed as text (XSS), or where
  a dependency has a known CVE affecting how this app uses it.
- The build/release pipeline (GitHub Actions) — supply-chain concerns like an unpinned action
  or a compromised dependency.

## What's out of scope

- The security of your own browser, OS, or device.
- The original Quick Family Tree app or its `.ftz` format itself — this project only reads
  that format; it doesn't run or depend on that app being secure.
- Reports that require an attacker to already have local access to the machine running the
  browser (at that point they already have your files directly).

## Supported versions

This is a young project without an LTS policy yet — security fixes land on `main` and the
latest tagged release. Once the release history is longer, this section will specify which
tagged versions still receive fixes.

## Dependency hygiene

Dependencies are kept minimal and standard for a Vite + React + TypeScript project (React,
Vite, Tailwind, `@xyflow/react` for visualization, `dagre` for layout, `jszip` for archive
extraction). `npm audit` is run as part of routine maintenance; see
[`docs/security-privacy-review.md`](docs/security-privacy-review.md) for the current
dependency-audit results and how supply-chain risk is managed for a project with no CI-time
secrets or deploy credentials to steal in the first place.
