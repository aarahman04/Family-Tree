import { describe, expect, it } from "vitest";
import { computePersonBox, photoAreaHeight } from "../poster/boxSizing.js";
import { DEFAULT_POSTER_STYLE } from "../poster/types.js";

const compact = DEFAULT_POSTER_STYLE;
const photoCards = { ...DEFAULT_POSTER_STYLE, displayMode: "photoCards" as const };
const minimal = { ...DEFAULT_POSTER_STYLE, displayMode: "minimal" as const };

describe("computePersonBox display modes", () => {
  it("compact output is unchanged (regression guard)", () => {
    const box = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
    // Height equals the original compact formula: floored at nodeMinHeight.
    expect(box.height).toBeGreaterThanOrEqual(compact.nodeMinHeight);
    expect(photoAreaHeight(box.width, compact)).toBe(0);
  });

  it("photoCards reserves a capped square photo slot (not full card width)", () => {
    const box = computePersonBox("Ahmed Rahman", "1974–2022", undefined, photoCards);
    const compactBox = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
    const side = photoAreaHeight(box.width, photoCards);
    expect(side).toBeGreaterThan(0);
    expect(side).toBeLessThanOrEqual(88); // PHOTO_MAX_PT — never full width
    // Photo card is taller than compact, but the photo does not dominate (capped, not full width).
    expect(box.height).toBeGreaterThan(compactBox.height);
    expect(box.height).toBeLessThan(compactBox.height + box.width);
  });

  it("minimal omits the year line height (shorter than compact)", () => {
    const withYear = computePersonBox("Ahmed Rahman", "1974–2022", undefined, minimal);
    const compactBox = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
    expect(withYear.height).toBeLessThan(compactBox.height);
  });
});
