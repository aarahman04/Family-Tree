import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// A connected grandparent -> parent -> child chain, so the child's grandparent is a
// non-relative that still appears in the (single connected component) layout.
const tree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: {
    gpa: P("gpa", { name: "Grand", gender: "male", famsIds: ["f1"] }),
    dad: P("dad", { name: "Dad", gender: "male", famcId: "f1", famsIds: ["f2"] }),
    kid: P("kid", { name: "Kid", gender: "female", famcId: "f2" }),
  } as Record<UUID, Person>,
  families: {
    f1: { id: "f1", husbandId: "gpa", childrenIds: ["dad"] },
    f2: { id: "f2", husbandId: "dad", childrenIds: ["kid"] },
  } as Record<UUID, Family>,
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

  it("focus mode dims people outside the selected person's immediate family", async () => {
    render(<EditorCanvas tree={tree} selectedPersonId="kid" onSelectPerson={vi.fn()} />);
    expect(screen.queryAllByTestId("focus-dim")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /focus mode/i }));
    // Focusing "kid" keeps kid + dad opaque and dims the grandparent.
    expect(screen.getAllByTestId("focus-dim").length).toBeGreaterThan(0);
  });
});
