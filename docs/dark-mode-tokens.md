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
| Error text | `text-red-700` | `dark:text-red-400` |
| Error tint | `bg-red-50 border-red-200` | `dark:bg-red-950/40 dark:border-red-900` |
| Warning text | `text-amber-800` | `dark:text-amber-300` |
| Warning tint | `bg-amber-50 border-amber-200` | `dark:bg-amber-950/40 dark:border-amber-900` |
| Success text | `text-green-700` | `dark:text-green-400` |
| Primary action | `bg-emerald-600 text-white` ⚠ | `dark:bg-emerald-500 dark:text-slate-950` |

⚠ `text-white` on `bg-emerald-600` is **3.65:1** at `text-sm font-semibold` (14px — not "large" by
WCAG, which needs ≥18.66px bold). Another pre-existing light-mode AA failure. `emerald-700` gives
5.36:1. See "Open findings".

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

Both are genuine WCAG AA failures in the **existing light** design. Fixing either changes the
established light appearance, so neither is being changed as a side effect of dark-mode work:

1. **Control borders** — `border-slate-300` on white, 1.49:1 vs. the 3:1 bar. Affects every text
   input in PersonInspector, PersonPicker, SearchBox, PosterExportPanel.
2. **Primary CTA** — `text-white` on `bg-emerald-600`, 3.65:1 vs. the 4.5:1 bar. Affects the
   HomePage hero and restore CTAs, the EditorPage empty-state CTA, and the wizard's Next button.
   `bg-emerald-700` would clear it at 5.36:1.
