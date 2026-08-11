import type { UUID, ValidationIssue } from "../../../../models/types.js";

interface ValidationSummaryProps {
  issues: ValidationIssue[];
  onSelect: (id: UUID) => void;
}

/**
 * A dedicated, non-blocking warnings area. Lists validation errors and warnings (never prevents
 * editing) and lets the user jump straight to the affected person. Renders nothing when the tree
 * is clean, so it stays out of the way. The issues come from the existing validation engine,
 * which `applyEdit` reruns after every edit — so this always reflects the current tree.
 */
export function ValidationSummary({ issues, onSelect }: ValidationSummaryProps) {
  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
        <span aria-hidden="true">⚠</span>
        {errors.length > 0 && `${errors.length} error${errors.length === 1 ? "" : "s"}`}
        {errors.length > 0 && warnings.length > 0 && " · "}
        {warnings.length > 0 && `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`}
      </h3>
      <ul className="flex flex-col gap-1">
        {issues.map((issue, i) => {
          const target = issue.relatedIds[0];
          const dot = issue.severity === "error" ? "bg-red-500" : "bg-amber-500";
          const body = (
            <>
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
                aria-hidden="true"
              />
              <span className="text-slate-700">{issue.message}</span>
            </>
          );
          return (
            <li key={`${issue.code}-${i}`}>
              {target ? (
                <button
                  type="button"
                  onClick={() => onSelect(target)}
                  className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-amber-100"
                >
                  {body}
                </button>
              ) : (
                <span className="flex items-start gap-2 px-1 py-0.5 text-xs">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
