import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FamilyTree } from "../../../src/models/types.js";
import { useTreeAnalysis } from "../../src/hooks/useTreeAnalysis.js";

function emptyTree(): FamilyTree {
  return {
    metadata: { sourceFormat: "manual", importedAt: "2026-01-01T00:00:00Z" },
    persons: {},
    families: {},
    validation: { validatedAt: "2026-01-01T00:00:00Z", issues: [], isValid: true },
  };
}

describe("useTreeAnalysis", () => {
  it("recomputes only when the tree identity changes", () => {
    const t = emptyTree();
    const { result, rerender } = renderHook(({ tree }) => useTreeAnalysis(tree), {
      initialProps: { tree: t },
    });
    const first = result.current;
    expect(first.summary.totalMarriages).toBe(0);

    rerender({ tree: t }); // same identity → memoized
    expect(result.current).toBe(first);

    rerender({ tree: emptyTree() }); // new identity → recomputed
    expect(result.current).not.toBe(first);
  });
});
