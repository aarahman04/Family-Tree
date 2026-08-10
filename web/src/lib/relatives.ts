import type { FamilyTree, UUID } from "../../../models/types.js";

/**
 * The immediate relatives of a person — themselves plus parents, siblings, spouse(s) and
 * children — as a Set of ids. Used by the editor's focus mode to keep this cluster fully
 * opaque while everyone else dims. Pure and framework-free (see tests/lib/relatives.test.ts).
 */
export function immediateRelatives(tree: FamilyTree, personId: UUID): Set<UUID> {
  const result = new Set<UUID>();
  const person = tree.persons[personId];
  if (!person) return result;
  result.add(personId);

  // Parents + siblings via the person's family-of-origin.
  const famc = person.famcId ? tree.families[person.famcId] : undefined;
  if (famc) {
    if (famc.husbandId) result.add(famc.husbandId);
    if (famc.wifeId) result.add(famc.wifeId);
    for (const sib of famc.childrenIds) result.add(sib);
  }

  // Spouses + children via the families the person is a spouse in.
  for (const famsId of person.famsIds) {
    const fam = tree.families[famsId];
    if (!fam) continue;
    if (fam.husbandId && fam.husbandId !== personId) result.add(fam.husbandId);
    if (fam.wifeId && fam.wifeId !== personId) result.add(fam.wifeId);
    for (const child of fam.childrenIds) result.add(child);
  }

  // Only keep ids that resolve to real people in this tree.
  for (const id of result) if (!tree.persons[id]) result.delete(id);
  return result;
}
