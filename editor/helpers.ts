import type { Family, FamilyTree, Person, UUID } from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";
import { EditorError } from "./errors.js";

/** Immutable update: replaces one person, never mutates the input tree. */
export function withPerson(tree: FamilyTree, id: UUID, updater: (p: Person) => Person): FamilyTree {
  const existing = tree.persons[id];
  if (!existing) throw new EditorError(`Person ${id} does not exist.`);
  return { ...tree, persons: { ...tree.persons, [id]: updater(existing) } };
}

/** Immutable update: replaces one family, never mutates the input tree. */
export function withFamily(tree: FamilyTree, id: UUID, updater: (f: Family) => Family): FamilyTree {
  const existing = tree.families[id];
  if (!existing) throw new EditorError(`Family ${id} does not exist.`);
  return { ...tree, families: { ...tree.families, [id]: updater(existing) } };
}

/** Deletes a family record once it has no husband, no wife, and no children — keeps the model tidy after remove-spouse/remove-child operations rather than leaving inert empty records behind. */
export function pruneEmptyFamily(tree: FamilyTree, familyId: UUID): FamilyTree {
  const family = tree.families[familyId];
  if (!family) return tree;
  if (family.husbandId || family.wifeId || family.childrenIds.length > 0) return tree;
  const { [familyId]: _removed, ...restFamilies } = tree.families;
  return { ...tree, families: restFamilies };
}

const MAX_ANCESTRY_WALK = 2000; // matches validation/integrity.ts's cycle-detection bound

/** True if `candidateId` is an ancestor of `personId` — used to reject edits that would make someone their own descendant's ancestor (a cycle) before it ever enters the tree. */
export function isAncestor(tree: FamilyTree, candidateId: UUID, personId: UUID): boolean {
  const visited = new Set<UUID>([personId]);
  let frontier: UUID[] = [personId];
  let steps = 0;
  while (frontier.length > 0 && steps < MAX_ANCESTRY_WALK) {
    const next: UUID[] = [];
    for (const id of frontier) {
      for (const parent of [fatherOf(tree, id), motherOf(tree, id)]) {
        if (!parent || visited.has(parent)) continue;
        if (parent === candidateId) return true;
        visited.add(parent);
        next.push(parent);
      }
    }
    frontier = next;
    steps++;
  }
  return false;
}
