import { useState } from "react";
import { useCloseOnEscape } from "../../lib/useCloseOnEscape.js";

interface ViewMenuProps {
  focusMode: boolean;
  onFitTree: () => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
  onPosterScale: () => void;
  onCenterSelection: () => void;
  onToggleFocus: () => void;
  onResetView: () => void;
}

/**
 * Toolbar "View" menu — the single place for navigation presets. It only invokes handlers
 * (wired to EditorCanvas's imperative view actions), so the toolbar stays decoupled from the
 * rendering implementation. Every action is transform-only; none recompute the layout.
 */
export function ViewMenu(props: ViewMenuProps) {
  const [open, setOpen] = useState(false);
  useCloseOnEscape(open, () => setOpen(false));

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const items: { label: string; onClick: () => void; checked?: boolean }[] = [
    { label: "Fit tree", onClick: props.onFitTree },
    { label: "Fit width", onClick: props.onFitWidth },
    { label: "Fit height", onClick: props.onFitHeight },
    { label: "Poster scale (100%)", onClick: props.onPosterScale },
    { label: "Center selection", onClick: props.onCenterSelection },
    { label: "Focus mode", onClick: props.onToggleFocus, checked: props.focusMode },
    { label: "Reset view", onClick: props.onResetView },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
      >
        View ▾
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
          <div
            role="menu"
            className="absolute left-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.checked ?? false}
                onClick={run(item.onClick)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {item.label}
                {item.checked && (
                  <span aria-hidden="true" className="text-emerald-600">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
