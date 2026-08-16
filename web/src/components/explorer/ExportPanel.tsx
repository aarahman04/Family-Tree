import type { FamilyTree } from "../../../../models/types.js";
import type { ExportState } from "../../hooks/useExport.js";
import { ConversionProgress } from "../ConversionProgress.js";
import { DownloadPanel } from "../DownloadPanel.js";
import { ErrorPanel } from "../ErrorPanel.js";

interface ExportPanelProps {
  tree: FamilyTree;
  editCount: number;
  sourceFileName: string;
  state: ExportState;
  runExport: (tree: FamilyTree, sourceFileName: string) => void;
  reset: () => void;
}

/**
 * Persistent export summary + action, reachable at any point in the explorer (with or
 * without edits) — reuses the existing exportGedcom pipeline via useExport, never a second
 * implementation. `state`/`runExport`/`reset` are owned by EditorPage (not this
 * component) so it can also disable editing elsewhere in the editor while a snapshot is
 * mid-export — see the "disabled" prop threaded to PersonInspector.
 */
export function ExportPanel({
  tree,
  editCount,
  sourceFileName,
  state,
  runExport,
  reset,
}: ExportPanelProps) {
  const personCount = Object.keys(tree.persons).length;
  const familyCount = Object.keys(tree.families).length;
  const errors = tree.validation.issues.filter((i) => i.severity === "error");
  const warnings = tree.validation.issues.filter((i) => i.severity === "warning");

  if (state.stage === "done") {
    return (
      <DownloadPanel
        gedcom={state.gedcom}
        sourceFileName={sourceFileName}
        exportIssues={state.issues}
        onConvertAnother={reset}
        secondaryActionLabel="Back to export summary"
      />
    );
  }

  if (state.stage === "error") {
    return (
      <ErrorPanel
        userMessage={state.userMessage}
        technicalDetails={state.technicalDetails}
        onTryAgain={reset}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Export</h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <dt>Individuals</dt>
        <dd className="font-medium text-slate-900 dark:text-slate-100">{personCount}</dd>
        <dt>Families</dt>
        <dd className="font-medium text-slate-900 dark:text-slate-100">{familyCount}</dd>
        <dt>Edits made this session</dt>
        <dd className="font-medium text-slate-900 dark:text-slate-100">{editCount}</dd>
        <dt>Validation warnings</dt>
        <dd className="font-medium text-slate-900 dark:text-slate-100">{warnings.length}</dd>
      </dl>

      {errors.length > 0 && (
        <p className="text-xs text-red-700 dark:text-red-400">
          {errors.length} validation {errors.length === 1 ? "error" : "errors"} must be resolved
          before this tree can be exported.
        </p>
      )}

      {state.stage === "exporting" ? (
        <ConversionProgress stage="converting" />
      ) : (
        <button
          type="button"
          onClick={() => runExport(tree, sourceFileName)}
          disabled={errors.length > 0}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          Export GEDCOM
        </button>
      )}
    </div>
  );
}
