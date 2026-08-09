import { useEffect, useMemo, useState } from "react";
import type { FamilyTree, UUID } from "../../../../models/types.js";
import { buildSearchIndex } from "../../lib/search.js";
import { useExport } from "../../hooks/useExport.js";
import { useTreeEditor } from "../../state/useTreeEditor.js";
import { ExportPanel } from "./ExportPanel.js";
import { FamilyTreeCanvas } from "./FamilyTreeCanvas.js";
import { PersonInspector } from "./PersonInspector.js";
import { SearchBox } from "./SearchBox.js";
import { PosterExportPanel } from "../poster/PosterExportPanel.js";

interface TreeExplorerProps {
  initialTree: FamilyTree;
  sourceFileName: string;
  /** Notified on every edit-count change, so a parent that owns file-replace/clear actions
   * can guard them against discarding unsaved work -- see web/src/lib/unsavedEdits.ts. */
  onEditCountChange?: (count: number) => void;
}

/** Prefers the FTZ header's anchor person (see docs/ftz-format-spec.md) as the default view, falling back to any person deterministically. */
function resolveDefaultFocus(tree: FamilyTree): UUID | undefined {
  const anchorFtzId = tree.metadata.ftzAnchorId;
  if (anchorFtzId !== undefined) {
    const match = Object.values(tree.persons).find((p) => p.ftzId === anchorFtzId);
    if (match) return match.id;
  }
  return Object.keys(tree.persons).sort()[0];
}

/**
 * Ties together editing (useTreeEditor), visualization (FamilyTreeCanvas), the person
 * inspector, search, and export into one screen. Mount a fresh instance per uploaded file
 * (see HomePage's `key` usage) so undo history never leaks across files.
 */
export function TreeExplorer({
  initialTree,
  sourceFileName,
  onEditCountChange,
}: TreeExplorerProps) {
  const { tree, canUndo, canRedo, editCount, edit, undo, redo } = useTreeEditor(initialTree);
  useEffect(() => {
    onEditCountChange?.(editCount);
  }, [editCount, onEditCountChange]);
  const [focusPersonId, setFocusPersonId] = useState<UUID | undefined>(() =>
    resolveDefaultFocus(initialTree)
  );
  const [selectedPersonId, setSelectedPersonId] = useState<UUID | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<UUID>>(new Set());
  const [view, setView] = useState<"explore" | "poster">("explore");
  const { state: exportState, runExport, reset: resetExport } = useExport();
  // Export captures the tree by value at click time (it runs in a worker, off the pure
  // editor path) — if editing stayed live during that round-trip, a save/undo/redo could
  // change the on-screen tree before the export finishes, so the downloaded file would
  // silently no longer match what the user sees. Disabling edits while a snapshot is
  // in flight keeps the download trustworthy instead of just "usually right."
  const isExporting = exportState.stage === "exporting";

  const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);
  const errors = tree.validation.issues.filter((i) => i.severity === "error");
  const warnings = tree.validation.issues.filter((i) => i.severity === "warning");

  function goTo(id: UUID) {
    setFocusPersonId(id);
    setSelectedPersonId(id);
  }

  function handleExpand(id: UUID) {
    setExpandedIds((prev) => new Set(prev).add(id));
  }

  if (!focusPersonId) {
    return <p className="text-sm text-slate-600">This tree has no people to display.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Explorer view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "explore"}
          onClick={() => setView("explore")}
          className={`px-3 py-1.5 text-sm font-medium ${
            view === "explore"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Explore
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "poster"}
          onClick={() => setView("poster")}
          className={`px-3 py-1.5 text-sm font-medium ${
            view === "poster"
              ? "border-b-2 border-blue-600 text-blue-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          Print poster
        </button>
      </div>

      <p className="text-xs text-slate-600" role="status">
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
            {warnings.length} validation {warnings.length === 1 ? "warning" : "warnings"}.{" "}
          </span>
        )}
        {errors.length === 0 && warnings.length === 0 && (
          <span className="text-green-700">Ready for export.</span>
        )}
      </p>

      {view === "explore" ? (
        <div className="flex flex-col gap-3 lg:flex-row">
          {/* flex + flex-col so this div's own height comes from the flex algorithm, not a
              percentage cascade — React Flow's descendants use height:100% chained through
              several wrapper divs, and a flex item whose height is decided by min-height
              winning over its flex-basis (as h-[65vh] vs min-h-96 does on narrow viewports)
              is NOT treated as a "definite" height by percentage-height descendants in
              Chromium, so those descendants silently collapsed to 0 height on mobile. See
              docs/explorer-architecture.md's "Known limitations" for the full writeup. */}
          <div className="flex h-[65vh] min-h-96 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200">
            <FamilyTreeCanvas
              tree={tree}
              focusPersonId={focusPersonId}
              expandedIds={expandedIds}
              selectedPersonId={selectedPersonId}
              onSelectPerson={setSelectedPersonId}
              onExpand={handleExpand}
            />
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-80 lg:shrink-0">
            {selectedPersonId && tree.persons[selectedPersonId] && (
              <div className="max-h-[65vh] overflow-y-auto rounded-lg border border-slate-200 bg-white">
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
            )}
            <ExportPanel
              tree={tree}
              editCount={editCount}
              sourceFileName={sourceFileName}
              state={exportState}
              runExport={runExport}
              reset={resetExport}
            />
          </div>
        </div>
      ) : (
        <PosterExportPanel tree={tree} sourceFileName={sourceFileName} />
      )}
    </div>
  );
}
