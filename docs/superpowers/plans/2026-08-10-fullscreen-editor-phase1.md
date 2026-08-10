# Full-Screen Editor — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move editing into a dedicated full-screen `#/editor` route whose tree canvas is rendered by the **poster layout engine** (so it matches the Print Poster exactly), with pan/zoom/fit, click-to-select, a sidebar reusing `PersonInspector` + search + undo/redo, and an export menu — removing React Flow entirely.

**Architecture:** An App-level `TreeSessionProvider` holds the imported tree + filename. `HomePage` imports and stores it, then offers "Open editor →". The `#/editor` route renders `EditorPage` full-bleed. `EditorCanvas` calls `computeBalancedPosterLayout` + `renderPosterSvg` (untouched shared `poster/` code) and layers pan/zoom + a click hit-test on top. The old React Flow neighborhood view is deleted.

**Tech Stack:** React 18, TypeScript (ESM, `.js` import specifiers), Vite, Tailwind, Vitest + @testing-library/react. Poster engine in `poster/`.

## Global Constraints

- ESM imports use `.js` specifiers even for `.ts`/`.tsx` sources (repo convention).
- `poster/` package MUST remain unchanged — the editor reuses it as-is.
- Reuse existing components (`PersonInspector`, `SearchBox`, `ExportPanel`, `PosterExportPanel`, `useTreeEditor`, `useExport`, `buildSearchIndex`) rather than reimplementing.
- Every changed file must trace to this plan; match existing code style.
- Root suite (`npm test`) and web suite (`cd web && npx vitest run`) must stay green.
- Web files must pass `cd web && npm run lint` and `prettier --check .`.

---

### Task 1: Add the `editor` route to the hash router

**Files:**
- Modify: `web/src/router.ts`
- Test: `web/tests/router.test.ts` (create)

**Interfaces:**
- Produces: `Route` now includes `"editor"`; `parseHash()` maps `#/editor` → `"editor"`; `routeHref("editor") === "#/editor"`.

- [ ] **Step 1: Write failing test** — `web/tests/router.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { routeHref } from "../src/router.js";

describe("router", () => {
  it("builds the editor href", () => {
    expect(routeHref("editor")).toBe("#/editor");
  });
});
```
- [ ] **Step 2:** Run `cd web && npx vitest run tests/router.test.ts` — expect FAIL (type error / wrong value).
- [ ] **Step 3:** In `router.ts`: add `"editor"` to the `Route` union; in `parseHash` add `if (hash === "editor") return "editor";`; `routeHref` returns `#/editor` for it (the existing `route === "home" ? "#/" : \`#/${route}\`` already handles this once the type allows it).
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit: `feat(web): add #/editor route`.

---

### Task 2: `TreeSessionProvider` — App-level shared tree state

**Files:**
- Create: `web/src/state/treeSession.tsx`
- Test: `web/tests/state/treeSession.test.tsx` (create)

**Interfaces:**
- Produces:
  - `interface TreeSession { tree: FamilyTree; fileName: string }`
  - `TreeSessionProvider({ children }: { children: ReactNode })`
  - `useTreeSession(): { session?: TreeSession; setSession(s: TreeSession): void; clearSession(): void }`

- [ ] **Step 1: Write failing test** — render a `TreeSessionProvider` wrapping a probe component that calls `useTreeSession`, assert `session` is initially `undefined`, then `setSession({tree, fileName})` makes a child read back `fileName`. Use a minimal `tree` (`{ metadata:{sourceFormat:"manual",importedAt:""}, persons:{}, families:{}, validation:{validatedAt:"",issues:[],isValid:true} }`).
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree } from "../../../models/types.js";
import { TreeSessionProvider, useTreeSession } from "../../src/state/treeSession.js";

const tree: FamilyTree = { metadata: { sourceFormat: "manual", importedAt: "" }, persons: {}, families: {}, validation: { validatedAt: "", issues: [], isValid: true } };

function Probe() {
  const { session, setSession } = useTreeSession();
  return (
    <div>
      <span>fn:{session?.fileName ?? "none"}</span>
      <button onClick={() => setSession({ tree, fileName: "A.ged" })}>set</button>
    </div>
  );
}

describe("TreeSessionProvider", () => {
  it("stores and exposes the session", async () => {
    render(<TreeSessionProvider><Probe /></TreeSessionProvider>);
    expect(screen.getByText("fn:none")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "set" }));
    expect(screen.getByText("fn:A.ged")).toBeInTheDocument();
  });
});
```
- [ ] **Step 2:** Run `cd web && npx vitest run tests/state/treeSession.test.tsx` — expect FAIL (module missing).
- [ ] **Step 3:** Implement `treeSession.tsx`: a `createContext`, provider holding `useState<TreeSession | undefined>`, `useTreeSession` throwing if used outside provider. Keep it minimal (no localStorage yet — that's Phase 4).
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit: `feat(web): add TreeSessionProvider for cross-route tree state`.

---

### Task 3: Pure hit-testing helper for canvas selection

**Files:**
- Create: `web/src/lib/canvasHitTest.ts`
- Test: `web/tests/lib/canvasHitTest.test.ts` (create)

**Interfaces:**
- Produces: `hitTestNode(nodes: readonly PosterNode[], contentX: number, contentY: number, marginPt: number): UUID | undefined` — returns the id of the node whose box (center `marginPt + node.x`, half-extents `width/2`, `height/2`) contains the point; `undefined` if none. Iterate in reverse so the topmost drawn node wins on overlap.

- [ ] **Step 1: Write failing test:**
```ts
import { describe, expect, it } from "vitest";
import type { PosterNode } from "../../../poster/types.js";
import { hitTestNode } from "../../src/lib/canvasHitTest.js";

const n = (personId: string, x: number, y: number): PosterNode => ({
  personId, generation: 0, x, y, width: 100, height: 40, name: personId,
  nameLines: [personId], rtl: false, gender: "unknown",
});

describe("hitTestNode", () => {
  const nodes = [n("a", 100, 100), n("b", 400, 100)];
  it("returns the node under the point (accounting for margin)", () => {
    expect(hitTestNode(nodes, 40 + 100, 40 + 100, 40)).toBe("a");
  });
  it("returns undefined in empty space", () => {
    expect(hitTestNode(nodes, 40 + 250, 40 + 100, 40)).toBeUndefined();
  });
});
```
- [ ] **Step 2:** Run `cd web && npx vitest run tests/lib/canvasHitTest.test.ts` — expect FAIL.
- [ ] **Step 3:** Implement `hitTestNode` (reverse loop; `Math.abs(contentX-(margin+node.x))<=node.width/2 && Math.abs(contentY-(margin+node.y))<=node.height/2`).
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit: `feat(web): add canvas hit-test helper`.

---

### Task 4: `EditorCanvas` — poster SVG + pan/zoom/fit + click-to-select

**Files:**
- Create: `web/src/components/editor/EditorCanvas.tsx`
- Test: `web/tests/components/editor/EditorCanvas.test.tsx` (create)

**Interfaces:**
- Consumes: `computeBalancedPosterLayout`, `computePosterPageSize`, `renderPosterSvg`, `DEFAULT_POSTER_STYLE` from `poster/*`; `makeCanvasTextMeasurer` from `web/src/lib/canvasTextMeasure.js`; `hitTestNode` (Task 3).
- Produces: `EditorCanvas({ tree, selectedPersonId, onSelectPerson, focusPersonId }: { tree: FamilyTree; selectedPersonId?: UUID; onSelectPerson: (id: UUID | undefined) => void; focusPersonId?: UUID })`.

Behavior: memoize `measurer` (on fontFamily), `layout` (on tree+style+measurer via `computeBalancedPosterLayout`), `page`, `svg` (via `renderPosterSvg`). Render an outer viewport `div` (`relative overflow-hidden`, `touch-none`) containing a transformed content `div` (`transform: translate(tx,ty) scale(s); transformOrigin: 0 0`) whose innerHTML is the SVG. State: `{ tx, ty, s }`. Wheel → zoom toward cursor (clamp s to [0.05, 4]); pointer drag → pan. On click without drag, convert pointer→content coords (`(clientX-rectLeft-tx)/s`, `(clientY-rectTop-ty)/s`) and call `hitTestNode(layout.nodes, cx, cy, style.marginPt)` → `onSelectPerson(hit)`. A **fit-to-view** helper sets `s`/`tx`/`ty` so `page.widthPt×heightPt` fits with padding; run on mount and whenever `focusPersonId` changes (center on that node). Draw a **selection highlight** as an absolutely-positioned `div` (or inline `<svg>` overlay) at the selected node's transformed rect — computed from `layout` + transform, so changing selection never re-renders the poster SVG. Controls cluster (buttons): Zoom In, Zoom Out, Reset, Fit.

- [ ] **Step 1: Write failing test** — render `EditorCanvas` with a 2-person tree and assert (a) it renders an `<svg>` (the poster), and (b) clicking the viewport calls `onSelectPerson`. Because jsdom has no layout, stub `getBoundingClientRect` on the viewport via the element ref is hard; instead test the lighter contract: the component mounts, shows the control buttons (`Fit`, `Zoom in`), and renders the poster `<svg>`. (Selection math is already unit-tested in Task 3.)
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Family, FamilyTree, Person, UUID } from "../../../../models/types.js";
import { EditorCanvas } from "../../../src/components/editor/EditorCanvas.js";

const P = (id: string, o: Partial<Person> = {}): Person => ({ id, name: id, gender: "unknown", notes: [], media: [], famsIds: [], ...o });
const tree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: { a: P("a", { gender: "male" }), b: P("b", { gender: "female", famcId: undefined }) } as Record<UUID, Person>,
  families: {} as Record<UUID, Family>,
  validation: { validatedAt: "", issues: [], isValid: true },
};

describe("EditorCanvas", () => {
  it("renders the poster svg and controls", () => {
    const { container } = render(<EditorCanvas tree={tree} onSelectPerson={vi.fn()} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: /fit to view/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
  });
});
```
- [ ] **Step 2:** Run `cd web && npx vitest run tests/components/editor/EditorCanvas.test.tsx` — expect FAIL.
- [ ] **Step 3:** Implement `EditorCanvas.tsx` per the Behavior notes above. Use `dangerouslySetInnerHTML={{ __html: svg }}` on the content div (the SVG is our own renderer output — same trust boundary already used in `PosterExportPanel.tsx:321`). Guard `computeBalancedPosterLayout` for an empty tree (0 nodes) by rendering an empty state message instead.
- [ ] **Step 4:** Run the test — expect PASS. Also run `cd web && npx vitest run tests/lib/canvasHitTest.test.ts` to confirm no regression.
- [ ] **Step 5:** Commit: `feat(web): EditorCanvas rendering the poster layout with pan/zoom/select`.

---

### Task 5: `ExportMenu` — one dropdown for GEDCOM + poster

**Files:**
- Create: `web/src/components/editor/ExportMenu.tsx`
- Test: `web/tests/components/editor/ExportMenu.test.tsx` (create)

**Interfaces:**
- Consumes: `ExportPanel` (GEDCOM), `PosterExportPanel` (SVG/PDF poster).
- Produces: `ExportMenu({ tree, sourceFileName, editCount, exportState, runExport, resetExport }: {...})` — a button that toggles a panel containing the GEDCOM `ExportPanel` and the `PosterExportPanel`. (Phase 1 keeps it as an expandable panel, not a fancy dropdown; JSON/PNG/CSV are future.)

- [ ] **Step 1: Write failing test:** render `ExportMenu` with a minimal tree; click "Export"; assert the GEDCOM "Export GEDCOM" button and the poster "Download the SVG" text appear.
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree } from "../../../../models/types.js";
import { ExportMenu } from "../../../src/components/editor/ExportMenu.js";

const tree: FamilyTree = { metadata: { sourceFormat: "manual", importedAt: "" }, persons: {}, families: {}, validation: { validatedAt: "", issues: [], isValid: true } };

describe("ExportMenu", () => {
  it("reveals GEDCOM and poster export controls", async () => {
    render(<ExportMenu tree={tree} sourceFileName="A.ged" editCount={0} exportState={{ stage: "idle" }} runExport={vi.fn()} resetExport={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /^export/i }));
    expect(screen.getByRole("button", { name: /export gedcom/i })).toBeInTheDocument();
    expect(screen.getByText(/download the svg/i)).toBeInTheDocument();
  });
});
```
- [ ] **Step 2:** Run the test — expect FAIL.
- [ ] **Step 3:** Implement `ExportMenu.tsx`: local `open` state; a header "Export ▼" button; when open, render `<ExportPanel .../>` and `<PosterExportPanel tree sourceFileName />` stacked in a scrollable container.
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit: `feat(web): unified ExportMenu (GEDCOM + poster)`.

---

### Task 6: `EditorPage` — full-screen workspace assembling canvas + sidebar + export

**Files:**
- Create: `web/src/pages/EditorPage.tsx`
- Test: `web/tests/pages/EditorPage.test.tsx` (create)

**Interfaces:**
- Consumes: `useTreeSession` (Task 2), `useTreeEditor`, `useExport`, `buildSearchIndex`, `EditorCanvas` (Task 4), `ExportMenu` (Task 5), `SearchBox`, `PersonInspector`.
- Produces: `EditorPage()` — reads `session` from context. If none, renders an empty state ("No tree loaded. Upload a family tree first.") with a link `href="#/"`. Otherwise runs `useTreeEditor(session.tree)`, shows a two-pane layout: `EditorCanvas` (left, grows) + collapsible right sidebar (`SearchBox`, selected `PersonInspector`, undo/redo buttons, `ExportMenu`). Selection state lives here; `SearchBox.onSelect` and canvas selection both set it (and set `focusPersonId` so the canvas centers).

- [ ] **Step 1: Write failing test:** with no session provider value, `EditorPage` shows the empty state; with a session (wrap in `TreeSessionProvider` + set via a helper that calls `setSession`), it shows the search box and canvas svg.
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TreeSessionProvider } from "../../src/state/treeSession.js";
import { EditorPage } from "../../src/pages/EditorPage.js";

describe("EditorPage", () => {
  it("shows an empty state when no tree is loaded", () => {
    render(<TreeSessionProvider><EditorPage /></TreeSessionProvider>);
    expect(screen.getByText(/no tree loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upload/i })).toBeInTheDocument();
  });
});
```
- [ ] **Step 2:** Run the test — expect FAIL.
- [ ] **Step 3:** Implement `EditorPage.tsx`. Reuse the search-index/undo/redo/export wiring currently in `TreeExplorer.tsx` (lift it here). Sidebar collapse via a boolean state + a toggle button. Keep `PersonInspector` props identical to today.
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit: `feat(web): full-screen EditorPage workspace`.

---

### Task 7: Wire App, full-bleed Layout, HomePage "Open editor", provider

**Files:**
- Modify: `web/src/App.tsx`, `web/src/components/Layout.tsx`, `web/src/pages/HomePage.tsx`, `web/src/main.tsx`
- Test: `web/tests/integration/editor-route.test.tsx` (create)

**Interfaces:**
- Consumes: `TreeSessionProvider`, `EditorPage`, `Route "editor"`.
- Produces: `main.tsx` wraps `<App/>` in `<TreeSessionProvider>`. `App` renders `EditorPage` on `route==="editor"`. `Layout` accepts `fullBleed?: boolean` (true when `current==="editor"`): drop the `max-w-3xl`/padding clamp and hide `<Footer/>`, use full height. `HomePage` writes the validated tree to the session and shows an **"Open editor →"** button (sets `window.location.hash = "#/editor"`).

- [ ] **Step 1: Write failing test** — `editor-route.test.tsx`: render `<TreeSessionProvider><App/></TreeSessionProvider>`, upload the real sample FTZ (reuse the helper from `upload.test.tsx`), wait for "Open editor", click it, assert the URL hash is `#/editor` and the editor search box renders. (Set `window.location.hash = ""` in a `beforeEach`, as `unsavedEdits.test.tsx` does.)
- [ ] **Step 2:** Run the test — expect FAIL.
- [ ] **Step 3:** Implement the wiring. In `HomePage`, on `state.stage==="validated"` call `setSession({ tree: state.tree, fileName: state.file.name })` (in an effect) and render the "Open editor →" button **instead of** the inline `TreeExplorer` (TreeExplorer is removed in Task 8). In `App`, `route==="editor" && <EditorPage/>`, and pass `fullBleed={route==="editor"}` to `Layout`.
- [ ] **Step 4:** Run the test — expect PASS.
- [ ] **Step 5:** Commit: `feat(web): mount full-screen editor route and Open-editor handoff`.

---

### Task 8: Remove React Flow and update explorer tests

**Files:**
- Delete: `web/src/components/explorer/FamilyTreeCanvas.tsx`, `web/src/components/explorer/PersonNode.tsx`, `web/src/lib/neighborhood.ts`, `web/src/components/explorer/TreeExplorer.tsx`, `web/tests/components/explorer/FamilyTreeCanvas.smoke.test.tsx`
- Modify: `web/package.json` (drop `@xyflow/react`), and the integration tests that used the inline explorer: `web/tests/integration/explorer.test.tsx`, `web/tests/integration/download.test.tsx`, `web/tests/integration/unsavedEdits.test.tsx`, `web/tests/integration/conversion-flow.test.tsx`, `web/tests/a11y/axe.test.tsx`
- Keep: `PersonInspector.tsx` + `PersonInspector.test.tsx`, `SearchBox.tsx`, `ExportPanel.tsx`, `PersonPicker.tsx` (still used by `EditorPage`).

**Interfaces:**
- Consumes: the editor route + "Open editor" handoff from Task 7.

- [ ] **Step 1:** Update the integration tests: after uploading and reaching "Open editor", click it to enter `#/editor`, THEN perform the existing search/save/export/undo assertions (which now live in `EditorPage`). For `unsavedEdits.test.tsx`, the beforeunload/nav-guard still applies while editing on `#/editor`; adjust navigations accordingly. Add `beforeEach(() => { window.location.hash = ""; })` where needed.
- [ ] **Step 2:** Run each updated test file — expect FAIL first (still references removed inline flow), iterate until they drive the route-based editor and PASS.
- [ ] **Step 3:** Delete the React Flow files/dep and `neighborhood.ts`; grep `@xyflow` and `neighborhood` to confirm no references remain (`grep -rn "@xyflow\|neighborhood\|FamilyTreeCanvas\|PersonNode\|TreeExplorer" web/src web/tests`).
- [ ] **Step 4:** Run the full web suite `cd web && npx vitest run` and root `npm test` — expect ALL PASS. Run `cd web && npm run lint && npx prettier --check . && npm run build`.
- [ ] **Step 5:** Commit: `refactor(web): remove React Flow; editing now lives on the poster-based #/editor route`.

---

## Self-Review

- **Spec coverage (Phase 1 items):** route (T1,T7) ✓; TreeSessionProvider (T2) ✓; full-screen layout (T7) ✓; remove React Flow (T8) ✓; EditorCanvas poster-match (T4) ✓; interaction layer/selection overlay (T4) ✓; navigation pan/zoom/fit (T4) ✓ — *minimap, center-on-search pulse, keyboard shortcuts, quick actions, focus mode, autosave, insights are Phases 2–4, intentionally out of this plan*; selection hit-test (T3) ✓; search reuse (T6) ✓; sidebar reuse PersonInspector (T6) ✓; export menu (T5,T6) ✓; performance memoization (T4) ✓; testing (each task) ✓.
- **Placeholder scan:** none — every code step has real code; UI-assembly steps name exact components/props.
- **Type consistency:** `TreeSession`, `useTreeSession`, `hitTestNode`, `EditorCanvas`, `ExportMenu`, `EditorPage` signatures are consistent across tasks.
- **Ambiguity:** estimated heuristics and extras are deferred to Phase 2 by design; Phase 1 has no estimation logic.

## Deferred to later phases (tracked, not in this plan)

- **Phase 2:** `lib/insights.ts` + Insights panel + stat strip.
- **Phase 3:** minimap, Center Selection button, search autocomplete + 2–3 s pulse, keyboard shortcuts, quick actions.
- **Phase 4:** focus mode (opacity fade of non-relatives), autosave to localStorage + restore prompt.
