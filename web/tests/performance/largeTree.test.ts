import { describe, expect, it } from "vitest";
import { parseNodeFtt } from "../../../parser/index.js";
import { applyEdit } from "../../../editor/index.js";
import { updatePersonFields } from "../../../editor/operations.js";
import { buildNodeFtt, familyRow, personRow } from "../../../tests/helpers.js";
import { buildSearchIndex, searchPeople } from "../../src/lib/search.js";
import type { FamilyTree } from "../../../models/types.js";

/**
 * Same generation-chain pattern as the root package's tests/scenarios.test.ts, scaled up to
 * clear the milestone's stated floor (>=10,000 people, >=5,000 families).
 */
function buildLargeTree(generations: number, childrenPerCouple: number) {
  const persons: string[] = [];
  const families: string[] = [];
  let nextId = 1;

  const founderHusband = nextId++;
  const founderWife = nextId++;
  persons.push(personRow({ id: founderHusband, name: `P${founderHusband}`, gender: 1 }));
  persons.push(personRow({ id: founderWife, name: `P${founderWife}`, gender: 2 }));
  let famId = 1000;
  families.push(familyRow({ id: famId, husband: founderHusband, wife: founderWife }));
  let couples = [famId];
  famId++;

  for (let g = 0; g < generations; g++) {
    const next: number[] = [];
    for (const parentFamId of couples) {
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
          next.push(famId);
          famId++;
        }
      }
    }
    couples = next;
    if (couples.length === 0 || persons.length > 15000) break;
  }

  return { persons, families };
}

function buildLargeFamilyTree(): FamilyTree {
  const { persons, families } = buildLargeTree(13, 4);
  return parseNodeFtt(buildNodeFtt(persons, families)).tree;
}

describe("Performance at 10,000+ people / 5,000+ families", () => {
  const tree = buildLargeFamilyTree();
  const personCount = Object.keys(tree.persons).length;
  const familyCount = Object.keys(tree.families).length;

  it("the generated fixture actually clears the milestone's stated floor", () => {
    expect(personCount).toBeGreaterThanOrEqual(10000);
    expect(familyCount).toBeGreaterThanOrEqual(5000);
  });

  it("an edit + revalidation stays fast regardless of total tree size", () => {
    const somePersonId = Object.keys(tree.persons)[5000]!;
    const start = performance.now();
    const next = applyEdit(tree, (t) => updatePersonFields(t, somePersonId, { name: "Renamed" }));
    const elapsedMs = performance.now() - start;

    expect(next.persons[somePersonId]!.name).toBe("Renamed");
    expect(elapsedMs).toBeLessThan(2000); // generous bound; typical is well under 200ms
  });

  it("search index build + query stays fast", () => {
    const buildStart = performance.now();
    const index = buildSearchIndex(tree);
    const buildElapsed = performance.now() - buildStart;
    expect(buildElapsed).toBeLessThan(1000);

    const queryStart = performance.now();
    const results = searchPeople(tree, index, "P5000", 20);
    const queryElapsed = performance.now() - queryStart;
    expect(queryElapsed).toBeLessThan(200);
    expect(results.length).toBeGreaterThan(0);
  });
});
