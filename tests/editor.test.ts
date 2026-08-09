import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../parser/index.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";
import { applyEdit, EditorError } from "../editor/index.js";
import {
  addChildToFamily,
  addChildToPerson,
  addSpouse,
  createPerson,
  removeChildFromFamily,
  removeSpouse,
  setFather,
  setMother,
  updatePersonFields,
} from "../editor/operations.js";
import type { FamilyTree } from "../models/types.js";

function nuclearFamilyTree(): FamilyTree {
  return parseNodeFtt(
    buildNodeFtt(
      [
        personRow({ id: 1, name: "Dad", gender: 1 }),
        personRow({ id: 2, name: "Mom", gender: 2 }),
        personRow({ id: 3, name: "Kid", famc: 10 }),
        personRow({ id: 4, name: "Unrelated" }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 })]
    )
  ).tree;
}

function idOf(tree: FamilyTree, name: string): string {
  return Object.values(tree.persons).find((p) => p.name === name)!.id;
}

describe("updatePersonFields", () => {
  it("updates name/gender/notes without touching relationships", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const famcBefore = tree.persons[kid]!.famcId;

    const next = updatePersonFields(tree, kid, {
      name: "Kiddo",
      gender: "female",
      notes: ["Loves painting"],
    });

    expect(next.persons[kid]!.name).toBe("Kiddo");
    expect(next.persons[kid]!.gender).toBe("female");
    expect(next.persons[kid]!.notes.map((n) => n.text)).toEqual(["Loves painting"]);
    expect(next.persons[kid]!.famcId).toBe(famcBefore);
    // original tree is untouched
    expect(tree.persons[kid]!.name).toBe("Kid");
  });

  it("sets and clears birth/death dates", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const withBirth = updatePersonFields(tree, kid, { birth: { year: 2000, month: 1, day: 1 } });
    expect(withBirth.persons[kid]!.birth?.date).toEqual({ year: 2000, month: 1, day: 1 });
    const cleared = updatePersonFields(withBirth, kid, { birth: null });
    expect(cleared.persons[kid]!.birth).toBeUndefined();
  });

  it("throws EditorError for a nonexistent person", () => {
    const tree = nuclearFamilyTree();
    expect(() => updatePersonFields(tree, "nonexistent", { name: "X" })).toThrow(EditorError);
  });
});

describe("setFather / setMother", () => {
  it("creates a parent-family record for a person who doesn't have one yet", () => {
    const tree = nuclearFamilyTree();
    const unrelated = idOf(tree, "Unrelated");
    const dad = idOf(tree, "Dad");
    expect(tree.persons[unrelated]!.famcId).toBeUndefined();

    const next = setFather(tree, unrelated, dad);
    const famcId = next.persons[unrelated]!.famcId!;
    expect(famcId).toBeDefined();
    expect(next.families[famcId]!.husbandId).toBe(dad);
    expect(next.persons[dad]!.famsIds).toContain(famcId);
  });

  it("reuses the existing family when assigning the second parent", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const unrelated = idOf(tree, "Unrelated");
    const famcBefore = tree.persons[kid]!.famcId;

    const next = setMother(tree, kid, unrelated);
    expect(next.persons[kid]!.famcId).toBe(famcBefore); // same family, not a new one
    expect(next.families[famcBefore!]!.wifeId).toBe(unrelated);
  });

  it("clears a parent when assigned undefined", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const famcId = tree.persons[kid]!.famcId!;
    const dad = idOf(tree, "Dad");

    const next = setFather(tree, kid, undefined);
    expect(next.families[famcId]!.husbandId).toBeUndefined();
    expect(next.persons[dad]!.famsIds).not.toContain(famcId);
  });

  it("rejects assigning a person as their own parent", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    expect(() => setFather(tree, kid, kid)).toThrow(EditorError);
  });

  it("rejects an assignment that would create circular ancestry", () => {
    const tree = nuclearFamilyTree();
    const dad = idOf(tree, "Dad");
    const kid = idOf(tree, "Kid");
    // Dad is Kid's father already; making Kid the father of Dad would be a cycle.
    expect(() => setFather(tree, dad, kid)).toThrow(EditorError);
  });

  it("keeps a newly-created parent-family record after clearing the only parent, since it still has the child", () => {
    const tree = nuclearFamilyTree();
    const unrelated = idOf(tree, "Unrelated");
    const dad = idOf(tree, "Dad");
    const withFather = setFather(tree, unrelated, dad);
    const famcId = withFather.persons[unrelated]!.famcId!;
    expect(withFather.families[famcId]).toBeDefined();

    const cleared = setFather(withFather, unrelated, undefined);
    // Not pruned: the family still lists `unrelated` as a child, even with no parents set.
    expect(cleared.families[famcId]).toBeDefined();
    expect(cleared.families[famcId]!.husbandId).toBeUndefined();
    expect(cleared.families[famcId]!.childrenIds).toContain(unrelated);
  });
});

describe("addSpouse / removeSpouse", () => {
  it("links two people with gender-appropriate husband/wife roles", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid"); // gender unknown by default in this fixture
    const unrelated = idOf(tree, "Unrelated");

    const next = addSpouse(tree, kid, unrelated);
    const famId = next.persons[kid]!.famsIds[0]!;
    const fam = next.families[famId]!;
    expect([fam.husbandId, fam.wifeId].sort()).toEqual([kid, unrelated].sort());
    expect(next.persons[unrelated]!.famsIds).toContain(famId);
  });

  it("is idempotent when adding the same spouse twice", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const unrelated = idOf(tree, "Unrelated");
    const once = addSpouse(tree, kid, unrelated);
    const twice = addSpouse(once, kid, unrelated);
    expect(twice.persons[kid]!.famsIds).toHaveLength(1);
  });

  it("rejects a person being their own spouse", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    expect(() => addSpouse(tree, kid, kid)).toThrow(EditorError);
  });

  it("removeSpouse keeps a childless family record while personId still occupies a slot", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const unrelated = idOf(tree, "Unrelated");
    const linked = addSpouse(tree, kid, unrelated);
    const famId = linked.persons[kid]!.famsIds[0]!;

    const next = removeSpouse(linked, kid, unrelated);
    expect(next.families[famId]).toBeDefined(); // kid is still recorded in it
    expect(next.persons[kid]!.famsIds).toContain(famId);
    expect(next.persons[unrelated]!.famsIds).toHaveLength(0);
  });

  it("removeSpouse(tree, personId, spouseId) unlinks only spouseId, keeping personId as the remaining parent", () => {
    const tree = nuclearFamilyTree();
    const dad = idOf(tree, "Dad");
    const mom = idOf(tree, "Mom");
    const famId = tree.persons[dad]!.famsIds[0]!;

    const next = removeSpouse(tree, dad, mom);
    expect(next.families[famId]).toBeDefined();
    expect(next.families[famId]!.husbandId).toBe(dad); // personId stays recorded
    expect(next.families[famId]!.wifeId).toBeUndefined(); // spouseId is the one removed
    expect(next.families[famId]!.childrenIds).toContain(idOf(tree, "Kid"));
    expect(next.persons[dad]!.famsIds).toContain(famId); // dad's own link to the family persists
    expect(next.persons[mom]!.famsIds).not.toContain(famId);
  });

  it("removeSpouse is symmetric in effect regardless of argument order (either direction removes the same link)", () => {
    const tree = nuclearFamilyTree();
    const dad = idOf(tree, "Dad");
    const mom = idOf(tree, "Mom");
    const famId = tree.persons[dad]!.famsIds[0]!;

    const next = removeSpouse(tree, mom, dad); // called from Mom's side this time
    expect(next.families[famId]!.wifeId).toBe(mom); // now Mom (personId) stays
    expect(next.families[famId]!.husbandId).toBeUndefined(); // Dad (spouseId) is removed
  });
});

describe("addChildToFamily / removeChildFromFamily", () => {
  it("moves a child from one family to another", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const unrelated = idOf(tree, "Unrelated");
    const originalFamId = tree.persons[kid]!.famcId!;

    const { tree: withNewParent, personId: newDad } = createPerson(tree, {
      name: "Step Dad",
      gender: "male",
    });
    const newFam = addSpouse(withNewParent, newDad, unrelated);
    const newFamId = newFam.persons[newDad]!.famsIds[0]!;

    const moved = addChildToFamily(newFam, newFamId, kid);
    expect(moved.persons[kid]!.famcId).toBe(newFamId);
    expect(moved.families[newFamId]!.childrenIds).toContain(kid);
    expect(moved.families[originalFamId]!.childrenIds).not.toContain(kid);
  });

  it("rejects assigning a family's own parent as its child", () => {
    const tree = nuclearFamilyTree();
    const dad = idOf(tree, "Dad");
    const famId = tree.persons[dad]!.famsIds[0]!;
    expect(() => addChildToFamily(tree, famId, dad)).toThrow(EditorError);
  });

  it("rejects a two-generations-removed circular ancestry (grandparent assigned as grandchild's child)", () => {
    const tree = nuclearFamilyTree();
    const dad = idOf(tree, "Dad");
    const kid = idOf(tree, "Kid"); // Kid's father is Dad
    const unrelated = idOf(tree, "Unrelated");

    // Give Kid a spouse family, so Kid is now a parent in some family.
    const withSpouse = addSpouse(tree, kid, unrelated);
    const kidsFamilyId = withSpouse.persons[kid]!.famsIds[0]!;

    // Dad is Kid's father (ancestor). Assigning Dad as a CHILD of Kid's family would make
    // Dad simultaneously an ancestor and a descendant of Kid — a cycle.
    expect(() => addChildToFamily(withSpouse, kidsFamilyId, dad)).toThrow(EditorError);
  });

  it("removeChildFromFamily unlinks, and prunes the family once it has neither parents nor children", () => {
    const tree = nuclearFamilyTree();
    const unrelated = idOf(tree, "Unrelated");
    const { tree: withParent, personId: parent } = createPerson(tree, { name: "Solo Parent" });
    const withFather = setFather(withParent, unrelated, parent);
    const famId = withFather.persons[unrelated]!.famcId!;
    const noParent = setFather(withFather, unrelated, undefined); // family now has only the child

    const removed = removeChildFromFamily(noParent, famId, unrelated);
    expect(removed.families[famId]).toBeUndefined();
    expect(removed.persons[unrelated]!.famcId).toBeUndefined();
  });

  it("removeChildFromFamily keeps the family record when a parent is still assigned", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    const dad = idOf(tree, "Dad");
    const famId = tree.persons[kid]!.famcId!;

    const removed = removeChildFromFamily(tree, famId, kid);
    expect(removed.families[famId]).toBeDefined();
    expect(removed.families[famId]!.husbandId).toBe(dad);
    expect(removed.persons[kid]!.famcId).toBeUndefined();
  });
});

describe("addChildToPerson", () => {
  it("creates a single-parent family when the person has no spouse-family yet", () => {
    const tree = nuclearFamilyTree();
    const unrelated = idOf(tree, "Unrelated");
    const { tree: withNewPerson, personId: newChild } = createPerson(tree, { name: "New Kid" });

    const next = addChildToPerson(withNewPerson, unrelated, newChild);
    const famId = next.persons[newChild]!.famcId!;
    expect(next.families[famId]!.childrenIds).toContain(newChild);
    expect([next.families[famId]!.husbandId, next.families[famId]!.wifeId]).toContain(unrelated);
  });

  it("uses the existing spouse-family when there is exactly one", () => {
    const tree = nuclearFamilyTree();
    const dad = idOf(tree, "Dad");
    const expectedFamId = tree.persons[dad]!.famsIds[0]!;
    const { tree: withNewPerson, personId: newChild } = createPerson(tree, { name: "New Kid" });

    const next = addChildToPerson(withNewPerson, dad, newChild);
    expect(next.persons[newChild]!.famcId).toBe(expectedFamId);
  });

  it("requires an explicit familyId when the person has multiple spouse-families", () => {
    const tree = nuclearFamilyTree();
    const dad = idOf(tree, "Dad");
    const unrelated = idOf(tree, "Unrelated");
    const { tree: withNewPerson, personId: newChild } = createPerson(tree, { name: "New Kid" });
    const withSecondSpouse = addSpouse(withNewPerson, dad, unrelated);

    expect(() => addChildToPerson(withSecondSpouse, dad, newChild)).toThrow(EditorError);

    const secondFamId = withSecondSpouse.persons[dad]!.famsIds[1]!;
    const resolved = addChildToPerson(withSecondSpouse, dad, newChild, secondFamId);
    expect(resolved.persons[newChild]!.famcId).toBe(secondFamId);
  });
});

describe("createPerson", () => {
  it("adds a new person with a fresh UUID and default empty relationships", () => {
    const tree = nuclearFamilyTree();
    const { tree: next, personId } = createPerson(tree, { name: "New Person", gender: "male" });
    expect(next.persons[personId]).toMatchObject({
      name: "New Person",
      gender: "male",
      famsIds: [],
      notes: [],
    });
    expect(Object.keys(next.persons)).toHaveLength(Object.keys(tree.persons).length + 1);
  });
});

describe("applyEdit", () => {
  it("revalidates using the existing validation engine after every edit", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");

    const next = applyEdit(tree, (t) => setFather(t, kid, undefined));
    expect(next.validation).not.toBe(tree.validation); // a fresh validation pass, not reused
    expect(next.validation.isValid).toBe(true);
  });

  it("surfaces a self-marriage fixed by editing as no longer an error", () => {
    const broken = parseNodeFtt(
      buildNodeFtt(
        [personRow({ id: 1, name: "Self" })],
        [familyRow({ id: 10, husband: 1, wife: 1 })]
      )
    ).tree;
    expect(broken.validation.issues.some((i) => i.severity === "error")).toBe(true);

    const self = idOf(broken, "Self");
    const fixed = applyEdit(broken, (t) => removeSpouse(t, self, self));
    expect(fixed.validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("propagates EditorError for invalid edits without silently applying them", () => {
    const tree = nuclearFamilyTree();
    const kid = idOf(tree, "Kid");
    expect(() => applyEdit(tree, (t) => setFather(t, kid, kid))).toThrow(EditorError);
  });
});
