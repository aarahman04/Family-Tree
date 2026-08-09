import type { WorkerRequest, WorkerResponse } from "./protocol.js";

/**
 * Spins up a fresh worker for one request/response round-trip, then terminates it.
 * Kept stateless (no persistent worker) since a single request costs only a few ms to
 * spin up and this avoids any worker-lifecycle/state-management complexity.
 */
export function runWorkerTask(
  request: WorkerRequest,
  transfer: Transferable[] = []
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./ftzWorker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(new Error(event.message || "Worker failed unexpectedly"));
      worker.terminate();
    };

    worker.postMessage(request, transfer);
  });
}
