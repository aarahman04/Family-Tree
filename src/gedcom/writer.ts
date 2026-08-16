const MAX_VALUE_CHUNK = 200; // conservative margin under GEDCOM 5.5.1's ~255-char line guidance

/**
 * Escapes a literal "@" in a free-text GEDCOM value per the 5.5.1 spec: "If an @ is desired
 * as part of the line_value, it must be written in GEDCOM as a double @" (e.g. "3 doz. @
 * $20.00" -> "3 doz. @@ $20.00") -- an unescaped "@" can be misread by a strict parser as the
 * start of an @XREF@ pointer.
 *
 * Callers must apply this ONLY to genuine free text (names, nicknames, notes, the source file
 * name) -- never to a value that is itself a pointer reference (FAMC/FAMS/HUSB/WIFE/CHIL/SUBM
 * all carry real "@I1@"-style xrefs as their value, which must reach the output unescaped).
 */
export function escapeGedcomValue(text: string): string {
  return text.replace(/@/g, "@@");
}

/**
 * Returns a chunk length <= maxLength that never splits a UTF-16 surrogate pair -- most
 * emoji and some rare CJK/mathematical characters outside the Basic Multilingual Plane are
 * stored as two 16-bit code units (a "high" surrogate, 0xD800-0xDBFF, followed by a "low"
 * surrogate). `.slice()` has no awareness of this and will happily cut between the two,
 * producing two lone/invalid surrogates -- silently corrupted text on both sides of the cut.
 * If the code unit that would end the chunk is a high surrogate, its partner is the very next
 * code unit, so back off by one and let the whole pair land in the following chunk instead.
 */
function safeChunkLength(text: string, maxLength: number): number {
  if (maxLength >= text.length) return text.length;
  const lastUnit = text.charCodeAt(maxLength - 1);
  const isHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
  return isHighSurrogate ? maxLength - 1 : maxLength;
}

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

  /**
   * Emits `${linePrefix} ${firstChunkOfText}`, then CONC continuations for the rest. Each
   * chunk boundary is picked via safeChunkLength so a chunk never ends mid-surrogate-pair.
   */
  private pushChunked(linePrefix: string, text: string): void {
    if (text.length <= MAX_VALUE_CHUNK) {
      this.lines.push(`${linePrefix} ${text}`.trimEnd());
      return;
    }
    const level = Number(linePrefix.split(" ")[0]);
    let rest = text;
    let prefix = linePrefix;
    while (rest.length > MAX_VALUE_CHUNK) {
      const chunkLength = safeChunkLength(rest, MAX_VALUE_CHUNK);
      this.lines.push(`${prefix} ${rest.slice(0, chunkLength)}`);
      rest = rest.slice(chunkLength);
      prefix = `${level + 1} CONC`;
    }
    this.lines.push(`${prefix} ${rest}`);
  }

  toString(): string {
    return this.lines.join("\n") + "\n";
  }
}
