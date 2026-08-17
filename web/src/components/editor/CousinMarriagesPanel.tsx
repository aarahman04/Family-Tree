import { useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../../src/models/types.js";
import type {
  MarriageAnalysis,
  RelationCategory,
  TreeAnalysis,
} from "../../../../src/analysis/index.js";
import { computeGenerations } from "../../../../src/analysis/index.js";
import { relationshipPhrase } from "../../lib/relationshipPhrase.js";

/** Filter buckets, in the order a reader is most likely to want them. */
const FILTERS: Array<{ value: string; label: string; match: (c: RelationCategory) => boolean }> = [
  { value: "all", label: "All marriages between relatives", match: () => true },
  { value: "cousins", label: "Married their cousin", match: (c) => c === "cousins" },
  {
    value: "avuncular",
    label: "Married their niece/nephew or aunt/uncle",
    match: (c) => c === "avuncular",
  },
  {
    value: "siblings",
    label: "Married a sibling or half-sibling",
    match: (c) => c === "siblings" || c === "half-siblings",
  },
  { value: "direct", label: "Direct ancestor/descendant link", match: (c) => c === "direct" },
];

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
  const [filter, setFilter] = useState("all");
  const [byRecency, setByRecency] = useState(false);
  const { chains } = analysis;

  // Every marriage between relatives, not only cousin ones: an uncle marrying his niece is a
  // closer tie than any cousin link and was previously absent from this list entirely.
  const relativeMarriages = useMemo(
    () => [...analysis.marriages.values()].filter((m) => m.category !== "unrelated"),
    [analysis.marriages]
  );

  // Without reliable dates, generation depth is the only honest proxy for recency: a marriage
  // deeper in the tree is nearer the present. Labelled as estimated wherever it is offered.
  const generations = useMemo(() => computeGenerations(tree), [tree]);
  const generationOf = (m: MarriageAnalysis) =>
    Math.max(generations.get(m.husbandId) ?? 0, generations.get(m.wifeId) ?? 0);

  // Deepest runs first, so the most striking pattern leads. Within a depth, keep a stable order.
  // Gated on `open` and memoized: the panel sits collapsed in the sidebar on every render of the
  // editor, and a tree with hundreds of marriages should not pay to sort a list nobody is looking
  // at. The real 473-person tree makes that difference measurable in the integration tests.
  const sorted = useMemo(() => {
    if (!open) return [];
    const active = FILTERS.find((f) => f.value === filter) ?? FILTERS[0]!;
    const rows = relativeMarriages.filter((m) => active.match(m.category));
    return rows.sort((a, b) =>
      byRecency
        ? generationOf(b) - generationOf(a)
        : (chains.depthByFamily.get(b.familyId) ?? 0) - (chains.depthByFamily.get(a.familyId) ?? 0)
    );
    // `generationOf` closes over `generations`, which is itself memoized on `tree`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, byRecency, relativeMarriages, chains.depthByFamily, generations]);

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
          All marriages between relatives
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {relativeMarriages.length}
          </span>
        </span>
        <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-slate-200 p-3 dark:border-slate-800">
          {relativeMarriages.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No marriages between relatives found in this tree.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                  Show
                  {/* Explicit colours on BOTH the select and its options: a select styled only
                      for dark mode renders its popup list with the platform default background,
                      which is where white-on-white text comes from. */}
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="rounded border border-slate-400 bg-white px-2 py-1.5 text-sm font-normal text-slate-900 [@media(pointer:coarse)]:min-h-11 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {FILTERS.map((f) => (
                      <option
                        key={f.value}
                        value={f.value}
                        className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={byRecency}
                    onChange={(e) => setByRecency(e.target.checked)}
                  />
                  Most recent first
                  <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                    est.
                  </span>
                </label>
                {byRecency && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Ordered by how deep each couple sits in the tree, since marriage dates
                    aren&apos;t recorded — deeper means nearer the present, not a known date.
                  </p>
                )}
              </div>

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
                          {relationshipPhrase(tree, m) ?? m.relation.label}
                          {depth >= 2 && ` · ${depth} generations of cousin marriage`}
                          {byRecency && ` · generation ${generationOf(m)}`}
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
