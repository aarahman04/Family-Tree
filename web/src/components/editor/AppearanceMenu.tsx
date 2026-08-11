import { useState } from "react";
import { useCloseOnEscape } from "../../lib/useCloseOnEscape.js";
import type { AppearancePrefs } from "../../lib/appearancePrefs.js";
import type { DisplayMode, PhotoShape } from "../../../../poster/types.js";

interface AppearanceMenuProps {
  prefs: AppearancePrefs;
  onChange: (next: AppearancePrefs) => void;
}

const MODES: { value: DisplayMode; label: string }[] = [
  { value: "minimal", label: "Minimal" },
  { value: "compact", label: "Compact" },
  { value: "photoCards", label: "Photo Cards" },
];
const SHAPES: { value: PhotoShape; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
];

export function AppearanceMenu({ prefs, onChange }: AppearanceMenuProps) {
  const [open, setOpen] = useState(false);
  useCloseOnEscape(open, () => setOpen(false));

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
      >
        Appearance ▾
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div role="menu" className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Display mode</p>
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="menuitemradio"
                aria-checked={prefs.displayMode === m.value}
                onClick={() => onChange({ ...prefs, displayMode: m.value })}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {m.label}
                {prefs.displayMode === m.value && <span aria-hidden="true" className="text-emerald-600">✓</span>}
              </button>
            ))}
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Photo shape</p>
            {SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="menuitemradio"
                aria-checked={prefs.photoShape === s.value}
                onClick={() => onChange({ ...prefs, photoShape: s.value })}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {s.label}
                {prefs.photoShape === s.value && <span aria-hidden="true" className="text-emerald-600">✓</span>}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={prefs.showLivingIndicator}
              onClick={() => onChange({ ...prefs, showLivingIndicator: !prefs.showLivingIndicator })}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
            >
              Living indicator
              {prefs.showLivingIndicator && <span aria-hidden="true" className="text-emerald-600">✓</span>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
