import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../parser/index.js";
import { getRelationships, siblingsOf, spousesOf } from "../parser/relationships.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

/**
 * A 3-generation tree:
 *   grandpa(1) x grandma(2) -> dad(3), aunt(4)
 *   dad(3) x mom(5) -> child(6), child2(7)
 */
function threeGenerationTree() {
  const text = buildNodeFtt(
    [
      personRow({ id: 1, name: "Grandpa", gender: 1 }),
      personRow({ id: 2, name: "Grandma", gender: 2 }),
      personRow({ id: 3, name: "Dad", famc: 10, birthOrder: 0, gender: 1 }),
      personRow({ id: 4, name: "Aunt", famc: 10, birthOrder: 1, gender: 2 }),
      personRow({ id: 5, name: "Mom", gender: 2 }),
      personRow({ id: 6, name: "Child", famc: 20, birthOrder: 0 }),
      personRow({ id: 7, name: "Child2", famc: 20, birthOrder: 1 }),
    ],
    [familyRow({ id: 10, husband: 1, wife: 2 }), familyRow({ id: 20, husband: 3, wife: 5 })]
  );
  return parseNodeFtt(text).tree;
}

function uuidByName(tree: ReturnType<typeof threeGenerationTree>, name: string) {
  return Object.values(tree.persons).find((p) => p.name === name)!.id;
}

describe("relationship reconstruction", () => {
  it("resolves father/mother/children/siblings across 3 generations", () => {
    const tree = threeGenerationTree();
    const dad = uuidByName(tree, "Dad");
    const rel = getRelationships(tree, dad);

    expect(tree.persons[rel.father!]!.name).toBe("Grandpa");
    expect(tree.persons[rel.mother!]!.name).toBe("Grandma");
    expect(rel.children.map((id) => tree.persons[id]!.name).sort()).toEqual(["Child", "Child2"]);
    expect(rel.siblings.map((id) => tree.persons[id]!.name)).toEqual(["Aunt"]);
  });

  it("resolves grandparents and grandchildren", () => {
    const tree = threeGenerationTree();
    const child = uuidByName(tree, "Child");
    const rel = getRelationships(tree, child);
    expect(tree.persons[rel.grandparents.paternalGrandfather!]!.name).toBe("Grandpa");
    expect(tree.persons[rel.grandparents.paternalGrandmother!]!.name).toBe("Grandma");

    const grandpa = uuidByName(tree, "Grandpa");
    const grandpaRel = getRelationships(tree, grandpa);
    expect(grandpaRel.grandchildren.map((id) => tree.persons[id]!.name).sort()).toEqual([
      "Child",
      "Child2",
    ]);
  });

  it("resolves spouses in both directions", () => {
    const tree = threeGenerationTree();
    const dad = uuidByName(tree, "Dad");
    const mom = uuidByName(tree, "Mom");
    expect(spousesOf(tree, dad)).toEqual([mom]);
    expect(spousesOf(tree, mom)).toEqual([dad]);
  });

  it("returns empty relationships for a person with no recorded family", () => {
    const tree = threeGenerationTree();
    const grandpa = uuidByName(tree, "Grandpa");
    expect(siblingsOf(tree, grandpa)).toEqual([]);
  });

  it("supports multiple spouses / remarriage: children merge without duplicates across families", () => {
    const text = buildNodeFtt(
      [
        personRow({ id: 1, name: "Husband", gender: 1 }),
        personRow({ id: 2, name: "Wife1", gender: 2 }),
        personRow({ id: 3, name: "Wife2", gender: 2 }),
        personRow({ id: 4, name: "ChildOfWife1", famc: 10 }),
        personRow({ id: 5, name: "ChildOfWife2", famc: 20 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 }), familyRow({ id: 20, husband: 1, wife: 3 })]
    );
    const tree = parseNodeFtt(text).tree;
    const husband = uuidByName(tree, "Husband");
    const rel = getRelationships(tree, husband);
    expect(rel.spouses).toHaveLength(2);
    expect(rel.children.map((id) => tree.persons[id]!.name).sort()).toEqual([
      "ChildOfWife1",
      "ChildOfWife2",
    ]);
    expect(tree.validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("supports cousin marriage without duplicating the shared ancestor", () => {
    // grandpa/grandma -> parentA, parentB. parentA's child marries parentB's child.
    const text = buildNodeFtt(
      [
        personRow({ id: 1, name: "Grandpa", gender: 1 }),
        personRow({ id: 2, name: "Grandma", gender: 2 }),
        personRow({ id: 3, name: "ParentA", famc: 10, gender: 1 }),
        personRow({ id: 4, name: "ParentB", famc: 10, gender: 2 }),
        personRow({ id: 5, name: "CousinX", famc: 20, gender: 1 }), // child of ParentA
        personRow({ id: 6, name: "CousinY", famc: 30, gender: 2 }), // child of ParentB
      ],
      [
        familyRow({ id: 10, husband: 1, wife: 2 }),
        familyRow({ id: 20, husband: 3 }), // ParentA's own family as spouse (spouse unrecorded)
        familyRow({ id: 30, wife: 4 }), // ParentB's own family as spouse
        familyRow({ id: 40, husband: 5, wife: 6 }), // the cousin marriage itself
      ]
    );
    const tree = parseNodeFtt(text).tree;
    expect(Object.keys(tree.persons)).toHaveLength(6); // each individual exists exactly once
    const grandpaId = uuidByName(tree, "Grandpa");
    const cousinX = uuidByName(tree, "CousinX");
    const cousinY = uuidByName(tree, "CousinY");
    // CousinX descends through father (ParentA); CousinY descends through mother (ParentB)
    expect(getRelationships(tree, cousinX).grandparents.paternalGrandfather).toBe(grandpaId);
    expect(getRelationships(tree, cousinY).grandparents.maternalGrandfather).toBe(grandpaId);
  });
});
