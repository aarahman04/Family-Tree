import type { FamilyTree } from "../../../src/models/types.js";
import type { MarriageAnalysis } from "../../../src/analysis/index.js";

/**
 * One plain-language sentence for a marriage between relatives, or `undefined` for an ordinary
 * one so the UI can stay quiet.
 *
 * "Avuncular" is accurate and unreadable. Someone looking at their own family wants to be told
 * that a man married his niece, and the direction matters: the elder spouse's gender decides
 * whether it reads as uncle/niece or aunt/nephew, and the two are not interchangeable.
 */
export function relationshipPhrase(
  tree: FamilyTree,
  marriage: MarriageAnalysis
): string | undefined {
  switch (marriage.category) {
    case "cousins": {
      const degree = marriage.relation.cousinDegree ?? 1;
      const removed = (marriage.relation.removal ?? 0) > 0 ? ", once removed" : "";
      const word =
        degree === 1 ? "first" : degree === 2 ? "second" : degree === 3 ? "third" : `${degree}th`;
      return `This is a ${word} cousin marriage${removed}.`;
    }
    case "avuncular": {
      const elder = marriage.elderId ? tree.persons[marriage.elderId] : undefined;
      // Without the elder's gender the direction is unknowable, so say the neutral true thing
      // rather than guessing one of two opposite readings.
      if (elder?.gender === "male") return "This person married their niece.";
      if (elder?.gender === "female") return "This person married their nephew.";
      return "This marriage is between an aunt or uncle and their niece or nephew.";
    }
    case "siblings":
      return "This marriage is between siblings.";
    case "half-siblings":
      return "This marriage is between half-siblings.";
    case "direct":
      return "This marriage is between direct ancestor and descendant.";
    default:
      return undefined;
  }
}
