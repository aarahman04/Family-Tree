/**
 * Thrown only for structural problems that make parsing impossible.
 * Everything else (data-quality issues) becomes a ValidationIssue instead — see docs/parser-spec.md.
 */
export class FtzParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FtzParseError";
  }
}
