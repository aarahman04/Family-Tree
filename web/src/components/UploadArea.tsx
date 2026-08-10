import { useId, useRef, useState } from "react";
import { formatFileSize } from "../lib/summary.js";

interface UploadAreaProps {
  onFileSelected: (file: File) => void;
  onClear: () => void;
  /** Comma-separated accept attribute, e.g. ".ged,.gedcom". */
  accept: string;
  /** Short line shown inside the drop zone under the main prompt. */
  hint: string;
  currentFile?: { name: string; size: number };
  disabled?: boolean;
}

export function UploadArea({
  onFileSelected,
  onClear,
  accept,
  hint,
  currentFile,
  disabled,
}: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputId = useId();

  function openPicker() {
    inputRef.current?.click();
  }
  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        aria-label={`Choose a file to import (${accept})`}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {!currentFile ? (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            isDragOver
              ? "border-emerald-500 bg-emerald-50"
              : "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400 hover:bg-emerald-50"
          } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              aria-hidden="true"
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.6}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </span>
          <p className="text-base font-semibold text-slate-800">
            Drag &amp; drop your file here, or{" "}
            <span className="text-emerald-700 underline">browse</span>
          </p>
          <p className="text-sm text-slate-600">{hint}</p>
        </label>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.6}
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800" title={currentFile.name}>
                {currentFile.name}
              </p>
              <p className="text-xs text-slate-600">{formatFileSize(currentFile.size)} · loaded</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Replace file
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
