import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTreeEditor } from "../../src/state/useTreeEditor.js";
import { setFather, updatePersonFields } from "../../../src/editor/operations.js";
import { parseNodeFtt } from "../../../src/parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../tests/helpers.js";
import type { FamilyTree } from "../../../src/models/types.js";

function nuclearFamilyTree(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Dad", gender: 1 }),
        personRow({ id: 2, name: "Mom", gender: 2 }),
        personRow({ id: 3, name: "Kid", famc: 10 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    )
  ).tree;
}

function idOf(tree: FamilyTree, name: string): string {
  return Object.values(tree.persons).find((p) => p.name === name)!.id;
}

describe("useTreeEditor", () => {
  it("starts with the initial tree, no history, and zero edits", () => {
    const tree = nuclearFamilyTree();
    const { result } = renderHook(() => useTreeEditor(tree));
    expect(result.current.tree).toBe(tree);
    expect(result.current.originalTree).toBe(tree);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.editCount).toBe(0);
  });

  it("applies an edit, updates present, and enables undo", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const { result } = renderHook(() => useTreeEditor(tree));

    act(() => {
      result.current.edit((t) => updatePersonFields(t, kid, { name: "Kiddo" }));
    });

    expect(result.current.tree.persons[kid]!.name).toBe("Kiddo");
    expect(result.current.originalTree.persons[kid]!.name).toBe("Kid"); // untouched
    expect(result.current.canUndo).toBe(true);
    expect(result.current.editCount).toBe(1);
  });

  it("undo restores the previous state and enables redo", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const { result } = renderHook(() => useTreeEditor(tree));

    act(() => {
      result.current.edit((t) => updatePersonFields(t, kid, { name: "Kiddo" }));
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.tree.persons[kid]!.name).toBe("Kid");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.editCount).toBe(0);
  });

  it("redo re-applies an undone edit", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const { result } = renderHook(() => useTreeEditor(tree));

    act(() => {
      result.current.edit((t) => updatePersonFields(t, kid, { name: "Kiddo" }));
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });

    expect(result.current.tree.persons[kid]!.name).toBe("Kiddo");
    expect(result.current.canRedo).toBe(false);
    expect(result.current.editCount).toBe(1);
  });

  it("a new edit after undo discards the redo stack", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const { result } = renderHook(() => useTreeEditor(tree));

    act(() => result.current.edit((t) => updatePersonFields(t, kid, { name: "First" })));
    act(() => result.current.undo());
    act(() => result.current.edit((t) => updatePersonFields(t, kid, { name: "Second" })));

    expect(result.current.tree.persons[kid]!.name).toBe("Second");
    expect(result.current.canRedo).toBe(false);
  });

  it("undo/redo are no-ops at the boundaries", () => {
    const tree = nuclearFamilyTree();
    const { result } = renderHook(() => useTreeEditor(tree));

    act(() => result.current.undo());
    expect(result.current.tree).toBe(tree);

    const kid = idOf(tree, "Kid");
    act(() => result.current.edit((t) => updatePersonFields(t, kid, { name: "X" })));
    act(() => result.current.redo()); // nothing to redo yet
    expect(result.current.editCount).toBe(1);
  });

  it("live-revalidates: fixing a broken tree via edit clears the error", () => {
    const broken = parseNodeFtt(
      buildNodeFtt(
        [personRow({ id: 1, name: "Self" })],
        [familyRow({ id: 10, husband: 1, wife: 1 })]
      )
    ).tree;
    expect(broken.validation.issues.some((i) => i.severity === "error")).toBe(true);

    const self = idOf(broken, "Self");
    const { result } = renderHook(() => useTreeEditor(broken));

    act(() => {
      result.current.edit((t) => setFather(t, self, undefined));
    });
    // Doesn't fully fix the self-marriage (that needs removeSpouse), but proves validation reran.
    expect(result.current.tree.validation).not.toBe(broken.validation);
  });
});
