import { useEffect, useState } from "react";
import { useTreeImport, ACCEPT_EXTENSIONS } from "../hooks/useTreeImport.js";
import { UploadArea } from "../components/UploadArea.js";
import { ConversionProgress } from "../components/ConversionProgress.js";
import { ErrorPanel } from "../components/ErrorPanel.js";
import { TreeExplorer } from "../components/explorer/TreeExplorer.js";
import { confirmDiscardIfUnsaved, setHasUnsavedEdits } from "../lib/unsavedEdits.js";

interface FormatCard {
  title: string;
  tagline: string;
  blurb: string;
  icon: JSX.Element;
}

const FORMATS: FormatCard[] = [
  {
    title: "GEDCOM",
    tagline: ".ged · .gedcom",
    blurb: "The universal format exported by Ancestry, MyHeritage, FamilySearch, Gramps, RootsMagic & more.",
    icon: (
      <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0V9m0 0a3 3 0 100-6 3 3 0 000 6zm-6 6a3 3 0 116 0M18 21a3 3 0 10-6 0" />
      </svg>
    ),
  },
  {
    title: "Quick Family Tree",
    tagline: ".ftz",
    blurb: "The file the Quick Family Tree mobile app exports. We'll read it directly — no conversion step needed.",
    icon: (
      <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8.25 6.75L12 3l3.75 3.75M12 3v9m6.364.636l-2.121 2.121M17.657 18a5.657 5.657 0 11-11.314 0c0-1.56.636-2.97 1.66-3.99" />
      </svg>
    ),
  },
];

export function HomePage() {
  const { state, isReplacing, selectFile, reset } = useTreeImport();
  const [editCount, setEditCount] = useState(0);
  const hasUnsavedEdits = state.stage === "validated" && editCount > 0;
  const loaded = state.stage === "validated";

  useEffect(() => {
    setHasUnsavedEdits(hasUnsavedEdits);
  }, [hasUnsavedEdits]);
  useEffect(() => {
    return () => setHasUnsavedEdits(false);
  }, []);

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
    if (!confirmDiscardIfUnsaved(editWarning("replace this file"))) return;
    selectFile(file);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
          <span aria-hidden="true">🌳</span> Private &amp; free — nothing ever leaves your device
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Turn your family tree into a poster you can print
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">
          Drop in your family file and get a clean, print-ready poster of the whole tree — every
          person, every generation, laid out beautifully. Works with the two most common formats,
          and everything happens right here in your browser.
        </p>
      </section>

      <UploadArea
        onFileSelected={handleFileSelected}
        onClear={handleClear}
        accept={ACCEPT_EXTENSIONS}
        hint="Supported: GEDCOM (.ged, .gedcom) and Quick Family Tree (.ftz)"
        currentFile={state.stage === "idle" ? undefined : state.file}
        disabled={state.stage === "parsing" || isReplacing}
      />

      {!loaded && (
        <section aria-labelledby="format-heading">
          <h2 id="format-heading" className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
            Two file formats, both welcome here
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FORMATS.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left"
              >
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  {f.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{f.title}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{f.tagline}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{f.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(state.stage === "parsing" || isReplacing) && <ConversionProgress stage="parsing" />}

      {state.stage === "validated" && (
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

      {!loaded && (
        <p className="text-center text-xs text-slate-500">
          Don&apos;t have a file handy? Export a GEDCOM from Ancestry, MyHeritage or FamilySearch
          (look for &ldquo;Export tree&rdquo;), then drop it above.
        </p>
      )}
    </div>
  );
}
