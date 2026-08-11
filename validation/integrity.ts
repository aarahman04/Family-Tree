import type { FamilyTree, UUID, ValidationIssue } from "../models/types.js";
import { fatherOf, motherOf } from "../parser/relationships.js";

/**
 * Graph-level integrity checks. Pure functions over a fully-built FamilyTree — reusable
 * by the parser (at import time) and by the future editor (after any edit), per
 * docs/data-model.md. Import-time-only checks (duplicate ftzIds, broken ftzId references,
 * ftzId namespace collisions) live in parser/build.ts instead, since they depend on raw
 * FTZ integer IDs that don't exist for records created after import.
 */
export function runIntegrityChecks(tree: FamilyTree): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const family of Object.values(tree.families)) {
    // Self-marriage
    if (family.husbandId && family.wifeId && family.husbandId === family.wifeId) {
      issues.push({
        severity: "error",
        code: "SELF_MARRIAGE",
        message: `Family lists the same person as both husband and wife.`,
        relatedIds: [family.id, family.husbandId],
      });
    }

    // Gender/role mismatch
    if (family.husbandId) {
      const husband = tree.persons[family.husbandId];
      if (husband && husband.gender === "female") {
        issues.push({
          severity: "warning",
          code: "GENDER_ROLE_MISMATCH",
          message: `Person recorded as gender "female" occupies the husband role in a family.`,
          relatedIds: [family.id, husband.id],
        });
      }
    }
    if (family.wifeId) {
      const wife = tree.persons[family.wifeId];
      if (wife && wife.gender === "male") {
        issues.push({
          severity: "warning",
          code: "GENDER_ROLE_MISMATCH",
          message: `Person recorded as gender "male" occupies the wife role in a family.`,
          relatedIds: [family.id, wife.id],
        });
      }
    }

    // Family missing parent. Checked directly against husbandId/wifeId (not the original
    // `raw` import snapshot) so this stays correct after an edit clears a parent — `raw`
    // only reflects the tree as it was AT IMPORT TIME and never updates. A parse-time-only
    // broken reference (nonzero ftzId that didn't resolve) already gets its own, more
    // specific BROKEN_SPOUSE_REF error from build.ts; this may also fire alongside it for
    // that rare case, which is harmless redundancy, not incorrect — the family really does
    // have no valid parent in that slot either way.
    const husbandMissing = family.husbandId === undefined;
    const wifeMissing = family.wifeId === undefined;
    if (husbandMissing) {
      issues.push({
        severity: "warning",
        code: "FAMILY_MISSING_PARENT",
        message: `Family has no recorded husband/father.`,
        relatedIds: [family.id],
      });
    }
    if (wifeMissing) {
      issues.push({
        severity: "warning",
        code: "FAMILY_MISSING_PARENT",
        message: `Family has no recorded wife/mother.`,
        relatedIds: [family.id],
      });
    }
  }

  // Self-parent: person appears as husband/wife of their own FAMC family.
  for (const person of Object.values(tree.persons)) {
    if (!person.famcId) continue;
    const family = tree.families[person.famcId];
    if (!family) continue;
    if (family.husbandId === person.id || family.wifeId === person.id) {
      issues.push({
        severity: "error",
        code: "SELF_PARENT",
        message: `Person is listed as a parent in their own family-as-child record.`,
        relatedIds: [person.id, family.id],
      });
    }
  }

  // Circular ancestry: a person who is their own ancestor. Detected with a three-colour DFS
  // up BOTH parent links at once (father AND mother) so a cycle that alternates paternal and
  // maternal lineage is caught — a per-parent walk would miss it. Each distinct cycle is
  // reported once (keyed on its member set), not once per member or per starting person.
  const parentsOf = (id: UUID): UUID[] => {
    const out: UUID[] = [];
    const f = fatherOf(tree, id);
    if (f !== undefined) out.push(f);
    const m = motherOf(tree, id);
    if (m !== undefined) out.push(m);
    return out;
  };
  const color = new Map<UUID, 1 | 2>(); // 1 = on the current DFS path (grey), 2 = done (black)
  const reportedCycles = new Set<string>();
  for (const person of Object.values(tree.persons)) {
    if (color.get(person.id)) continue; // already grey/black from an earlier root
    const path: UUID[] = [person.id];
    const stack: { parents: UUID[]; idx: number }[] = [{ parents: parentsOf(person.id), idx: 0 }];
    color.set(person.id, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.idx < frame.parents.length) {
        const next = frame.parents[frame.idx++]!;
        const c = color.get(next);
        if (c === 1) {
          // Back-edge to a node on the current path: the cycle is that path suffix.
          const cycle = path.slice(path.indexOf(next));
          const key = [...cycle].sort().join("|");
          if (!reportedCycles.has(key)) {
            reportedCycles.add(key);
            issues.push({
              severity: "error",
              code: "CIRCULAR_ANCESTRY",
              message: `Circular ancestry detected: person is their own ancestor.`,
              relatedIds: cycle,
            });
          }
        } else if (c === undefined) {
          color.set(next, 1);
          path.push(next);
          stack.push({ parents: parentsOf(next), idx: 0 });
        }
        // c === 2 (black): fully explored already, no cycle through it.
      } else {
        color.set(path[path.length - 1]!, 2);
        path.pop();
        stack.pop();
      }
    }
  }

  return issues;
}
