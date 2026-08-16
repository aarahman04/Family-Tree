import type { FamilyTree, ValidationIssue, ValidationState } from "../../../src/models/types.js";

/** Messages the main thread sends to the worker. */
export type WorkerRequest =
  | { type: "parse"; fileBuffer: ArrayBuffer; fileName: string }
  | { type: "export"; tree: FamilyTree; force?: boolean; sourceFileName?: string };

/** Messages the worker sends back. Exactly one response per request. */
export type WorkerResponse =
  | { type: "parse:success"; tree: FamilyTree; validation: ValidationState }
  | { type: "parse:error"; message: string; stack?: string }
  | { type: "export:success"; gedcom: string; issues: ValidationIssue[] }
  | { type: "export:rejected"; rejectionReason: string; issues: ValidationIssue[] }
  | { type: "export:error"; message: string; stack?: string };
