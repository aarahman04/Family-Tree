import { useId, useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { type SearchIndex, searchPeople } from "../../lib/search.js";

interface SearchBoxProps {
  tree: FamilyTree;
  index: SearchIndex;
  onSelect: (id: UUID) => void;
}

/** Search by name (full or partial), original FTZ ID, or internal UUID. Selecting a result centers the visualization on that person (via onSelect → focus). */
export function SearchBox({ tree, index, onSelect }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const listId = useId();

  const results = useMemo(() => searchPeople(tree, index, query, 10), [tree, index, query]);

  return (
    <div className="relative w-full max-w-xs">
      <label htmlFor={inputId} className="sr-only">
        Search people by name or ID
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people…"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
      />
      {results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {results.map((r) => (
            <li key={r.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r.id);
                  setQuery("");
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length > 0 && results.length === 0 && (
        <div
          role="status"
          className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        >
          No people match &ldquo;{query.trim()}&rdquo;.
        </div>
      )}
    </div>
  );
}
