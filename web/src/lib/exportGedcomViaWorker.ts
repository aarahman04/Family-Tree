import type { FamilyTree, ValidationIssue } from "../../../models/types.js";
import { runWorkerTask } from "../worker/workerClient.js";

export type ExportOutcome =
  | { ok: true; gedcom: string; issues: ValidationIssue[] }
  | { ok: false; userMessage: string; technicalDetails: string };

/** Shared by the initial-conversion flow (useTreeImport) and the post-edit export flow (explorer) — one place that calls the worker/exporter, so neither re-implements the response mapping. */
export async function exportGedcomViaWorker(
  tree: FamilyTree,
  sourceFileName: string
): Promise<ExportOutcome> {
  try {
    const response = await runWorkerTask({ type: "export", tree, sourceFileName });
    if (response.type === "export:success") {
      return { ok: true, gedcom: response.gedcom, issues: response.issues };
    }
    if (response.type === "export:rejected") {
      return {
        ok: false,
        userMessage:
          "This file has data issues that need to be resolved before it can be converted.",
        technicalDetails: [
          response.rejectionReason,
          ...response.issues.map((i) => `[${i.severity}] ${i.code}: ${i.message}`),
        ].join("\n"),
      };
    }
    if (response.type === "export:error") {
      return {
        ok: false,
        userMessage: "Something unexpected went wrong while generating the GEDCOM file.",
        technicalDetails: response.stack ?? response.message,
      };
    }
    // An export request only ever produces an export:* response — this is unreachable in
    // practice, but keeps the return type honest without a runtime type assertion.
    return {
      ok: false,
      userMessage: "Something unexpected went wrong while generating the GEDCOM file.",
      technicalDetails: `Unexpected worker response type: ${response.type}`,
    };
  } catch (err) {
    return {
      ok: false,
      userMessage: "Something unexpected went wrong while generating the GEDCOM file.",
      technicalDetails: err instanceof Error ? (err.stack ?? err.message) : String(err),
    };
  }
}
