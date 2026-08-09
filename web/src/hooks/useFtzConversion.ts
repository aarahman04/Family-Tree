import { useCallback, useState } from "react";
import type { FamilyTree, ValidationState } from "../../../models/types.js";
import { runWorkerTask } from "../worker/workerClient.js";

export interface FileMeta {
  name: string;
  size: number;
}

export type ConversionState =
  | { stage: "idle" }
  | { stage: "parsing"; file: FileMeta }
  | { stage: "validated"; file: FileMeta; tree: FamilyTree; validation: ValidationState }
  | {
      stage: "error";
      phase: "parse";
      file?: FileMeta;
      userMessage: string;
      technicalDetails: string;
    };

const ACCEPTED_EXTENSION = ".ftz";

function friendlyParseError(message: string): string {
  if (message.includes("node.ftt not found")) {
    return "This ZIP file doesn't contain a node.ftt file, so it doesn't look like a Quick Family Tree export.";
  }
  if (message.includes("not a valid FTZ archive")) {
    return "We couldn't open this file as a ZIP archive. It may be corrupted, or not actually an FTZ file.";
  }
  if (message.includes("unrecognized node.ftt header") || message.includes("file is empty")) {
    return "The data inside this archive isn't in a format we recognize.";
  }
  return "We couldn't read this file as a Quick Family Tree export.";
}

/**
 * Orchestrates the existing parser (via a Web Worker, so large trees never block the UI
 * thread) as a UI-facing state machine covering upload → parse → validate. Contains no
 * parsing/validation logic of its own — see ../worker/ftzWorker.ts. Once a file reaches
 * "validated", the tree explorer (useTreeEditor + ExportPanel) takes over editing and
 * export — this hook's job ends at validation.
 */
export function useFtzConversion() {
  const [state, setState] = useState<ConversionState>({ stage: "idle" });

  const selectFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION)) {
      setState({
        stage: "error",
        phase: "parse",
        file: { name: file.name, size: file.size },
        userMessage: `"${file.name}" doesn't look like an FTZ file. Please choose a file ending in ${ACCEPTED_EXTENSION}.`,
        technicalDetails: `Rejected file with extension ".${
          file.name.split(".").pop() ?? ""
        }"; expected ${ACCEPTED_EXTENSION}.`,
      });
      return;
    }

    const fileMeta: FileMeta = { name: file.name, size: file.size };
    setState({ stage: "parsing", file: fileMeta });

    try {
      const buffer = await file.arrayBuffer();
      const response = await runWorkerTask(
        { type: "parse", fileBuffer: buffer, fileName: file.name },
        [buffer]
      );
      if (response.type === "parse:success") {
        setState({
          stage: "validated",
          file: fileMeta,
          tree: response.tree,
          validation: response.validation,
        });
      } else if (response.type === "parse:error") {
        setState({
          stage: "error",
          phase: "parse",
          file: fileMeta,
          userMessage: friendlyParseError(response.message),
          technicalDetails: response.stack ?? response.message,
        });
      }
    } catch (err) {
      setState({
        stage: "error",
        phase: "parse",
        file: fileMeta,
        userMessage: "Something unexpected went wrong while reading this file.",
        technicalDetails: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
    }
  }, []);

  const reset = useCallback(() => setState({ stage: "idle" }), []);

  return { state, selectFile, reset };
}
