/**
 * Runs the existing FTZ parser and GEDCOM exporter off the main thread, so a large family
 * tree never freezes the UI. This file contains NO business logic of its own — it only
 * calls into ../../../parser and ../../../gedcom, the same modules covered by
 * docs/parser-implementation.md and docs/gedcom-exporter.md.
 */
import { parseFtzFile } from "../../../src/parser/index.js";
import { exportGedcom } from "../../../src/gedcom/export.js";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

function post(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  if (req.type === "parse") {
    try {
      const { tree, validation } = await parseFtzFile(req.fileBuffer, req.fileName);
      post({ type: "parse:success", tree, validation });
    } catch (err) {
      post({
        type: "parse:error",
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
    return;
  }

  if (req.type === "export") {
    try {
      const result = exportGedcom(req.tree, {
        force: req.force,
        sourceFileName: req.sourceFileName,
      });
      if (result.rejected) {
        post({
          type: "export:rejected",
          rejectionReason: result.rejectionReason ?? "Export was rejected.",
          issues: result.issues,
        });
      } else {
        post({ type: "export:success", gedcom: result.gedcom!, issues: result.issues });
      }
    } catch (err) {
      post({
        type: "export:error",
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }
};
