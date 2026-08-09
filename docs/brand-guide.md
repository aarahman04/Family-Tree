# Project Identity & Brand Guide

Prepared as part of Milestone 7 (Version 1.0 release readiness). The name **"TreeBridge"** used
throughout this project's newer documentation is a **recommendation pending your sign-off** —
renaming later only touches text (README, package descriptions, the GitHub repo name/topics),
not architecture, so this is a low-cost decision to revisit.

*A companion visual version of this document (logo mockups, color swatches, typography
specimen, hero-section mockup) was produced as an interactive artifact during this milestone —
ask to have it regenerated if you'd like to see it again; this file is the durable, in-repo
record of the same decisions.*

## Name

**Recommended: TreeBridge.**

Genealogy software has a strong, decades-old naming convention — *RootsMagic*, *Legacy Family
Tree*, *Gramps*, *Family Tree Maker* — plain, descriptive, two-part names a non-technical user
can say out loud and immediately understand. TreeBridge follows that convention rather than
reaching for an invented or abstract brand name, which matters for an audience that skews
toward valuing trustworthiness and plain-spokenness over novelty.

"Tree" ties directly to the subject matter and to the source app's own name (Quick Family
*Tree*) without borrowing its brand. "Bridge" does real work on three levels: it bridges one
file format to another (FTZ → GEDCOM), it bridges one piece of software's lifecycle to the open
standard that will outlive it, and it bridges one generation's records to the next. A web
search turned up no existing genealogy product, company, or trademark using this name.

### Other candidates considered

| # | Name | Why it didn't win |
|---|---|---|
| 2 | RootBridge | Same logic as TreeBridge; "root" reads slightly more botanical than functional |
| 3 | Kinbridge | Warmer, but less immediately legible to a non-native English speaker |
| 4 | Lineage Bridge | Accurate, but three syllables into "Lineage" slows it down |
| 5 | GedBridge | Leads with the acronym — opaque to a first-time visitor |
| 6 | TreeCarry | Nice portability metaphor, undersells the validation/repair the tool also does |
| 7 | Rootscribe | Reads closer to a note-taking app than a converter |
| 8 | OpenLineage | Collides conceptually with existing data-lineage/observability tooling |
| 9 | TreeArchive | Sounds like storage, not a migration tool |
| 10 | Legacy Bridge | "Legacy" is emotionally right but overloaded in software (= old/deprecated) |
| 11 | Kintree Open | Compound-plus-qualifier reads less confident than one settled name |
| 12 | Rootline | Doesn't communicate "conversion" or "format" at all on first read |
| 13 | TreeSprout | Too playful a metaphor for a tool handling irreplaceable family records |
| 14 | Familia Bridge | The Latin root reads as generic-brand rather than considered |
| 15 | GenBridge | "Gen" is ambiguous (generation? generator? Gen Z?) in a way "Tree" never is |

## Tagline

**Recommended:** *"Your family history, set free."* — names the emotional stake and the core
value prop (freedom from format lock-in) without cuteness.

Considered and rejected: *"From FTZ to forever"* (overpromises, reads more marketing than
trustworthy) and *"One app shouldn't hold your family hostage"* (sharper, but adversarial in
tone for a project that wants to stay likeable).

## Mission

TreeBridge exists to make sure no family's history is ever trapped in a format only one app
can open. It converts Quick Family Tree exports into open, universal GEDCOM files —
accurately, transparently, and entirely on your own device — so decades of research can
outlive any single piece of software.

## Vision

A future where every genealogist's research can move freely between tools, survive an app's
discontinuation, and be handed down as easily as the stories themselves.

## Core values

- **Accuracy** — never silently drop, guess at, or duplicate a single record. Every
  uncertainty is surfaced, not hidden.
- **Privacy** — your file never leaves your device. No servers, no accounts, no telemetry —
  verified, not just claimed (see `docs/security-privacy-review.md`).
- **Transparency** — open source, MIT-licensed, and readable end to end.
- **Longevity** — built to keep working long after the app that made your original file is
  gone.
- **Respect** — this is somebody's grandmother, not a test fixture. Every design decision is
  weighed against that.

## Target audience

- **Quick Family Tree users** who need their existing `.ftz` export in a format other software
  can actually open.
- **Genealogy hobbyists and researchers** moving years of research into RootsMagic, Gramps,
  FamilySearch, or Legacy without re-entering it by hand.
- **People inheriting a device or app account** — someone found a relative's family tree file
  after a loss and needs to preserve it somewhere durable.
- **Genealogy software developers** wanting a reference, open-source FTZ parser and GEDCOM
  exporter to build on or learn from.

## Mark concept

A single line-drawn tree canopy resting on a low arch — read the arch as roots, or as a
bridge; both are intentional. One weight, one color (deep pine green, `#1F3A2E`), no gradient,
so it stays legible from a 16px favicon up to a conference banner. A small copper dot
(`#A85C32`) marks the canopy's center — the only accent color in the mark, used sparingly. At
favicon size, drop the copper dot and render canopy-only in a single stroke.

## Typography

- **Display / headings:** `Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Times New Roman", serif`
  — carries warmth and a hint of archival authority without the overused "warm-cream-and-serif"
  template. Headings and the wordmark only, never running paragraph text.
- **Body / interface:** `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
  — plain, legible, operable. System stacks only — no webfonts, so the page never silently
  falls back to something ungoverned.

## Color

Pine and bone, not blue-and-cream — green ties directly to "tree" without reaching for a
tech-blue default; the bone/paper ground and copper accent read as archival (record cards, ink
stamps, old ledgers) rather than corporate.

| Token | Light | Dark |
|---|---|---|
| Primary (pine) | `#1F3A2E` | `#7BB096` |
| Accent (copper) | `#A85C32` | `#DC9D6C` |
| Ground | `#F1ECE0` | `#14201A` |
| Text (ink) | `#211E19` | `#ECE5D4` |

Dark mode doesn't simply invert — pine shifts lighter and slightly more saturated to hold
contrast on a near-black warm-green ground, and copper brightens the same way. Semantic
validation colors (error/warning/success) stay outside this palette entirely, exactly as in
the existing app.

## What this deliberately avoids

No gradient hero. No neon accent-on-black. No Inter-by-default typography. No
rounded-everything card soup. No emoji as section markers. This is dressed the way a piece of
software that will still be quietly working in fifteen years dresses — because that's the
actual promise being made to the people who'll use it.

## Applying this

Nothing in this document has been applied to the live app yet — the current UI still reads
"FTZ → GEDCOM" in its header. Applying the name/mark/palette to `web/src/components/Header.tsx`,
`index.html`'s `<title>`/favicon, and `package.json`'s `name` field is a small, mechanical
follow-up once the name is confirmed, not a redesign.
