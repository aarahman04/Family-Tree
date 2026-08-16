# Dark mode token vocabulary

The shared class vocabulary for the app-shell styling/dark-mode phase (Step 2). It is a
**convention, not a CSS-variable refactor** — a semantic-token refactor is explicitly out of scope
(see `superpowers/plans/2026-08-11-shell-dark-mode.md`). Every row is a light utility paired with
the `dark:` utility that must accompany it.

Contrast is enforced executably by `web/tests/lib/theme-contrast.test.ts`, which parses Tailwind's
real OKLCH palette, converts to sRGB, and asserts each pair meets its WCAG 2.1 AA bar. Update the
table and the test together.

## Bars applied

| Bar | Applies to |
| --- | --- |
| **4.5:1** | Normal body text (WCAG 1.4.3 AA) |
| **3:1** | Large/bold text ≥18.66px, and **interactive component boundaries** — input and control borders, focus rings (WCAG 1.4.11) |
| _exempt_ | Purely decorative separators — panel dividers, section hairlines. These do not identify a control, so 1.4.11 does not apply. |

The decorative/interactive border split is the one judgement call in this table. A hairline between
two sections is not something you operate, so it is held to no minimum; the border that tells you
where a text input begins is, so it must clear 3:1.

## Surfaces (elevation)

| Role | Light | Dark |
| --- | --- | --- |
| L0 — app backdrop, canvas | `bg-slate-50` | `dark:bg-slate-950` |
| L1 — chrome, panels, cards | `bg-white` | `dark:bg-slate-900` |
| L2 — raised: menus, popovers | `bg-white` | `dark:bg-slate-800` |
| Sunken — sidebar rail, `<details>` body | `bg-slate-50` | `dark:bg-slate-900` |

## Borders

| Role | Light | Dark | Bar |
| --- | --- | --- | --- |
| Divider (decorative) | `border-slate-200` | `dark:border-slate-800` | exempt |
| Control boundary (inputs, bordered buttons) | `border-slate-300` ⚠ | `dark:border-slate-500` | 3:1 |

⚠ `border-slate-300` on white is **1.49:1** — a pre-existing light-mode 1.4.11 failure, not
introduced here. The lightest passing shade is `slate-500` (4.76:1), a visibly heavier border
across the whole app. Flagged rather than changed unilaterally; see "Open findings".

## Text

| Role | Light | Dark |
| --- | --- | --- |
| Primary | `text-slate-900` | `dark:text-slate-100` |
| Secondary | `text-slate-700` | `dark:text-slate-300` |
| Muted | `text-slate-600` | `dark:text-slate-400` |
| Faint (large/bold only) | `text-slate-500` | `dark:text-slate-500` |

## Semantic

| Role | Light | Dark |
| --- | --- | --- |
| Link / accent | `text-blue-700` | `dark:text-blue-400` |
| Selected/accent tint | `bg-blue-50 border-blue-500` | `dark:bg-blue-950/40 dark:border-blue-500` |
| Error text | `text-red-700` | `dark:text-red-400` |
| Error tint | `bg-red-50 border-red-200` | `dark:bg-red-950/40 dark:border-red-900` |
| Warning text | `text-amber-800` | `dark:text-amber-300` |
| Warning tint | `bg-amber-50 border-amber-200` | `dark:bg-amber-950/40 dark:border-amber-900` |
| Success text | `text-green-700` | `dark:text-green-400` |
| Success tint | `bg-green-50 border-green-200` | `dark:bg-green-950/40 dark:border-green-900` |
| Primary action | `bg-emerald-700 text-white` | `dark:bg-emerald-500 dark:text-slate-950` |

The three tint rows follow one pattern — a `50` fill + `200`/`500` border in light become a
`950/40` fill + `900` border in dark, with the label at the `300` shade (`slate-100`/`blue-400` on
the selected tint). Text on a tint stays at-or-brighter than the same family's tested "text on L1"
pair, so no new contrast pair is introduced. **Saturated filled accent buttons** (`bg-blue-600`,
`bg-green-700` download actions) are theme-independent — the fill carries its own contrast on any
backdrop, so they take no `dark:` variant, unlike the emerald chrome CTA which brightens.

`text-white` on `bg-emerald-700` is **5.36:1** — clears AA for the `text-sm font-semibold` (14px)
label. This was raised from `emerald-600` (3.65:1, a failure) in the global batch; hover deepens to
`emerald-800`.

## Inverted surfaces

The delete toast is a dark chip in light mode; in dark mode it would sink into L1, so it lifts to
L2 with a boundary instead of inverting:

| Light | Dark |
| --- | --- |
| `bg-slate-900 text-white` | `dark:bg-slate-800 dark:ring-1 dark:ring-slate-700` |

## Theme-exempt: the poster

`renderPosterSvg` output is **never** themed — not in the editor canvas, not in the export
preview. The poster keeps its own paper palette in both themes (confirmed decision, forks #3/#4).
The canvas backdrop darkens around it; the sheet stays paper-white, like artboards in a design
tool. Enforced by `web/tests/lib/theme-render-identity.test.ts`.

This also means the canvas focus-dim overlay (`bg-slate-50/75`) stays light in both themes — it
dims against the light sheet, not against the app backdrop.

## Open findings (pre-existing, not introduced by this phase)

Both surfaced during the audit as genuine WCAG AA failures in the **existing light** design.

1. **Control borders — DEFERRED as AUD-9.** `border-slate-300` on white, 1.49:1 vs. the 3:1 bar.
   Affects every text input in PersonInspector, PersonPicker, SearchBox, PosterExportPanel. Not
   fixed here: the lightest passing shade (`slate-500`, 4.76:1) is a visibly heavier border applied
   app-wide — a visual-weight decision, not a contained swap. Pinned by `theme-contrast.test.ts`.
2. **Primary CTA — FIXED (global batch).** `text-white` on `bg-emerald-600` was 3.65:1 vs. the
   4.5:1 bar. Raised to `bg-emerald-700` (5.36:1) across all five call sites (HomePage restore +
   bottom CTAs, EditorPage empty-state CTA, both wizard Next buttons); hover deepens to
   `emerald-800`. Asserted positively in `theme-contrast.test.ts`.
