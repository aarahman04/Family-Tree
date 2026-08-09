/**
 * Tracks whether the current session has unsaved edits, so destructive actions can guard
 * themselves with a confirmation prompt. A plain module-level flag (not React state/Context)
 * deliberately, since the only two consumers -- HomePage (writer, owns the actual edit count)
 * and Header (reader, needs to guard its navigation links) -- are siblings in the tree with no
 * other shared state; adding a Context provider just for this would be a bigger structural
 * change than the one boolean actually warrants.
 */
let hasUnsavedEdits = false;

export function setHasUnsavedEdits(value: boolean): void {
  hasUnsavedEdits = value;
}

/**
 * Returns true immediately if there's nothing to lose. Otherwise asks the user via a native
 * confirm dialog and returns their answer. Callers must not proceed with the destructive
 * action when this returns false.
 */
export function confirmDiscardIfUnsaved(message: string): boolean {
  if (!hasUnsavedEdits) return true;
  return window.confirm(message);
}
