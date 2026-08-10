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

import type { PosterChip, PosterLayout, PosterNode, PosterPageSize, PosterStyleOptions } from "./types.js";

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

function renderNode(node: PosterNode, offsetX: number, offsetY: number, style: PosterStyleOptions): string {
  const cx = offsetX + node.x;
  const cy = offsetY + node.y;
  const x = cx - node.width / 2;
  const y = cy - node.height / 2;
  const indicatorColor =
    node.gender === "male"
      ? style.maleIndicatorColor
      : node.gender === "female"
        ? style.femaleIndicatorColor
        : style.lineColor;

  const parts: string[] = [];
  parts.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${num(node.width)}" height="${num(node.height)}" rx="4" fill="${style.backgroundColor}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );
  parts.push(`<rect x="${num(x)}" y="${num(y)}" width="4" height="${num(node.height)}" fill="${indicatorColor}"/>`);

  const nameLineHeight = style.nameFontSize * 1.25;
  const noteFontSize = style.yearFontSize * 0.82;
  const totalTextHeight =
    node.nameLines.length * nameLineHeight +
    (node.yearLine ? style.yearFontSize * 1.25 : 0) +
    (node.noteLine ? noteFontSize * 1.25 : 0);
  let lineY = cy - totalTextHeight / 2 + nameLineHeight / 2;
  for (const line of node.nameLines) {
    parts.push(textLine(cx + 2, lineY, line, style.nameFontSize, style.textColor, style.fontFamily, node.rtl));
    lineY += nameLineHeight;
  }
  if (node.yearLine) {
    parts.push(textLine(cx + 2, lineY, node.yearLine, style.yearFontSize, style.textColor, style.fontFamily, false));
    lineY += style.yearFontSize * 1.25;
  }
  if (node.noteLine) {
    // A pointer to where this person's descendants are actually shown -- never a
    // placeholder, always names the real anchor (see poster/boxSizing.ts). Visually
    // distinct (smaller, italic, the chip's own color) so it reads as a cross-reference.
    parts.push(
      textLine(cx + 2, lineY, node.noteLine, noteFontSize, style.chipBorderColor, style.fontFamily, node.rtl, {
        italic: true,
      })
    );
  }
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

export function renderPosterSvg(layout: PosterLayout, page: PosterPageSize, style: PosterStyleOptions): string {
  const offsetX = style.marginPt;
  const offsetY = style.marginPt;

  const nodeCenter = new Map<string, { x: number; y: number; top: number; bottom: number }>();
  for (const node of layout.nodes) {
    nodeCenter.set(node.personId, {
      x: offsetX + node.x,
      y: offsetY + node.y,
      top: offsetY + node.y - node.height / 2,
      bottom: offsetY + node.y + node.height / 2,
    });
  }

  const svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(page.widthPt)}" height="${num(page.heightPt)}" viewBox="0 0 ${num(page.widthPt)} ${num(page.heightPt)}">`
  );
  svgParts.push(`<rect x="0" y="0" width="${num(page.widthPt)}" height="${num(page.heightPt)}" fill="${style.backgroundColor}"/>`);

  // Connectors and chips first so node boxes render on top of the lines that touch their edges.
  for (const connector of layout.connectors) {
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
    svgParts.push(renderNode(node, offsetX, offsetY, style));
  }

  svgParts.push(`</svg>`);
  return svgParts.join("\n");
}
