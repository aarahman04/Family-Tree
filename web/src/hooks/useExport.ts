import { useCallback, useState } from "react";
import type { ValidationIssue } from "../../../models/types.js";
import type { FamilyTree } from "../../../models/types.js";
import { exportGedcomViaWorker } from "../lib/exportGedcomViaWorker.js";

export type ExportState =
  | { stage: "idle" }
  | { stage: "exporting" }
  | { stage: "done"; gedcom: string; issues: ValidationIssue[] }
  | { stage: "error"; userMessage: string; technicalDetails: string };

/** Export-on-demand for the tree explorer — re-uses exportGedcomViaWorker (the same code path useTreeImport uses), just with its own small idle/exporting/done/error state since it's triggered independently of the initial upload flow. */
export function useExport() {
  const [state, setState] = useState<ExportState>({ stage: "idle" });

  const runExport = useCallback(async (tree: FamilyTree, sourceFileName: string) => {
    setState({ stage: "exporting" });
    const outcome = await exportGedcomViaWorker(tree, sourceFileName);
    if (outcome.ok) {
      setState({ stage: "done", gedcom: outcome.gedcom, issues: outcome.issues });
    } else {
      setState({
        stage: "error",
        userMessage: outcome.userMessage,
        technicalDetails: outcome.technicalDetails,
      });
    }
  }, []);

  const reset = useCallback(() => setState({ stage: "idle" }), []);

  return { state, runExport, reset };
}
