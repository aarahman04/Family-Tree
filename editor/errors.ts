/** Thrown when an edit would corrupt the family graph (self-parent, circular ancestry, etc.) or references a record that doesn't exist. Never thrown for ordinary data-quality issues — those become ValidationIssues instead, same policy as parser/ and gedcom/. */
export class EditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorError";
  }
}
