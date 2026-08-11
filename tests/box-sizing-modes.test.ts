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

  it("photoAreaHeight is capped and clamped to a non-negative value at the boundary", () => {
    expect(photoAreaHeight(104, photoCards)).toBe(88);
    expect(photoAreaHeight(103, photoCards)).toBe(87);
    expect(photoAreaHeight(10, photoCards)).toBe(0); // clamp: would otherwise go negative
  });

  it("dropping the year line changes height by exactly one year-line's worth (no floor binding)", () => {
    const name = "Alexander Maximilian Featherstonehaugh Wetherby";
    const c = computePersonBox(name, "1974–2022", undefined, compact);
    const m = computePersonBox(name, "1974–2022", undefined, minimal);
    expect(c.lines.length).toBeGreaterThanOrEqual(2); // guard: floors don't bind
    expect(c.height - m.height).toBeCloseTo(DEFAULT_POSTER_STYLE.yearFontSize * 1.25, 5);
  });

  it("compact box dimensions are pinned (characterization guard)", () => {
    const box = computePersonBox("Ahmed Rahman", "1974–2022", undefined, compact);
    // Values captured from the current heuristic measurer — DO NOT recompute to match a
    // change; a diff here means compact geometry moved and must be justified.
    // NOTE: this case is floor-bound (width hits nodeMinWidth=100, height hits
    // nodeMinHeight=40), so it only pins the floor constants, not the measurer's line
    // geometry -- see the case below for that.
    expect(box.width).toBeCloseTo(100, 3);
    expect(box.height).toBeCloseTo(40, 3);
  });

  it("compact box dimensions are pinned for a name that exceeds both floors (characterization guard)", () => {
    const name = "Alexander Maximilian Featherstonehaugh Wetherby";
    const box = computePersonBox(name, "1974–2022", undefined, compact);
    // Width (165.42) and height (50.125) both clear nodeMinWidth/nodeMinHeight, so unlike the
    // floor-bound case above, this pins the heuristic measurer's actual line-width/line-height
    // math -- a regression there that stays under the floors would slip past the other test.
    expect(box.width).toBeCloseTo(165.42, 3);
    expect(box.height).toBeCloseTo(50.125, 3);
  });
});
