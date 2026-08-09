import { useEffect, useState } from "react";
import { useFtzConversion } from "../hooks/useFtzConversion.js";
import { UploadArea } from "../components/UploadArea.js";
import { ConversionProgress } from "../components/ConversionProgress.js";
import { ErrorPanel } from "../components/ErrorPanel.js";
import { TreeExplorer } from "../components/explorer/TreeExplorer.js";
import { confirmDiscardIfUnsaved, setHasUnsavedEdits } from "../lib/unsavedEdits.js";

export function HomePage() {
  const { state, isReplacing, selectFile, reset } = useFtzConversion();
  const [editCount, setEditCount] = useState(0);
  const hasUnsavedEdits = state.stage === "validated" && editCount > 0;

  // Keep the shared "unsaved edits" flag (read by Header's navigation guard) in sync, and
  // clear it on unmount so nothing stays stuck warning about edits that no longer exist.
  useEffect(() => {
    setHasUnsavedEdits(hasUnsavedEdits);
  }, [hasUnsavedEdits]);
  useEffect(() => {
    return () => setHasUnsavedEdits(false);
  }, []);

  // Warn before closing the tab, refreshing, or typing a new URL -- registered only while
  // there's something to lose, and removed the moment there isn't, per the requirement.
  useEffect(() => {
    if (!hasUnsavedEdits) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedEdits]);

  function editWarning(action: string) {
    return `You have ${editCount} unsaved edit${editCount === 1 ? "" : "s"} that will be lost if you ${action}. Continue?`;
  }

  function handleClear() {
    if (!confirmDiscardIfUnsaved(editWarning("clear this file"))) return;
    setEditCount(0);
    reset();
  }

  function handleFileSelected(file: File) {
    // Only asks (and only blocks) when there's actually something to lose -- see
    // confirmDiscardIfUnsaved. The initial upload (no tree loaded yet) is never affected.
    if (!confirmDiscardIfUnsaved(editWarning("replace this file"))) return;
    selectFile(file);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Convert Quick Family Tree (.FTZ) files into GEDCOM.
        </h1>
        <p className="mt-2 text-slate-600">
          Free, open source, and entirely private — your file is processed in your browser and never
          uploaded anywhere. GEDCOM files work with genealogy software like Gramps, RootsMagic,
          FamilySearch, and Legacy Family Tree.
        </p>
      </div>

      <UploadArea
        onFileSelected={handleFileSelected}
        onClear={handleClear}
        currentFile={state.stage === "idle" ? undefined : state.file}
        disabled={state.stage === "parsing" || isReplacing}
      />

      {(state.stage === "parsing" || isReplacing) && <ConversionProgress stage="parsing" />}

      {state.stage === "validated" && (
        // Keyed by import time so a fresh upload always starts a fresh editing/undo session,
        // even if the same file is re-selected.
        <TreeExplorer
          key={state.tree.metadata.importedAt}
          initialTree={state.tree}
          sourceFileName={state.file.name}
          onEditCountChange={setEditCount}
        />
      )}

      {state.stage === "error" && (
        <ErrorPanel
          userMessage={state.userMessage}
          technicalDetails={state.technicalDetails}
          onTryAgain={reset}
        />
      )}
    </div>
  );
}
