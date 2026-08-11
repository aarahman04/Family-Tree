import { describe, expect, it } from "vitest";
import { computeSquareCrop, isAcceptedPhotoType, processImageFile } from "../../src/lib/photo.js";

describe("computeSquareCrop", () => {
  it("center-crops a landscape image to the shorter side", () => {
    expect(computeSquareCrop(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });
  it("center-crops a portrait image", () => {
    expect(computeSquareCrop(100, 200)).toEqual({ sx: 0, sy: 50, size: 100 });
  });
  it("returns the whole frame for an already-square image", () => {
    expect(computeSquareCrop(120, 120)).toEqual({ sx: 0, sy: 0, size: 120 });
  });
  it("centers on a provided face box, clamped within bounds", () => {
    // Face near the top; crop should shift up but never below y=0.
    const c = computeSquareCrop(200, 200, { x: 80, y: 5, width: 40, height: 40 });
    expect(c.size).toBe(200);
    expect(c.sy).toBe(0);
  });
});

describe("isAcceptedPhotoType", () => {
  it("accepts png/jpeg/webp and rejects others", () => {
    expect(isAcceptedPhotoType("image/png")).toBe(true);
    expect(isAcceptedPhotoType("image/jpeg")).toBe(true);
    expect(isAcceptedPhotoType("image/webp")).toBe(true);
    expect(isAcceptedPhotoType("image/gif")).toBe(false);
    expect(isAcceptedPhotoType("application/pdf")).toBe(false);
  });
});

describe("processImageFile validation", () => {
  it("rejects an unsupported type before any canvas work", async () => {
    const file = new File(["x"], "a.gif", { type: "image/gif" });
    await expect(processImageFile(file)).rejects.toThrow(/unsupported/i);
  });

  it("rejects a corrupt/undecodable image (caller falls back to placeholder)", async () => {
    // jsdom has no createImageBitmap; stub it to reject, simulating a corrupt file.
    const g = globalThis as unknown as { createImageBitmap?: unknown };
    const prev = g.createImageBitmap;
    g.createImageBitmap = () => Promise.reject(new Error("decode failed"));
    try {
      const file = new File(["not-a-real-png"], "a.png", { type: "image/png" });
      await expect(processImageFile(file)).rejects.toThrow();
    } finally {
      g.createImageBitmap = prev;
    }
  });
});
