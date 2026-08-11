import type { FamilyTree } from "../models/types.js";
import type { PosterStyleOptions } from "./types.js";

/**
 * A compact signature of everything that affects box sizing and node placement — but NOT
 * photo bytes. Two trees that differ only in a `person.photo` produce the same key, so the
 * editor can memoize the (expensive) layout across photo edits and only regenerate the SVG.
 * Display-mode / shape / sizing style changes DO change the key (geometry genuinely changes).
 */
export function posterLayoutKey(tree: FamilyTree, style: PosterStyleOptions): string {
  const parts: string[] = [
    // Sizing- and mode-relevant style only.
    style.displayMode,
    style.photoShape,
    String(style.showLivingIndicator),
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
