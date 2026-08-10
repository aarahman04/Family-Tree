import { describe, expect, it } from "vitest";
import { routeHref } from "../src/router.js";

describe("router", () => {
  it("builds the editor href", () => {
    expect(routeHref("editor")).toBe("#/editor");
  });
});
