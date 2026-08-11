import type { FamilyTree } from "../../../models/types.js";

/**
 * Best-effort autosave of the current editing session to localStorage, so an accidental tab
 * close or reload doesn't lose unsaved edits. Everything is wrapped in try/catch: localStorage
 * can be unavailable (private mode) or over quota (large trees), and autosave must never break
 * the app when it can't persist — it just silently no-ops.
 */
const KEY = "familyTree.autosave.v1";

export interface SavedSession {
  tree: FamilyTree;
  fileName: string;
  savedAt: string; // ISO timestamp
}

/**
 * Thumb-only persistence: the ~640px `print` WebP is kept in the in-memory tree for High-quality
 * export this session, but is NOT written to localStorage — two data URIs per person would blow
 * the storage quota on a large tree and contradicts the memory budget. Only `thumb` (+ `alt`)
 * survives a reload; a High-quality export after a reload prompts re-upload (Task 13). Returns a
 * new tree (the in-memory one is never mutated); shares person objects that have no print to strip.
 */
function stripPrintForPersistence(tree: FamilyTree): FamilyTree {
  let changed = false;
  const persons: FamilyTree["persons"] = {};
  for (const [id, person] of Object.entries(tree.persons)) {
    if (person.photo?.print !== undefined) {
      changed = true;
      const photo =
        person.photo.alt !== undefined
          ? { thumb: person.photo.thumb, alt: person.photo.alt }
          : { thumb: person.photo.thumb };
      persons[id] = { ...person, photo };
    } else {
      persons[id] = person;
    }
  }
  return changed ? { ...tree, persons } : tree;
}

export function saveSession(session: { tree: FamilyTree; fileName: string }): void {
  try {
    const payload: SavedSession = {
      tree: stripPrintForPersistence(session.tree),
      fileName: session.fileName,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable or over quota — autosave is best-effort, so ignore.
  }
}

export function loadSavedSession(): SavedSession | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (parsed && parsed.tree && parsed.fileName && parsed.savedAt) {
      return parsed as SavedSession;
    }
  } catch {
    // Malformed or unreadable — treat as no saved session.
  }
  return undefined;
}

export function clearSavedSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}
