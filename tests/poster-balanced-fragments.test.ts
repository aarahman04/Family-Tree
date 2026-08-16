import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../src/models/types.js";
import { computeBalancedPosterLayout } from "../src/poster/layoutBalanced.js";
import { DEFAULT_POSTER_STYLE } from "../src/poster/types.js";

// AUD-6 repro fixture. layoutBalanced.finalize claims: "Any people the walk never owned
// (disconnected fragments) ... are dropped below everything so they never overlap the main
// chart." This builds a tree with a large main component (so the branch-wing repositioning
// runs) PLUS a fully disconnected second family, and probes whether that claim actually holds.
// NOTE: this is an investigation fixture only — it must NOT touch layoutBalanced.ts.

function person(id: UUID, name = id, famcId?: UUID): Person {
  return { id, name, gender: "unknown", notes: [], media: [], famcId, famsIds: [] };
}
function family(id: UUID, husbandId?: UUID, wifeId?: UUID, childrenIds: UUID[] = []): Family {
  return { id, husbandId, wifeId, childrenIds };
}
function buildTree(persons: Person[], families: Family[]): FamilyTree {
  const personMap: Record<UUID, Person> = {};
  for (const p of persons) personMap[p.id] = { ...p, famsIds: [] };
  const familyMap: Record<UUID, Family> = {};
  for (const f of families) {
    familyMap[f.id] = f;
    for (const spouseId of [f.husbandId, f.wifeId])
      if (spouseId && personMap[spouseId]) personMap[spouseId]!.famsIds.push(f.id);
  }
  return {
    metadata: { sourceFormat: "manual", importedAt: new Date(0).toISOString() },
    persons: personMap,
    families: familyMap,
    validation: { validatedAt: new Date(0).toISOString(), issues: [], isValid: true },
  };
}

const COMP2 = new Set<UUID>(["S", "S_sp", "S1", "S2"]);

/** Main component: root "R" with three branches, each branch head having two children (so the
 *  root has >=2 kids and the recursive branch-wing balancing path runs). PLUS a fully
 *  disconnected second family (component 2) with no link to the main chart. */
function multiComponentTree(): FamilyTree {
  const persons: Person[] = [person("R", "Root")];
  const families: Family[] = [];
  const kids1: UUID[] = [];
  for (const b of ["A", "B", "C"]) {
    persons.push(person(`${b}0`, `Head ${b}`, "fRoot"));
    kids1.push(`${b}0`);
    persons.push(person(`${b}1`, `Kid ${b}1`, `f${b}`));
    persons.push(person(`${b}2`, `Kid ${b}2`, `f${b}`));
    families.push(family(`f${b}`, `${b}0`, undefined, [`${b}1`, `${b}2`]));
  }
  families.push(family("fRoot", "R", undefined, kids1));

  // Disconnected second family.
  persons.push(person("S", "Solo Root"));
  persons.push(person("S_sp", "Solo Spouse"));
  persons.push(person("S1", "Solo Kid 1", "fSolo"));
  persons.push(person("S2", "Solo Kid 2", "fSolo"));
  families.push(family("fSolo", "S", "S_sp", ["S1", "S2"]));

  return buildTree(persons, families);
}

// FINDING (2026-08-11): the bug was REAL. finalize computed its normalization bbox over OWNED
// nodes only and shifted ALL nodes by the same (minX,minY) — nothing moved disconnected fragments
// below the chart, so the second family landed in the top band while the main chart ran down past
// it, breaking finalize's own "dropped below everything" contract.
// FIXED (2026-08-16, AUD-6): finalize now relocates unowned fragments as one rigid block to below
// the main chart, left-aligned to it. The assertions below are the regression guards:
//   • fragments stay on-page (non-negative coords), and
//   • fragments sit below the main chart's bottom edge (the contract now holds).
describe("AUD-6 — disconnected fragments in the balanced layout", () => {
  const layout = computeBalancedPosterLayout(multiComponentTree(), DEFAULT_POSTER_STYLE);
  const boxOf = (n: { x: number; y: number; width: number; height: number }) => ({
    t: n.y - n.height / 2,
    b: n.y + n.height / 2,
  });
  const frag = layout.nodes.filter((n) => COMP2.has(n.personId)).map(boxOf);
  const main = layout.nodes.filter((n) => !COMP2.has(n.personId)).map(boxOf);

  it("keeps every node on-page (no negative coordinates after normalization)", () => {
    const minL = Math.min(...layout.nodes.map((n) => n.x - n.width / 2));
    const minT = Math.min(...layout.nodes.map((n) => n.y - n.height / 2));
    expect(minL).toBeGreaterThanOrEqual(-0.5);
    expect(minT).toBeGreaterThanOrEqual(-0.5);
  });

  it("drops disconnected fragments BELOW the main chart (finalize's stated contract)", () => {
    const mainBottom = Math.max(...main.map((b) => b.b));
    const fragTop = Math.min(...frag.map((b) => b.t));
    expect(fragTop).toBeGreaterThanOrEqual(mainBottom - 0.5);
  });
});
