import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Family, FamilyTree, Person, UUID } from "../../../../models/types.js";
import { EditorCanvas } from "../../../src/components/editor/EditorCanvas.js";

const P = (id: string, o: Partial<Person> = {}): Person => ({
  id,
  name: id,
  gender: "unknown",
  notes: [],
  media: [],
  famsIds: [],
  ...o,
});

const tree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: {
    a: P("a", { name: "Ada", gender: "female" }),
    b: P("b", { name: "Ben", gender: "male" }),
  } as Record<UUID, Person>,
  families: {} as Record<UUID, Family>,
  validation: { validatedAt: "", issues: [], isValid: true },
};

describe("EditorCanvas", () => {
  it("renders the poster svg and zoom controls", () => {
    const { container } = render(<EditorCanvas tree={tree} onSelectPerson={vi.fn()} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: /fit to view/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
  });

  it("shows an empty state for a tree with no people", () => {
    const empty: FamilyTree = { ...tree, persons: {}, families: {} };
    render(<EditorCanvas tree={empty} onSelectPerson={vi.fn()} />);
    expect(screen.getByText(/no people to display/i)).toBeInTheDocument();
  });
});
