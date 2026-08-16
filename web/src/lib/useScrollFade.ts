import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether a horizontally-scrollable element has more content off either edge, so the UI
 * can show a fade/gradient affordance ("there's more this way — scroll"). Without this, an
 * `overflow-x-auto` strip on touch devices (no visible scrollbar) reads as "cut off" rather than
 * "scrollable" — the mobile toolbar and insights strips both need the cue. Updates on scroll and
 * on resize (ResizeObserver), and no-ops to the same state object when nothing changed.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return { ref, edges };
}
