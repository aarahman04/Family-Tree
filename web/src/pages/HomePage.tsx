import { useFtzConversion } from "../hooks/useFtzConversion.js";
import { UploadArea } from "../components/UploadArea.js";
import { ConversionProgress } from "../components/ConversionProgress.js";
import { ErrorPanel } from "../components/ErrorPanel.js";
import { TreeExplorer } from "../components/explorer/TreeExplorer.js";

export function HomePage() {
  const { state, selectFile, reset } = useFtzConversion();

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
        onFileSelected={selectFile}
        onClear={reset}
        currentFile={state.stage === "idle" ? undefined : state.file}
        disabled={state.stage === "parsing"}
      />

      {state.stage === "parsing" && <ConversionProgress stage="parsing" />}

      {state.stage === "validated" && (
        // Keyed by import time so a fresh upload always starts a fresh editing/undo session,
        // even if the same file is re-selected.
        <TreeExplorer
          key={state.tree.metadata.importedAt}
          initialTree={state.tree}
          sourceFileName={state.file.name}
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
