/**
 * Hand-written SVG generator -- the single rendering backend shared by the in-app preview,
 * the SVG export, and (via svg2pdf.js in web/src/lib/posterExport.ts) the PDF export, so
 * "preview matches exported output" holds by construction rather than by two renderers
 * happening to agree. See docs/poster-architecture.md.
 *
 * Always renders at the layout's TRUE size (`page.widthPt`/`heightPt`, never the PDF-scaled
 * numbers) -- SVG has no page-size ceiling, so this is what stays uncapped regardless of how
 * large the tree is.
 */

import type { UUID } from "../models/types.js";
import { photoAreaHeight, CARD_DIVIDER_GAP, PHOTO_TOP_PAD } from "./boxSizing.js";
import type {
  PosterAnalytics,
  PosterChip,
  PosterLayout,
  PosterNode,
  PosterPageSize,
  PosterStyleOptions,
} from "./types.js";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function textLine(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  fill: string,
  fontFamily: string,
  rtl: boolean,
  opts?: { weight?: string; italic?: boolean }
): string {
  const dir = rtl ? ` direction="rtl"` : "";
  const w = opts?.weight ? ` font-weight="${opts.weight}"` : "";
  const i = opts?.italic ? ` font-style="italic"` : "";
  return `<text x="${num(x)}" y="${num(y)}" font-family="${escapeXml(fontFamily)}" font-size="${num(fontSize)}" fill="${fill}" text-anchor="middle" dominant-baseline="middle"${dir}${w}${i}>${escapeXml(text)}</text>`;
}

/** A small Mars (♂) / Venus (♀) glyph in the top corner of a box, so gender reads at a
 * glance -- clearer than a color stripe, and it survives grayscale printing. Drawn from vector
 * primitives (no glyph-font dependency) so it stays crisp in the SVG, PDF and in-app preview.
 * For an RTL (e.g. Arabic) name the glyph mirrors to the TRAILING (right) corner and the male
 * arrow flips to point up-and-out that way, so it never collides with the right-aligned text
 * (AUD-4). `boxWidth` locates the trailing corner; `rtl` chooses the side + arrow direction. */
function genderIcon(
  gender: "male" | "female",
  boxX: number,
  boxY: number,
  boxWidth: number,
  style: PosterStyleOptions,
  rtl: boolean
): string {
  const color = gender === "male" ? style.maleIndicatorColor : style.femaleIndicatorColor;
  const r = 3.3;
  const cx = rtl ? boxX + boxWidth - 9 : boxX + 9;
  const cy = boxY + 11;
  const stroke = `stroke="${color}" stroke-width="1.3" fill="none" stroke-linecap="round"`;
  const circle = `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" ${stroke}/>`;
  if (gender === "female") {
    // Venus is horizontally symmetric, so only the corner position changes under RTL.
    const sy = cy + r;
    return (
      circle +
      `<line x1="${num(cx)}" y1="${num(sy)}" x2="${num(cx)}" y2="${num(sy + 6)}" ${stroke}/>` +
      `<line x1="${num(cx - 3)}" y1="${num(sy + 3.5)}" x2="${num(cx + 3)}" y2="${num(sy + 3.5)}" ${stroke}/>`
    );
  }
  // male: an arrow springing from the circle's upper-outer edge toward the near top corner.
  // `s` mirrors the whole arrow horizontally for RTL so it points up-and-away from the text.
  const s = rtl ? -1 : 1;
  const ex = cx + s * r * 0.7;
  const ey = cy - r * 0.7;
  const tx = ex + s * 5;
  const ty = ey - 5;
  return (
    circle +
    `<line x1="${num(ex)}" y1="${num(ey)}" x2="${num(tx)}" y2="${num(ty)}" ${stroke}/>` +
    `<line x1="${num(tx)}" y1="${num(ty)}" x2="${num(tx - s * 4)}" y2="${num(ty)}" ${stroke}/>` +
    `<line x1="${num(tx)}" y1="${num(ty)}" x2="${num(tx)}" y2="${num(ty + 4)}" ${stroke}/>`
  );
}

/** Clip-path def + the attribute to apply it, for a square/rounded/circle photo slot at
 * (x,y) sized `side`×`side`. Returns {def, attr}; `id` must be unique per node. */
function photoClip(id: string, x: number, y: number, side: number, shape: "square" | "rounded" | "circle"): { def: string; attr: string } {
  let inner: string;
  if (shape === "circle") {
    inner = `<circle cx="${num(x + side / 2)}" cy="${num(y + side / 2)}" r="${num(side / 2)}"/>`;
  } else {
    const rx = shape === "rounded" ? Math.min(10, side * 0.12) : 0;
    inner = `<rect x="${num(x)}" y="${num(y)}" width="${num(side)}" height="${num(side)}" rx="${num(rx)}"/>`;
  }
  return { def: `<clipPath id="${id}">${inner}</clipPath>`, attr: `clip-path="url(#${id})"` };
}

/** A polished neutral placeholder: subtle gray fill + a simple head-and-shoulders silhouette,
 * clipped to the same shape as real photos. Never an empty white box. The `<title>` names the
 * person ("No photo of {name}") for screen-reader parity with a real photo's "Photo of {name}"
 * (AUD-5) — otherwise every placeholder announces the same generic string. */
function photoPlaceholder(x: number, y: number, side: number, clipAttr: string, name: string): string {
  const cx = x + side / 2;
  const headR = side * 0.17;
  const headCy = y + side * 0.4;
  const shoulderR = side * 0.34;
  const shoulderCy = y + side * 0.95;
  return (
    `<g ${clipAttr} role="img"><title>No photo of ${escapeXml(name)}</title>` +
    `<rect x="${num(x)}" y="${num(y)}" width="${num(side)}" height="${num(side)}" fill="#e2e8f0"/>` +
    `<circle cx="${num(cx)}" cy="${num(headCy)}" r="${num(headR)}" fill="#cbd5e1"/>` +
    `<circle cx="${num(cx)}" cy="${num(shoulderCy)}" r="${num(shoulderR)}" fill="#cbd5e1"/>` +
    `</g>`
  );
}

// ─── CARD EXTENSION POINT (refinement 6) ───────────────────────────────────────
/** Future optional card elements render here, BELOW the name/year block, without any change
 * to the photo/name geometry above. Intended for the future "detailed" mode:
 *   • Occupation   • Country   • Verification badge   • Notes indicator   • Document count
 * Return additional SVG strings when implementing them. Intentionally a no-op today — this is
 * the single, documented place to grow the card so nothing above needs a redesign. */
function renderCardExtras(_node: PosterNode, _style: PosterStyleOptions): string {
  return "";
}
// ────────────────────────────────────────────────────────────────────────────────

function renderNode(node: PosterNode, offsetX: number, offsetY: number, style: PosterStyleOptions, photoHref?: string): string {
  if (style.displayMode === "photoCards") return renderPhotoCard(node, offsetX, offsetY, style, photoHref);
  if (style.displayMode === "minimal") return renderMinimalNode(node, offsetX, offsetY, style);
  return renderCompactNode(node, offsetX, offsetY, style); // the original renderNode body, unchanged
}

function renderCompactNode(node: PosterNode, offsetX: number, offsetY: number, style: PosterStyleOptions): string {
  const cx = offsetX + node.x;
  const cy = offsetY + node.y;
  const x = cx - node.width / 2;
  const y = cy - node.height / 2;

  const parts: string[] = [];
  parts.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${num(node.width)}" height="${num(node.height)}" rx="4" fill="${style.backgroundColor}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );
  // Male/female get a gender glyph; unknown/unspecified keep the plain neutral edge stripe. Both
  // sit on the TRAILING edge for an RTL name (right), matching the text's own alignment (AUD-4).
  if (node.gender === "male" || node.gender === "female") {
    parts.push(genderIcon(node.gender, x, y, node.width, style, node.rtl));
  } else {
    const stripeX = node.rtl ? x + node.width - 4 : x;
    parts.push(`<rect x="${num(stripeX)}" y="${num(y)}" width="4" height="${num(node.height)}" fill="${style.lineColor}"/>`);
  }

  // Nudge the (center-anchored) text away from the gender element: right of center for LTR, left
  // of center for RTL where that element now sits on the right (AUD-4).
  const textNudge = node.rtl ? -2 : 2;
  const nameLineHeight = style.nameFontSize * 1.25;
  const noteFontSize = style.yearFontSize * 0.82;
  const totalTextHeight =
    node.nameLines.length * nameLineHeight +
    (node.yearLine ? style.yearFontSize * 1.25 : 0) +
    (node.noteLine ? noteFontSize * 1.25 : 0);
  let lineY = cy - totalTextHeight / 2 + nameLineHeight / 2;
  // DUPLICATED ON PURPOSE — do NOT extract into a shared helper. This whole compact body is a
  // byte-for-byte preservation guard for the pre-photos default (pinned in
  // tests/box-sizing-modes.test.ts); the same name-line loop also appears in renderMinimalNode
  // and renderPhotoCard, but the three differ in x-offset (cx+2 here for the gender stripe, cx
  // there) and in what follows (year/note vs nothing), so a parameterised helper nets negative.
  for (const line of node.nameLines) {
    parts.push(textLine(cx + textNudge, lineY, line, style.nameFontSize, style.textColor, style.fontFamily, node.rtl));
    lineY += nameLineHeight;
  }
  if (node.yearLine) {
    parts.push(textLine(cx + textNudge, lineY, node.yearLine, style.yearFontSize, style.textColor, style.fontFamily, false));
    lineY += style.yearFontSize * 1.25;
  }
  if (node.noteLine) {
    // A pointer to where this person's descendants are actually shown -- never a
    // placeholder, always names the real anchor (see poster/boxSizing.ts). Visually
    // distinct (smaller, italic, the chip's own color) so it reads as a cross-reference.
    parts.push(
      textLine(cx + textNudge, lineY, node.noteLine, noteFontSize, style.chipBorderColor, style.fontFamily, node.rtl, {
        italic: true,
      })
    );
  }
  return parts.join("");
}

function renderMinimalNode(node: PosterNode, offsetX: number, offsetY: number, style: PosterStyleOptions): string {
  const cx = offsetX + node.x;
  const cy = offsetY + node.y;
  const x = cx - node.width / 2;
  const y = cy - node.height / 2;

  const parts: string[] = [];
  parts.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${num(node.width)}" height="${num(node.height)}" rx="4" fill="${style.backgroundColor}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );

  const nameLineHeight = style.nameFontSize * 1.25;
  const totalTextHeight = node.nameLines.length * nameLineHeight;
  let lineY = cy - totalTextHeight / 2 + nameLineHeight / 2;
  // Name-line loop intentionally NOT shared with the other renderers — see the note in
  // renderCompactNode.
  for (const line of node.nameLines) {
    parts.push(textLine(cx, lineY, line, style.nameFontSize, style.textColor, style.fontFamily, node.rtl));
    lineY += nameLineHeight;
  }
  return parts.join("");
}

function renderPhotoCard(node: PosterNode, offsetX: number, offsetY: number, style: PosterStyleOptions, photoHref?: string): string {
  const cx = offsetX + node.x;
  const cyTop = offsetY + node.y - node.height / 2;
  const x = cx - node.width / 2;
  const side = photoAreaHeight(node.width, style); // capped square side (refinement 2)
  const photoX = cx - side / 2;                    // centered horizontally, not full-bleed
  const photoY = cyTop + PHOTO_TOP_PAD;
  const cardBottom = cyTop + node.height;
  const parts: string[] = [];

  // Card outline.
  parts.push(
    `<rect x="${num(x)}" y="${num(cyTop)}" width="${num(node.width)}" height="${num(node.height)}" rx="6" fill="${style.backgroundColor}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );

  // Photo (image or placeholder), clipped to the chosen shape. An absent OR empty href always
  // falls back to the placeholder, so a missing/failed photo can never break rendering
  // (refinement 3). The renderer builds strings only and never throws on a photo.
  //
  // EQUAL-SIZE SHAPES: the pre-cropped square thumbnail FILLS the full `side`×`side` square for
  // every photoShape (`slice` = scale-to-fit; square→square, so NO second crop and no aspect
  // logic here — that lives only in Task 5's ingestion). Only the clip differs. The circle uses
  // r = side/2 (inscribed); it is intentionally NOT enlarged beyond the square — doing so would
  // overflow the reserved slot and break the fixed photo footprint. The face therefore renders
  // at the same scale in all three shapes; the circle just omits the corners.
  const clip = photoClip(`ph-${node.personId}`, photoX, photoY, side, style.photoShape);
  parts.push(clip.def);
  if (photoHref) {
    parts.push(
      `<image href="${escapeXml(photoHref)}" x="${num(photoX)}" y="${num(photoY)}" width="${num(side)}" height="${num(side)}" preserveAspectRatio="xMidYMid slice" ${clip.attr}><title>Photo of ${escapeXml(node.name)}</title></image>`
    );
  } else {
    parts.push(photoPlaceholder(photoX, photoY, side, clip.attr, node.name));
  }

  // Divider under the photo.
  const dividerY = photoY + side;
  parts.push(
    `<line x1="${num(x)}" y1="${num(dividerY)}" x2="${num(x + node.width)}" y2="${num(dividerY)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );

  // Gender glyph in the text region's top corner (reuse existing genderIcon) — trailing edge for
  // RTL names (AUD-4).
  const textTop = dividerY + CARD_DIVIDER_GAP;
  if (node.gender === "male" || node.gender === "female") {
    parts.push(genderIcon(node.gender, x, textTop - 2, node.width, style, node.rtl));
  }

  // Name + year + optional branch-note, centered in the lower text region. The note height uses
  // the SAME font math computePersonBox reserves (yearFontSize * 0.82 * 1.25), so drawing it here
  // fits exactly the space already budgeted — verified against boxSizing.ts's noteLineHeight.
  const nameLineHeight = style.nameFontSize * 1.25;
  const noteFontSize = style.yearFontSize * 0.82; // == NOTE_FONT_RATIO in boxSizing.ts
  const yearH = node.yearLine ? style.yearFontSize * 1.25 : 0;
  const noteH = node.noteLine ? noteFontSize * 1.25 : 0;
  const totalTextHeight = node.nameLines.length * nameLineHeight + yearH + noteH;
  const regionCenter = textTop + (cardBottom - textTop) / 2;
  let lineY = regionCenter - totalTextHeight / 2 + nameLineHeight / 2;
  // Name-line loop intentionally NOT shared with the other renderers — see the note in
  // renderCompactNode.
  for (const line of node.nameLines) {
    parts.push(textLine(cx, lineY, line, style.nameFontSize, style.textColor, style.fontFamily, node.rtl));
    lineY += nameLineHeight;
  }
  if (node.yearLine) {
    parts.push(textLine(cx, lineY, node.yearLine, style.yearFontSize, style.textColor, style.fontFamily, false));
    lineY += style.yearFontSize * 1.25;
  }
  if (node.noteLine) {
    // The cross-reference to where this person's descendants are shown — same treatment as the
    // compact renderer (smaller, italic, chip color). Dropping it silently loses data in export.
    parts.push(
      textLine(cx, lineY, node.noteLine, noteFontSize, style.chipBorderColor, style.fontFamily, node.rtl, {
        italic: true,
      })
    );
  }

  // Optional living/deceased dot, bottom-right. Distinguished by SHAPE as well as hue so it
  // survives grayscale printing and colorblindness (AUD-5): living is a solid green disc, deceased
  // a hollow gray ring. A <title> gives each an accessible/hover label rather than colour alone.
  if (style.showLivingIndicator) {
    const dcx = num(x + node.width - 8);
    const dcy = num(cardBottom - 8);
    parts.push(
      node.living
        ? `<circle data-role="living-dot" cx="${dcx}" cy="${dcy}" r="3.2" fill="#16a34a"><title>Living</title></circle>`
        : `<circle data-role="living-dot" cx="${dcx}" cy="${dcy}" r="3.2" fill="none" stroke="#9ca3af" stroke-width="1.4"><title>Deceased</title></circle>`
    );
  }

  parts.push(renderCardExtras(node, style));
  return parts.join("");
}

function renderChip(chip: PosterChip, offsetX: number, offsetY: number, style: PosterStyleOptions): string {
  const cx = offsetX + chip.x;
  const cy = offsetY + chip.y;
  const x = cx - chip.width / 2;
  const y = cy - chip.height / 2;
  const fontSize = style.yearFontSize;
  const lineHeight = fontSize * 1.25;

  const parts: string[] = [];
  parts.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${num(chip.width)}" height="${num(chip.height)}" rx="4" fill="${style.chipFillColor}" stroke="${style.chipBorderColor}" stroke-width="${num(style.lineThickness)}" stroke-dasharray="4,3"/>`
  );
  let lineY = cy - (chip.lines.length * lineHeight) / 2 + lineHeight / 2;
  for (const line of chip.lines) {
    parts.push(textLine(cx, lineY, line, fontSize, style.textColor, style.fontFamily, chip.rtl));
    lineY += lineHeight;
  }
  return parts.join("");
}

export function renderPosterSvg(
  layout: PosterLayout,
  page: PosterPageSize,
  style: PosterStyleOptions,
  photos?: ReadonlyMap<UUID, string>,
  // CP5.1: threaded through for CP5.2-5.8 to consume. Intentionally unread here -- with
  // `analytics` absent (or present but ignored, same as today), output stays byte-identical.
  _analytics?: PosterAnalytics,
): string {
  const offsetX = style.marginPt;
  const offsetY = style.marginPt;

  const nodeCenter = new Map<string, { x: number; y: number; top: number; bottom: number }>();
  const widthById = new Map<string, number>();
  for (const node of layout.nodes) {
    nodeCenter.set(node.personId, {
      x: offsetX + node.x,
      y: offsetY + node.y,
      top: offsetY + node.y - node.height / 2,
      bottom: offsetY + node.y + node.height / 2,
    });
    widthById.set(node.personId, node.width);
  }

  const svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(page.widthPt)}" height="${num(page.heightPt)}" viewBox="0 0 ${num(page.widthPt)} ${num(page.heightPt)}">`
  );
  svgParts.push(`<rect x="0" y="0" width="${num(page.widthPt)}" height="${num(page.heightPt)}" fill="${style.backgroundColor}"/>`);

  // Connectors and chips first so node boxes render on top of the lines that touch their edges.
  for (const connector of layout.connectors) {
    if (connector.kind === "spine") {
      const from = nodeCenter.get(connector.fromPersonId);
      const heads = connector.toPersonIds
        .map((id) => ({ w: widthById.get(id) ?? 0, c: nodeCenter.get(id) }))
        .filter((h): h is { w: number; c: NonNullable<ReturnType<typeof nodeCenter.get>> } => !!h.c);
      if (!from || heads.length === 0) continue;
      // Node-derived: the trunk drops straight from the ancestor; each head is reached by a
      // short horizontal stub entering from whichever side faces the trunk.
      const trunkX = from.x;
      const trunkBottom = Math.max(...heads.map((h) => h.c.y));
      svgParts.push(
        `<line x1="${num(trunkX)}" y1="${num(from.bottom)}" x2="${num(trunkX)}" y2="${num(trunkBottom)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
      for (const h of heads) {
        const nearEdge = h.c.x >= trunkX ? h.c.x - h.w / 2 : h.c.x + h.w / 2;
        svgParts.push(
          `<line x1="${num(trunkX)}" y1="${num(h.c.y)}" x2="${num(nearEdge)}" y2="${num(h.c.y)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
        );
      }
      continue;
    }
    if (connector.kind === "marriage") {
      const [aId, bId] = connector.personIds;
      const a = nodeCenter.get(aId);
      const b = nodeCenter.get(bId);
      if (!a || !b) continue;
      svgParts.push(
        `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
    } else {
      const parentPoints = connector.parentPersonIds.map((id) => nodeCenter.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
      const childPoints = connector.childPersonIds.map((id) => nodeCenter.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
      if (!parentPoints.length || !childPoints.length) continue;
      const parentX = parentPoints.reduce((s, p) => s + p.x, 0) / parentPoints.length;
      const parentBottom = Math.max(...parentPoints.map((p) => p.bottom));
      const childTop = Math.min(...childPoints.map((p) => p.top));
      const busY = parentBottom + (childTop - parentBottom) / 2;
      const childXs = childPoints.map((p) => p.x);
      const busLeft = Math.min(parentX, ...childXs);
      const busRight = Math.max(parentX, ...childXs);
      // Single shared branch: one stub down from the parents, one horizontal bus, one
      // stub per child -- never a duplicated line per child back to the parents.
      svgParts.push(
        `<line x1="${num(parentX)}" y1="${num(parentBottom)}" x2="${num(parentX)}" y2="${num(busY)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
      svgParts.push(
        `<line x1="${num(busLeft)}" y1="${num(busY)}" x2="${num(busRight)}" y2="${num(busY)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
      for (const cp of childPoints) {
        svgParts.push(
          `<line x1="${num(cp.x)}" y1="${num(busY)}" x2="${num(cp.x)}" y2="${num(cp.top)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
        );
      }
    }
  }

  for (const chip of layout.chips) {
    const anchor = nodeCenter.get(chip.anchorPersonId);
    const chipCx = offsetX + chip.x;
    const chipCy = offsetY + chip.y;
    if (anchor) {
      svgParts.push(
        `<line x1="${num(anchor.x)}" y1="${num(anchor.y)}" x2="${num(chipCx)}" y2="${num(chipCy)}" stroke="${style.chipBorderColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
    }
    svgParts.push(renderChip(chip, offsetX, offsetY, style));
  }

  for (const node of layout.nodes) {
    svgParts.push(renderNode(node, offsetX, offsetY, style, photos?.get(node.personId)));
  }

  svgParts.push(`</svg>`);
  return svgParts.join("\n");
}
