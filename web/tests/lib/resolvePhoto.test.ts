import { describe, expect, it } from "vitest";
import { buildPhotoMap, photoAlt, resolvePhoto } from "../../src/lib/resolvePhoto.js";
import type { FamilyTree, Person } from "../../../src/models/types.js";

const withPhoto: Person = {
  id: "p1",
  name: "Ann",
  gender: "female",
  notes: [],
  media: [],
  famsIds: [],
  photo: { thumb: "T", print: "P" },
};
const noPhoto: Person = { id: "p2", name: "Bo", gender: "male", notes: [], media: [], famsIds: [] };

describe("resolvePhoto", () => {
  it("selects thumb vs print", () => {
    expect(resolvePhoto(withPhoto, "thumb")).toBe("T");
    expect(resolvePhoto(withPhoto, "print")).toBe("P");
    expect(resolvePhoto(noPhoto, "thumb")).toBeUndefined();
  });
  it("derives alt text from the name", () => {
    expect(photoAlt(withPhoto)).toBe("Photo of Ann");
  });
  it("buildPhotoMap includes only people with photos", () => {
    const tree = {
      metadata: { sourceFormat: "manual", importedAt: "t" },
      persons: { p1: withPhoto, p2: noPhoto },
      families: {},
      validation: { validatedAt: "t", issues: [], isValid: true },
    } as unknown as FamilyTree;
    const map = buildPhotoMap(tree, "thumb");
    expect(map.get("p1")).toBe("T");
    expect(map.has("p2")).toBe(false);
  });
  it("returns undefined for print when only thumb is present (reloaded, thumb-only persisted)", () => {
    const thumbOnly: Person = {
      id: "p3",
      name: "Cy",
      gender: "male",
      notes: [],
      media: [],
      famsIds: [],
      photo: { thumb: "T" }, // no print — never silently falls back to thumb
    };
    expect(resolvePhoto(thumbOnly, "print")).toBeUndefined();
    expect(resolvePhoto(thumbOnly, "thumb")).toBe("T");
    const tree = {
      metadata: { sourceFormat: "manual", importedAt: "t" },
      persons: { p3: thumbOnly },
      families: {},
      validation: { validatedAt: "t", issues: [], isValid: true },
    } as unknown as FamilyTree;
    expect(buildPhotoMap(tree, "print").has("p3")).toBe(false);
    expect(buildPhotoMap(tree, "thumb").get("p3")).toBe("T");
  });
});
