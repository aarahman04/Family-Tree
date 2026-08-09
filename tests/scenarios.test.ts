import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../parser/index.js";
import { getRelationships } from "../parser/relationships.js";
import { buildNodeFtt, familyRow, personRow } from "./helpers.js";

describe("remarriage (deceased first spouse, second marriage)", () => {
  it("keeps children of both marriages attributed correctly, with no duplicated person", () => {
    const text = buildNodeFtt(
      [
        personRow({ id: 1, name: "Widower", gender: 1 }),
        personRow({ id: 2, name: "FirstWife", gender: 2, deathYear: 1990 }),
        personRow({ id: 3, name: "SecondWife", gender: 2 }),
        personRow({ id: 4, name: "ChildFromFirst", famc: 10 }),
        personRow({ id: 5, name: "ChildFromSecond", famc: 20 }),
      ],
      [familyRow({ id: 10, husband: 1, wife: 2 }), familyRow({ id: 20, husband: 1, wife: 3 })]
    );
    const { tree, validation } = parseNodeFtt(text);
    expect(Object.keys(tree.persons)).toHaveLength(5);
    expect(validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    const widower = Object.values(tree.persons).find((p) => p.name === "Widower")!;
    const rel = getRelationships(tree, widower.id);
    expect(rel.spouses).toHaveLength(2);
    expect(rel.children).toHaveLength(2);
  });
});

describe("large family dataset", () => {
  function buildChainOfGenerations(generations: number, childrenPerCouple: number) {
    const persons: string[] = [];
    const families: string[] = [];
    let nextId = 1;
    let currentGenCouples: number[] = [];

    const founderHusband = nextId++;
    const founderWife = nextId++;
    persons.push(personRow({ id: founderHusband, name: `P${founderHusband}`, gender: 1 }));
    persons.push(personRow({ id: founderWife, name: `P${founderWife}`, gender: 2 }));
    let famId = 1000;
    families.push(familyRow({ id: famId, husband: founderHusband, wife: founderWife }));
    currentGenCouples = [famId];
    famId++;

    for (let g = 0; g < generations; g++) {
      const nextGenCouples: number[] = [];
      for (const parentFamId of currentGenCouples) {
        for (let c = 0; c < childrenPerCouple; c++) {
          const childId = nextId++;
          const gender = c % 2 === 0 ? 1 : 2;
          persons.push(
            personRow({ id: childId, name: `P${childId}`, famc: parentFamId, birthOrder: c, gender })
          );
          if (gender === 1) {
            const spouseId = nextId++;
            persons.push(personRow({ id: spouseId, name: `P${spouseId}`, gender: 2 }));
            families.push(familyRow({ id: famId, husband: childId, wife: spouseId }));
            nextGenCouples.push(famId);
            famId++;
          }
        }
      }
      currentGenCouples = nextGenCouples;
      if (currentGenCouples.length === 0) break;
    }
    return { persons, families };
  }

  it("parses a large multi-generation tree without error and with correct depth", () => {
    const { persons, families } = buildChainOfGenerations(8, 4);
    const text = buildNodeFtt(persons, families);

    const start = Date.now();
    const { tree, validation } = parseNodeFtt(text);
    const elapsedMs = Date.now() - start;

    expect(persons.length).toBeGreaterThan(500); // genuinely large
    expect(Object.keys(tree.persons)).toHaveLength(persons.length);
    expect(validation.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(elapsedMs).toBeLessThan(5000); // no pathological slowdown
  });

  it("does not stack-overflow on a single very deep lineage chain", () => {
    const { persons, families } = buildChainOfGenerations(150, 1);
    const text = buildNodeFtt(persons, families);
    expect(() => parseNodeFtt(text)).not.toThrow();
  });
});
