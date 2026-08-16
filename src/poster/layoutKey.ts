import type { FamilyTree } from "../models/types.js";
import type { PosterStyleOptions } from "./types.js";

/**
 * A compact signature of EXACTLY the inputs that affect box sizing and node placement — the
 * same inputs `computePersonBox` (poster/boxSizing.ts) and the layout pass (poster/layout.ts)
 * read. Two trees/styles that differ only in something that changes how a node is *drawn* but
 * not its geometry produce the same key, so the editor can memoize the (expensive) layout and
 * only regenerate the cheaper SVG.
 *
 * Deliberately EXCLUDED because they are render-only, not geometry (verified: `computePersonBox`
 * never reads them): `person.photo` bytes, `style.photoShape` (the reserved photo slot is a fixed
 * square regardless of shape), and `style.showLivingIndicator` (the dot draws in-bounds and
 * reserves no space). `displayMode` IS included — it genuinely changes box sizing.
 *
 * INVARIANT: keep this list in lockstep with boxSizing.ts/layout.ts. If you add a field there
 * that changes a box's size or position, add it here too — otherwise the memo serves a stale
 * layout on an unrelated-looking edit. tests/layout-key.test.ts guards the pairing in both
 * directions (geometry field ⇒ in key; render-only field ⇒ not in key).
 */
export function posterLayoutKey(tree: FamilyTree, style: PosterStyleOptions): string {
  const parts: string[] = [
    // Sizing- and mode-relevant style only (see INVARIANT above).
    style.displayMode,
    String(style.nameFontSize),
    String(style.yearFontSize),
    String(style.nodeMinWidth),
    String(style.nodeMaxWidth),
    String(style.nodeMinHeight),
    String(style.horizontalSpacing),
    String(style.generationSpacing),
    style.fontFamily,
  ];
  for (const id of Object.keys(tree.persons).sort()) {
    const p = tree.persons[id]!;
    parts.push(
      [
        id,
        p.name,
        p.nickname ?? "",
        p.gender,
        p.birth?.date?.year ?? "",
        p.death?.date?.year ?? "",
        p.famcId ?? "",
        p.famsIds.join(","),
      ].join("|")
    );
  }
  for (const id of Object.keys(tree.families).sort()) {
    const f = tree.families[id]!;
    parts.push([id, f.husbandId ?? "", f.wifeId ?? "", f.childrenIds.join(",")].join("|"));
  }
  return parts.join("\n");
}
