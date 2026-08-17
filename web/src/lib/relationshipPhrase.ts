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
      const removal = marriage.relation.removal ?? 0;
      const word =
        degree === 1 ? "first" : degree === 2 ? "second" : degree === 3 ? "third" : `${degree}th`;
      if (removal === 0) return `This is a ${word} cousin marriage.`;

      // A removed cousin link spans a generation, and everyday family usage names that gap: a
      // parent's cousin is called an uncle or aunt, and their child a niece or nephew. Both
      // readings are given -- the genealogical one because it is precise, the familial one
      // because it is what a reader recognises. Substituting one for the other would be wrong in
      // opposite directions: "cousins" hides the generation gap, "niece" overstates the closeness.
      const elder = marriage.elderId ? tree.persons[marriage.elderId] : undefined;
      const younger = marriage.youngerId ? tree.persons[marriage.youngerId] : undefined;
      const removedWord = removal === 1 ? "once" : removal === 2 ? "twice" : `${removal} times`;
      const base = `This is a ${word} cousin marriage, ${removedWord} removed.`;
      if (!elder || !younger) return base;

      const elderTerm = elder.gender === "female" ? "aunt" : "uncle";
      const youngerTerm = younger.gender === "female" ? "niece" : "nephew";
      const elderName = elder.name.trim() || "The elder spouse";
      return `${base} ${elderName} is a generation above — in everyday family terms, ${elderTerm} and ${youngerTerm}.`;
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
