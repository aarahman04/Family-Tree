# Graph Report - Family-Tree  (2026-08-16)

## Corpus Check
- 224 files · ~166,580 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1375 nodes · 2687 edges · 117 communities (100 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a676c341`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- parser/index.ts
- exportGedcom
- insights.ts
- Header.tsx
- EditorPage.tsx
- compilerOptions
- Full-Screen Family Tree Editor — Single Layout Engine
- EditorCanvas.tsx
- computePosterLayout
- poster/types.ts
- dependencies
- compilerOptions
- compilerOptions
- layout.ts
- devDependencies
- Global Constraints
- Person Cards with Photos — Design Specification
- renderSvg.ts
- compilerOptions
- DownloadPanel.tsx
- layoutBalanced.ts
- AUD-13 — native scrollbar renders light on dark pages (deferred, in progress)
- package.json
- PosterExportPanel.tsx
- Print Poster — Developer Documentation
- mockWorker.ts
- @types/node
- ErrorBoundary
- poster-photo-render.test.ts
- poster-balanced-fragments.test.ts
- UploadArea.tsx
- vercel.json
- Round 1 (Milestone 7 release-readiness audit)
- ConversionProgress.tsx
- download.test.tsx
- FamilyTree
- axe.test.tsx
- conversion-flow.test.tsx
- .prettierrc.json
- TechnicalDetails.tsx
- web/tsconfig.json
- @testing-library/jest-dom
- eslint-plugin-react-refresh
- Explorer Architecture — Developer Documentation
- @testing-library/react
- @testing-library/user-event
- Project Identity & Brand Guide
- TreeBridge — FTZ → GEDCOM Converter
- typescript-eslint
- vite
- @vitejs/plugin-react
- Global Constraints
- Shell-only dark mode — plan
- Parser Test Case Specification
- GEDCOM Exporter — Developer Documentation
- Final review — critical, not confirmatory
- Dark mode token vocabulary
- Editor Architecture
- Parser Implementation — Developer Documentation
- scripts
- theme-contrast.test.ts
- Changelog
- FTZ Format Specification
- Contributing
- Deployment Guide
- Performance Report
- Privacy & Security Review
- Native Family Tree Builder (core)
- CLAUDE.md
- Code of Conduct
- Architecture Overview
- FTZ Parser Specification
- Release Notes — Version 1.0
- Roadmap
- Validation Report — Relationship Reconstruction & Integrity Checks
- Security Policy
- web/package.json
- FTZ → GEDCOM Field Mapping
- Canonical Internal Data Model
- GitHub Discussions — setup guidance
- PULL_REQUEST_TEMPLATE.md
- useAnchoredDropdown.tsx
- tailwindcss
- @tailwindcss/vite
- @types/react
- vitest
- Person
- export.ts
- verify.ts
- models/types.ts
- relationships.ts
- setup.ts
- Link Existing Relative — Implementation Plan
- photo.ts
- import.ts
- typescript

## God Nodes (most connected - your core abstractions)
1. `FamilyTree` - 80 edges
2. `personRow()` - 40 edges
3. `buildNodeFtt()` - 38 edges
4. `computePosterLayout()` - 37 edges
5. `parseNodeFtt()` - 26 edges
6. `familyRow()` - 24 edges
7. `Full-Screen Family Tree Editor — Single Layout Engine` - 23 edges
8. `ValidationIssue` - 22 edges
9. `Person` - 22 edges
10. `computeBalancedPosterLayout()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `DownloadPanelProps` --references--> `ValidationIssue`  [EXTRACTED]
  web/src/components/DownloadPanel.tsx → models/types.ts
- `PosterExportPanelProps` --references--> `FamilyTree`  [EXTRACTED]
  web/src/components/poster/PosterExportPanel.tsx → models/types.ts
- `SavedSession` --references--> `FamilyTree`  [EXTRACTED]
  web/src/lib/autosave.ts → models/types.ts
- `TreeSession` --references--> `FamilyTree`  [EXTRACTED]
  web/src/state/treeSession.tsx → models/types.ts
- `isAncestor()` --calls--> `fatherOf()`  [EXTRACTED]
  editor/helpers.ts → parser/relationships.ts

## Import Cycles
- None detected.

## Communities (117 total, 17 thin omitted)

### Community 0 - "parser/index.ts"
Cohesion: 0.06
Nodes (64): Event, MediaRef, NoteEntry, buildTree(), FtzParseError, parseNodeFtt(), genderFromCode(), padRow() (+56 more)

### Community 1 - "exportGedcom"
Cohesion: 0.20
Nodes (9): formatGedcomDate(), MONTHS, exportGedcom(), writeFam(), writeHeader(), writeIndi(), escapeGedcomValue(), GedcomWriter (+1 more)

### Community 2 - "insights.ts"
Cohesion: 0.12
Nodes (16): InsightsStrip(), computeGenerations(), gen(), computeTreeInsights(), countDisconnectedGroups(), displayName(), NamedCount, parentIdsOf() (+8 more)

### Community 3 - "Header.tsx"
Cohesion: 0.12
Nodes (21): App(), guardNavigation(), Header(), HeaderProps, LINKS, MobileMenu(), LayoutProps, ThemeToggle() (+13 more)

### Community 4 - "EditorPage.tsx"
Cohesion: 0.09
Nodes (19): DisplayMode, PhotoShape, AppearanceMenu(), AppearanceMenuProps, MODES, SHAPES, ViewMenu(), ViewMenuProps (+11 more)

### Community 5 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+14 more)

### Community 6 - "Full-Screen Family Tree Editor — Single Layout Engine"
Cohesion: 0.08
Nodes (23): 10. Quick actions, 11. Keyboard shortcuts, 12. Focus mode, 13. Export, 14. Autosave, 15. Performance, 16. Insights module — `lib/insights.ts`, 17. Future-proof architecture (+15 more)

### Community 7 - "EditorCanvas.tsx"
Cohesion: 0.15
Nodes (8): posterLayoutKey(), PosterNode, clampScale(), EditorCanvas, EditorCanvasHandle, MINIMAP_MAX, Transform, hitTestNode()

### Community 8 - "computePosterLayout"
Cohesion: 0.09
Nodes (42): anchoredFamiliesOf(), anchorIdOf(), buildPlacements(), computePosterLayout(), addChip(), addNode(), attachmentWidthOf(), childrenWidthOf() (+34 more)

### Community 9 - "poster/types.ts"
Cohesion: 0.11
Nodes (18): Family, DEFAULT_POSTER_STYLE, DescentConnector, MarriageConnector, PDF_MAX_DIMENSION_PT, PosterLayout, PosterPageSize, PosterTheme (+10 more)

### Community 10 - "dependencies"
Cohesion: 0.18
Nodes (11): react, react-dom, dependencies, jspdf, jszip, react, react-dom, svg2pdf.js (+3 more)

### Community 11 - "compilerOptions"
Cohesion: 0.08
Nodes (24): editor, gedcom, lib, models, parser, poster, scripts, validation (+16 more)

### Community 12 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+12 more)

### Community 13 - "layout.ts"
Cohesion: 0.26
Nodes (15): computeChipBox(), computePersonBox(), MeasuredBox, PHOTO_MAX_PT, wrappedLinesFor(), ChipInfo, Placement, ARABIC_RANGES (+7 more)

### Community 14 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react-hooks, jest-axe, jsdom, prettier, @types/jest-axe (+11 more)

### Community 15 - "Global Constraints"
Cohesion: 0.10
Nodes (19): Audit-derived follow-ups (post-Task-3 read-only audit, 2026-08-11), Deferred, tracked (not part of the Person Cards arc), Final verification (after all tasks), Global Constraints, Person Cards with Photos Implementation Plan, Requirements → task traceability, Task 10: Wire appearance + photos into the editor canvas (render + memo), Task 11: Hover preview + search auto-preview (editor only) (+11 more)

### Community 16 - "Person Cards with Photos — Design Specification"
Cohesion: 0.11
Nodes (17): 10. UI, 11. Appearance preferences persistence (requirement 5), 12. Performance (requirement 8, restated), 13. Backwards compatibility, 14. Testing, 15. Explicitly out of scope (future; room left, not built), 16. Files touched, 1. Goal (+9 more)

### Community 17 - "renderSvg.ts"
Cohesion: 0.32
Nodes (16): CARD_DIVIDER_GAP, PHOTO_TOP_PAD, photoAreaHeight(), escapeXml(), genderIcon(), num(), photoClip(), photoPlaceholder() (+8 more)

### Community 18 - "compilerOptions"
Cohesion: 0.12
Nodes (16): node, vite.config.ts, compilerOptions, lib, module, moduleDetection, moduleResolution, noEmit (+8 more)

### Community 19 - "DownloadPanel.tsx"
Cohesion: 0.36
Nodes (6): DownloadPanel(), DownloadPanelProps, gedcomFileName(), ErrorPanel(), ErrorPanelProps, useAutoFocus()

### Community 20 - "layoutBalanced.ts"
Cohesion: 0.19
Nodes (17): BBox, Block, blockBBox(), boxOf(), computeBalancedPosterLayout(), finalize(), headerBlock(), layout() (+9 more)

### Community 21 - "AUD-13 — native scrollbar renders light on dark pages (deferred, in progress)"
Cohesion: 0.40
Nodes (4): AUD-13 — native scrollbar renders light on dark pages (deferred, in progress), Next steps (NOT yet done), Scope, What's already in place

### Community 22 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, jszip, description, devDependencies, @types/node, typescript, vitest, @vitest/coverage-v8 (+19 more)

### Community 23 - "PosterExportPanel.tsx"
Cohesion: 0.17
Nodes (16): downloadBlob(), formatMeters(), PosterExportPanel(), handleDownloadPdf(), handleDownloadSvg(), PosterExportPanelProps, posterFileName(), makeCanvasTextMeasurer() (+8 more)

### Community 24 - "Print Poster — Developer Documentation"
Cohesion: 0.12
Nodes (17): Box sizing — "width before height", Centering the oldest ancestor couple, Cousin marriage handling, Future improvements, Known limitations, Layout algorithm — seven stages, Package layout, Page sizing (+9 more)

### Community 25 - "mockWorker.ts"
Cohesion: 0.24
Nodes (5): WorkerRequest, WorkerResponse, ErrorHandler, MessageHandler, MockWorker

### Community 27 - "ErrorBoundary"
Cohesion: 0.20
Nodes (3): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState

### Community 28 - "poster-photo-render.test.ts"
Cohesion: 0.53
Nodes (8): computePosterPageSize(), buildTree(), cousinMarriageTree(), family(), makeTree(), person(), setup(), svgFor()

### Community 29 - "poster-balanced-fragments.test.ts"
Cohesion: 0.43
Nodes (6): buildTree(), COMP2, family(), multiComponentTree(), person(), NOTE: this is an investigation fixture only — it must NOT touch…

### Community 30 - "UploadArea.tsx"
Cohesion: 0.38
Nodes (3): UploadArea(), UploadAreaProps, formatFileSize()

### Community 31 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, outputDirectory, $schema

### Community 32 - "Round 1 (Milestone 7 release-readiness audit)"
Cohesion: 0.13
Nodes (14): 1. Export-during-edit race could produce a download that doesn't match the screen, 2. The explorer canvas rendered completely blank on mobile-width viewports, Also found and fixed: a UX gap in "center on selection", Engineering Audit — Version 1.0 Release Findings, Family graph verification (real dataset), Findings that were real bugs, and are fixed, Findings that were real bugs, and are fixed, Findings that were real bugs, and are fixed (+6 more)

### Community 33 - "ConversionProgress.tsx"
Cohesion: 0.40
Nodes (3): ConversionProgressProps, ProgressStage, STAGES

### Community 34 - "download.test.tsx"
Cohesion: 0.40
Nodes (3): __dirname, SAMPLE_EXISTS, SAMPLE_PATH

### Community 35 - "FamilyTree"
Cohesion: 0.05
Nodes (75): EditorError, isAncestor(), pruneEmptyFamily(), withFamily(), withPerson(), applyEdit(), addChildToFamily(), addChildToPerson() (+67 more)

### Community 36 - "axe.test.tsx"
Cohesion: 0.50
Nodes (3): __dirname, SAMPLE_EXISTS, SAMPLE_PATH

### Community 38 - "conversion-flow.test.tsx"
Cohesion: 0.50
Nodes (3): __dirname, SAMPLE_EXISTS, SAMPLE_PATH

### Community 44 - "Explorer Architecture — Developer Documentation"
Cohesion: 0.13
Nodes (14): Accessibility, Corruption prevention, Editing workflow, Error recovery, Explorer Architecture — Developer Documentation, Family lifecycle, Known limitations, Package layout (+6 more)

### Community 48 - "Project Identity & Brand Guide"
Cohesion: 0.14
Nodes (13): Applying this, Color, Core values, Mark concept, Mission, Name, Other candidates considered, Project Identity & Brand Guide (+5 more)

### Community 49 - "TreeBridge — FTZ → GEDCOM Converter"
Cohesion: 0.14
Nodes (14): Contributing, Deployment, Development, FAQ, How it's built, License, Privacy, in one sentence, Project status: Version 1.0 (+6 more)

### Community 68 - "Global Constraints"
Cohesion: 0.15
Nodes (12): Deferred to later phases (tracked, not in this plan), Full-Screen Editor — Phase 1 (Foundation) Implementation Plan, Global Constraints, Self-Review, Task 1: Add the `editor` route to the hash router, Task 2: `TreeSessionProvider` — App-level shared tree state, Task 3: Pure hit-testing helper for canvas selection, Task 4: `EditorCanvas` — poster SVG + pan/zoom/fit + click-to-select (+4 more)

### Community 69 - "Shell-only dark mode — plan"
Cohesion: 0.15
Nodes (12): About/Privacy dark-mode follow-up (deferred surface) — DONE (2026-08-16), Decisions (locked), Deferred INTO the menu/picker batch (moved out of the EditorPage-chrome checkpoint), E2 dropdown-behavior recommendation (2026-08-15) — RECOMMENDED: Option A (portal), awaiting sign-off, EditorPage-chrome checkpoint as actually shipped, Final verification checkpoint (to run after PosterExportPanel, before the pass closes), Invariant (load-bearing), Mechanism (+4 more)

### Community 70 - "Parser Test Case Specification"
Cohesion: 0.15
Nodes (12): 10. Circular references — **[synthetic fixture required]**, 1. Single family — **[real data]**, 2. Multiple generations — **[real data]**, 3. Cousin marriages — **[real data]**, 4. Multiple spouses / remarriage — **[synthetic fixture required]**, 5. Shared ancestors / pedigree collapse — **[real data, deeper case]**, 6. Large trees — **[synthetic fixture required]**, 7. Missing data — **[real data]** (+4 more)

### Community 71 - "GEDCOM Exporter — Developer Documentation"
Cohesion: 0.18
Nodes (10): Compatibility notes, Data preservation strategy, Export pipeline, GEDCOM 5.5.1 spec-compliance details, GEDCOM Exporter — Developer Documentation, Known limitations, Mapping decisions, Rejection policy (+2 more)

### Community 72 - "Final review — critical, not confirmatory"
Cohesion: 0.20
Nodes (10): Data integrity risk — still the operating principle, Edge cases not covered by real data, Feature status (originally "future features — not implemented in this milestone"), Final review — critical, not confirmatory, GEDCOM compatibility — resolved, Hidden assumptions, Performance — measured, not just estimated, Repository structure (+2 more)

### Community 73 - "Dark mode token vocabulary"
Cohesion: 0.20
Nodes (9): Bars applied, Borders, Dark mode token vocabulary, Inverted surfaces, Resolved findings (pre-existing light-mode AA failures, now fixed), Semantic, Surfaces (elevation), Text (+1 more)

### Community 74 - "Editor Architecture"
Cohesion: 0.20
Nodes (9): Editor Architecture, Future extension points (not yet built), Guided editing, Layers, Manual tree creation flow, Performance model, Session, autosave, unsaved changes, The one rendering pipeline (+1 more)

### Community 75 - "Parser Implementation — Developer Documentation"
Cohesion: 0.20
Nodes (9): Architecture, Deviations from the approved specification (flagged, not hidden), Error handling, Internal data model, Known limitations carried over from Milestone 2, Parser Implementation — Developer Documentation, Parsing flow, Public API (+1 more)

### Community 76 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, format, format:check, lint, preview, test (+2 more)

### Community 77 - "theme-contrast.test.ts"
Cohesion: 0.27
Nodes (9): Check, contrastRatio(), DARK, LIGHT, loadPalette(), oklchToRgb(), PALETTE, relativeLuminance() (+1 more)

### Community 78 - "Changelog"
Cohesion: 0.22
Nodes (8): [1.0.0] — Version 1.0 (first public release), Added, Added (V1, now superseded by the V2 changes above), Changed, Changelog, Fixed, Milestones 1–6 (pre-1.0 development), [Unreleased]

### Community 80 - "FTZ Format Specification"
Cohesion: 0.22
Nodes (8): Archive structure, Family record (12 fields), Fields still marked Low confidence — do not guess further without more data, FTZ Format Specification, Known limitation: no escaping mechanism for tab characters in free-text fields, `node.ftt` container format, Person record (29 fields), Relationship model (derived, not stored explicitly)

### Community 82 - "Contributing"
Cohesion: 0.25
Nodes (8): Coding standards, Contributing, Project layout, Real-browser verification, Running things, Setup, Submitting a change, Testing against real data

### Community 83 - "Deployment Guide"
Cohesion: 0.25
Nodes (7): Automatic deployments, Branch protection (recommended — apply once the repo is on GitHub), Deployment Guide, Environment variables, Verifying it worked, What you need to do, Why zero configuration is enough

### Community 84 - "Performance Report"
Cohesion: 0.25
Nodes (7): Build output, Memory and browser responsiveness, Performance Report, Pure-function timing (Node, isolates parser/editor/exporter cost), Real-browser timing (production build, real 473-person/136-family sample), Recommendations, Undo-history memory cost (measured, not estimated)

### Community 85 - "Privacy & Security Review"
Cohesion: 0.25
Nodes (8): Dependency safety, Does all processing really happen locally? Yes — verified, not just claimed., Downloads, File handling, Privacy & Security Review, Recommendations, Supply-chain considerations, ZIP archive size guards

### Community 86 - "Native Family Tree Builder (core)"
Cohesion: 0.25
Nodes (7): Deferred (architecture must not block), Native Family Tree Builder (core), Non-negotiable architecture, Phase A — Create New Tree, Phase B — Add / Delete person, Phase C — View menu, poster scale, unsaved changes, validation, tests, Testing

### Community 87 - "CLAUDE.md"
Cohesion: 0.29
Nodes (5): 1. Think Before Coding, 2. Simplicity First, 3. Surgical Changes, 4. Goal-Driven Execution, graphify

### Community 88 - "Code of Conduct"
Cohesion: 0.29
Nodes (6): Attribution, Code of Conduct, Data handling is a conduct issue here specifically, Enforcement, Our pledge, Our standards

### Community 89 - "Architecture Overview"
Cohesion: 0.29
Nodes (7): Architecture Overview, The one rule that shapes everything above, The pipeline, What each stage owns, and where to read more, Where state lives, and why it's shaped that way, Where to go from here, Why the framework-free packages matter

### Community 90 - "FTZ Parser Specification"
Cohesion: 0.29
Nodes (6): Error recovery summary, FTZ Parser Specification, Future compatibility, Input, Output, Parsing order

### Community 91 - "Release Notes — Version 1.0"
Cohesion: 0.29
Nodes (6): Fixed in this release, Highlights, Known limitations, Release Notes — Version 1.0, Thanks, Upgrading

### Community 92 - "Roadmap"
Cohesion: 0.29
Nodes (7): Explicitly not planned, Guiding principle for what makes the list, How to influence this roadmap, Roadmap, Version 1.1 — round out the core loop, Version 1.2 — richer data, richer view, Version 2.0 — bigger bets

### Community 93 - "Validation Report — Relationship Reconstruction & Integrity Checks"
Cohesion: 0.29
Nodes (6): 1. Relationship reconstruction, 2. Integrity checks, 3. Complex relationship scenarios — validated against real data, 4. What this report does and doesn't prove, Additional checks run beyond the required list, Validation Report — Relationship Reconstruction & Integrity Checks

### Community 94 - "Security Policy"
Cohesion: 0.29
Nodes (7): Dependency hygiene, Reporting a vulnerability, Security Policy, Supported versions, The short version, What's in scope, What's out of scope

### Community 95 - "web/package.json"
Cohesion: 0.29
Nodes (6): description, license, name, private, type, version

### Community 96 - "FTZ → GEDCOM Field Mapping"
Cohesion: 0.33
Nodes (5): Family fields, Fields that cannot be cleanly mapped, FTZ → GEDCOM Field Mapping, Person fields, Zero-unexpected-data-loss guarantee (recommended enforcement)

### Community 97 - "Canonical Internal Data Model"
Cohesion: 0.40
Nodes (4): Canonical Internal Data Model, Design decisions, Interfaces, Notes on fields intentionally left out

### Community 98 - "GitHub Discussions — setup guidance"
Cohesion: 0.40
Nodes (4): GitHub Discussions — setup guidance, Issues vs. Discussions — where does this go?, Recommended categories, The one rule that carries over from everywhere else in this project

### Community 99 - "PULL_REQUEST_TEMPLATE.md"
Cohesion: 0.40
Nodes (4): Checklist, Screenshots (if this changes the UI), What changed and why, Which part of the project does this touch?

### Community 109 - "Person"
Cohesion: 0.29
Nodes (5): Person, ValidationIssue, BuildResult, TokenizeResult, ValidationSummaryProps

### Community 111 - "export.ts"
Cohesion: 0.24
Nodes (10): ExportOptions, genderToSex(), findUnmappedPopulatedFields(), isPopulated(), UNMAPPED_FAMILY_INDICES, UNMAPPED_PERSON_INDICES, formatGedcomName(), splitName() (+2 more)

### Community 112 - "verify.ts"
Cohesion: 0.15
Nodes (13): ancestorFtzSetFromGedcom(), ParsedFamily, ParsedPerson, parseGedcomForVerification(), verifyRoundTrip(), RoundTripReport, parseFtzFile(), main() (+5 more)

### Community 113 - "models/types.ts"
Cohesion: 0.05
Nodes (40): ExportResult, FtzId, Metadata, ParseResult, ValidationIssueCode, ValidationState, ExportMenuProps, ExportPanelProps (+32 more)

### Community 114 - "relationships.ts"
Cohesion: 0.21
Nodes (15): ancestorFtzSet(), Relationship, childrenOf(), fatherOf(), getRelationships(), grandchildrenOf(), grandparentsOf(), motherOf() (+7 more)

### Community 115 - "setup.ts"
Cohesion: 0.18
Nodes (4): DOMMatrixReadOnlyPolyfill, FAKE_SIZE, resetGlobalEditorState(), ResizeObserverPolyfill

### Community 118 - "Link Existing Relative — Implementation Plan"
Cohesion: 0.17
Nodes (11): Design & Rationale, Final verification (run after Task 5), Global Constraints, Link Existing Relative — Implementation Plan, Open questions for the reviewer (non-blocking), Self-Review (completed), Task 1: `linkRelative` helper, Task 2: `PersonPicker` dialog (+3 more)

### Community 119 - "photo.ts"
Cohesion: 0.30
Nodes (10): handlePhotoFile(), ACCEPTED_PHOTO_TYPES, blobToDataUri(), computeSquareCrop(), detectFace(), encodeSquare(), FaceBox, isAcceptedPhotoType() (+2 more)

### Community 120 - "import.ts"
Cohesion: 0.17
Nodes (13): GedcomExportError, GedcomImportError, DATE_QUALIFIERS, GedLine, importGedcom(), MONTHS, parseGedcomDate(), parseGedcomName() (+5 more)

## Knowledge Gaps
- **536 isolated node(s):** `MONTHS`, `UNMAPPED_PERSON_INDICES`, `UNMAPPED_FAMILY_INDICES`, `GedLine`, `MONTHS` (+531 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FamilyTree` connect `FamilyTree` to `parser/index.ts`, `insights.ts`, `EditorPage.tsx`, `EditorCanvas.tsx`, `computePosterLayout`, `poster/types.ts`, `layout.ts`, `export.ts`, `verify.ts`, `models/types.ts`, `relationships.ts`, `layoutBalanced.ts`, `PosterExportPanel.tsx`, `import.ts`, `mockWorker.ts`, `poster-photo-render.test.ts`, `poster-balanced-fragments.test.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `UUID` connect `FamilyTree` to `parser/index.ts`, `insights.ts`, `EditorPage.tsx`, `EditorCanvas.tsx`, `computePosterLayout`, `poster/types.ts`, `Person`, `layout.ts`, `export.ts`, `verify.ts`, `models/types.ts`, `relationships.ts`, `renderSvg.ts`, `layoutBalanced.ts`, `PosterExportPanel.tsx`, `import.ts`, `poster-photo-render.test.ts`, `poster-balanced-fragments.test.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `computePosterLayout()` connect `computePosterLayout` to `poster/types.ts`, `layoutBalanced.ts`, `layout.ts`, `PosterExportPanel.tsx`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `MONTHS`, `UNMAPPED_PERSON_INDICES`, `UNMAPPED_FAMILY_INDICES` to the rest of the system?**
  _536 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `parser/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05563853622106049 - nodes in this community are weakly interconnected._
- **Should `insights.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Header.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12299465240641712 - nodes in this community are weakly interconnected._