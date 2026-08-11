import { useState } from "react";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { addRelative, type RelativeKind } from "../../lib/addRelative.js";
import { createPerson } from "../../../../editor/operations.js";

interface AddPersonMenuProps {
  tree: FamilyTree;
  selectedPersonId?: UUID;
  onEdit: (mutate: (tree: FamilyTree) => FamilyTree) => void;
  onSelect: (id: UUID) => void;
  disabled?: boolean;
}

/**
 * Toolbar "Add person ▾" menu. "New Independent Person" creates an unlinked placeholder; the
 * Parent / Child / Spouse items reuse the shared addRelative helper (same logic as the sidebar
 * QuickActions) and require a selected person. The new person is auto-selected for renaming.
 */
export function AddPersonMenu({
  tree,
  selectedPersonId,
  onEdit,
  onSelect,
  disabled,
}: AddPersonMenuProps) {
  const [open, setOpen] = useState(false);

  function addIndependent() {
    const { tree: next, personId } = createPerson(tree, { name: "New person" });
    onEdit(() => next);
    onSelect(personId);
    setOpen(false);
  }
  function addLinked(kind: Exclude<RelativeKind, "independent">) {
    if (!selectedPersonId) return;
    const { tree: next, personId } = addRelative(tree, selectedPersonId, kind);
    onEdit(() => next);
    onSelect(personId);
    setOpen(false);
  }

  const linked: { kind: Exclude<RelativeKind, "independent">; label: string }[] = [
    { kind: "parent", label: "Parent" },
    { kind: "child", label: "Child" },
    { kind: "spouse", label: "Spouse" },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add person ▾
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute left-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={addIndependent}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
            >
              New independent person
            </button>
            <div className="my-1 border-t border-slate-100" />
            {linked.map((item) => (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                disabled={!selectedPersonId}
                onClick={() => addLinked(item.kind)}
                className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                {item.label} of selected
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
