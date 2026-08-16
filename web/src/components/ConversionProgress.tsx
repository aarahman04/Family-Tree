export type ProgressStage = "parsing" | "converting";

const STAGES: { key: ProgressStage; label: string }[] = [
  { key: "parsing", label: "Parsing & validating…" },
  { key: "converting", label: "Generating GEDCOM…" },
];

interface ConversionProgressProps {
  stage: ProgressStage;
}

/** aria-live region so screen readers announce each stage change without extra prompting. */
export function ConversionProgress({ stage }: ConversionProgressProps) {
  const activeIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      role="status"
      aria-live="polite"
    >
      {STAGES.map((s, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        return (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            {isDone ? (
              <span aria-hidden="true" className="text-green-600 dark:text-green-400">
                ✓
              </span>
            ) : isActive ? (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400"
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 dark:border-slate-700"
              />
            )}
            <span
              className={
                isActive
                  ? "font-medium text-slate-800 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400"
              }
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
