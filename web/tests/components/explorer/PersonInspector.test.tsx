import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { PersonInspector } from "../../../src/components/explorer/PersonInspector.js";
import { buildSearchIndex } from "../../../src/lib/search.js";
import { processImageFile } from "../../../src/lib/photo.js";
import { parseNodeFtt } from "../../../../src/parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "../../../../tests/helpers.js";
import type { FamilyTree } from "../../../../src/models/types.js";
import { analyzeTree } from "../../../../src/analysis/index.js";

// Mock only the canvas-dependent encoder; keep isAcceptedPhotoType (pure) real so the
// unsupported-type path exercises the actual predicate.
vi.mock("../../../src/lib/photo.js", async (importActual) => ({
  ...(await importActual<typeof import("../../../src/lib/photo.js")>()),
  processImageFile: vi.fn(),
}));

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

/** First-cousin marriage (CousinA×CousinB) plus their child, whose parents are cousins. */
function cousinTree(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Grandpa", gender: 1 }),
        personRow({ id: 2, name: "Grandma", gender: 2 }),
        personRow({ id: 3, name: "DadA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "DadB", famc: 10, gender: 1 }),
        personRow({ id: 5, name: "MomA", gender: 2 }),
        personRow({ id: 6, name: "CousinA", famc: 20, gender: 1 }),
        personRow({ id: 7, name: "MomB", gender: 2 }),
        personRow({ id: 8, name: "CousinB", famc: 30, gender: 2 }),
        personRow({ id: 9, name: "GrandchildAB", famc: 40 }),
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3, wife: 5 }),
        familyRow({ id: 30, husband: 4, wife: 7 }),
        familyRow({ id: 40, husband: 6, wife: 8 }),
      ]
    )
  ).tree;
}

function treeWithKidPhoto(): FamilyTree {
  const t = tree();
  const kid = idOf(t, "Kid");
  return {
    ...t,
    persons: {
      ...t.persons,
      [kid]: { ...t.persons[kid]!, photo: { thumb: "data:image/webp;base64,TT", alt: "A face" } },
    },
  };
}

/**
 * Renders the inspector with real state so a dispatched `onEdit` actually re-renders the panel
 * (the plain-`vi.fn` renders above can't show post-edit UI like the photo preview). `onEditSpy`
 * observes each mutate for call-timing/argument assertions.
 */
function Host({
  initial,
  personId,
  onEditSpy,
}: {
  initial: FamilyTree;
  personId: string;
  onEditSpy?: (mutate: (t: FamilyTree) => FamilyTree) => void;
}) {
  const [t, setT] = useState(initial);
  return (
    <PersonInspector
      tree={t}
      personId={personId}
      searchIndex={buildSearchIndex(t)}
      onNavigate={vi.fn()}
      onEdit={(mutate) => {
        onEditSpy?.(mutate);
        setT((cur) => mutate(cur));
      }}
      onClose={vi.fn()}
    />
  );
}

describe("PersonInspector", () => {
  beforeEach(() => {
    vi.mocked(processImageFile).mockReset();
  });

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

  it("dispatches the photo only after encoding resolves, showing a busy state meanwhile", async () => {
    let resolveEncode!: (photo: { thumb: string; print: string }) => void;
    vi.mocked(processImageFile).mockImplementation(
      () => new Promise((res) => (resolveEncode = res))
    );
    const t = tree();
    const kid = idOf(t, "Kid");
    const onEditSpy = vi.fn();
    render(<Host initial={t} personId={kid} onEditSpy={onEditSpy} />);

    const input = screen.getByLabelText(/upload photo/i);
    await userEvent.upload(input, new File(["x"], "a.png", { type: "image/png" }));

    // Encode in flight: nothing written to the tree yet, and the control reflects it.
    expect(onEditSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/processing image/i)).toBeInTheDocument();
    expect(input).toBeDisabled();

    await act(async () => {
      resolveEncode({ thumb: "data:image/webp;base64,TT", print: "data:image/webp;base64,PP" });
    });

    // Now — and only now — the edit is dispatched and the preview appears.
    expect(await screen.findByRole("img", { name: /photo of kid/i })).toBeInTheDocument();
    expect(onEditSpy).toHaveBeenCalledOnce();
    const photo = onEditSpy.mock.calls[0]![0](t).persons[kid]!.photo;
    expect(photo).toEqual({
      thumb: "data:image/webp;base64,TT",
      print: "data:image/webp;base64,PP",
    });
  });

  it("rejects an unsupported file type (drag-and-drop) without dispatching", async () => {
    const t = tree();
    const kid = idOf(t, "Kid");
    const onEditSpy = vi.fn();
    render(<Host initial={t} personId={kid} onEditSpy={onEditSpy} />);

    const section = screen.getByRole("heading", { name: "Photo" }).closest("section")!;
    fireEvent.drop(section, {
      dataTransfer: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/png, jpeg, or webp/i);
    expect(onEditSpy).not.toHaveBeenCalled();
    expect(processImageFile).not.toHaveBeenCalled();
  });

  it("surfaces an error and does not dispatch when decoding fails", async () => {
    vi.mocked(processImageFile).mockRejectedValueOnce(new Error("Image encoding failed"));
    const t = tree();
    const kid = idOf(t, "Kid");
    const onEditSpy = vi.fn();
    render(<Host initial={t} personId={kid} onEditSpy={onEditSpy} />);

    await userEvent.upload(
      screen.getByLabelText(/upload photo/i),
      new File(["x"], "a.png", { type: "image/png" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/image encoding failed/i);
    expect(onEditSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/processing image/i)).not.toBeInTheDocument();
  });

  it("removes an existing photo and restores focus to the upload control", async () => {
    const t = treeWithKidPhoto();
    const kid = idOf(t, "Kid");
    const onEditSpy = vi.fn();
    render(<Host initial={t} personId={kid} onEditSpy={onEditSpy} />);

    // The stored alt is used for the preview.
    expect(screen.getByRole("img", { name: "A face" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove photo/i }));

    expect(onEditSpy).toHaveBeenCalledOnce();
    expect(onEditSpy.mock.calls[0]![0](t).persons[kid]!.photo).toBeUndefined();
    // Placeholder replaces the preview, and focus lands on the (still-mounted) upload input
    // rather than being lost to <body>.
    expect(screen.getByRole("img", { name: /no photo/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload photo/i)).toHaveFocus();
  });

  it("the upload control is keyboard-focusable", () => {
    const t = tree();
    const kid = idOf(t, "Kid");
    render(<Host initial={t} personId={kid} />);
    const input = screen.getByLabelText(/upload photo/i);
    input.focus();
    expect(input).toHaveFocus();
  });

  it("shows the marriage's cousin classification and confidence when analysis is supplied", () => {
    const t = cousinTree();
    const cousinA = idOf(t, "CousinA");
    render(
      <PersonInspector
        tree={t}
        personId={cousinA}
        searchIndex={buildSearchIndex(t)}
        analysis={analyzeTree(t)}
        onNavigate={vi.fn()}
        onEdit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/cousinb: first cousins/i)).toBeInTheDocument();
    expect(screen.getByText(/common ancestor:/i)).toBeInTheDocument();
    expect(screen.getByText("likely")).toBeInTheDocument();
    // Inline badge near the heading.
    expect(screen.getByText("First cousins")).toBeInTheDocument();
  });

  it("shows the parents-related summary, badge, and chain depth for a cousin marriage's child", () => {
    const t = cousinTree();
    const child = idOf(t, "GrandchildAB");
    render(
      <PersonInspector
        tree={t}
        personId={child}
        searchIndex={buildSearchIndex(t)}
        analysis={analyzeTree(t)}
        onNavigate={vi.fn()}
        onEdit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/parents: first cousins/i)).toBeInTheDocument();
    expect(screen.getByText("Parents Related")).toBeInTheDocument();
    expect(screen.getByText(/chain: 1 generation deep/i)).toBeInTheDocument();
  });

  it("omits the relationship-intelligence section when no analysis is supplied", () => {
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
    expect(screen.queryByText(/relationship intelligence/i)).not.toBeInTheDocument();
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
