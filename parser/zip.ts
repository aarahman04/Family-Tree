import JSZip from "jszip";
import { FtzParseError } from "./errors.js";

/**
 * Opens an .ftz (ZIP) archive and returns the decoded text of node.ftt.
 * The containing folder name inside the zip is export-specific (e.g. "FamilyTree(2)")
 * and must not be hard-coded — we locate node.ftt by filename anywhere in the archive.
 */
export async function extractNodeFtt(data: ArrayBuffer | Uint8Array): Promise<string> {
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

  const text = await entry.async("string");
  // Strip a leading UTF-8 BOM if present (node.ftt is exported with one).
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
