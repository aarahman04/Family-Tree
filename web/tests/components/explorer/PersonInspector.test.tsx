import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonInspector } from "../../../src/components/explorer/PersonInspector.js";
import { buildSearchIndex } from "../../../src/lib/search.js";
import { parseNodeFtt } from "../../../../parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";
import type { FamilyTree } from "../../../../models/types.js";

function tree(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Dad", gender: 1 }),
        personRow({ id: 2, name: "Mom", gender: 2 }),
        personRow({ id: 3, name: "Kid", famc: 10, note: "Loves painting" }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    )
  ).tree;
}

function idOf(t: FamilyTree, name: string): string {
  return Object.values(t.persons).find((p) => p.name === name)!.id;
}

describe("PersonInspector", () => {
  it("shows name, IDs, parents, and notes", () => {
    const t = tree();
    const kid = idOf(t, "Kid");
    render(
      <PersonInspector
        tree={t}
        personId={kid}
        searchIndex={buildSearchIndex(t)}
        onNavigate={vi.fn()}
        onEdit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Kid" })).toBeInTheDocument();
    expect(screen.getByText(t.persons[kid]!.id)).toBeInTheDocument();
    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(screen.getByText("Mom")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Loves painting")).toBeInTheDocument();
  });

  it("calls onNavigate when clicking a parent's name", async () => {
    const t = tree();
    const kid = idOf(t, "Kid");
    const dad = idOf(t, "Dad");
    const onNavigate = vi.fn();
    render(
      <PersonInspector
        tree={t}
        personId={kid}
        searchIndex={buildSearchIndex(t)}
        onNavigate={onNavigate}
        onEdit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText("Dad"));
    expect(onNavigate).toHaveBeenCalledWith(dad);
  });

  it("calls onEdit with an updatePersonFields mutation when saving the form", async () => {
    const t = tree();
    const kid = idOf(t, "Kid");
    const onEdit = vi.fn();
    render(
      <PersonInspector
        tree={t}
        personId={kid}
        searchIndex={buildSearchIndex(t)}
        onNavigate={vi.fn()}
        onEdit={onEdit}
        onClose={vi.fn()}
      />
    );
    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Kiddo");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onEdit).toHaveBeenCalledOnce();
    const mutate = onEdit.mock.calls[0]![0] as (t: FamilyTree) => FamilyTree;
    const result = mutate(t);
    expect(result.persons[kid]!.name).toBe("Kiddo");
  });

  it("opens the spouse picker and calls onEdit with addSpouse when a create-new is chosen", async () => {
    const t = tree();
    const dad = idOf(t, "Dad");
    const onEdit = vi.fn();
    render(
      <PersonInspector
        tree={t}
        personId={dad}
        searchIndex={buildSearchIndex(t)}
        onNavigate={vi.fn()}
        onEdit={onEdit}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /add spouse/i }));
    const searchInput = screen.getByPlaceholderText(/search by name or id/i);
    await userEvent.type(searchInput, "Second Wife");
    await userEvent.click(screen.getByRole("button", { name: /create new person/i }));

    expect(onEdit).toHaveBeenCalledOnce();
    const mutate = onEdit.mock.calls[0]![0] as (t: FamilyTree) => FamilyTree;
    const result = mutate(t);
    const newPerson = Object.values(result.persons).find((p) => p.name === "Second Wife");
    expect(newPerson).toBeDefined();
    expect(newPerson!.famsIds.length).toBeGreaterThan(0);
  });

  it("removing a spouse calls onEdit with removeSpouse", async () => {
    const t = tree();
    const dad = idOf(t, "Dad");
    const mom = idOf(t, "Mom");
    const onEdit = vi.fn();
    render(
      <PersonInspector
        tree={t}
        personId={dad}
        searchIndex={buildSearchIndex(t)}
        onNavigate={vi.fn()}
        onEdit={onEdit}
        onClose={vi.fn()}
      />
    );
    const spousesSection = screen.getByText("Spouses").closest("section")!;
    await userEvent.click(within(spousesSection).getByRole("button", { name: /remove/i }));
    expect(onEdit).toHaveBeenCalledOnce();
    const mutate = onEdit.mock.calls[0]![0] as (t: FamilyTree) => FamilyTree;
    const result = mutate(t);
    // Removing Mom from Dad's inspector unlinks only Mom — Dad (the person whose
    // inspector this is) stays recorded as the remaining parent in the family.
    expect(result.persons[dad]!.famsIds).toHaveLength(1);
    expect(result.persons[mom]!.famsIds).toHaveLength(0);
  });

  it("shows validation warnings related to this person", () => {
    const broken = parseNodeFtt(
      buildNodeFtt(
        [personRow({ id: 1, name: "Self" })],
        [familyRow({ id: 10, husband: 1, wife: 1 })]
      )
    ).tree;
    const self = idOf(broken, "Self");
    render(
      <PersonInspector
        tree={broken}
        personId={self}
        searchIndex={buildSearchIndex(broken)}
        onNavigate={vi.fn()}
        onEdit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/validation warnings for this person/i)).toBeInTheDocument();
  });
});
