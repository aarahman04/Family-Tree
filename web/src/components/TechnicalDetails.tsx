import type { ReactNode } from "react";

interface TechnicalDetailsProps {
  summary?: string;
  children: ReactNode;
}

/** Native <details>/<summary> — accessible and keyboard-operable with zero extra JS. */
export function TechnicalDetails({
  summary = "Show technical details",
  children,
}: TechnicalDetailsProps) {
  return (
    <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 text-sm">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-slate-700 hover:text-slate-900">
        {summary}
      </summary>
      <div className="border-t border-slate-200 px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words text-slate-600">
        {children}
      </div>
    </details>
  );
}
