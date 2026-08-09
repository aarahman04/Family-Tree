import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseFtzFile } from "../parser/index.js";
import { FtzParseError } from "../parser/errors.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

async function buildFtz(nodeFttContent: string | undefined, folder = "FamilyTree(1)"): Promise<Uint8Array> {
  const zip = new JSZip();
  if (nodeFttContent !== undefined) {
    zip.file(`${folder}/node.ftt`, nodeFttContent);
    zip.folder(`${folder}/face`);
  } else {
    zip.file(`${folder}/README.txt`, "no node.ftt here");
  }
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseFtzFile (archive layer)", () => {
  it("parses a valid .ftz archive end to end, locating node.ftt regardless of folder name", async () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "A" })],
      []
    );
    const bytes = await buildFtz(text, "WeirdFolderName(3)");
    const { tree } = await parseFtzFile(bytes, "test.ftz");
    expect(Object.keys(tree.persons)).toHaveLength(1);
    expect(tree.metadata.sourceFileName).toBe("test.ftz");
  });

  it("rejects an archive with no node.ftt, with a meaningful error", async () => {
    const bytes = await buildFtz(undefined);
    await expect(parseFtzFile(bytes)).rejects.toThrow(FtzParseError);
    await expect(parseFtzFile(bytes)).rejects.toThrow(/node\.ftt not found/);
  });

  it("rejects data that isn't a valid ZIP at all", async () => {
    const garbage = new TextEncoder().encode("this is definitely not a zip file");
    await expect(parseFtzFile(garbage)).rejects.toThrow(FtzParseError);
    await expect(parseFtzFile(garbage)).rejects.toThrow(/not a valid FTZ archive/);
  });

  it("rejects an empty (zero-byte) file", async () => {
    const empty = new Uint8Array(0);
    await expect(parseFtzFile(empty)).rejects.toThrow(FtzParseError);
  });

  it("rejects a corrupted zip (valid signature, truncated body)", async () => {
    const text = buildNodeFtt([personRow({ id: 1, name: "A" })], []);
    const bytes = await buildFtz(text);
    const truncated = bytes.slice(0, Math.floor(bytes.length / 2));
    await expect(parseFtzFile(truncated)).rejects.toThrow(FtzParseError);
  });

  it("rejects a node.ftt with an unrecognized header inside an otherwise-valid zip", async () => {
    const bytes = await buildFtz("garbage\theader\ttext\tfour\tfields");
    await expect(parseFtzFile(bytes)).rejects.toThrow(FtzParseError);
  });
});

describe("parseFtzFile — archive size guards", () => {
  it("rejects a whole archive over the compressed-size limit before ever attempting to open it as a zip", async () => {
    const { MAX_ARCHIVE_BYTES } = await import("../parser/zip.js");
    // Content doesn't matter -- the whole-archive check happens before JSZip.loadAsync is
    // ever called, purely on byteLength, so this doesn't need to be a real/valid zip at all.
    const oversized = new ArrayBuffer(MAX_ARCHIVE_BYTES + 1);
    await expect(parseFtzFile(oversized)).rejects.toThrow(/file too large/i);
  });

  it("rejects a node.ftt entry whose declared uncompressed size exceeds the per-entry limit, without decompressing it", async () => {
    const { MAX_ENTRY_UNCOMPRESSED_BYTES } = await import("../parser/zip.js");
    // A real (if mild) decompression-bomb-style fixture: highly repetitive content compresses
    // to almost nothing, so this zip is small and fast to build/hold in memory, while its
    // DECLARED uncompressed size genuinely exceeds the limit -- proving the guard reads the
    // zip's own declared size rather than needing to fully decompress first to notice.
    const zip = new JSZip();
    const bomb = "0".repeat(MAX_ENTRY_UNCOMPRESSED_BYTES + 1024);
    zip.file("FamilyTree(1)/node.ftt", bomb, { compression: "DEFLATE" });
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(parseFtzFile(bytes)).rejects.toThrow(/archive entry too large/i);
  }, 20000);

  it("does not reject a normal, real-scale archive", async () => {
    const text = buildNodeFtt([personRow({ id: 1, name: "A" })], []);
    const bytes = await buildFtz(text);
    const { tree } = await parseFtzFile(bytes, "normal.ftz");
    expect(Object.keys(tree.persons)).toHaveLength(1);
  });
});
