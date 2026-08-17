import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Family, FamilyTree, Person, UUID } from "../../../../src/models/types.js";
import { analyzeTree } from "../../../../src/analysis/index.js";
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

// gpa/gma -> dadA/dadB (siblings) -> cousinA x cousinB, a first-cousin marriage, for the CP2.9
// ancestry-highlight overlay.
const cousinTree: FamilyTree = {
  metadata: { sourceFormat: "manual", importedAt: "" },
  persons: {
    gpa: P("gpa", { name: "Gpa", gender: "male", famsIds: ["f1"] }),
    gma: P("gma", { name: "Gma", gender: "female", famsIds: ["f1"] }),
    dadA: P("dadA", { name: "DadA", gender: "male", famcId: "f1", famsIds: ["f2"] }),
    dadB: P("dadB", { name: "DadB", gender: "male", famcId: "f1", famsIds: ["f3"] }),
    momA: P("momA", { name: "MomA", gender: "female", famsIds: ["f2"] }),
    cousinA: P("cousinA", {
      name: "CousinA",
      gender: "male",
      famcId: "f2",
      famsIds: ["f4"],
    }),
    momB: P("momB", { name: "MomB", gender: "female", famsIds: ["f3"] }),
    cousinB: P("cousinB", {
      name: "CousinB",
      gender: "female",
      famcId: "f3",
      famsIds: ["f4"],
    }),
  } as Record<UUID, Person>,
  families: {
    f1: { id: "f1", husbandId: "gpa", wifeId: "gma", childrenIds: ["dadA", "dadB"] },
    f2: { id: "f2", husbandId: "dadA", wifeId: "momA", childrenIds: ["cousinA"] },
    f3: { id: "f3", husbandId: "dadB", wifeId: "momB", childrenIds: ["cousinB"] },
    f4: { id: "f4", husbandId: "cousinA", wifeId: "cousinB", childrenIds: [] },
  } as Record<UUID, Family>,
  validation: { validatedAt: "", issues: [], isValid: true },
};

// jsdom has no PointerEvent, so fireEvent.pointerX drops clientX/pointerId. Dispatch a MouseEvent
// typed as a pointer event with pointerId attached — React reads clientX/pointerId off the native
// event, which is all the canvas handlers need.
function firePointer(
  el: HTMLElement,
  type: "down" | "move" | "up",
  o: { pointerId: number; clientX: number; clientY: number }
) {
  const ev = new MouseEvent(`pointer${type}`, {
    bubbles: true,
    cancelable: true,
    clientX: o.clientX,
    clientY: o.clientY,
  });
  Object.defineProperty(ev, "pointerId", { value: o.pointerId, configurable: true });
  Object.defineProperty(ev, "pointerType", { value: "touch", configurable: true });
  // act() flushes the handler's setState so the transform is committed before we read it back.
  act(() => {
    el.dispatchEvent(ev);
  });
}

/** The transform scale currently applied to the canvas's content layer. */
function scaleOf(viewport: HTMLElement): number {
  const layer = viewport.querySelector(":scope > div") as HTMLElement;
  const m = /scale\(([-\d.]+)\)/.exec(layer.style.transform);
  return m ? parseFloat(m[1]!) : NaN;
}

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
    render(
      <EditorCanvas tree={empty} appearance={DEFAULT_APPEARANCE_PREFS} onSelectPerson={vi.fn()} />
    );
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
        appearance={{
          displayMode: "photoCards",
          photoShape: "rounded",
          showLivingIndicator: false,
        }}
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

  // Regression guard for the touch "fluctuation": before the fix, two fingers panned off a single
  // shared drag ref and never changed the scale. A pinch must now change scale, monotonically with
  // the finger distance, so the view zooms instead of oscillating.
  it("pinches to zoom: two fingers spreading zoom in, pinching together zoom out", () => {
    render(
      <EditorCanvas tree={tree} appearance={DEFAULT_APPEARANCE_PREFS} onSelectPerson={vi.fn()} />
    );
    const viewport = screen.getByRole("application");
    const start = scaleOf(viewport);

    // Two fingers 200px apart, then spread to 300px apart -> zoom in.
    firePointer(viewport, "down", { pointerId: 1, clientX: 500, clientY: 400 });
    firePointer(viewport, "down", { pointerId: 2, clientX: 700, clientY: 400 });
    firePointer(viewport, "move", { pointerId: 1, clientX: 450, clientY: 400 });
    firePointer(viewport, "move", { pointerId: 2, clientX: 750, clientY: 400 });
    const zoomedIn = scaleOf(viewport);
    expect(zoomedIn).toBeGreaterThan(start);

    // Draw them back together, much closer than the start -> zoom out below the start scale.
    firePointer(viewport, "move", { pointerId: 1, clientX: 590, clientY: 400 });
    firePointer(viewport, "move", { pointerId: 2, clientX: 610, clientY: 400 });
    const zoomedOut = scaleOf(viewport);
    expect(zoomedOut).toBeLessThan(zoomedIn);
    expect(zoomedOut).toBeLessThan(start);

    firePointer(viewport, "up", { pointerId: 1, clientX: 590, clientY: 400 });
    firePointer(viewport, "up", { pointerId: 2, clientX: 610, clientY: 400 });
  });

  it("still treats a single tap (press that doesn't move) as a select", () => {
    const onSelect = vi.fn();
    render(
      <EditorCanvas tree={tree} appearance={DEFAULT_APPEARANCE_PREFS} onSelectPerson={onSelect} />
    );
    const viewport = screen.getByRole("application");
    firePointer(viewport, "down", { pointerId: 1, clientX: 12, clientY: 12 });
    firePointer(viewport, "up", { pointerId: 1, clientX: 12, clientY: 12 });
    expect(onSelect).toHaveBeenCalled();
  });

  it("highlights the cousin-marriage ancestry loop when the selected person is in one", () => {
    const analysis = analyzeTree(cousinTree);
    render(
      <EditorCanvas
        tree={cousinTree}
        appearance={DEFAULT_APPEARANCE_PREFS}
        analysis={analysis}
        selectedPersonId="cousinA"
        onSelectPerson={vi.fn()}
      />
    );
    // cousinB, dadA, dadB, and the shared grandparent (gpa or gma) — 4 people besides cousinA.
    expect(screen.getAllByTestId("ancestry-highlight")).toHaveLength(4);
  });

  it("shows no ancestry highlight for a person with no cousin-marriage evidence", () => {
    const analysis = analyzeTree(cousinTree);
    render(
      <EditorCanvas
        tree={cousinTree}
        appearance={DEFAULT_APPEARANCE_PREFS}
        analysis={analysis}
        selectedPersonId="gpa"
        onSelectPerson={vi.fn()}
      />
    );
    expect(screen.queryAllByTestId("ancestry-highlight")).toHaveLength(0);
  });

  it("shows no ancestry highlight when analysis is not supplied", () => {
    render(
      <EditorCanvas
        tree={cousinTree}
        appearance={DEFAULT_APPEARANCE_PREFS}
        selectedPersonId="cousinA"
        onSelectPerson={vi.fn()}
      />
    );
    expect(screen.queryAllByTestId("ancestry-highlight")).toHaveLength(0);
  });

  it("focus mode dims people outside the selected person's immediate family", async () => {
    render(
      <EditorCanvas
        tree={tree}
        appearance={DEFAULT_APPEARANCE_PREFS}
        selectedPersonId="kid"
        onSelectPerson={vi.fn()}
      />
    );
    expect(screen.queryAllByTestId("focus-dim")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /focus mode/i }));
    // Focusing "kid" keeps kid + dad opaque and dims the grandparent.
    expect(screen.getAllByTestId("focus-dim").length).toBeGreaterThan(0);
  });

  it("renders insight overlays into the SAME poster svg only when insightMode is on (CP5.7)", () => {
    const analysis = analyzeTree(cousinTree);
    const off = render(
      <EditorCanvas
        tree={cousinTree}
        appearance={DEFAULT_APPEARANCE_PREFS}
        analysis={analysis}
        onSelectPerson={vi.fn()}
      />
    );
    expect(off.container.querySelector('[data-role^="badge-"]')).toBeNull();
    off.unmount();

    const on = render(
      <EditorCanvas
        tree={cousinTree}
        appearance={DEFAULT_APPEARANCE_PREFS}
        analysis={analysis}
        insightMode
        onSelectPerson={vi.fn()}
      />
    );
    // The badges live inside the poster svg itself, not in a separate React overlay layer —
    // invariant 1: every persistent visual is emitted by renderPosterSvg.
    const svg = on.container.querySelector("svg")!;
    expect(svg.querySelector('[data-role="badge-cousin-marriage"]')).toBeTruthy();
  });

  it("renders no insight overlays with insightMode on but no analysis supplied (CP5.7)", () => {
    const { container } = render(
      <EditorCanvas
        tree={cousinTree}
        appearance={DEFAULT_APPEARANCE_PREFS}
        insightMode
        onSelectPerson={vi.fn()}
      />
    );
    expect(container.querySelector('[data-role^="badge-"]')).toBeNull();
  });
});
