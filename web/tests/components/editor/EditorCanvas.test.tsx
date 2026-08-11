import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Family, FamilyTree, Person, UUID } from "../../../../models/types.js";
import { EditorCanvas } from "../../../src/components/editor/EditorCanvas.js";
import { DEFAULT_APPEARANCE_PREFS } from "../../../src/lib/appearancePrefs.js";

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
    const { container } = render(
      <EditorCanvas tree={tree} appearance={DEFAULT_APPEARANCE_PREFS} onSelectPerson={vi.fn()} />
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: /fit to view/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
  });

  it("shows an empty state for a tree with no people", () => {
    const empty: FamilyTree = { ...tree, persons: {}, families: {} };
    render(<EditorCanvas tree={empty} appearance={DEFAULT_APPEARANCE_PREFS} onSelectPerson={vi.fn()} />);
    expect(screen.getByText(/no people yet/i)).toBeInTheDocument();
  });

  it("renders an <image> for a person with a photo in photoCards mode", () => {
    const withPhoto: FamilyTree = {
      ...tree,
      persons: {
        ...tree.persons,
        kid: P("kid", {
          name: "Kid",
          gender: "female",
          famcId: "f2",
          photo: { thumb: "data:image/webp;base64,ZZ", print: "data:image/webp;base64,PP" },
        }),
      } as Record<UUID, Person>,
    };
    const { container } = render(
      <EditorCanvas
        tree={withPhoto}
        appearance={{ displayMode: "photoCards", photoShape: "rounded", showLivingIndicator: false }}
        onSelectPerson={vi.fn()}
      />
    );
    expect(container.querySelector("image")).not.toBeNull();
  });

  it("auto-shows a larger preview for the focused person if they have a photo", () => {
    const withPhoto: FamilyTree = {
      ...tree,
      persons: {
        ...tree.persons,
        kid: P("kid", {
          name: "Kid",
          gender: "female",
          famcId: "f2",
          photo: { thumb: "data:image/webp;base64,ZZ", print: "data:image/webp;base64,PP" },
        }),
      } as Record<UUID, Person>,
    };
    render(
      <EditorCanvas
        tree={withPhoto}
        appearance={DEFAULT_APPEARANCE_PREFS}
        onSelectPerson={vi.fn()}
        focusPersonId="kid"
      />
    );
    expect(screen.getByRole("img", { name: /photo of kid/i })).toBeInTheDocument();
  });

  it("focus mode dims people outside the selected person's immediate family", async () => {
    render(
      <EditorCanvas tree={tree} appearance={DEFAULT_APPEARANCE_PREFS} selectedPersonId="kid" onSelectPerson={vi.fn()} />
    );
    expect(screen.queryAllByTestId("focus-dim")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /focus mode/i }));
    // Focusing "kid" keeps kid + dad opaque and dims the grandparent.
    expect(screen.getAllByTestId("focus-dim").length).toBeGreaterThan(0);
  });
});
