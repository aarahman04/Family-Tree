import type { FamilyTree, UUID } from "../../../src/models/types.js";

interface SearchIndexEntry {
  id: UUID;
  ftzId?: number;
  nameLower: string;
  nicknameLower: string;
}

export type SearchIndex = SearchIndexEntry[];

/**
 * Built once per tree (memoize on the caller side, keyed on the tree reference) and reused
 * across keystrokes. A plain array + linear scan is deliberately simple: at up to ~10,000
 * people a full scan is a few thousand cheap string comparisons, well under a millisecond in
 * V8 — no trie/fuzzy-search library earns its complexity at this scale.
 */
export function buildSearchIndex(tree: FamilyTree): SearchIndex {
  return Object.values(tree.persons).map((p) => ({
    id: p.id,
    ftzId: p.ftzId,
    nameLower: p.name.toLowerCase(),
    nicknameLower: (p.nickname ?? "").toLowerCase(),
  }));
}

export interface SearchResult {
  id: UUID;
  label: string;
}

export function searchPeople(
  tree: FamilyTree,
  index: SearchIndex,
  rawQuery: string,
  limit = 20
): SearchResult[] {
  const query = rawQuery.trim();
  if (!query) return [];
  const q = query.toLowerCase();

  const results: SearchResult[] = [];
  for (const entry of index) {
    if (results.length >= limit) break;
    const matches =
      entry.nameLower.includes(q) ||
      entry.nicknameLower.includes(q) ||
      entry.id === query ||
      (entry.ftzId !== undefined && String(entry.ftzId) === query);
    if (!matches) continue;
    const person = tree.persons[entry.id];
    if (!person) continue;
    results.push({ id: entry.id, label: person.name.trim() || "(no name)" });
  }
  return results;
}
