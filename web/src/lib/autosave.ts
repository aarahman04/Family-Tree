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

export function saveSession(session: { tree: FamilyTree; fileName: string }): void {
  try {
    const payload: SavedSession = { ...session, savedAt: new Date().toISOString() };
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
