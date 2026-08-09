/** Thrown only when export cannot proceed at all (see gedcom/export.ts rejection policy). */
export class GedcomExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GedcomExportError";
  }
}
