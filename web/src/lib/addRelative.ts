import type { FamilyTree, UUID } from "../../../src/models/types.js";
import {
  addChildToPerson,
  addSpouse,
  createPerson,
  setFather,
  setMother,
} from "../../../src/editor/operations.js";

export type RelativeKind = "father" | "mother" | "parent" | "spouse" | "child" | "independent";

/**
 * Creates a new "New person" and links them to `personId` in the requested role, returning the
 * new tree and the new person's id (so callers can select them for immediate renaming). This is
 * the single place the editor's guided "add a relative" actions compose the existing operations
 * — QuickActions and the toolbar's Add-Person menu both go through here, so there's no duplicated
 * relationship-creation logic. `independent` creates an unlinked placeholder.
 */
export function addRelative(
  tree: FamilyTree,
  personId: UUID,
  kind: RelativeKind
): { tree: FamilyTree; personId: UUID } {
  const gender = kind === "father" ? "male" : kind === "mother" ? "female" : undefined;
  const { tree: withNew, personId: newId } = createPerson(tree, { name: "New person", gender });

  let next: FamilyTree;
  switch (kind) {
    case "independent":
      next = withNew;
      break;
    case "father":
      next = setFather(withNew, personId, newId);
      break;
    case "mother":
      next = setMother(withNew, personId, newId);
      break;
    case "parent": {
      // Fill whichever parent slot is open (prefer father), so a single "Parent" action works.
      const famc = tree.persons[personId]?.famcId
        ? tree.families[tree.persons[personId]!.famcId!]
        : undefined;
      next = famc?.husbandId
        ? setMother(withNew, personId, newId)
        : setFather(withNew, personId, newId);
      break;
    }
    case "spouse":
      next = addSpouse(withNew, personId, newId);
      break;
    case "child":
      next = addChildToPerson(withNew, personId, newId);
      break;
  }
  return { tree: next, personId: newId };
}
