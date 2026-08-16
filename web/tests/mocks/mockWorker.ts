/**
 * jsdom (the test environment) can't spawn real Web Workers. This mock keeps the message-
 * passing contract identical to src/worker/ftzWorker.ts but runs on the main thread — it
 * still calls the REAL parseFtzFile/exportGedcom, so tests exercise the actual production
 * pipeline, just not across a real thread boundary.
 */
import { parseFtzFile } from "../../../src/parser/index.js";
import { exportGedcom } from "../../../src/gedcom/export.js";
import type { WorkerRequest, WorkerResponse } from "../../src/worker/protocol.js";

type MessageHandler = ((ev: { data: WorkerResponse }) => void) | null;
type ErrorHandler = ((ev: { message: string }) => void) | null;

export class MockWorker {
  onmessage: MessageHandler = null;
  onerror: ErrorHandler = null;

  constructor(_url: string | URL, _opts?: unknown) {}

  postMessage(request: WorkerRequest): void {
    void this.handle(request);
  }

  terminate(): void {}

  private async handle(request: WorkerRequest): Promise<void> {
    let response: WorkerResponse;

    if (request.type === "parse") {
      try {
        const { tree, validation } = await parseFtzFile(request.fileBuffer, request.fileName);
        response = { type: "parse:success", tree, validation };
      } catch (err) {
        response = {
          type: "parse:error",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        };
      }
    } else {
      // exportGedcom itself is synchronous — a real await (unlike the parse branch's
      // await parseFtzFile) so tests can reliably observe the "exporting" state in between,
      // the same way a real Worker round-trip always has an observable in-flight window.
      await new Promise((resolve) => setTimeout(resolve, 50));
      try {
        const result = exportGedcom(request.tree, {
          force: request.force,
          sourceFileName: request.sourceFileName,
        });
        response = result.rejected
          ? {
              type: "export:rejected",
              rejectionReason: result.rejectionReason ?? "Export was rejected.",
              issues: result.issues,
            }
          : { type: "export:success", gedcom: result.gedcom!, issues: result.issues };
      } catch (err) {
        response = {
          type: "export:error",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        };
      }
    }

    this.onmessage?.({ data: response });
  }
}
