import { useCallback, useRef, useState } from "react";
import type { FamilyTree, ValidationState } from "../../../src/models/types.js";
import { importGedcom } from "../../../src/gedcom/import.js";
import { GedcomImportError } from "../../../src/gedcom/errors.js";
import { runWorkerTask } from "../worker/workerClient.js";

export interface FileMeta {
  name: string;
  size: number;
}

export type TreeFormat = "ftz" | "gedcom";

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

const EXT: Record<TreeFormat, string[]> = {
  ftz: [".ftz"],
  gedcom: [".ged", ".gedcom"],
};

/** All accepted extensions, as a single `accept` attribute / user-facing list. */
export const ACCEPT_EXTENSIONS = [...EXT.ftz, ...EXT.gedcom].join(",");

/** Picks the importer purely from the file extension, so dropping either supported
 * file type just works — the user never has to tell us which format it is. */
function detectFormat(fileName: string): TreeFormat | undefined {
  const lower = fileName.toLowerCase();
  if (EXT.ftz.some((e) => lower.endsWith(e))) return "ftz";
  if (EXT.gedcom.some((e) => lower.endsWith(e))) return "gedcom";
  return undefined;
}

function friendlyFtzError(message: string): string {
  if (message.includes("file too large") || message.includes("archive entry too large"))
    return message;
  if (message.includes("node.ftt not found"))
    return "This ZIP file doesn't contain a node.ftt file, so it doesn't look like a Quick Family Tree export.";
  if (message.includes("not a valid FTZ archive"))
    return "We couldn't open this file as a ZIP archive. It may be corrupted, or not actually an FTZ file.";
  if (message.includes("unrecognized node.ftt header") || message.includes("file is empty"))
    return "The data inside this archive isn't in a format we recognize.";
  return "We couldn't read this file as a Quick Family Tree export.";
}

/**
 * UI-facing state machine for importing a family tree from either format:
 *  - FTZ (Quick Family Tree) is parsed in a Web Worker (jszip is heavy), and
 *  - GEDCOM (.ged/.gedcom) is parsed on the main thread (it's plain text and fast).
 * Both land on the same `validated` state carrying a canonical FamilyTree, so everything
 * downstream (the explorer, the print poster) is format-agnostic.
 */
export function useTreeImport() {
  const [state, setState] = useState<ConversionState>({ stage: "idle" });
  const [isReplacing, setIsReplacing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const selectFile = useCallback(async (file: File) => {
    const isReplace = stateRef.current.stage === "validated";
    const fileMeta: FileMeta = { name: file.name, size: file.size };
    const format = detectFormat(file.name);

    if (!format) {
      const userMessage = `"${file.name}" isn't a supported file. Please choose a GEDCOM file (.ged or .gedcom) or a Quick Family Tree file (.ftz).`;
      if (isReplace) return void window.alert(userMessage);
      return void setState({
        stage: "error",
        phase: "parse",
        file: fileMeta,
        userMessage,
        technicalDetails: `Rejected "${file.name}"; expected .ftz, .ged, or .gedcom.`,
      });
    }

    if (isReplace) setIsReplacing(true);
    else setState({ stage: "parsing", file: fileMeta });

    try {
      if (format === "gedcom") {
        const text = await file.text();
        const { tree, validation } = importGedcom(text, file.name);
        setState({ stage: "validated", file: fileMeta, tree, validation });
      } else {
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
          const userMessage = friendlyFtzError(response.message);
          if (isReplace) window.alert(userMessage);
          else
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
      const isGedcom = err instanceof GedcomImportError;
      const userMessage = isGedcom
        ? err.message
        : "Something unexpected went wrong while reading this file.";
      const technicalDetails = err instanceof Error ? (err.stack ?? err.message) : String(err);
      if (isReplace) window.alert(userMessage);
      else
        setState({ stage: "error", phase: "parse", file: fileMeta, userMessage, technicalDetails });
    } finally {
      if (isReplace) setIsReplacing(false);
    }
  }, []);

  const reset = useCallback(() => setState({ stage: "idle" }), []);

  return { state, isReplacing, selectFile, reset };
}
