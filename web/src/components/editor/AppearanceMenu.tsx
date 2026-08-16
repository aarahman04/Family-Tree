import { useCloseOnEscape } from "../../lib/useCloseOnEscape.js";
import { AnchoredPanel, useAnchoredDropdown } from "../../lib/useAnchoredDropdown.js";
import type { AppearancePrefs } from "../../lib/appearancePrefs.js";
import type { DisplayMode, PhotoShape } from "../../../../src/poster/types.js";

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
  const { open, toggle, close, triggerRef, panelRef, pos } = useAnchoredDropdown();
  useCloseOnEscape(open, close);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Appearance ▾
      </button>
      <AnchoredPanel
        open={open}
        pos={pos}
        panelRef={panelRef}
        onClose={close}
        className="w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      >
        <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Display mode
        </p>
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="menuitemradio"
            aria-checked={prefs.displayMode === m.value}
            onClick={() => onChange({ ...prefs, displayMode: m.value })}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            {m.label}
            {prefs.displayMode === m.value && (
              <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">
                ✓
              </span>
            )}
          </button>
        ))}
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Photo shape
        </p>
        {SHAPES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="menuitemradio"
            aria-checked={prefs.photoShape === s.value}
            onClick={() => onChange({ ...prefs, photoShape: s.value })}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            {s.label}
            {prefs.photoShape === s.value && (
              <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">
                ✓
              </span>
            )}
          </button>
        ))}
        <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={prefs.showLivingIndicator}
          onClick={() => onChange({ ...prefs, showLivingIndicator: !prefs.showLivingIndicator })}
          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
        >
          Living indicator
          {prefs.showLivingIndicator && (
            <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">
              ✓
            </span>
          )}
        </button>
      </AnchoredPanel>
    </>
  );
}
