import { describe, expect, it } from "vitest";
import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { computeBalancedPosterLayout } from "../poster/layoutBalanced.js";
import { DEFAULT_POSTER_STYLE } from "../poster/types.js";

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

// FINDING (2026-08-11): the bug is REAL. finalize computes its normalization bbox over OWNED
// nodes only and then shifts ALL nodes by the same (minX,minY) — there is no code that moves
// disconnected fragments below the chart. They keep their FLAT positions, so here the second
// family lands in the top band (fragTop ≈ 0) while the main chart runs down to y ≈ 606.
//   • The "dropped below everything" contract is broken → the .fails test below is the repro.
//   • The worst consequence (a fragment overlapping a main node) is LATENT, not reproduced by
//     this particular fixture's x-geometry, so no overlap assertion is made here — asserting
//     "no overlap" would encode a guarantee finalize does not actually provide.
//   • Fragments do stay on-page (non-negative coords) for this fixture — pinned as a guard so a
//     future fix doesn't regress it.
// Do NOT fix layoutBalanced.ts here (AUD-6 is gated on this fixture existing first).
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

  // Expected to FAIL until AUD-6 is fixed: fragments are NOT dropped below the main chart today.
  // When finalize is fixed, this starts passing and vitest flags the stale `.fails` for removal.
  it.fails("drops disconnected fragments BELOW the main chart (finalize's stated contract)", () => {
    const mainBottom = Math.max(...main.map((b) => b.b));
    const fragTop = Math.min(...frag.map((b) => b.t));
    expect(fragTop).toBeGreaterThanOrEqual(mainBottom - 0.5);
  });
});
