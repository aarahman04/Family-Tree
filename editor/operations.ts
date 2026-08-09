import type { DatePart, FamilyTree, Gender, Person, UUID } from "../models/types.js";
import { generateId } from "../lib/uuid.js";
import { EditorError } from "./errors.js";
import { isAncestor, pruneEmptyFamily, withFamily, withPerson } from "./helpers.js";

export interface PersonFieldEdits {
  name?: string;
  nickname?: string;
  gender?: Gender;
  /** `null` clears the event entirely; `undefined` leaves it untouched. */
  birth?: DatePart | null;
  death?: DatePart | null;
  /** Replaces the full set of general notes (event-category notes from FTZ import are left alone). */
  notes?: string[];
}

/** Updates the editable person fields (name, gender, birth, death, notes) — never touches relationships. */
export function updatePersonFields(tree: FamilyTree, personId: UUID, edits: PersonFieldEdits): FamilyTree {
  return withPerson(tree, personId, (p) => {
    const updated: Person = { ...p };
    if (edits.name !== undefined) updated.name = edits.name;
    if (edits.nickname !== undefined) updated.nickname = edits.nickname || undefined;
    if (edits.gender !== undefined) updated.gender = edits.gender;
    if (edits.birth !== undefined) {
      updated.birth =
        edits.birth === null ? undefined : { id: p.birth?.id ?? generateId(), type: "birth", date: edits.birth };
    }
    if (edits.death !== undefined) {
      updated.death =
        edits.death === null ? undefined : { id: p.death?.id ?? generateId(), type: "death", date: edits.death };
    }
    if (edits.notes !== undefined) {
      const eventNotes = p.notes.filter((n) => n.category === "event");
      updated.notes = [
        ...edits.notes.map((text, i) => ({
          id: p.notes.filter((n) => n.category !== "event")[i]?.id ?? generateId(),
          text,
          category: "general" as const,
        })),
        ...eventNotes,
      ];
    }
    return updated;
  });
}

export function createPerson(
  tree: FamilyTree,
  fields: { name: string; gender?: Gender }
): { tree: FamilyTree; personId: UUID } {
  const id = generateId();
  const person: Person = {
    id,
    name: fields.name,
    gender: fields.gender ?? "unknown",
    notes: [],
    media: [],
    famsIds: [],
  };
  return { tree: { ...tree, persons: { ...tree.persons, [id]: person } }, personId: id };
}

function ensureFamcFamily(tree: FamilyTree, childId: UUID): [FamilyTree, UUID] {
  const child = tree.persons[childId];
  if (!child) throw new EditorError(`Person ${childId} does not exist.`);
  if (child.famcId && tree.families[child.famcId]) return [tree, child.famcId];
  const familyId = generateId();
  let next: FamilyTree = {
    ...tree,
    families: { ...tree.families, [familyId]: { id: familyId, childrenIds: [childId] } },
  };
  next = withPerson(next, childId, (p) => ({ ...p, famcId: familyId }));
  return [next, familyId];
}

function assignParent(
  tree: FamilyTree,
  childId: UUID,
  parentId: UUID | undefined,
  slot: "husbandId" | "wifeId"
): FamilyTree {
  if (parentId === childId) {
    throw new EditorError("A person cannot be their own parent.");
  }
  if (parentId && !tree.persons[parentId]) {
    throw new EditorError(`Person ${parentId} does not exist.`);
  }
  if (parentId && isAncestor(tree, childId, parentId)) {
    throw new EditorError("This assignment would create a circular ancestry.");
  }

  let [next, familyId] = ensureFamcFamily(tree, childId);
  const family = next.families[familyId]!;
  const prevParentId = family[slot];

  next = withFamily(next, familyId, (f) => ({ ...f, [slot]: parentId }));

  if (prevParentId && prevParentId !== parentId && next.persons[prevParentId]) {
    next = withPerson(next, prevParentId, (p) => ({
      ...p,
      famsIds: p.famsIds.filter((id) => id !== familyId),
    }));
  }
  if (parentId && parentId !== prevParentId) {
    next = withPerson(next, parentId, (p) =>
      p.famsIds.includes(familyId) ? p : { ...p, famsIds: [...p.famsIds, familyId] }
    );
  }

  return pruneEmptyFamily(next, familyId);
}

/** Assigns (or clears, with `fatherId: undefined`) a person's father. Creates their parent-family record if they don't have one yet. */
export function setFather(tree: FamilyTree, childId: UUID, fatherId: UUID | undefined): FamilyTree {
  return assignParent(tree, childId, fatherId, "husbandId");
}

/** Assigns (or clears, with `motherId: undefined`) a person's mother. Creates their parent-family record if they don't have one yet. */
export function setMother(tree: FamilyTree, childId: UUID, motherId: UUID | undefined): FamilyTree {
  return assignParent(tree, childId, motherId, "wifeId");
}

function familyLinking(tree: FamilyTree, personId: UUID, spouseId: UUID): UUID | undefined {
  const person = tree.persons[personId];
  if (!person) return undefined;
  return person.famsIds.find((fid) => {
    const f = tree.families[fid];
    return f && ((f.husbandId === personId && f.wifeId === spouseId) || (f.husbandId === spouseId && f.wifeId === personId));
  });
}

/** Links two people as spouses (creates a new Family record). No-op if already linked. */
export function addSpouse(tree: FamilyTree, personId: UUID, spouseId: UUID): FamilyTree {
  if (personId === spouseId) {
    throw new EditorError("A person cannot be their own spouse.");
  }
  const person = tree.persons[personId];
  const spouse = tree.persons[spouseId];
  if (!person) throw new EditorError(`Person ${personId} does not exist.`);
  if (!spouse) throw new EditorError(`Person ${spouseId} does not exist.`);
  if (familyLinking(tree, personId, spouseId)) return tree;

  let husbandId: UUID;
  let wifeId: UUID;
  if (person.gender === "male" || spouse.gender === "female") {
    husbandId = personId;
    wifeId = spouseId;
  } else if (person.gender === "female" || spouse.gender === "male") {
    husbandId = spouseId;
    wifeId = personId;
  } else {
    husbandId = personId;
    wifeId = spouseId;
  }

  const familyId = generateId();
  let next: FamilyTree = {
    ...tree,
    families: { ...tree.families, [familyId]: { id: familyId, husbandId, wifeId, childrenIds: [] } },
  };
  next = withPerson(next, personId, (p) => ({ ...p, famsIds: [...p.famsIds, familyId] }));
  next = withPerson(next, spouseId, (p) => ({ ...p, famsIds: [...p.famsIds, familyId] }));
  return next;
}

/** Unlinks two spouses. Their shared family record is deleted if it has no children left; otherwise it's kept (with that side cleared) so any children's FAMC references stay valid. */
export function removeSpouse(tree: FamilyTree, personId: UUID, spouseId: UUID): FamilyTree {
  const familyId = familyLinking(tree, personId, spouseId);
  if (!familyId) return tree;

  // Only spouseId is unlinked from the family record — personId stays recorded as the
  // remaining parent (e.g. removing Mom from Dad's family leaves Dad as husband, with the
  // wife slot now empty; it does not also remove Dad). This is what "remove spouse" means
  // from the person you're viewing's perspective: their own place in the family persists.
  let next = withFamily(tree, familyId, (f) => ({
    ...f,
    husbandId: f.husbandId === spouseId ? undefined : f.husbandId,
    wifeId: f.wifeId === spouseId ? undefined : f.wifeId,
  }));
  next = withPerson(next, spouseId, (p) => ({ ...p, famsIds: p.famsIds.filter((id) => id !== familyId) }));
  return pruneEmptyFamily(next, familyId);
}

/** Assigns an existing person as a child of the given family, moving them out of any previous parent-family. Rejects assignments that would make someone their own ancestor. */
export function addChildToFamily(tree: FamilyTree, familyId: UUID, childId: UUID): FamilyTree {
  const family = tree.families[familyId];
  const child = tree.persons[childId];
  if (!family) throw new EditorError(`Family ${familyId} does not exist.`);
  if (!child) throw new EditorError(`Person ${childId} does not exist.`);
  if (family.husbandId === childId || family.wifeId === childId) {
    throw new EditorError("A person cannot be their own parent.");
  }
  for (const parentId of [family.husbandId, family.wifeId]) {
    if (parentId && isAncestor(tree, childId, parentId)) {
      throw new EditorError("This assignment would create a circular ancestry.");
    }
  }

  let next = tree;
  const oldFamcId = child.famcId;
  if (oldFamcId && oldFamcId !== familyId) {
    next = withFamily(next, oldFamcId, (f) => ({ ...f, childrenIds: f.childrenIds.filter((id) => id !== childId) }));
    next = pruneEmptyFamily(next, oldFamcId);
  }
  if (!family.childrenIds.includes(childId)) {
    next = withFamily(next, familyId, (f) => ({ ...f, childrenIds: [...f.childrenIds, childId] }));
  }
  next = withPerson(next, childId, (p) => ({ ...p, famcId: familyId }));
  return next;
}

/**
 * Adds a child to a person directly, resolving which of their spouse-families to attach to:
 * - exactly one existing spouse-family → uses it
 * - none yet → creates one with this person as the sole parent (single-parent family)
 * - more than one → the caller must disambiguate via `familyId` (e.g. the UI asks "which
 *   marriage?"); throws EditorError otherwise rather than guessing
 */
export function addChildToPerson(
  tree: FamilyTree,
  personId: UUID,
  childId: UUID,
  familyId?: UUID
): FamilyTree {
  const person = tree.persons[personId];
  if (!person) throw new EditorError(`Person ${personId} does not exist.`);

  if (familyId) {
    if (!person.famsIds.includes(familyId)) {
      throw new EditorError("That family is not one of this person's spouse-families.");
    }
    return addChildToFamily(tree, familyId, childId);
  }

  if (person.famsIds.length === 1) {
    return addChildToFamily(tree, person.famsIds[0]!, childId);
  }
  if (person.famsIds.length > 1) {
    throw new EditorError("This person has multiple spouse-families — specify which one.");
  }

  // No spouse-family yet: create a single-parent one.
  const newFamilyId = generateId();
  const slot: "husbandId" | "wifeId" = person.gender === "female" ? "wifeId" : "husbandId";
  let next: FamilyTree = {
    ...tree,
    families: { ...tree.families, [newFamilyId]: { id: newFamilyId, [slot]: personId, childrenIds: [] } },
  };
  next = withPerson(next, personId, (p) => ({ ...p, famsIds: [...p.famsIds, newFamilyId] }));
  return addChildToFamily(next, newFamilyId, childId);
}

/** Removes a child from a family. The family record is deleted if this leaves it with no parents and no other children. */
export function removeChildFromFamily(tree: FamilyTree, familyId: UUID, childId: UUID): FamilyTree {
  const family = tree.families[familyId];
  if (!family) throw new EditorError(`Family ${familyId} does not exist.`);

  let next = withFamily(tree, familyId, (f) => ({
    ...f,
    childrenIds: f.childrenIds.filter((id) => id !== childId),
  }));
  next = withPerson(next, childId, (p) => (p.famcId === familyId ? { ...p, famcId: undefined } : p));
  return pruneEmptyFamily(next, familyId);
}
