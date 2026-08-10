/** Thrown only when export cannot proceed at all (see gedcom/export.ts rejection policy). */
export class GedcomExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GedcomExportError";
  }
}

/** Thrown when a file can't be read as GEDCOM at all (not the lineage-linked format, or no
 * individuals in it). Content-level problems are reported via ParseResult.validation instead. */
export class GedcomImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GedcomImportError";
  }
}
