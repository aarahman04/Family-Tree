import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FamilyTree, UUID } from "../../../src/models/types.js";
import { buildSearchIndex } from "../lib/search.js";
import { computeTreeInsights } from "../lib/insights.js";
import { saveSession } from "../lib/autosave.js";
import { setHasUnsavedEdits } from "../lib/unsavedEdits.js";
import { useExport } from "../hooks/useExport.js";
import { useTreeEditor } from "../state/useTreeEditor.js";
import { useTreeSession, type TreeSession } from "../state/treeSession.js";
import { deletePerson } from "../../../src/editor/operations.js";
import { EditorCanvas, type EditorCanvasHandle } from "../components/editor/EditorCanvas.js";
import { ExportMenu } from "../components/editor/ExportMenu.js";
import { AddPersonMenu } from "../components/editor/AddPersonMenu.js";
import { ViewMenu } from "../components/editor/ViewMenu.js";
import { AppearanceMenu } from "../components/editor/AppearanceMenu.js";
import {
  loadAppearancePrefs,
  saveAppearancePrefs,
  type AppearancePrefs,
} from "../lib/appearancePrefs.js";
import { ValidationSummary } from "../components/editor/ValidationSummary.js";
import { InsightsPanel } from "../components/editor/InsightsPanel.js";
import { InsightsStrip } from "../components/editor/InsightsStrip.js";
import { QuickActions } from "../components/editor/QuickActions.js";
import { PersonInspector } from "../components/explorer/PersonInspector.js";
import { SearchBox } from "../components/explorer/SearchBox.js";
import { shouldSidebarStartOpen } from "../lib/sidebarLayout.js";
import { useCloseOnEscape } from "../lib/useCloseOnEscape.js";

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
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">No tree loaded.</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Upload a family tree first.</p>
        <a
          href="#/"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          Upload a family tree
        </a>
      </div>
    );
  }
  return <EditorWorkspace session={session} />;
}

function EditorWorkspace({ session }: { session: TreeSession }) {
  const { setSession } = useTreeSession();
  const { tree, canUndo, canRedo, editCount, edit, undo, redo } = useTreeEditor(session.tree);
  const { state: exportState, runExport, reset: resetExport } = useExport();
  const isExporting = exportState.stage === "exporting";

  const [selectedPersonId, setSelectedPersonId] = useState<UUID | undefined>(undefined);
  const [focusPersonId, setFocusPersonId] = useState<UUID | undefined>(() =>
    resolveDefaultFocus(session.tree)
  );
  // Seed the panel's open state from viewport width (E1): on phones/tablets the fixed 384px panel
  // would crush the canvas, so it starts closed there. One-time seed — the toolbar toggle owns it
  // thereafter (see shouldSidebarStartOpen).
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    shouldSidebarStartOpen(typeof window === "undefined" ? 0 : window.innerWidth)
  );
  const [toast, setToast] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  // Appearance is a per-user view preference, persisted separately from the tree (refinement 5).
  const [appearance, setAppearance] = useState<AppearancePrefs>(() => loadAppearancePrefs());
  const updateAppearance = useCallback((next: AppearancePrefs) => {
    setAppearance(next);
    saveAppearancePrefs(next);
  }, []);
  const toggleShowPhotos = useCallback(
    () =>
      updateAppearance({
        ...appearance,
        displayMode: appearance.displayMode === "photoCards" ? "compact" : "photoCards",
      }),
    [appearance, updateAppearance]
  );
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<EditorCanvasHandle>(null);
  // Below lg the toolbar actions collapse behind a single ☰ trigger (PHASE 3); this owns that
  // dropdown's open state. Escape closes it.
  const [actionsOpen, setActionsOpen] = useState(false);
  useCloseOnEscape(actionsOpen, () => setActionsOpen(false));

  const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);
  const insights = useMemo(() => computeTreeInsights(tree), [tree]);
  const errors = tree.validation.issues.filter((i) => i.severity === "error");
  const warnings = tree.validation.issues.filter((i) => i.severity === "warning");

  useEffect(() => {
    setHasUnsavedEdits(editCount > 0);
  }, [editCount]);
  useEffect(() => () => setHasUnsavedEdits(false), []);

  // Autosave: mirror edits into the in-memory session (so leaving and re-entering the editor
  // resumes them) immediately, and persist to localStorage (debounced) so a reload or crash
  // can offer to restore. Best-effort — saveSession swallows storage errors.
  useEffect(() => {
    if (editCount === 0) return;
    setSession({ tree, fileName: session.fileName });
    const id = setTimeout(() => saveSession({ tree, fileName: session.fileName }), 800);
    return () => clearTimeout(id);
  }, [tree, editCount, session.fileName, setSession]);
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

  // Delete is immediate + undoable — no confirm dialog, just a temporary "Person deleted · Undo"
  // toast (per the design). Deletion goes through the normal edit() path, so undo/redo work.
  const handleDeletePerson = useCallback(
    (id: UUID) => {
      edit((t) => deletePerson(t, id));
      setSelectedPersonId((cur) => (cur === id ? undefined : cur));
      setToast("Person deleted");
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    },
    [edit]
  );
  function handleUndoDelete() {
    undo();
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  // Keyboard shortcuts: Ctrl/Cmd+F focus search, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo,
  // Delete removes the selected person, Esc clears selection. Editor-wide shortcuts are ignored
  // while typing in a field (so the field's own undo/find still work), except Escape (blur).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        searchWrapRef.current?.querySelector("input")?.focus();
        return;
      }
      if (typing) {
        if (e.key === "Escape") (el as HTMLElement).blur();
        return;
      }
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo && !isExporting) redo();
        } else if (canUndo && !isExporting) {
          undo();
        }
        return;
      }
      if (e.key === "Delete" && selectedPersonId && !isExporting) {
        e.preventDefault();
        handleDeletePerson(selectedPersonId);
        return;
      }
      if (e.key === "Escape") setSelectedPersonId(undefined);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, canRedo, isExporting, undo, redo, selectedPersonId, handleDeletePerson]);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex items-center gap-x-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          {tree.metadata.name && (
            <span
              className="min-w-0 shrink truncate text-sm font-semibold text-slate-800 dark:text-slate-100 sm:max-w-[10rem]"
              title={tree.metadata.name}
            >
              {tree.metadata.name}
            </span>
          )}
          <div ref={searchWrapRef} className="w-32 shrink-0 sm:w-52 lg:w-44">
            <SearchBox tree={tree} index={searchIndex} onSelect={goTo} />
          </div>
          {/* PHASE 3: one mounted set of action controls. From lg up they sit inline in the
              toolbar; below lg they collapse into a single ☰ dropdown (the button lives after the
              panel toggle). The child menus portal their own panels, so a single instance serves
              both layouts — no duplicate controls, no horizontal-scroll strip to fight on a phone. */}
          <div
            id="editor-actions"
            className={
              (actionsOpen ? "max-lg:flex" : "max-lg:hidden") +
              " lg:flex lg:min-w-0 lg:flex-1 lg:flex-row lg:items-center lg:gap-x-3" +
              " max-lg:absolute max-lg:top-full max-lg:right-2 max-lg:z-30 max-lg:mt-1 max-lg:w-64 max-lg:flex-col max-lg:gap-2 max-lg:rounded-lg max-lg:border max-lg:border-slate-200 max-lg:bg-white max-lg:p-2 max-lg:shadow-lg max-lg:dark:border-slate-700 max-lg:dark:bg-slate-800"
            }
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-2 lg:[&_button]:whitespace-nowrap">
              <AddPersonMenu
                tree={tree}
                selectedPersonId={selectedPersonId}
                onEdit={edit}
                onSelect={goTo}
                disabled={isExporting}
              />
              <ViewMenu
                focusMode={focusMode}
                showPhotos={appearance.displayMode === "photoCards"}
                onToggleShowPhotos={toggleShowPhotos}
                onFitTree={() => canvasRef.current?.fitTree()}
                onFitWidth={() => canvasRef.current?.fitWidth()}
                onFitHeight={() => canvasRef.current?.fitHeight()}
                onPosterScale={() => canvasRef.current?.posterScale()}
                onCenterSelection={() => canvasRef.current?.centerSelection()}
                onToggleFocus={() => canvasRef.current?.toggleFocus()}
                onResetView={() => canvasRef.current?.resetView()}
              />
              <AppearanceMenu prefs={appearance} onChange={updateAppearance} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo || isExporting}
                  aria-label="Undo last edit"
                  title="Undo last edit"
                  className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  ↶<span className="lg:hidden"> Undo</span>
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo || isExporting}
                  aria-label="Redo last undone edit"
                  title="Redo last undone edit"
                  className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  ↷<span className="lg:hidden"> Redo</span>
                </button>
              </div>
            </div>
            {/* Status + unsaved pill: pinned right on desktop; a bottom row inside the ☰ menu on
                mobile (own divider). */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-lg:mt-1 max-lg:border-t max-lg:border-slate-100 max-lg:pt-2 lg:ml-auto max-lg:dark:border-slate-700">
              {editCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"
                  title="You have unsaved edits. They're autosaved locally, but leaving will prompt a warning."
                >
                  <span aria-hidden="true">●</span> Unsaved changes
                </span>
              )}
              {/* Compact validation state. The people/family counts that used to live here are
                  redundant with the InsightsStrip directly below, so they were dropped to declutter
                  the toolbar and let it fit inline without a scroll strip. */}
              <p className="text-xs whitespace-nowrap" role="status">
                {errors.length > 0 && (
                  <span className="text-red-700 dark:text-red-400">
                    {errors.length} {errors.length === 1 ? "error" : "errors"}
                  </span>
                )}
                {warnings.length > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {errors.length > 0 ? " · " : ""}
                    {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
                  </span>
                )}
                {errors.length === 0 && warnings.length === 0 && (
                  <span className="text-green-700 dark:text-green-400">Ready for export</span>
                )}
              </p>
            </div>
          </div>
          {/* ☰ actions trigger — only below lg, where the row above is a dropdown. */}
          <button
            type="button"
            onClick={() => setActionsOpen((v) => !v)}
            aria-expanded={actionsOpen}
            aria-controls="editor-actions"
            aria-label={actionsOpen ? "Hide actions" : "Show actions"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 lg:hidden dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            className="shrink-0 rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {sidebarOpen ? "Hide panel" : "Show panel"}
          </button>
        </div>
        <InsightsStrip insights={insights} />
        <div className="min-h-0 flex-1">
          <EditorCanvas
            ref={canvasRef}
            tree={tree}
            appearance={appearance}
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
            focusPersonId={focusPersonId}
            onFocusModeChange={setFocusMode}
          />
        </div>
      </div>

      {/* Below lg the panel is a drawer overlaid above the canvas (fixed, out of flow) with a
          scrim — opening it must never steal the canvas's width down to a sliver, which crushed
          the toolbar and made its pinned items overflow across the panel. At lg+ it returns to an
          in-flow side-by-side column. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {sidebarOpen && (
        <aside className="fixed inset-y-0 right-0 z-30 flex w-[85%] max-w-sm flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-3 shadow-xl lg:static lg:z-auto lg:w-96 lg:max-w-none lg:shrink-0 lg:shadow-none dark:border-slate-800 dark:bg-slate-900">
          {/* The drawer overlays the toolbar on mobile (incl. its Hide-panel button), so it carries
              its own close control there. The scrim also closes it; on lg+ this header is hidden and
              the toolbar toggle is visible again. */}
          <div className="flex items-center justify-between lg:hidden">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Details
            </span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close panel"
              className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ✕ Close
            </button>
          </div>
          <ValidationSummary issues={tree.validation.issues} onSelect={goTo} />
          {selectedPersonId && tree.persons[selectedPersonId] ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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
              <QuickActions
                tree={tree}
                personId={selectedPersonId}
                onEdit={edit}
                onSelect={goTo}
                disabled={isExporting}
              />
              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleDeletePerson(selectedPersonId)}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Delete person
              </button>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
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

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-slate-800 dark:ring-1 dark:ring-slate-700"
        >
          <span>{toast}</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="font-semibold text-emerald-300 hover:text-emerald-200"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
