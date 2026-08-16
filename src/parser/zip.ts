import JSZip from "jszip";
import { FtzParseError } from "./errors.js";

// A real Quick Family Tree export is tiny — the sample this parser was built and validated
// against is ~11KB compressed, and its node.ftt (473 people / 136 families) is well under
// 200KB uncompressed. These ceilings are generous multiples of that — comfortably above any
// realistic family tree (including one with embedded photos in the archive, for the whole-
// archive limit) — chosen to reject a corrupted or maliciously crafted archive (e.g. a
// decompression bomb: a tiny compressed file that expands to gigabytes) before the browser
// tab spends time and memory extracting it, rather than to fit real data snugly.
// Exported so tests can build fixtures precisely at the boundary without duplicating (and
// risking drifting out of sync with) these numbers.
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024; // 200MB compressed, whole archive
export const MAX_ENTRY_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50MB decompressed, node.ftt only

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * JSZip's public JSZipObject type doesn't expose the ZIP central directory's declared
 * uncompressed size — it's only available via an internal `_data` property (undocumented,
 * but stable across JSZip's 3.x line; see node_modules/jszip/index.d.ts's own comment on
 * it). Reading it lets the entry be size-checked BEFORE calling `.async(...)`, which is the
 * whole point — checking only after decompression is too late to avoid doing it. Falls back
 * to `undefined` (never throws) if that internal shape isn't there, so a future JSZip version
 * changing this detail degrades to relying on the post-decompression check below instead of
 * breaking the app outright.
 */
function declaredUncompressedSize(entry: JSZip.JSZipObject): number | undefined {
  const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
    ?.uncompressedSize;
  return typeof size === "number" ? size : undefined;
}

/**
 * Opens an .ftz (ZIP) archive and returns the decoded text of node.ftt.
 * The containing folder name inside the zip is export-specific (e.g. "FamilyTree(2)")
 * and must not be hard-coded — we locate node.ftt by filename anywhere in the archive.
 */
export async function extractNodeFtt(data: ArrayBuffer | Uint8Array): Promise<string> {
  const archiveBytes = data.byteLength;
  if (archiveBytes > MAX_ARCHIVE_BYTES) {
    throw new FtzParseError(
      `file too large: this archive is ${formatMB(archiveBytes)}, over the ${formatMB(MAX_ARCHIVE_BYTES)} limit for a Quick Family Tree export. If this is genuinely your family tree file, please open an issue — this limit may need to change.`
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new FtzParseError("not a valid FTZ archive: failed to open as ZIP");
  }

  const entry = Object.values(zip.files).find(
    (f) => !f.dir && f.name.split("/").pop() === "node.ftt"
  );

  if (!entry) {
    throw new FtzParseError("not a valid FTZ archive: node.ftt not found");
  }

  const declaredSize = declaredUncompressedSize(entry);
  if (declaredSize !== undefined && declaredSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new FtzParseError(
      `archive entry too large: node.ftt would decompress to ${formatMB(declaredSize)}, over the ${formatMB(MAX_ENTRY_UNCOMPRESSED_BYTES)} limit — this doesn't look like a real Quick Family Tree export.`
    );
  }

  const text = await entry.async("string");

  // Belt-and-suspenders: if the declared size above wasn't available (or was wrong), still
  // don't hold onto or process an absurdly large result.
  if (text.length > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new FtzParseError(
      `archive entry too large: node.ftt decompressed to over ${formatMB(MAX_ENTRY_UNCOMPRESSED_BYTES)} — this doesn't look like a real Quick Family Tree export.`
    );
  }

  // Strip a leading UTF-8 BOM if present (node.ftt is exported with one).
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
