import type { FamilyTree, UUID } from "../../../../src/models/types.js";
import { addRelative, type RelativeKind } from "../../lib/addRelative.js";

interface QuickActionsProps {
  tree: FamilyTree;
  personId: UUID;
  onEdit: (mutate: (tree: FamilyTree) => FamilyTree) => void;
  onSelect: (id: UUID) => void;
  disabled?: boolean;
}

/**
 * One-click "add a relative" buttons for the selected person. Each creates a "New person"
 * (auto-selected for immediate renaming) linked in the chosen role via the shared addRelative
 * helper — the same helper the toolbar's Add-Person menu uses, so there's no duplicated logic.
 */
export function QuickActions({ tree, personId, onEdit, onSelect, disabled }: QuickActionsProps) {
  function add(kind: RelativeKind) {
    const { tree: next, personId: newId } = addRelative(tree, personId, kind);
    onEdit(() => next);
    onSelect(newId);
  }

  const buttons: { kind: RelativeKind; label: string }[] = [
    { kind: "father", label: "+ Father" },
    { kind: "mother", label: "+ Mother" },
    { kind: "spouse", label: "+ Spouse" },
    { kind: "child", label: "+ Child" },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400">
        Quick add
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {buttons.map((b) => (
          <button
            key={b.kind}
            type="button"
            disabled={disabled}
            onClick={() => add(b.kind)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
