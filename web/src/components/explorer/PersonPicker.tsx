import { useId, useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../../src/models/types.js";
import { type SearchIndex, searchPeople } from "../../lib/search.js";
import { useAutoFocus } from "../../hooks/useAutoFocus.js";

interface PersonPickerProps {
  tree: FamilyTree;
  index: SearchIndex;
  label: string;
  excludeId?: UUID;
  onPick: (id: UUID) => void;
  onCreateNew: (name: string) => void;
  onCancel: () => void;
}

/** Inline person search-and-pick used for every relationship-editing action (assign father/mother, add spouse, add child). Pick an existing person, or create a new one with the typed name. */
export function PersonPicker({
  tree,
  index,
  label,
  excludeId,
  onPick,
  onCreateNew,
  onCancel,
}: PersonPickerProps) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const inputRef = useAutoFocus<HTMLInputElement>();

  const results = useMemo(
    () => searchPeople(tree, index, query, 8).filter((r) => r.id !== excludeId),
    [tree, index, query, excludeId]
  );

  return (
    <div className="rounded-md border border-slate-300 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {label}
        </label>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Cancel
        </button>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or ID…"
        className="mt-1 w-full rounded border border-slate-500 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <ul className="mt-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
        {results.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onPick(r.id)}
              className="w-full rounded px-2 py-1 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
      {query.trim() && (
        <button
          type="button"
          onClick={() => onCreateNew(query.trim())}
          className="mt-2 w-full rounded border border-dashed border-slate-300 px-2 py-1.5 text-left text-sm text-blue-700 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-blue-950/40"
        >
          + Create new person "{query.trim()}"
        </button>
      )}
    </div>
  );
}
