import { useEffect, useMemo } from "react";
import type { ValidationIssue } from "../../../src/models/types.js";
import { useAutoFocus } from "../hooks/useAutoFocus.js";
import { TechnicalDetails } from "./TechnicalDetails.js";

interface DownloadPanelProps {
  gedcom: string;
  sourceFileName: string;
  exportIssues: ValidationIssue[];
  onConvertAnother: () => void;
  /** Overrides the secondary action's label — e.g. "Export again" when reused from the tree explorer, where "another file" wouldn't make sense. */
  secondaryActionLabel?: string;
}

function gedcomFileName(sourceFileName: string): string {
  const base = sourceFileName.replace(/\.ftz$/i, "");
  return `${base || "family"}.ged`;
}

export function DownloadPanel({
  gedcom,
  sourceFileName,
  exportIssues,
  onConvertAnother,
  secondaryActionLabel = "Convert another file",
}: DownloadPanelProps) {
  const url = useMemo(
    () => URL.createObjectURL(new Blob([gedcom], { type: "text/plain;charset=utf-8" })),
    [gedcom]
  );

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const fileName = gedcomFileName(sourceFileName);
  const warnings = exportIssues.filter((i) => i.severity !== "info");
  const headingRef = useAutoFocus<HTMLParagraphElement>();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/40">
      <p
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-2 text-base font-semibold text-green-800 dark:text-green-300"
      >
        <span aria-hidden="true">✓</span>
        Conversion successful
      </p>

      <a
        href={url}
        download={fileName}
        className="inline-flex w-fit items-center gap-2 rounded-md bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
      >
        Download {fileName}
      </a>

      <p className="text-xs text-slate-600 dark:text-slate-400">
        You can download this file as many times as you like without re-uploading.
      </p>

      {warnings.length > 0 && (
        <TechnicalDetails summary={`Show technical details (${warnings.length})`}>
          <ul className="flex flex-col gap-1">
            {warnings.map((issue, i) => (
              <li key={i}>
                [{issue.severity}] {issue.code}: {issue.message}
              </li>
            ))}
          </ul>
        </TechnicalDetails>
      )}

      <button
        type="button"
        onClick={onConvertAnother}
        className="w-fit text-sm font-medium text-blue-700 underline hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
      >
        {secondaryActionLabel}
      </button>
    </div>
  );
}
