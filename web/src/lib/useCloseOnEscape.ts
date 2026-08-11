import { useEffect } from "react";

/**
 * Closes an open popup (menu/dropdown) when Escape is pressed. Registered on the capture phase
 * and stops immediate propagation so the editor's global Escape handler (which clears the canvas
 * selection) doesn't also fire — pressing Escape on an open menu should only close the menu.
 */
export function useCloseOnEscape(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);
}
