/** Tailwind's `lg` breakpoint. At/above this the editor canvas keeps a usable width beside the
 * fixed 384px (w-96) sidebar; below it the panel would crush the canvas, so it seeds closed. */
export const SIDEBAR_AUTO_OPEN_MIN_WIDTH = 1024;

/**
 * The editor sidebar's INITIAL open state, seeded once from viewport width (E1). It is not a live
 * media query: after seeding, the user's manual toggle is the only thing that moves it — resizing
 * never reopens or re-hides it, matching the toggle's precedence.
 *
 * A non-positive or NaN width means the viewport couldn't be read; fall back to open (the
 * historical desktop-first default) rather than hiding the panel on a real desktop.
 */
export function shouldSidebarStartOpen(viewportWidth: number): boolean {
  if (!(viewportWidth > 0)) return true; // 0, negative, or NaN -> safe desktop default
  return viewportWidth >= SIDEBAR_AUTO_OPEN_MIN_WIDTH;
}
