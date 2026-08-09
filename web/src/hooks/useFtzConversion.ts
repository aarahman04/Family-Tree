import { useCallback, useRef, useState } from "react";
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
  if (message.includes("file too large") || message.includes("archive entry too large")) {
    return message; // already written as a clear, specific, user-facing explanation — see parser/zip.ts
  }
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
  // True while a *replacement* file (one chosen while a tree is already loaded) is being
  // parsed/validated in the background. `state` itself is never touched during this window --
  // only on success -- so a failed or cancelled replace leaves the current session completely
  // untouched. Kept in sync via render-time assignment (not an effect) so selectFile, which
  // fires from a user event well after the current render has committed, always reads the
  // latest stage rather than a stale one captured when this stable callback was first created.
  const [isReplacing, setIsReplacing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const selectFile = useCallback(async (file: File) => {
    const isReplace = stateRef.current.stage === "validated";

    if (!file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION)) {
      const userMessage = `"${file.name}" doesn't look like an FTZ file. Please choose a file ending in ${ACCEPTED_EXTENSION}.`;
      if (isReplace) {
        window.alert(userMessage);
        return;
      }
      setState({
        stage: "error",
        phase: "parse",
        file: { name: file.name, size: file.size },
        userMessage,
        technicalDetails: `Rejected file with extension ".${
          file.name.split(".").pop() ?? ""
        }"; expected ${ACCEPTED_EXTENSION}.`,
      });
      return;
    }

    const fileMeta: FileMeta = { name: file.name, size: file.size };
    if (isReplace) {
      setIsReplacing(true);
    } else {
      setState({ stage: "parsing", file: fileMeta });
    }

    try {
      const buffer = await file.arrayBuffer();
      const response = await runWorkerTask(
        { type: "parse", fileBuffer: buffer, fileName: file.name },
        [buffer]
      );
      if (response.type === "parse:success") {
        // Only point where a replace attempt is allowed to touch `state` -- the new file is
        // fully parsed and validated by this point, so it's safe to swap it in.
        setState({
          stage: "validated",
          file: fileMeta,
          tree: response.tree,
          validation: response.validation,
        });
      } else if (response.type === "parse:error") {
        const userMessage = friendlyParseError(response.message);
        if (isReplace) {
          window.alert(userMessage);
        } else {
          setState({
            stage: "error",
            phase: "parse",
            file: fileMeta,
            userMessage,
            technicalDetails: response.stack ?? response.message,
          });
        }
      }
    } catch (err) {
      const userMessage = "Something unexpected went wrong while reading this file.";
      const technicalDetails = err instanceof Error ? (err.stack ?? err.message) : String(err);
      if (isReplace) {
        window.alert(userMessage);
      } else {
        setState({ stage: "error", phase: "parse", file: fileMeta, userMessage, technicalDetails });
      }
    } finally {
      if (isReplace) setIsReplacing(false);
    }
  }, []);

  const reset = useCallback(() => setState({ stage: "idle" }), []);

  return { state, isReplacing, selectFile, reset };
}
