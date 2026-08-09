import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

describe("validation engine", () => {
  it("flags self-marriage", () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "Self" })],
      [familyRow({ id: 10, husband: 1, wife: 1 })]
    );
    const { validation } = parseNodeFtt(text);
    expect(validation.issues.some((i) => i.code === "SELF_MARRIAGE")).toBe(true);
    expect(validation.isValid).toBe(false);
  });

  it("flags self-parent", () => {
    // Person 1's own FAMC family (10) lists person 1 as the husband.
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "Weird", famc: 10 })],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    );
    const { validation } = parseNodeFtt(text);
    expect(validation.issues.some((i) => i.code === "SELF_PARENT")).toBe(true);
  });

  it("detects circular ancestry without hanging", () => {
    // Person 1's father chain: famc 10 -> husband 2; person 2's famc 20 -> husband 1 (cycle).
    const text = buildNodeFtt(
      [
        personRow({ id: 1, name: "A", famc: 10 }),
        personRow({ id: 2, name: "B", famc: 20 }),
      ],
      [familyRow({ id: 10, husband: 2 }), familyRow({ id: 20, husband: 1 })]
    );
    const start = Date.now();
    const { validation } = parseNodeFtt(text);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(validation.issues.some((i) => i.code === "CIRCULAR_ANCESTRY")).toBe(true);
  });

  it("flags gender/role mismatch as a warning, not an error", () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "A", gender: 2 }), personRow({ id: 2, name: "B", gender: 2 })],
      [familyRow({ id: 10, husband: 1, wife: 2 })] // husband recorded as gender 2 (female)
    );
    const { validation } = parseNodeFtt(text);
    const issue = validation.issues.find((i) => i.code === "GENDER_ROLE_MISMATCH");
    expect(issue?.severity).toBe("warning");
  });

  it("does not flag gender/role mismatch when gender is unknown", () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "A", gender: 0 }), personRow({ id: 2, name: "B", gender: 0 })],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    );
    const { validation } = parseNodeFtt(text);
    expect(validation.issues.some((i) => i.code === "GENDER_ROLE_MISMATCH")).toBe(false);
  });

  it("flags a family missing a parent (0 sentinel) as a warning, distinct from a broken reference (error)", () => {
    const text = buildNodeFtt(
      [personRow({ id: 1, name: "A" })],
      [familyRow({ id: 10, husband: 1, wife: 0 })]
    );
    const { validation } = parseNodeFtt(text);
    const missing = validation.issues.find((i) => i.code === "FAMILY_MISSING_PARENT");
    expect(missing?.severity).toBe("warning");
    expect(validation.issues.some((i) => i.code === "BROKEN_SPOUSE_REF")).toBe(false);
  });

  it("produces zero issues for a clean, simple tree", () => {
    const text = buildNodeFtt(
      [
        personRow({ id: 1, name: "Dad", gender: 1 }),
        personRow({ id: 2, name: "Mom", gender: 2 }),
        personRow({ id: 3, name: "Kid", famc: 10 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    );
    const { validation } = parseNodeFtt(text);
    expect(validation.issues).toHaveLength(0);
    expect(validation.isValid).toBe(true);
  });
});
