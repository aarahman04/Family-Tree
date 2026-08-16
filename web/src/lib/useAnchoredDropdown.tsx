import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

interface AnchorPos {
  top: number;
  left: number;
}

/**
 * A dropdown whose panel is rendered through a portal at a fixed, viewport-anchored position
 * instead of `absolute`ly inside the trigger's parent. This lets the trigger live inside an
 * `overflow-x-auto` toolbar strip (E2) without its panel being clipped, and keeps the panel out of
 * any ancestor's overflow/stacking trap. The panel right-aligns to the trigger when a left-aligned
 * panel would spill past the viewport edge, and simply CLOSES on scroll/resize (the anchor moved)
 * rather than chasing it — the swipe-to-reach behavior that is standard for mobile toolbars.
 *
 * Reusable beyond the toolbar menus (SearchBox / PersonPicker) — pair it with <AnchoredPanel>.
 */
export function useAnchoredDropdown() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<AnchorPos | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const trigger = triggerRef.current;
    if (trigger) {
      const t = trigger.getBoundingClientRect();
      const margin = 8;
      const width = panelRef.current?.offsetWidth ?? 0;
      let left = t.left;
      if (width) {
        if (left + width > window.innerWidth - margin) left = t.right - width; // right-align
        left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      }
      setPos({ top: t.bottom + 4, left });
    }
    // The anchor rides the toolbar strip, so dismiss rather than reposition. Capture phase because
    // scroll events don't bubble — a scroll on the strip (an ancestor) is only seen on capture. A
    // scroll inside the panel itself must NOT close it (matters once a listbox reuses this).
    function onScroll(e: Event) {
      const target = e.target;
      if (panelRef.current && target instanceof Node && panelRef.current.contains(target)) return;
      close();
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return { open, setOpen, toggle, close, triggerRef, panelRef, pos };
}

/**
 * The portaled panel for {@link useAnchoredDropdown}. Renders a full-viewport click-catcher plus
 * the fixed-position panel into `document.body`. Hidden until its position is measured (one frame),
 * so it never flashes at the top-left corner. `className` styles the panel box; `role` defaults to
 * "menu".
 */
export function AnchoredPanel({
  open,
  pos,
  panelRef,
  onClose,
  className,
  role = "menu",
  children,
}: {
  open: boolean;
  pos: AnchorPos | null;
  panelRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  className?: string;
  role?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role={role}
        style={{
          position: "fixed",
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          visibility: pos ? "visible" : "hidden",
        }}
        className={`z-50 ${className ?? ""}`}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
