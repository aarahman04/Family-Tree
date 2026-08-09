# GitHub Discussions — setup guidance

Discussions are not enabled by default on a new repository; a maintainer needs to turn them on
under **Settings → General → Features → Discussions**. This document is guidance for doing
that, not a template Discussions itself reads.

## Recommended categories

| Category | Format | Use for |
|---|---|---|
| **Announcements** | Announcement | Release notes, breaking changes — maintainer-only posting |
| **Q&A** | Q&A | "How do I...", "Why did my export do X" — anything answerable, gets a marked accepted answer |
| **Ideas** | Open-ended | Feature ideas not yet concrete enough for a feature-request issue (see below for the line) |
| **Show and tell** | Open-ended | "I used this to recover my family's tree from an app that's since shut down" — the good kind of validation |
| **FTZ format findings** | Open-ended | A dedicated home for anyone who discovers something about the FTZ format from a sample this project hasn't seen yet — see the note on `docs/ftz-format-spec.md`'s single-sample-risk limitation |

## Issues vs. Discussions — where does this go?

- **Issue**: something concrete and actionable — a bug, a specific feature request ready to be
  scoped, a documentation gap. Use the templates in `.github/ISSUE_TEMPLATE/`.
- **Discussion**: something exploratory — "would people want X", a question about how to use
  the tool, a report of an interesting FTZ file structure that isn't necessarily a bug. If a
  Discussion converges into something concrete, convert it to an issue (GitHub supports this
  natively) rather than duplicating it.

## The one rule that carries over from everywhere else in this project

Same as issues and PRs: **never post a real person's `.ftz`/`.ged` file, or an excerpt
containing real names/dates/notes about real people, in a Discussion** — including in "Show
and tell." Describe the shape of what happened instead. See `CODE_OF_CONDUCT.md`.
