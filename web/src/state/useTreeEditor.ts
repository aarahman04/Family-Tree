import { useCallback, useReducer } from "react";
import type { FamilyTree } from "../../../models/types.js";
import { applyEdit } from "../../../editor/index.js";

interface EditorState {
  originalTree: FamilyTree; // never mutated — proves "the original uploaded data remains unchanged"
  past: FamilyTree[];
  present: FamilyTree;
  future: FamilyTree[];
  editCount: number;
}

type Action =
  { type: "EDIT"; mutate: (tree: FamilyTree) => FamilyTree } | { type: "UNDO" } | { type: "REDO" };

/** Bounds memory use — undo/redo keeps full tree snapshots (simple and always-correct; see docs/explorer-architecture.md for why this beats an inverse-operation approach at this scale). */
const MAX_HISTORY = 50;

function initState(tree: FamilyTree): EditorState {
  return { originalTree: tree, past: [], present: tree, future: [], editCount: 0 };
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "EDIT": {
      const next = applyEdit(state.present, action.mutate);
      const past = [...state.past, state.present].slice(-MAX_HISTORY);
      return { ...state, past, present: next, future: [], editCount: state.editCount + 1 };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1]!;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        editCount: Math.max(0, state.editCount - 1),
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0]!;
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        editCount: state.editCount + 1,
      };
    }
    default:
      return state;
  }
}

/**
 * Undo/redo-capable editing session for one FamilyTree. `mutate` functions always come
 * from editor/operations.ts — this hook only sequences them through applyEdit()
 * (which revalidates via the existing validation engine) and keeps history. It contains
 * no editing logic of its own. Callers should mount a fresh instance per uploaded file
 * (e.g. via a `key` on the component using this hook) rather than reusing one across files.
 */
export function useTreeEditor(initialTree: FamilyTree) {
  const [state, dispatch] = useReducer(reducer, initialTree, initState);

  const edit = useCallback((mutate: (tree: FamilyTree) => FamilyTree) => {
    dispatch({ type: "EDIT", mutate });
  }, []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  return {
    tree: state.present,
    originalTree: state.originalTree,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    editCount: state.editCount,
    edit,
    undo,
    redo,
  };
}
