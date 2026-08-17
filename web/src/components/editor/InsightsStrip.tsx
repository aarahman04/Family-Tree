import type { TreeAnalysis } from "../../../../src/analysis/index.js";
import type { TreeInsights } from "../../lib/insights.js";
import { useScrollFade } from "../../lib/useScrollFade.js";

function Chip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <span aria-hidden="true">{icon}</span>
      <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
      <span className="text-slate-400 dark:text-slate-400">{label}</span>
    </span>
  );
}

/** A thin, horizontally-scrollable strip of headline stats across the top of the editor. The
 * detailed breakdown lives in the sidebar's InsightsPanel. */
export function InsightsStrip({
  insights,
  analysis,
}: {
  insights: TreeInsights;
  analysis?: TreeAnalysis;
}) {
  const i = insights;
  const { ref, edges } = useScrollFade<HTMLDivElement>();
  return (
    <div className="relative border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div
        ref={ref}
        className="flex items-center gap-2 overflow-x-auto px-4 py-1.5"
        aria-label="Tree insights summary"
      >
        <Chip icon="👥" label="members" value={String(i.totalMembers)} />
        <Chip icon="♂" label="male" value={String(i.maleCount)} />
        <Chip icon="♀" label="female" value={String(i.femaleCount)} />
        <Chip icon="🌳" label="generations" value={String(i.generationCount)} />
        {/* One source of truth for the timeline: analysis.timeline, which measures the tree's own
            generation gap. The old computeTreeInsights estimate assumed 30 years and could
            disagree with the figure shown in the panel. */}
        {analysis?.timeline.earliestBirthRange && (
          <Chip
            icon="🕰️"
            label="est. earliest"
            value={`~${analysis.timeline.earliestBirthRange.from}s`}
          />
        )}
        {analysis && analysis.summary.cousinMarriageCount > 0 && (
          <Chip
            icon="🧬"
            label="cousin marriages"
            value={`${analysis.summary.cousinMarriagePercent}%`}
          />
        )}
      </div>
      {edges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white dark:from-slate-900" />
      )}
      {edges.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white dark:from-slate-900" />
      )}
    </div>
  );
}
