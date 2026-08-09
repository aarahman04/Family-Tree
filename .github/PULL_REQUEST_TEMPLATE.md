## What changed and why

<!-- Not just what — why. Especially for anything touching FTZ field mapping, GEDCOM
     generation, or validation rules, since the reasoning matters more than the diff. -->

## Which part of the project does this touch?

- [ ] FTZ format understanding (`docs/ftz-format-spec.md`)
- [ ] Parser (`parser/`)
- [ ] Validation (`validation/`)
- [ ] Editor (`editor/`)
- [ ] GEDCOM export (`gedcom/`)
- [ ] Web app / explorer (`web/`)
- [ ] Documentation only

## Checklist

- [ ] `npm test` passes at the root (parser/validation/editor/GEDCOM)
- [ ] `npm run typecheck` passes at the root
- [ ] `web/`: `npm test`, `npm run typecheck`, `npm run build`, and `npm run lint` all pass
- [ ] Any new parser/editor/validation/GEDCOM behavior has a test
- [ ] Any new UI interaction has at least a component test
- [ ] Any change to layout, responsive breakpoints, or the visualization canvas was verified
      in a real browser at a few widths, not just in the jsdom-based test suite (see
      `CONTRIBUTING.md` — jsdom cannot catch real CSS layout bugs)
- [ ] No real person's `.ftz`/`.ged` file or data is included anywhere in this PR (tests,
      fixtures, screenshots, commit messages) — see `CODE_OF_CONDUCT.md`

## Screenshots (if this changes the UI)

<!-- Use synthetic data only — see docs/screenshots/ for the existing pattern. -->
