import { useState } from "react";
import type { FamilyTree } from "../../../../src/models/types.js";
import type { TreeAnalysis } from "../../../../src/analysis/index.js";
import type { TreeInsights } from "../../lib/insights.js";

/** One label/value row. `estimate` renders a small amber "est." badge next to the value. */
function Stat({ label, value, estimate }: { label: string; value: string; estimate?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="flex items-center gap-1.5 text-right text-sm font-medium text-slate-900 dark:text-slate-100">
        {estimate && (
          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            est.
          </span>
        )}
        {value}
      </span>
    </div>
  );
}

/**
 * A collapsible group of stats. Open by default: the point of the panel is to be scanned, and
 * hiding figures behind a click would work against that — but a reader who has seen enough of a
 * section can fold it away and keep the rest in view.
 */
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0 dark:border-slate-800">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400 [@media(pointer:coarse)]:min-h-11 dark:text-slate-400"
      >
        {title}
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {/* A plain <div>, not a <dl>: sections now mix label/value rows with bars and provenance
          notes, and a definition list may only contain dt/dd groups (axe rule: definition-list). */}
      {open && <div>{children}</div>}
    </div>
  );
}

/** One big at-a-glance figure. Four of these answer the questions people actually open the panel
 * for, without scrolling past thirty rows to find them. */
function Headline({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <div className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      {hint && <div className="text-[10px] text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

/** A labelled proportion bar — reads faster than a bare percentage when comparing branches (S-5). */
function Bar({ label, percent, caption }: { label: string; percent: number; caption?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-slate-600 dark:text-slate-300">{label}</span>
        <span className="shrink-0 font-medium text-slate-900 dark:text-slate-100">
          {Math.round(clamped)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {caption && <span className="text-[10px] text-slate-400 dark:text-slate-500">{caption}</span>}
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
  const lowConfidenceCousinMarriages =
    analysis?.cousinMarriages.filter((m) => m.confidence.level !== "confirmed").length ?? 0;

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
          {/* The four questions people open this panel to answer, before any scrolling. */}
          <div className="grid grid-cols-2 gap-2">
            <Headline label="People" value={String(i.totalMembers)} />
            <Headline label="Generations" value={String(i.generationCount)} />
            {analysis?.timeline.treeAgeRange !== undefined && (
              <Headline
                label="Tree reaches back"
                // A range, not a single number: on a mostly-undated tree the earliest person is
                // many inferences from any real date, and a lone figure would be the most
                // confident-looking thing in the panel and the least earned.
                value={`${analysis.timeline.treeAgeRange.min}–${analysis.timeline.treeAgeRange.max} yrs`}
                hint={
                  analysis.timeline.earliestBirthRange !== undefined
                    ? `oldest born ~${analysis.timeline.earliestBirthRange.from}–${analysis.timeline.earliestBirthRange.to}`
                    : undefined
                }
              />
            )}
            {analysis && analysis.summary.totalMarriages > 0 && (
              <Headline
                label="Cousin marriages"
                value={`${analysis.summary.cousinMarriageCount}`}
                hint={`${analysis.summary.cousinMarriagePercent}% of ${analysis.summary.totalMarriages}`}
              />
            )}
          </div>

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

          {analysis && (
            <Section title="Timeline">
              <Stat
                label="Generation gap"
                value={`${analysis.timeline.generationGap} years`}
                estimate={analysis.timeline.gapIsFallback}
              />
              <Stat
                label="Recorded birth years"
                value={`${analysis.timeline.recordedBirthCount} of ${analysis.timeline.totalPeople}`}
              />
              {analysis.timeline.earliestBirthRange && (
                <Stat
                  label="Oldest ancestor born"
                  value={`~${analysis.timeline.earliestBirthRange.from}–${analysis.timeline.earliestBirthRange.to}`}
                  estimate
                />
              )}
              {/* The estimate's footing, stated rather than implied — on a mostly-undated tree
                      these numbers are the difference between a figure and a guess. */}
              {/* A <div>, not a <p>: this sits inside a <dl>, which only permits dt/dd
                      groups and <div> (axe rule: definition-list). */}
              <div className="pt-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                {analysis.timeline.gapIsFallback
                  ? `Generation gap assumed (only ${analysis.timeline.gapSampleSize} parent-child pair${analysis.timeline.gapSampleSize === 1 ? "" : "s"} have both birth years).`
                  : `Generation gap measured from ${analysis.timeline.gapSampleSize} parent-child pairs.`}{" "}
                Confidence in the timeline: {analysis.timeline.confidence}.
              </div>
            </Section>
          )}

          {analysis && analysis.generations.perGeneration.length > 0 && (
            <Section title="Generations">
              {analysis.generations.mostMarriages && (
                <Stat
                  label="Most marriages"
                  value={`Generation ${analysis.generations.mostMarriages.generation} (${analysis.generations.mostMarriages.marriages})`}
                />
              )}
              {analysis.generations.mostCousinMarriages && (
                <Stat
                  label="Most cousin marriages"
                  value={`Generation ${analysis.generations.mostCousinMarriages.generation} (${analysis.generations.mostCousinMarriages.cousinMarriages})`}
                />
              )}
              {analysis.generations.perGeneration.map((g) => (
                <Stat
                  key={g.generation}
                  label={`Generation ${g.generation}`}
                  value={`${g.people} people · ${g.marriages} marriage${g.marriages === 1 ? "" : "s"}${g.cousinMarriages > 0 ? ` · ${g.cousinMarriages} cousin` : ""}`}
                />
              ))}
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
              {/* A single "31 cousin marriages" figure flattens a tree of distant third-cousin
                  ties and one where first cousins marry three generations running. */}
              {Object.keys(analysis.cousinBreakdown.byDegree)
                .map(Number)
                .sort((a, b) => a - b)
                .map((degree) => (
                  <Stat
                    key={degree}
                    label={`${degree === 1 ? "First" : degree === 2 ? "Second" : degree === 3 ? "Third" : `${degree}th`}-cousin marriages`}
                    value={String(analysis.cousinBreakdown.byDegree[degree])}
                  />
                ))}
              {analysis.cousinBreakdown.onceRemoved > 0 && (
                <Stat
                  label="Of those, removed a generation"
                  value={String(analysis.cousinBreakdown.onceRemoved)}
                />
              )}
              {analysis.cousinBreakdown.multiGenerationChains > 0 && (
                <Stat
                  label="Multi-generation chains"
                  value={String(analysis.cousinBreakdown.multiGenerationChains)}
                />
              )}
              {analysis.cousinBreakdown.branchesWithRepeats > 0 && (
                <Stat
                  label="Branches marrying cousins more than once"
                  value={String(analysis.cousinBreakdown.branchesWithRepeats)}
                />
              )}
              {analysis.cousinBreakdown.generationsSpanned > 0 && (
                <Stat
                  label="Pattern spans"
                  value={`${analysis.cousinBreakdown.generationsSpanned} generation${analysis.cousinBreakdown.generationsSpanned === 1 ? "" : "s"}`}
                />
              )}
              {analysis.summary.maxChainDepth > 0 && (
                <Stat
                  label="Longest cousin-marriage chain"
                  value={`${analysis.summary.maxChainDepth} generation${analysis.summary.maxChainDepth === 1 ? "" : "s"}`}
                />
              )}
              {/* Naming the couples turns a bare depth into something a reader recognises. */}
              {analysis.chains.longestChains[0] && analysis.summary.maxChainDepth >= 2 && (
                <Stat
                  label="Chain runs through"
                  value={analysis.chains.longestChains[0].familyIds
                    .map((familyId) => {
                      const m = analysis.marriages.get(familyId);
                      return m ? `${nameOf(m.husbandId)} × ${nameOf(m.wifeId)}` : undefined;
                    })
                    .filter(Boolean)
                    .join(" → ")}
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
              <Bar
                label="Ancestry completeness (whole tree)"
                percent={analysis.summary.completenessPercent}
                caption="Share of each person's expected ancestor slots that are actually recorded."
              />
              {/* S-5: the same measure per branch, so a reader can see WHICH side of the family is
                  well documented rather than only the tree-wide average. */}
              {analysis.branches.branches.slice(0, 6).map((branch) => {
                const members = [...branch.memberIds];
                const avg =
                  members.length === 0
                    ? 0
                    : (members.reduce(
                        (sum, memberId) =>
                          sum + (analysis.completeness.byPerson.get(memberId) ?? 0),
                        0
                      ) /
                        members.length) *
                      100;
                return (
                  <Bar
                    key={branch.rootPersonId}
                    label={`${nameOf(branch.rootPersonId)}'s branch`}
                    percent={avg}
                    caption={`${branch.descendantCount} descendant${branch.descendantCount === 1 ? "" : "s"}`}
                  />
                );
              })}
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
              {lowConfidenceCousinMarriages > 0 && (
                <Stat
                  label="Low-confidence cousin marriages"
                  value={String(lowConfidenceCousinMarriages)}
                />
              )}
            </Section>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-400">
            Figures marked{" "}
            <span className="font-semibold text-amber-700 dark:text-amber-300">est.</span> are
            worked out from the dates the tree does contain — including a generation gap measured
            from this tree where there is enough data to measure one — rather than read off exact
            records.
          </p>
        </div>
      )}
    </div>
  );
}
