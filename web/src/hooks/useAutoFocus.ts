import { useEffect, useRef } from "react";

/**
 * Moves keyboard focus to the returned element whenever it mounts. Used so that when a new
 * panel (validation summary, download panel, error panel) appears after a state transition,
 * keyboard and screen-reader users land on it immediately instead of having to find it.
 */
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return ref;
}
