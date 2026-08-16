import { describe, expect, it } from "vitest";
import { DEFAULT_POSTER_STYLE } from "../src/poster/types.js";
import type { PersonPhoto } from "../src/models/types.js";

describe("person photo model + appearance defaults", () => {
  it("DEFAULT_POSTER_STYLE keeps compact defaults for backwards compatibility", () => {
    expect(DEFAULT_POSTER_STYLE.displayMode).toBe("compact");
    expect(DEFAULT_POSTER_STYLE.photoShape).toBe("rounded");
    expect(DEFAULT_POSTER_STYLE.showLivingIndicator).toBe(false);
  });

  it("PersonPhoto carries two sizes and optional alt", () => {
    const photo: PersonPhoto = { thumb: "data:image/webp;base64,AAA", print: "data:image/webp;base64,BBB" };
    expect(photo.thumb).toContain("webp");
    expect(photo.print).toContain("webp");
    expect(photo.alt).toBeUndefined();
  });
});
