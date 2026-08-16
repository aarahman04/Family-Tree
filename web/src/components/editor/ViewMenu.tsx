import { useCloseOnEscape } from "../../lib/useCloseOnEscape.js";
import { AnchoredPanel, useAnchoredDropdown } from "../../lib/useAnchoredDropdown.js";

interface ViewMenuProps {
  focusMode: boolean;
  /** "Show photos" view toggle. Optional so the menu compiles before EditorPage wires the
   * state in Task 10; the item only appears once `onToggleShowPhotos` is provided. */
  showPhotos?: boolean;
  onToggleShowPhotos?: () => void;
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
  const { open, toggle, close, triggerRef, panelRef, pos } = useAnchoredDropdown();
  useCloseOnEscape(open, close);

  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  // `toggle` items are real on/off states → role="menuitemcheckbox" with aria-checked. The rest
  // are one-shot actions (they recompute/move the view, they don't hold a checked state) → plain
  // role="menuitem", so screen readers don't announce a checkbox state that doesn't exist.
  const items: { label: string; onClick: () => void; toggle?: boolean; checked?: boolean }[] = [
    ...(props.onToggleShowPhotos
      ? [
          {
            label: "Show photos",
            onClick: props.onToggleShowPhotos,
            toggle: true,
            checked: props.showPhotos ?? false,
          },
        ]
      : []),
    { label: "Fit tree", onClick: props.onFitTree },
    { label: "Fit width", onClick: props.onFitWidth },
    { label: "Fit height", onClick: props.onFitHeight },
    { label: "Poster scale (100%)", onClick: props.onPosterScale },
    { label: "Center selection", onClick: props.onCenterSelection },
    { label: "Focus mode", onClick: props.onToggleFocus, toggle: true, checked: props.focusMode },
    { label: "Reset view", onClick: props.onResetView },
  ];

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
        View ▾
      </button>
      <AnchoredPanel
        open={open}
        pos={pos}
        panelRef={panelRef}
        onClose={close}
        className="w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role={item.toggle ? "menuitemcheckbox" : "menuitem"}
            aria-checked={item.toggle ? (item.checked ?? false) : undefined}
            onClick={run(item.onClick)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            {item.label}
            {item.checked && (
              <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">
                ✓
              </span>
            )}
          </button>
        ))}
      </AnchoredPanel>
    </>
  );
}
