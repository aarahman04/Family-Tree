import { useEffect, useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../models/types.js";
import { buildSearchIndex } from "../lib/search.js";
import { computeTreeInsights } from "../lib/insights.js";
import { setHasUnsavedEdits } from "../lib/unsavedEdits.js";
import { useExport } from "../hooks/useExport.js";
import { useTreeEditor } from "../state/useTreeEditor.js";
import { useTreeSession, type TreeSession } from "../state/treeSession.js";
import { EditorCanvas } from "../components/editor/EditorCanvas.js";
import { ExportMenu } from "../components/editor/ExportMenu.js";
import { InsightsPanel } from "../components/editor/InsightsPanel.js";
import { InsightsStrip } from "../components/editor/InsightsStrip.js";
import { PersonInspector } from "../components/explorer/PersonInspector.js";
import { SearchBox } from "../components/explorer/SearchBox.js";

/** Prefers the FTZ header's anchor person as the initial view, falling back deterministically. */
function resolveDefaultFocus(tree: FamilyTree): UUID | undefined {
  const anchorFtzId = tree.metadata.ftzAnchorId;
  if (anchorFtzId !== undefined) {
    const match = Object.values(tree.persons).find((p) => p.ftzId === anchorFtzId);
    if (match) return match.id;
  }
  return Object.keys(tree.persons).sort()[0];
}

export function EditorPage() {
  const { session } = useTreeSession();
  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-semibold text-slate-800">No tree loaded.</p>
        <p className="text-sm text-slate-600">Upload a family tree first.</p>
        <a
          href="#/"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Upload a family tree
        </a>
      </div>
    );
  }
  return <EditorWorkspace session={session} />;
}

function EditorWorkspace({ session }: { session: TreeSession }) {
  const { tree, canUndo, canRedo, editCount, edit, undo, redo } = useTreeEditor(session.tree);
  const { state: exportState, runExport, reset: resetExport } = useExport();
  const isExporting = exportState.stage === "exporting";

  const [selectedPersonId, setSelectedPersonId] = useState<UUID | undefined>(undefined);
  const [focusPersonId, setFocusPersonId] = useState<UUID | undefined>(() =>
    resolveDefaultFocus(session.tree)
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);
  const insights = useMemo(() => computeTreeInsights(tree), [tree]);
  const errors = tree.validation.issues.filter((i) => i.severity === "error");
  const warnings = tree.validation.issues.filter((i) => i.severity === "warning");

  useEffect(() => {
    setHasUnsavedEdits(editCount > 0);
  }, [editCount]);
  useEffect(() => () => setHasUnsavedEdits(false), []);
  useEffect(() => {
    if (editCount === 0) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editCount]);

  function goTo(id: UUID) {
    setFocusPersonId(id);
    setSelectedPersonId(id);
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <SearchBox tree={tree} index={searchIndex} onSelect={goTo} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo || isExporting}
              aria-label="Undo last edit"
              className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo || isExporting}
              aria-label="Redo last undone edit"
              className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↷ Redo
            </button>
          </div>
          <p className="ml-auto text-xs text-slate-600" role="status">
            <span className="font-medium text-slate-900">{Object.keys(tree.persons).length}</span>{" "}
            people,{" "}
            <span className="font-medium text-slate-900">{Object.keys(tree.families).length}</span>{" "}
            families.{" "}
            {errors.length > 0 && (
              <span className="text-red-700">
                {errors.length} validation {errors.length === 1 ? "error" : "errors"}.{" "}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="text-amber-700">
                {warnings.length} validation {warnings.length === 1 ? "warning" : "warnings"}.
              </span>
            )}
            {errors.length === 0 && warnings.length === 0 && (
              <span className="text-green-700">Ready for export.</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            {sidebarOpen ? "Hide panel" : "Show panel"}
          </button>
        </div>
        <InsightsStrip insights={insights} />
        <div className="min-h-0 flex-1">
          <EditorCanvas
            tree={tree}
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
            focusPersonId={focusPersonId}
          />
        </div>
      </div>

      {sidebarOpen && (
        <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3">
          {selectedPersonId && tree.persons[selectedPersonId] ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <PersonInspector
                tree={tree}
                personId={selectedPersonId}
                searchIndex={searchIndex}
                onNavigate={goTo}
                onEdit={edit}
                onClose={() => setSelectedPersonId(undefined)}
                disabled={isExporting}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              Select a person on the canvas to view and edit their details.
            </p>
          )}
          <InsightsPanel insights={insights} />
          <ExportMenu
            tree={tree}
            sourceFileName={session.fileName}
            editCount={editCount}
            exportState={exportState}
            runExport={runExport}
            resetExport={resetExport}
          />
        </aside>
      )}
    </div>
  );
}
