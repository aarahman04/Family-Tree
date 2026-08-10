import type { TreeInsights } from "../../lib/insights.js";

function Chip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
      <span aria-hidden="true">{icon}</span>
      <span className="font-semibold text-slate-900">{value}</span>
      <span className="text-slate-400">{label}</span>
    </span>
  );
}

/** A thin, horizontally-scrollable strip of headline stats across the top of the editor. The
 * detailed breakdown lives in the sidebar's InsightsPanel. */
export function InsightsStrip({ insights }: { insights: TreeInsights }) {
  const i = insights;
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-1.5"
      aria-label="Tree insights summary"
    >
      <Chip icon="👥" label="members" value={String(i.totalMembers)} />
      <Chip icon="♂" label="male" value={String(i.maleCount)} />
      <Chip icon="♀" label="female" value={String(i.femaleCount)} />
      <Chip icon="🌳" label="generations" value={String(i.generationCount)} />
      {i.estimatedEarliestDecade !== undefined && (
        <Chip icon="🕰️" label="est. earliest" value={`~${i.estimatedEarliestDecade}s`} />
      )}
    </div>
  );
}
