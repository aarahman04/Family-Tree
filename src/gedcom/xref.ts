import type { FamilyTree, UUID } from "../models/types.js";

/**
 * Deterministically allocates GEDCOM cross-reference IDs (@I1@, @I2@, ... @F1@, @F2@, ...)
 * from the internal model's UUIDs. Deterministic (sorted by UUID) so re-exporting the same
 * tree twice produces byte-identical output, which matters for the round-trip verifier and
 * for diffing exports in code review.
 */
export class XrefAllocator {
  readonly personXref = new Map<UUID, string>();
  readonly familyXref = new Map<UUID, string>();
  readonly xrefToPerson = new Map<string, UUID>();
  readonly xrefToFamily = new Map<string, UUID>();

  constructor(tree: FamilyTree) {
    const personIds = Object.keys(tree.persons).sort();
    personIds.forEach((id, i) => {
      const xref = `@I${i + 1}@`;
      this.personXref.set(id, xref);
      this.xrefToPerson.set(xref, id);
    });

    const familyIds = Object.keys(tree.families).sort();
    familyIds.forEach((id, i) => {
      const xref = `@F${i + 1}@`;
      this.familyXref.set(id, xref);
      this.xrefToFamily.set(xref, id);
    });
  }
}
