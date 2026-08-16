import type { FamilyTree, UUID } from "../../../../src/models/types.js";
import { addRelative, type RelativeKind } from "../../lib/addRelative.js";
import { createPerson } from "../../../../src/editor/operations.js";
import { useCloseOnEscape } from "../../lib/useCloseOnEscape.js";
import { AnchoredPanel, useAnchoredDropdown } from "../../lib/useAnchoredDropdown.js";

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
  const { open, toggle, close, triggerRef, panelRef, pos } = useAnchoredDropdown();
  useCloseOnEscape(open, close);

  function addIndependent() {
    const { tree: next, personId } = createPerson(tree, { name: "New person" });
    onEdit(() => next);
    onSelect(personId);
    close();
  }
  function addLinked(kind: Exclude<RelativeKind, "independent">) {
    if (!selectedPersonId) return;
    const { tree: next, personId } = addRelative(tree, selectedPersonId, kind);
    onEdit(() => next);
    onSelect(personId);
    close();
  }

  const linked: { kind: Exclude<RelativeKind, "independent">; label: string }[] = [
    { kind: "parent", label: "Parent" },
    { kind: "child", label: "Child" },
    { kind: "spouse", label: "Spouse" },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Add person ▾
      </button>
      <AnchoredPanel
        open={open}
        pos={pos}
        panelRef={panelRef}
        onClose={close}
        className="w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      >
        <button
          type="button"
          role="menuitem"
          onClick={addIndependent}
          className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
        >
          New independent person
        </button>
        <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
        {linked.map((item) => (
          <button
            key={item.kind}
            type="button"
            role="menuitem"
            disabled={!selectedPersonId}
            onClick={() => addLinked(item.kind)}
            className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:disabled:text-slate-600"
          >
            {item.label} of selected
          </button>
        ))}
      </AnchoredPanel>
    </>
  );
}
