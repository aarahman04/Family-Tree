import { useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../../src/models/types.js";
import type { MarriageAnalysis, TreeAnalysis } from "../../../../src/analysis/index.js";

interface CousinMarriagesPanelProps {
  tree: FamilyTree;
  analysis: TreeAnalysis;
  onSelect: (id: UUID) => void;
}

const nameOf = (tree: FamilyTree, id: UUID) => tree.persons[id]?.name.trim() || "(no name)";

/** A couple's two names, each clickable. Labelled "View <name>" so it is distinguishable from
 * the sidebar's other same-named navigation buttons (see PersonInspector's card titles). */
function Couple({
  tree,
  husbandId,
  wifeId,
  onSelect,
}: {
  tree: FamilyTree;
  husbandId: UUID;
  wifeId: UUID;
  onSelect: (id: UUID) => void;
}) {
  return (
    <span>
      {[husbandId, wifeId].map((id, i) => (
        <span key={id}>
          {i > 0 && <span className="text-slate-400 dark:text-slate-500"> × </span>}
          <button
            type="button"
            onClick={() => onSelect(id)}
            aria-label={`View ${nameOf(tree, id)}`}
            className="rounded text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
          >
            {nameOf(tree, id)}
          </button>
        </span>
      ))}
    </span>
  );
}

/**
 * Every cousin marriage in the tree, browsable in one place — and, above the flat list, the
 * longest consecutive RUN of them, which is the thing a flat list cannot show. A run means a
 * couple married a relative, their child did too, and so on; `analyzeCousinChains` reconstructs
 * those paths (CP6.3) so they can be rendered oldest generation first.
 *
 * Reuses the collapsed-card pattern of `ExportMenu`/`InsightsPanel` rather than introducing a
 * floating dropdown, because the list can be long and needs room.
 */
export function CousinMarriagesPanel({ tree, analysis, onSelect }: CousinMarriagesPanelProps) {
  const [open, setOpen] = useState(false);
  const { cousinMarriages, chains } = analysis;

  // Deepest runs first, so the most striking pattern leads. Within a depth, keep a stable order.
  // Gated on `open` and memoized: the panel sits collapsed in the sidebar on every render of the
  // editor, and a tree with hundreds of marriages should not pay to sort a list nobody is looking
  // at. The real 473-person tree makes that difference measurable in the integration tests.
  const sorted = useMemo(
    () =>
      open
        ? [...cousinMarriages].sort(
            (a, b) =>
              (chains.depthByFamily.get(b.familyId) ?? 0) -
              (chains.depthByFamily.get(a.familyId) ?? 0)
          )
        : [],
    [open, cousinMarriages, chains.depthByFamily]
  );

  const familyOf = (familyId: UUID): MarriageAnalysis | undefined =>
    analysis.marriages.get(familyId);

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 [@media(pointer:coarse)]:min-h-11 dark:text-slate-100"
      >
        <span>
          All cousin marriages
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {cousinMarriages.length}
          </span>
        </span>
        <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-slate-200 p-3 dark:border-slate-800">
          {cousinMarriages.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No cousin marriages found in this tree.
            </p>
          ) : (
            <>
              {chains.maxChainDepth >= 2 && chains.longestChains[0] && (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Longest chain — {chains.maxChainDepth} generations in a row
                  </h4>
                  <ol
                    aria-label="Longest chain of cousin marriages"
                    className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
                  >
                    {chains.longestChains[0].familyIds.map((familyId, depth) => {
                      const m = familyOf(familyId);
                      if (!m) return null;
                      return (
                        <li
                          key={familyId}
                          // Each step is indented one level further, so the descent reads as a
                          // descent rather than as a flat list of unrelated couples.
                          style={{ paddingInlineStart: `${depth * 0.85}rem` }}
                          className="text-amber-900 dark:text-amber-200"
                        >
                          <span aria-hidden="true" className="mr-1 opacity-60">
                            {depth === 0 ? "•" : "↳"}
                          </span>
                          <Couple
                            tree={tree}
                            husbandId={m.husbandId}
                            wifeId={m.wifeId}
                            onSelect={onSelect}
                          />
                          <span className="ml-1 text-xs opacity-75">{m.relation.label}</span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}

              <section className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Every cousin marriage
                </h4>
                <ul
                  aria-label="Cousin marriages"
                  className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800"
                >
                  {sorted.map((m) => {
                    const depth = chains.depthByFamily.get(m.familyId) ?? 0;
                    return (
                      <li key={m.familyId} className="flex flex-col gap-0.5 py-2 text-sm">
                        <Couple
                          tree={tree}
                          husbandId={m.husbandId}
                          wifeId={m.wifeId}
                          onSelect={onSelect}
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {m.relation.label}
                          {depth >= 2 && ` · ${depth} generations of cousin marriage`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
