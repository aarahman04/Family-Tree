import type { FamilyTree, UUID } from "../../../../models/types.js";
import {
  addChildToPerson,
  addSpouse,
  createPerson,
  setFather,
  setMother,
} from "../../../../editor/operations.js";

type Relative = "father" | "mother" | "spouse" | "child";

interface QuickActionsProps {
  tree: FamilyTree;
  personId: UUID;
  onEdit: (mutate: (tree: FamilyTree) => FamilyTree) => void;
  onSelect: (id: UUID) => void;
  disabled?: boolean;
}

/**
 * One-click "add a relative" buttons for the selected person. Each creates a new person named
 * "New person" (which the user immediately renames in the inspector, since the new person is
 * auto-selected) and links them via the existing editor operations — no bespoke tree mutation.
 */
export function QuickActions({ tree, personId, onEdit, onSelect, disabled }: QuickActionsProps) {
  function add(kind: Relative) {
    const gender = kind === "father" ? "male" : kind === "mother" ? "female" : undefined;
    const { tree: withNew, personId: newId } = createPerson(tree, { name: "New person", gender });
    let next: FamilyTree;
    if (kind === "father") next = setFather(withNew, personId, newId);
    else if (kind === "mother") next = setMother(withNew, personId, newId);
    else if (kind === "spouse") next = addSpouse(withNew, personId, newId);
    else next = addChildToPerson(withNew, personId, newId);
    onEdit(() => next);
    onSelect(newId);
  }

  const buttons: { kind: Relative; label: string }[] = [
    { kind: "father", label: "+ Father" },
    { kind: "mother", label: "+ Mother" },
    { kind: "spouse", label: "+ Spouse" },
    { kind: "child", label: "+ Child" },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Quick add
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {buttons.map((b) => (
          <button
            key={b.kind}
            type="button"
            disabled={disabled}
            onClick={() => add(b.kind)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
