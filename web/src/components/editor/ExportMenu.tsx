import { useState } from "react";
import type { FamilyTree } from "../../../../src/models/types.js";
import type { ExportState } from "../../hooks/useExport.js";
import { ExportPanel } from "../explorer/ExportPanel.js";
import { PosterExportPanel } from "../poster/PosterExportPanel.js";

interface ExportMenuProps {
  tree: FamilyTree;
  sourceFileName: string;
  editCount: number;
  exportState: ExportState;
  runExport: (tree: FamilyTree, sourceFileName: string) => void;
  resetExport: () => void;
}

/**
 * A single place to export from inside the editor: GEDCOM (the existing ExportPanel) and the
 * Print Poster (the existing PosterExportPanel, SVG/PDF). Reuses both components untouched;
 * JSON / PNG / CSV are future entries. Kept as an expandable panel rather than a floating
 * dropdown so its taller poster controls have room.
 */
export function ExportMenu({
  tree,
  sourceFileName,
  editCount,
  exportState,
  runExport,
  resetExport,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100"
      >
        Export
        <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-200 p-3 dark:border-slate-800">
          <ExportPanel
            tree={tree}
            editCount={editCount}
            sourceFileName={sourceFileName}
            state={exportState}
            runExport={runExport}
            reset={resetExport}
          />
          <PosterExportPanel tree={tree} sourceFileName={sourceFileName} />
        </div>
      )}
    </div>
  );
}
