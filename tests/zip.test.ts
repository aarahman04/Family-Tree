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
