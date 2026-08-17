import type { FamilyTree, UUID } from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";
import type { MarriageAnalysis } from "./marriages.js";

/**
 * Generation-level insights (S-3, spec §11) — "which generation married the most, and which
 * married cousins the most".
 *
 * `computeGenerations` is the shared depth numbering: 0 for anyone with no recorded parents, one
 * more than the deepest known parent otherwise. Malformed data can contain parent cycles, so the
 * walk is memoized with a visiting guard rather than trusting the graph to be acyclic.
 */

export interface GenerationStats {
  generation: number;
  people: number;
  marriages: number;
  cousinMarriages: number;
}

export interface GenerationAnalysis {
  /** One entry per populated generation, ascending. */
  perGeneration: GenerationStats[];
  mostMarriages?: GenerationStats;
  mostCousinMarriages?: GenerationStats;
}

export function computeGenerations(tree: FamilyTree): Map<UUID, number> {
  const memo = new Map<UUID, number>();
  const visiting = new Set<UUID>();
  function gen(id: UUID): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard (malformed data)
    visiting.add(id);
    let g = 0;
    for (const parentId of [fatherOf(tree, id), motherOf(tree, id)]) {
      if (parentId && tree.persons[parentId])
        g = Math.max(g, gen(parentId) + 1);
    }
    visiting.delete(id);
    memo.set(id, g);
    return g;
  }
  for (const id of Object.keys(tree.persons)) gen(id);
  return memo;
}

export function analyzeGenerations(
  tree: FamilyTree,
  marriages: Map<UUID, MarriageAnalysis>,
): GenerationAnalysis {
  const generations = computeGenerations(tree);
  const stats = new Map<number, GenerationStats>();
  const at = (generation: number): GenerationStats => {
    let s = stats.get(generation);
    if (!s) {
      s = { generation, people: 0, marriages: 0, cousinMarriages: 0 };
      stats.set(generation, s);
    }
    return s;
  };

  for (const [personId, generation] of generations) {
    if (tree.persons[personId]) at(generation).people += 1;
  }

  for (const marriage of marriages.values()) {
    // A couple routinely straddles two generations: a spouse who married in from outside the
    // recorded tree has no parents on file and therefore sits at generation 0 whoever they marry.
    // Attribute the union to the DEEPER spouse -- the blood descendant whose depth actually
    // locates the marriage in the lineage. Taking the shallower one instead collapses nearly
    // every marriage in a real tree onto generation 0, since most in-marrying spouses are undocumented.
    const generation = Math.max(
      generations.get(marriage.husbandId) ?? 0,
      generations.get(marriage.wifeId) ?? 0,
    );
    const entry = at(generation);
    entry.marriages += 1;
    if (marriage.isCousinMarriage) entry.cousinMarriages += 1;
  }

  const perGeneration = [...stats.values()].sort(
    (a, b) => a.generation - b.generation,
  );

  let mostMarriages: GenerationStats | undefined;
  let mostCousinMarriages: GenerationStats | undefined;
  for (const entry of perGeneration) {
    if (entry.marriages > 0 && (!mostMarriages || entry.marriages > mostMarriages.marriages))
      mostMarriages = entry;
    if (
      entry.cousinMarriages > 0 &&
      (!mostCousinMarriages || entry.cousinMarriages > mostCousinMarriages.cousinMarriages)
    )
      mostCousinMarriages = entry;
  }

  return { perGeneration, mostMarriages, mostCousinMarriages };
}
