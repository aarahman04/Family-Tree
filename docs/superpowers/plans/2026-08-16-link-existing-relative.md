# Link Existing Relative — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user connect a relationship between two people who *both already exist* in the tree (parent, spouse, or child), instead of the current flow which can only create a brand-new "New person" and link that.

**Architecture:** This is a **UI/flow-layer addition only** — the relationship-creation operations in `editor/operations.ts` (`setFather`, `setMother`, `addSpouse`, `addChildToPerson`) already accept two existing person IDs and already carry every guard (circular-ancestry, self-link, duplicate no-op, multi-marriage disambiguation). We add (a) a `linkRelative` helper that maps a relative-kind to the right existing operation, (b) a reusable `PersonPicker` dialog for choosing the existing person, and (c) an entry point in both the toolbar `AddPersonMenu` and the sidebar `QuickActions`. No changes to `models/`, `editor/operations.ts`, or the data model.

**Tech Stack:** React 18 + TypeScript, Tailwind v4 (class-based `dark:` variants), Vitest + Testing Library. ESM with `.js` import specifiers.

**Spec:** Embedded below (§ Design & Rationale). Requirements came from the user request ("no way to link a new relative to an already-existing person — e.g. a cousin marriage where both people already exist") plus the triage scoping in this session; no separate spec doc.

## Global Constraints

- **No data-model or operations changes.** Reuse `setFather` / `setMother` / `addSpouse` / `addChildToPerson` from `editor/operations.ts` exactly as-is. If a task seems to need an operations change, stop and escalate.
- **Import specifiers use `.js`** even for `.ts`/`.tsx` sources (project ESM convention). From `web/src/lib/` and `web/src/components/editor/`, the operations/model live at `../../../editor/…` / `../../../../models/…` and `../../../../editor/…` respectively — match the existing imports in each file.
- **Dark mode is mandatory** for every new surface: each color utility needs its `dark:` counterpart, following the shipped pattern in `AddPersonMenu.tsx` / `SearchBox.tsx` (e.g. `border-slate-300 dark:border-slate-600`, `bg-white dark:bg-slate-800`).
- **Guard errors are `EditorError`** (`editor/errors.ts`). The link flow MUST catch them and surface the message inline — never let one throw uncaught into React render.
- **No new dependencies.** Reuse `searchPeople` / `buildSearchIndex` (`web/src/lib/search.ts`) and `useCloseOnEscape` (`web/src/lib/useCloseOnEscape.ts`).

---

## Design & Rationale

**Why this is small.** The three marquee cases map one-to-one onto existing, fully-guarded operations:

| Kind (relative to selected person P) | Operation | Notes |
|---|---|---|
| Parent (existing X becomes P's parent) | `setFather(tree, P, X)` / `setMother(tree, P, X)` | slot chosen like today's `addRelative` "parent": fill father slot first, else mother |
| Spouse (existing X marries P) | `addSpouse(tree, P, X)` | **the cousin-marriage case**; no cycle risk; no-ops if already linked |
| Child (existing X becomes P's child) | `addChildToPerson(tree, P, X, familyId?)` | needs `familyId` only when P has >1 spouse-family |

`setFather`/`setMother`/`addChildToPerson` throw `EditorError` on circular ancestry or self-link; `addSpouse` throws on self-link. The picker excludes the anchor person (cheap, prevents the obvious self-link). Cycle candidates are **not** pre-filtered (computing descendants isn't worth it — the operation is the source of truth); instead we surface the thrown message inline in the picker so the user just picks someone else.

**Known behavior to accept for v1 (not a bug to fix here):** linking an existing person as a *child* who already has parents re-parents them (this is how `addChildToFamily` already works, and how "set father" already works for the new-person flow). We surface it via the normal flow; a confirm dialog is out of scope.

**File structure:**
- `web/src/lib/addRelative.ts` — gains `LinkableKind` + `linkRelative`, alongside the existing `addRelative` (shared home for "compose the guided relationship actions").
- `web/src/components/editor/PersonPicker.tsx` — new, self-contained dialog: search existing people, exclude IDs, pick one, show an inline error. One responsibility: "choose an existing person."
- `web/src/components/editor/AddPersonMenu.tsx` — toolbar entry: new "Link existing person as…" menu section that opens the picker.
- `web/src/components/editor/QuickActions.tsx` — sidebar entry: a "Create new / Link existing" mode toggle over the existing kind buttons.
- Family-disambiguation for the child case is folded into the picker flow via `linkRelative`'s `familyId` param (Task 5).

---

## Task 1: `linkRelative` helper

**Files:**
- Modify: `web/src/lib/addRelative.ts`
- Test: `web/tests/lib/linkRelative.test.ts` (create)

**Interfaces:**
- Consumes: `setFather`, `setMother`, `addSpouse`, `addChildToPerson` from `../../../editor/operations.js`.
- Produces:
  - `type LinkableKind = "parent" | "spouse" | "child"`
  - `function linkRelative(tree: FamilyTree, personId: UUID, kind: LinkableKind, existingId: UUID, familyId?: UUID): FamilyTree` — returns the new tree, or throws `EditorError` from the underlying operation.

- [ ] **Step 1: Write the failing tests**

```ts
// web/tests/lib/linkRelative.test.ts
import { describe, expect, it } from "vitest";
import type { FamilyTree, Person, UUID } from "../../../models/types.js";
import { linkRelative } from "../../src/lib/addRelative.js";
import { EditorError } from "../../../editor/errors.js";

function person(id: string, gender: Person["gender"] = "unknown"): Person {
  return { id, name: id.toUpperCase(), gender, notes: [], media: [], famsIds: [] };
}
function base(ids: [string, Person["gender"]?][]): FamilyTree {
  const persons: Record<UUID, Person> = {};
  for (const [id, g] of ids) persons[id] = person(id, g);
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons,
    families: {},
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

describe("linkRelative", () => {
  it("links an existing person as a spouse (cousin-marriage case)", () => {
    const tree = linkRelative(base([["a", "male"], ["b", "female"]]), "a", "spouse", "b");
    const famId = tree.persons.a!.famsIds[0]!;
    const fam = tree.families[famId]!;
    expect([fam.husbandId, fam.wifeId].sort()).toEqual(["a", "b"]);
  });

  it("links an existing person as a parent, father slot first then mother", () => {
    const first = linkRelative(base([["c"], ["p1"], ["p2"]]), "c", "parent", "p1");
    const famc = first.persons.c!.famcId!;
    expect(first.families[famc]!.husbandId).toBe("p1");
    const second = linkRelative(first, "c", "parent", "p2");
    expect(second.families[famc]!.wifeId).toBe("p2");
  });

  it("links an existing person as a child of a single-family parent", () => {
    const tree = linkRelative(base([["mom", "female"], ["kid"]]), "mom", "child", "kid");
    const fam = tree.persons.mom!.famsIds[0]!;
    expect(tree.families[fam]!.childrenIds).toContain("kid");
    expect(tree.persons.kid!.famcId).toBe(fam);
  });

  it("propagates EditorError for self-link", () => {
    expect(() => linkRelative(base([["a"]]), "a", "spouse", "a")).toThrow(EditorError);
  });

  it("propagates EditorError for circular ancestry (making a descendant your parent)", () => {
    // gp -> parent-of -> child; then try to make child gp's parent
    let tree = linkRelative(base([["gp"], ["ch"]]), "ch", "parent", "gp"); // gp is ch's parent
    expect(() => linkRelative(tree, "gp", "parent", "ch")).toThrow(EditorError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/lib/linkRelative.test.ts`
Expected: FAIL — `linkRelative` is not exported.

- [ ] **Step 3: Implement `linkRelative`**

Add to `web/src/lib/addRelative.ts` (keep existing `addRelative`; extend the imports and add the export):

```ts
// extend the existing operations import at the top of the file:
import {
  addChildToPerson,
  addSpouse,
  createPerson,
  setFather,
  setMother,
} from "../../../editor/operations.js";

export type LinkableKind = "parent" | "spouse" | "child";

/**
 * Connects two people who BOTH already exist: `existingId` is linked to `personId` in the given
 * role, reusing the same guarded operations as the new-person flow (so cycle / self-link checks
 * apply). Returns the new tree, or throws EditorError from the underlying operation. `familyId`
 * is only consulted for `kind === "child"` when `personId` has more than one spouse-family.
 */
export function linkRelative(
  tree: FamilyTree,
  personId: UUID,
  kind: LinkableKind,
  existingId: UUID,
  familyId?: UUID
): FamilyTree {
  switch (kind) {
    case "spouse":
      return addSpouse(tree, personId, existingId);
    case "parent": {
      // Mirror addRelative's "parent": fill the father slot first, then the mother slot.
      const famc = tree.persons[personId]?.famcId
        ? tree.families[tree.persons[personId]!.famcId!]
        : undefined;
      return famc?.husbandId
        ? setMother(tree, personId, existingId)
        : setFather(tree, personId, existingId);
    }
    case "child":
      return addChildToPerson(tree, personId, existingId, familyId);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/lib/linkRelative.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/addRelative.ts web/tests/lib/linkRelative.test.ts
git commit -m "feat(web): linkRelative helper — connect two existing people"
```

---

## Task 2: `PersonPicker` dialog

**Files:**
- Create: `web/src/components/editor/PersonPicker.tsx`
- Test: `web/tests/components/editor/PersonPicker.test.tsx` (create)

**Interfaces:**
- Consumes: `searchPeople`, `type SearchIndex` from `../../lib/search.js`; `useCloseOnEscape` from `../../lib/useCloseOnEscape.js`.
- Produces:
  ```ts
  interface PersonPickerProps {
    tree: FamilyTree;
    index: SearchIndex;
    excludeIds: UUID[];          // filtered out of results (at minimum the anchor person)
    title: string;              // e.g. "Link existing person as spouse"
    error?: string;             // inline error from a failed link attempt; keeps dialog open
    onPick: (id: UUID) => void;
    onCancel: () => void;
  }
  export function PersonPicker(props: PersonPickerProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// web/tests/components/editor/PersonPicker.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree, Person, UUID } from "../../../../models/types.js";
import { buildSearchIndex } from "../../../src/lib/search.js";
import { PersonPicker } from "../../../src/components/editor/PersonPicker.js";

function tree(): FamilyTree {
  const persons: Record<UUID, Person> = {
    a: { id: "a", name: "Anchor", gender: "male", notes: [], media: [], famsIds: [] },
    b: { id: "b", name: "Bilal Khan", gender: "male", notes: [], media: [], famsIds: [] },
    c: { id: "c", name: "Bushra Khan", gender: "female", notes: [], media: [], famsIds: [] },
  };
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons,
    families: {},
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

it("searches and picks an existing person, excluding the anchor", async () => {
  const t = tree();
  const onPick = vi.fn();
  render(
    <PersonPicker
      tree={t}
      index={buildSearchIndex(t)}
      excludeIds={["a"]}
      title="Link existing person as spouse"
      onPick={onPick}
      onCancel={() => {}}
    />
  );
  await userEvent.type(screen.getByRole("searchbox"), "khan");
  expect(screen.queryByText("Anchor")).not.toBeInTheDocument(); // excluded
  await userEvent.click(screen.getByRole("button", { name: "Bilal Khan" }));
  expect(onPick).toHaveBeenCalledWith("b");
});

it("shows an inline error and stays open", () => {
  const t = tree();
  render(
    <PersonPicker
      tree={t}
      index={buildSearchIndex(t)}
      excludeIds={["a"]}
      title="Link existing person as parent"
      error="This assignment would create a circular ancestry."
      onPick={() => {}}
      onCancel={() => {}}
    />
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/circular ancestry/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run tests/components/editor/PersonPicker.test.tsx`
Expected: FAIL — module `PersonPicker` not found.

- [ ] **Step 3: Implement `PersonPicker`**

```tsx
// web/src/components/editor/PersonPicker.tsx
import { useId, useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { type SearchIndex, searchPeople } from "../../lib/search.js";
import { useCloseOnEscape } from "../../lib/useCloseOnEscape.js";

interface PersonPickerProps {
  tree: FamilyTree;
  index: SearchIndex;
  excludeIds: UUID[];
  title: string;
  error?: string;
  onPick: (id: UUID) => void;
  onCancel: () => void;
}

/**
 * Modal dialog for choosing an EXISTING person to link. Reuses the shared searchPeople scan and
 * filters out `excludeIds` (at minimum the anchor person, to block the obvious self-link). An
 * `error` prop renders inline and keeps the dialog open so the user can pick someone else.
 */
export function PersonPicker({
  tree,
  index,
  excludeIds,
  title,
  error,
  onPick,
  onCancel,
}: PersonPickerProps) {
  const [query, setQuery] = useState("");
  const titleId = useId();
  useCloseOnEscape(true, onCancel);

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const results = useMemo(
    () => searchPeople(tree, index, query, 30).filter((r) => !exclude.has(r.id)),
    [tree, index, query, exclude]
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 p-4 pt-[15vh]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800"
      >
        <h2 id={titleId} className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </h2>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people to link"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-400"
        />
        {error && (
          <p
            role="alert"
            className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto" aria-label="Matching people">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r.id)}
                className="block w-full rounded px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
              >
                {r.label}
              </button>
            </li>
          ))}
          {query.trim() !== "" && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              No matching people.
            </li>
          )}
        </ul>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/components/editor/PersonPicker.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/editor/PersonPicker.tsx web/tests/components/editor/PersonPicker.test.tsx
git commit -m "feat(web): PersonPicker dialog for choosing an existing person"
```

---

## Task 3: Wire link-existing into the toolbar `AddPersonMenu`

**Files:**
- Modify: `web/src/components/editor/AddPersonMenu.tsx`
- Test: `web/tests/components/editor/AddPersonMenu.test.tsx` (create if absent; otherwise extend)

**Interfaces:**
- Consumes: `linkRelative`, `type LinkableKind` (Task 1); `PersonPicker` (Task 2); `buildSearchIndex` from `../../lib/search.js`; `EditorError` from `../../../../editor/errors.js`.
- Produces: no new exports — behavior only.

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/editor/AddPersonMenu.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree, Person, UUID } from "../../../../models/types.js";
import { AddPersonMenu } from "../../../src/components/editor/AddPersonMenu.js";

function tree(): FamilyTree {
  const persons: Record<UUID, Person> = {
    a: { id: "a", name: "Anchor", gender: "male", notes: [], media: [], famsIds: [] },
    b: { id: "b", name: "Cousin Bride", gender: "female", notes: [], media: [], famsIds: [] },
  };
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons,
    families: {},
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

it("links an existing person as spouse via the picker", async () => {
  const t = tree();
  let mutated: FamilyTree | undefined;
  const onEdit = (fn: (x: FamilyTree) => FamilyTree) => (mutated = fn(t));
  render(
    <AddPersonMenu tree={t} selectedPersonId="a" onEdit={onEdit} onSelect={vi.fn()} />
  );
  await userEvent.click(screen.getByRole("button", { name: /Add person/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /Existing person as spouse/i }));
  await userEvent.click(screen.getByRole("button", { name: "Cousin Bride" }));
  expect(mutated).toBeDefined();
  const fam = mutated!.persons.a!.famsIds[0]!;
  expect([mutated!.families[fam]!.husbandId, mutated!.families[fam]!.wifeId].sort()).toEqual([
    "a",
    "b",
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/components/editor/AddPersonMenu.test.tsx`
Expected: FAIL — no "Existing person as spouse" menu item.

- [ ] **Step 3: Implement the wiring**

In `web/src/components/editor/AddPersonMenu.tsx`:

1. Add imports:
```tsx
import { useMemo, useState } from "react";
import { addRelative, linkRelative, type LinkableKind, type RelativeKind } from "../../lib/addRelative.js";
import { buildSearchIndex } from "../../lib/search.js";
import { EditorError } from "../../../../editor/errors.js";
import { PersonPicker } from "./PersonPicker.js";
```

2. Inside the component, add picker state and a link handler:
```tsx
const [linkKind, setLinkKind] = useState<LinkableKind | null>(null);
const [linkError, setLinkError] = useState<string | undefined>(undefined);
const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);

function startLink(kind: LinkableKind) {
  setLinkError(undefined);
  setLinkKind(kind);
  close();
}
function handlePick(existingId: string) {
  if (!selectedPersonId || !linkKind) return;
  try {
    const next = linkRelative(tree, selectedPersonId, linkKind, existingId);
    onEdit(() => next);
    onSelect(existingId);
    setLinkKind(null);
  } catch (err) {
    if (err instanceof EditorError) setLinkError(err.message);
    else throw err;
  }
}
```

3. Add a "Link existing person as…" section to the dropdown, after the existing linked items (reusing the same three kinds), each calling `startLink`:
```tsx
<div className="my-1 border-t border-slate-100 dark:border-slate-700" />
{(["parent", "spouse", "child"] as LinkableKind[]).map((kind) => (
  <button
    key={`link-${kind}`}
    type="button"
    role="menuitem"
    disabled={!selectedPersonId}
    onClick={() => startLink(kind)}
    className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:disabled:text-slate-600"
  >
    Existing person as {kind}
  </button>
))}
```

4. Render the picker (after `</AnchoredPanel>`, still inside the fragment):
```tsx
{linkKind && selectedPersonId && (
  <PersonPicker
    tree={tree}
    index={searchIndex}
    excludeIds={[selectedPersonId]}
    title={`Link existing person as ${linkKind}`}
    error={linkError}
    onPick={handlePick}
    onCancel={() => setLinkKind(null)}
  />
)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run tests/components/editor/AddPersonMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/editor/AddPersonMenu.tsx web/tests/components/editor/AddPersonMenu.test.tsx
git commit -m "feat(web): link an existing person from the Add-Person toolbar menu"
```

---

## Task 4: Wire link-existing into the sidebar `QuickActions`

**Files:**
- Modify: `web/src/components/editor/QuickActions.tsx`
- Test: `web/tests/components/editor/QuickActions.test.tsx` (create if absent; otherwise extend)

**Interfaces:**
- Consumes: `linkRelative`, `type LinkableKind` (Task 1); `PersonPicker` (Task 2); `buildSearchIndex`; `EditorError`.
- Produces: no new exports — behavior only. A "Create new / Link existing" mode toggle governs whether the kind buttons create or link.

- [ ] **Step 1: Write the failing test**

```tsx
// web/tests/components/editor/QuickActions.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyTree, Person, UUID } from "../../../../models/types.js";
import { QuickActions } from "../../../src/components/editor/QuickActions.js";

function tree(): FamilyTree {
  const persons: Record<UUID, Person> = {
    a: { id: "a", name: "Anchor", gender: "male", notes: [], media: [], famsIds: [] },
    b: { id: "b", name: "Existing Wife", gender: "female", notes: [], media: [], famsIds: [] },
  };
  return {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons,
    families: {},
    validation: { validatedAt: "", issues: [], isValid: true },
  };
}

it("links an existing spouse when in Link-existing mode", async () => {
  const t = tree();
  let mutated: FamilyTree | undefined;
  render(
    <QuickActions
      tree={t}
      personId="a"
      onEdit={(fn) => (mutated = fn(t))}
      onSelect={vi.fn()}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: /Link existing/i }));
  await userEvent.click(screen.getByRole("button", { name: /Spouse/i }));
  await userEvent.click(screen.getByRole("button", { name: "Existing Wife" }));
  const fam = mutated!.persons.a!.famsIds[0]!;
  expect([mutated!.families[fam]!.husbandId, mutated!.families[fam]!.wifeId].sort()).toEqual([
    "a",
    "b",
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/components/editor/QuickActions.test.tsx`
Expected: FAIL — no "Link existing" toggle.

- [ ] **Step 3: Implement the wiring**

Rework `web/src/components/editor/QuickActions.tsx` to add a mode toggle. The existing 4 buttons keep their kinds (`father`/`mother`/`spouse`/`child`); in link mode they open the picker. Map the `father`/`mother` buttons to the `parent` `LinkableKind` when linking (father/mother slot resolution is handled inside `linkRelative`'s `parent` branch):

```tsx
import { useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { addRelative, linkRelative, type LinkableKind, type RelativeKind } from "../../lib/addRelative.js";
import { buildSearchIndex } from "../../lib/search.js";
import { EditorError } from "../../../../editor/errors.js";
import { PersonPicker } from "./PersonPicker.js";

// ...inside the component:
const [mode, setMode] = useState<"create" | "link">("create");
const [linkKind, setLinkKind] = useState<LinkableKind | null>(null);
const [linkError, setLinkError] = useState<string | undefined>(undefined);
const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);

// "father"/"mother" both map to the "parent" LinkableKind (slot chosen inside linkRelative)
const toLinkable = (k: RelativeKind): LinkableKind | null =>
  k === "father" || k === "mother" || k === "parent" ? "parent"
  : k === "spouse" ? "spouse"
  : k === "child" ? "child"
  : null;

function onKindClick(kind: RelativeKind) {
  if (mode === "create") {
    const { tree: next, personId: newId } = addRelative(tree, personId, kind);
    onEdit(() => next);
    onSelect(newId);
    return;
  }
  const lk = toLinkable(kind);
  if (lk) { setLinkError(undefined); setLinkKind(lk); }
}
function handlePick(existingId: string) {
  if (!linkKind) return;
  try {
    const next = linkRelative(tree, personId, linkKind, existingId);
    onEdit(() => next);
    onSelect(existingId);
    setLinkKind(null);
  } catch (err) {
    if (err instanceof EditorError) setLinkError(err.message);
    else throw err;
  }
}
```

Add a segmented toggle above the button grid (two buttons, `aria-pressed`):
```tsx
<div className="mb-2 flex gap-1" role="group" aria-label="Add mode">
  {(["create", "link"] as const).map((m) => (
    <button
      key={m}
      type="button"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
        mode === m
          ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950"
          : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
      }`}
    >
      {m === "create" ? "Create new" : "Link existing"}
    </button>
  ))}
</div>
```

Change the grid buttons' `onClick` to `onKindClick(b.kind)`, and render the picker at the end:
```tsx
{linkKind && (
  <PersonPicker
    tree={tree}
    index={searchIndex}
    excludeIds={[personId]}
    title={`Link existing person as ${linkKind}`}
    error={linkError}
    onPick={handlePick}
    onCancel={() => setLinkKind(null)}
  />
)}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run tests/components/editor/QuickActions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/editor/QuickActions.tsx web/tests/components/editor/QuickActions.test.tsx
git commit -m "feat(web): Create-new/Link-existing toggle in sidebar Quick add"
```

---

## Task 5: Child → multiple-marriage family disambiguation

**Files:**
- Modify: `web/src/components/editor/PersonPicker.tsx` (add an optional post-pick family step) OR add a tiny `FamilyChoice.tsx` — implementer's choice; keep it one small surface.
- Modify: `web/src/components/editor/AddPersonMenu.tsx`, `web/src/components/editor/QuickActions.tsx` (pass a chosen `familyId` into `linkRelative`).
- Test: extend `web/tests/components/editor/AddPersonMenu.test.tsx`.

**Interfaces:**
- Consumes: `linkRelative(..., familyId)` (Task 1 already supports the 5th arg).
- Produces: no new exports.

**Rationale:** `addChildToPerson` throws `EditorError("This person has multiple spouse-families — specify which one.")` when the anchor has >1 spouse-family and no `familyId`. Without this task, linking an existing person as a *child* of a twice-married anchor dead-ends on that error. This task adds a family chooser so the user can say "which marriage."

- [ ] **Step 1: Write the failing test**

```tsx
// add to web/tests/components/editor/AddPersonMenu.test.tsx
it("asks which marriage when linking a child to a twice-married anchor, then links", async () => {
  // anchor a married to w1 (fam f1) and w2 (fam f2); link existing kid as child of f2
  const persons = {
    a: { id: "a", name: "Anchor", gender: "male", notes: [], media: [], famsIds: ["f1", "f2"] },
    w1: { id: "w1", name: "Wife One", gender: "female", notes: [], media: [], famsIds: ["f1"] },
    w2: { id: "w2", name: "Wife Two", gender: "female", notes: [], media: [], famsIds: ["f2"] },
    kid: { id: "kid", name: "Adopted Kid", gender: "unknown", notes: [], media: [], famsIds: [] },
  } as any;
  const t: FamilyTree = {
    metadata: { sourceFormat: "manual", importedAt: "" },
    persons,
    families: {
      f1: { id: "f1", husbandId: "a", wifeId: "w1", childrenIds: [] },
      f2: { id: "f2", husbandId: "a", wifeId: "w2", childrenIds: [] },
    },
    validation: { validatedAt: "", issues: [], isValid: true },
  };
  let mutated: FamilyTree | undefined;
  render(<AddPersonMenu tree={t} selectedPersonId="a" onEdit={(fn) => (mutated = fn(t))} onSelect={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: /Add person/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /Existing person as child/i }));
  await userEvent.click(screen.getByRole("button", { name: "Adopted Kid" }));
  // family chooser appears — pick the marriage to Wife Two
  await userEvent.click(screen.getByRole("button", { name: /Wife Two/i }));
  expect(mutated!.families.f2!.childrenIds).toContain("kid");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run tests/components/editor/AddPersonMenu.test.tsx`
Expected: FAIL — no family chooser; the pick throws the multi-family EditorError instead.

- [ ] **Step 3: Implement the family-choice step**

In the pick handler (both entry points), before calling `linkRelative` for the `child` kind, detect the multi-family case and defer to a chooser instead of catching the throw:

```tsx
// helper, shared shape in each entry point
function spouseFamilies(tree: FamilyTree, personId: UUID) {
  return (tree.persons[personId]?.famsIds ?? [])
    .map((fid) => tree.families[fid])
    .filter((f): f is NonNullable<typeof f> => !!f);
}

// in handlePick, for kind === "child":
if (linkKind === "child") {
  const fams = spouseFamilies(tree, selectedPersonId);
  if (fams.length > 1) {
    setPendingChildId(existingId); // new useState<UUID | null>
    return; // render the family chooser
  }
}
```

Render a small chooser when `pendingChildId` is set: one button per family, labelled by the *other* spouse's name (or "single-parent family" when no other spouse), each calling:
```tsx
const next = linkRelative(tree, selectedPersonId, "child", pendingChildId, fam.id);
onEdit(() => next);
onSelect(pendingChildId);
setPendingChildId(null);
setLinkKind(null);
```
Family label helper:
```tsx
function familyLabel(tree: FamilyTree, fam: Family, anchorId: UUID): string {
  const otherId = fam.husbandId === anchorId ? fam.wifeId : fam.husbandId;
  const other = otherId ? tree.persons[otherId]?.name : undefined;
  return other ? `Marriage to ${other}` : "Single-parent family";
}
```
(Import `type Family` from `../../../../models/types.js`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run tests/components/editor/AddPersonMenu.test.tsx tests/components/editor/QuickActions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/editor/*.tsx web/tests/components/editor/*.tsx
git commit -m "feat(web): choose which marriage when linking an existing child"
```

---

## Final verification (run after Task 5)

- [ ] **Root + web gates** (per project rule — run BOTH):
  - `npm test` (root) and `cd web && npm test`
  - `npx tsc -b` (root) and `cd web && npm run build` (`tsc -b && vite build`)
  - `cd web && npm run lint && npm run format:check`
- [ ] **Real-browser confirmation:** in the editor, select a person, and via both the toolbar menu and the sidebar toggle, link an existing person as spouse (cousin-marriage case), parent, and child; confirm the edge does the right thing on the canvas and undo reverts it. Capture a screenshot of the picker + the resulting link.
- [ ] `graphify update .` to refresh the graph.

---

## Self-Review (completed)

- **Spec coverage:** parent / spouse / child linking → Task 1 + 3 + 4; cousin-marriage (spouse) is the primary path, covered in Task 1/3/4 tests; guard-error surfacing → Task 2 (`error` prop) + Task 3/4 (`catch EditorError`); child multi-marriage dead-end → Task 5. No data-model changes (Global Constraints). ✎ Covered.
- **Placeholder scan:** no TBD/"handle edge cases"/vague steps — all code blocks concrete.
- **Type consistency:** `LinkableKind = "parent" | "spouse" | "child"` used identically in Tasks 1/3/4/5; `linkRelative(tree, personId, kind, existingId, familyId?)` signature consistent across call sites; `PersonPickerProps` fields (`excludeIds`, `title`, `error`, `onPick`, `onCancel`) match between Task 2 definition and Task 3/4 usage.

## Open questions for the reviewer (non-blocking)

1. **Re-parenting confirm:** linking an existing person as a *child* who already has parents silently moves them (existing `addChildToFamily` semantics). Acceptable for v1, or should it confirm first? (Out of scope as written.)
2. **QuickActions father/mother in link mode:** both collapse to the `parent` slot-fill behavior (father slot first). If linking should let the user force the mother slot even when father is open, that's a small follow-up — flagged, not built.
