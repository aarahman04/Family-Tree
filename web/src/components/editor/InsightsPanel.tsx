import { useState } from "react";
import type { FamilyTree } from "../../../../src/models/types.js";
import type { TreeAnalysis } from "../../../../src/analysis/index.js";
import type { TreeInsights } from "../../lib/insights.js";

/** One label/value row. `estimate` renders a small amber "est." badge next to the value. */
function Stat({ label, value, estimate }: { label: string; value: string; estimate?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="flex items-center gap-1.5 text-right text-sm font-medium text-slate-900 dark:text-slate-100">
        {estimate && (
          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            est.
          </span>
        )}
        {value}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0 dark:border-slate-800">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400">
        {title}
      </h3>
      <dl>{children}</dl>
    </div>
  );
}

/**
 * The detailed "cool insights" panel for the editor sidebar. Every estimated figure carries an
 * "est." badge and hedged wording ("~1900s", "~175 years") so nothing reads as verified history.
 * Rows are omitted when the underlying data isn't present, so sparse trees stay uncluttered.
 */
interface InsightsPanelProps {
  insights: TreeInsights;
  /** Whole-tree relationship analysis (Insights v2). The "Family health" section renders only
   * when both this and `tree` (for name resolution) are supplied. */
  analysis?: TreeAnalysis;
  tree?: FamilyTree;
}

export function InsightsPanel({ insights, analysis, tree }: InsightsPanelProps) {
  const [open, setOpen] = useState(true);
  const i = insights;
  const nameOf = (id: string) => tree?.persons[id]?.name.trim() || "(no name)";

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">✨</span> Insights
        </span>
        <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-200 p-3 dark:border-slate-800">
          <Section title="People">
            <Stat label="Total members" value={String(i.totalMembers)} />
            <Stat label="Male" value={`${i.maleCount} (${i.malePercent}%)`} />
            <Stat label="Female" value={`${i.femaleCount} (${i.femalePercent}%)`} />
            {i.unknownCount > 0 && (
              <Stat label="Unspecified gender" value={String(i.unknownCount)} />
            )}
            <Stat label="Living (presumed)" value={String(i.livingCount)} estimate />
            <Stat label="Deceased" value={String(i.deceasedCount)} />
          </Section>

          <Section title="Family structure">
            <Stat label="Generations" value={String(i.generationCount)} />
            <Stat label="Marriages" value={String(i.marriageCount)} />
            <Stat label="Avg. children / family" value={String(i.averageChildrenPerFamily)} />
            {i.largestGeneration && (
              <Stat label="Largest generation" value={`${i.largestGeneration.count} people`} />
            )}
            {i.largestFamily && (
              <Stat
                label="Largest family"
                value={`${i.largestFamily.childCount} children (${i.largestFamily.parents})`}
              />
            )}
            {i.disconnectedGroups > 1 && (
              <Stat label="Separate family groups" value={String(i.disconnectedGroups)} />
            )}
          </Section>

          {(i.estimatedEarliestDecade !== undefined || i.estimatedSpanYears !== undefined) && (
            <Section title="Timeline">
              {i.estimatedEarliestDecade !== undefined && (
                <Stat label="Reaches back to" value={`~${i.estimatedEarliestDecade}s`} estimate />
              )}
              {i.estimatedSpanYears !== undefined && (
                <Stat label="Tree spans" value={`~${i.estimatedSpanYears} years`} estimate />
              )}
            </Section>
          )}

          {(i.averageLifespan !== undefined ||
            i.longestLived ||
            i.oldestLiving ||
            i.youngestLiving) && (
            <Section title="Lifespan">
              {i.averageLifespan !== undefined && (
                <Stat label="Average lifespan" value={`${i.averageLifespan} years`} estimate />
              )}
              {i.longestLived && (
                <Stat
                  label="Longest-lived"
                  value={`${i.longestLived.name} (${i.longestLived.years} yrs)`}
                />
              )}
              {i.oldestLiving && (
                <Stat
                  label="Oldest living"
                  value={`${i.oldestLiving.name} (${i.oldestLiving.age})`}
                  estimate
                />
              )}
              {i.youngestLiving && (
                <Stat
                  label="Youngest living"
                  value={`${i.youngestLiving.name} (${i.youngestLiving.age})`}
                  estimate
                />
              )}
            </Section>
          )}

          {(i.mostCommonSurname || i.mostCommonFirstName) && (
            <Section title="Names">
              {i.mostCommonSurname && (
                <Stat
                  label="Most common surname"
                  value={`${i.mostCommonSurname.name} (${i.mostCommonSurname.count})`}
                />
              )}
              {i.mostCommonFirstName && (
                <Stat
                  label="Most common first name"
                  value={`${i.mostCommonFirstName.name} (${i.mostCommonFirstName.count})`}
                />
              )}
            </Section>
          )}

          {analysis && tree && (
            <Section title="Family health">
              {analysis.summary.totalMarriages > 0 && (
                <Stat
                  label="Cousin marriages"
                  value={`${analysis.summary.cousinMarriageCount} of ${analysis.summary.totalMarriages} (${analysis.summary.cousinMarriagePercent}%)`}
                />
              )}
              {analysis.summary.maxChainDepth > 0 && (
                <Stat
                  label="Cousin-marriage chain depth"
                  value={`${analysis.summary.maxChainDepth} generation${analysis.summary.maxChainDepth === 1 ? "" : "s"}`}
                />
              )}
              <Stat
                label="Pedigree collapse"
                value={`${analysis.summary.pedigreeCollapsePercent}%`}
              />
              {analysis.branches.branches.length > 0 && (
                <Stat label="Branch overlap" value={`${analysis.summary.branchOverlapPercent}%`} />
              )}
              {analysis.influence.mostInfluentialAncestor && (
                <Stat
                  label="Most influential ancestor"
                  value={`${nameOf(analysis.influence.mostInfluentialAncestor.personId)} (${analysis.influence.mostInfluentialAncestor.descendantCount} descendant${analysis.influence.mostInfluentialAncestor.descendantCount === 1 ? "" : "s"})`}
                />
              )}
              {analysis.influence.mostConnectedPerson && (
                <Stat
                  label="Most connected person"
                  value={`${nameOf(analysis.influence.mostConnectedPerson.personId)} (${analysis.influence.mostConnectedPerson.connectionCount} connection${analysis.influence.mostConnectedPerson.connectionCount === 1 ? "" : "s"})`}
                />
              )}
            </Section>
          )}

          {analysis && tree && (
            <Section title="Data quality">
              <Stat
                label="Ancestry completeness"
                value={`${analysis.summary.completenessPercent}%`}
              />
              {analysis.quality.duplicateSuspects.length > 0 && (
                <Stat
                  label="Duplicate suspects"
                  value={String(analysis.quality.duplicateSuspects.length)}
                />
              )}
              {analysis.quality.duplicateNameGroups.length > 0 && (
                <Stat
                  label="Duplicate names"
                  value={String(analysis.quality.duplicateNameGroups.length)}
                />
              )}
              {analysis.quality.incompleteRecords.length > 0 && (
                <Stat
                  label="Incomplete records"
                  value={String(analysis.quality.incompleteRecords.length)}
                />
              )}
              {analysis.quality.isolatedRecordIds.length > 0 && (
                <Stat
                  label="Isolated records"
                  value={String(analysis.quality.isolatedRecordIds.length)}
                />
              )}
              {analysis.quality.suspiciousLoops.length > 0 && (
                <Stat
                  label="Suspicious loops"
                  value={String(analysis.quality.suspiciousLoops.length)}
                />
              )}
              {(() => {
                const lowConfidence = analysis.cousinMarriages.filter(
                  (m) => m.confidence.level !== "confirmed"
                ).length;
                return (
                  lowConfidence > 0 && (
                    <Stat label="Low-confidence cousin marriages" value={String(lowConfidence)} />
                  )
                );
              })()}
            </Section>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-400">
            Figures marked{" "}
            <span className="font-semibold text-amber-700 dark:text-amber-300">est.</span> are
            estimated from available dates and generation depth (~30 years per generation), not
            exact records.
          </p>
        </div>
      )}
    </div>
  );
}
