const MAX_VALUE_CHUNK = 200; // conservative margin under GEDCOM 5.5.1's ~255-char line guidance

/**
 * Emits GEDCOM 5.5.1 lines: "<level> [<xref>] <tag> [<value>]".
 * Handles the two structural requirements a naive string-join would violate:
 *  - embedded newlines in a value are illegal in a single GEDCOM line -> split via CONT
 *  - overlong values should be wrapped via CONC rather than emitted as one giant line
 */
export class GedcomWriter {
  private lines: string[] = [];

  line(level: number, tag: string, value?: string): void {
    this.emit(level, undefined, tag, value);
  }

  lineWithXref(level: number, xref: string, tag: string, value?: string): void {
    this.emit(level, xref, tag, value);
  }

  private emit(level: number, xref: string | undefined, tag: string, value?: string): void {
    const prefix = xref ? `${level} ${xref} ${tag}` : `${level} ${tag}`;

    if (value === undefined || value === "") {
      this.lines.push(prefix);
      return;
    }

    const segments = value.split("\n");
    const firstSegment = segments[0] ?? "";
    this.pushChunked(prefix, firstSegment);

    for (let i = 1; i < segments.length; i++) {
      this.pushChunked(`${level + 1} CONT`, segments[i] ?? "");
    }
  }

  /** Emits `${linePrefix} ${firstChunkOfText}`, then CONC continuations for the rest. */
  private pushChunked(linePrefix: string, text: string): void {
    if (text.length <= MAX_VALUE_CHUNK) {
      this.lines.push(`${linePrefix} ${text}`.trimEnd());
      return;
    }
    const level = Number(linePrefix.split(" ")[0]);
    this.lines.push(`${linePrefix} ${text.slice(0, MAX_VALUE_CHUNK)}`);
    let rest = text.slice(MAX_VALUE_CHUNK);
    while (rest.length > 0) {
      const chunk = rest.slice(0, MAX_VALUE_CHUNK);
      this.lines.push(`${level + 1} CONC ${chunk}`);
      rest = rest.slice(MAX_VALUE_CHUNK);
    }
  }

  toString(): string {
    return this.lines.join("\n") + "\n";
  }
}
