import type { FamilyTree, Relationship, UUID } from "../models/types.js";

/**
 * All relationship queries are computed on demand from famcId/famsIds/childrenIds —
 * never cached on Person, so they can't desync from the source of truth after an edit.
 * See docs/data-model.md decision 2.
 */

export function fatherOf(tree: FamilyTree, personId: UUID): UUID | undefined {
  const person = tree.persons[personId];
  if (!person?.famcId) return undefined;
  return tree.families[person.famcId]?.husbandId;
}

export function motherOf(tree: FamilyTree, personId: UUID): UUID | undefined {
  const person = tree.persons[personId];
  if (!person?.famcId) return undefined;
  return tree.families[person.famcId]?.wifeId;
}

export function spousesOf(tree: FamilyTree, personId: UUID): UUID[] {
  const person = tree.persons[personId];
  if (!person) return [];
  const result: UUID[] = [];
  for (const famId of person.famsIds) {
    const family = tree.families[famId];
    if (!family) continue;
    const other = family.husbandId === personId ? family.wifeId : family.husbandId;
    if (other) result.push(other);
  }
  return result;
}

export function childrenOf(tree: FamilyTree, personId: UUID): UUID[] {
  const person = tree.persons[personId];
  if (!person) return [];
  const result = new Set<UUID>();
  for (const famId of person.famsIds) {
    const family = tree.families[famId];
    if (!family) continue;
    for (const childId of family.childrenIds) result.add(childId);
  }
  return [...result];
}

export function siblingsOf(tree: FamilyTree, personId: UUID): UUID[] {
  const person = tree.persons[personId];
  if (!person?.famcId) return [];
  const family = tree.families[person.famcId];
  if (!family) return [];
  return family.childrenIds.filter((id) => id !== personId);
}

export function grandparentsOf(tree: FamilyTree, personId: UUID): Relationship["grandparents"] {
  const father = fatherOf(tree, personId);
  const mother = motherOf(tree, personId);
  return {
    paternalGrandfather: father ? fatherOf(tree, father) : undefined,
    paternalGrandmother: father ? motherOf(tree, father) : undefined,
    maternalGrandfather: mother ? fatherOf(tree, mother) : undefined,
    maternalGrandmother: mother ? motherOf(tree, mother) : undefined,
  };
}

export function grandchildrenOf(tree: FamilyTree, personId: UUID): UUID[] {
  const result = new Set<UUID>();
  for (const childId of childrenOf(tree, personId)) {
    for (const grandchildId of childrenOf(tree, childId)) result.add(grandchildId);
  }
  return [...result];
}

export function getRelationships(tree: FamilyTree, personId: UUID): Relationship {
  return {
    personId,
    father: fatherOf(tree, personId),
    mother: motherOf(tree, personId),
    spouses: spousesOf(tree, personId),
    children: childrenOf(tree, personId),
    siblings: siblingsOf(tree, personId),
    grandparents: grandparentsOf(tree, personId),
    grandchildren: grandchildrenOf(tree, personId),
  };
}
