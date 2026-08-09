/**
 * Hand-written SVG generator -- the single rendering backend shared by the in-app preview,
 * the SVG export, and (via svg2pdf.js in web/src/lib/posterExport.ts) the PDF export, so
 * "preview matches exported output" holds by construction rather than by two renderers
 * happening to agree. See docs/poster-architecture.md.
 */

import type { PosterLayout, PosterNode, PosterPageSize, PosterStyleOptions } from "./types.js";

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

interface Point {
  x: number;
  y: number;
}

class Coords {
  private slotWidth: number;
  private rowHeight: number;
  constructor(private style: PosterStyleOptions) {
    this.slotWidth = style.nodeWidth + style.siblingSpacing;
    this.rowHeight = style.nodeHeight + style.generationSpacing;
  }
  center(node: PosterNode): Point {
    return {
      x: this.style.marginPt + node.x * this.slotWidth,
      y: this.style.marginPt + node.generation * this.rowHeight + this.style.nodeHeight / 2,
    };
  }
}

function renderNode(node: PosterNode, center: Point, style: PosterStyleOptions): string {
  const { nodeWidth: w, nodeHeight: h } = style;
  const x = center.x - w / 2;
  const y = center.y - h / 2;
  const indicatorColor =
    node.gender === "male"
      ? style.maleIndicatorColor
      : node.gender === "female"
        ? style.femaleIndicatorColor
        : style.lineColor;
  const yearLine = node.birthYear || node.deathYear ? `${node.birthYear ?? "?"}–${node.deathYear ?? ""}` : "";

  const parts: string[] = [];
  parts.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="4" fill="${style.backgroundColor}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
  );
  parts.push(
    `<rect x="${num(x)}" y="${num(y)}" width="4" height="${num(h)}" fill="${indicatorColor}"/>`
  );
  parts.push(
    `<text x="${num(center.x + 2)}" y="${num(y + h / 2 - (yearLine ? 6 : 0))}" font-family="${escapeXml(style.fontFamily)}" font-size="${num(style.nameFontSize)}" fill="${style.textColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(node.name)}</text>`
  );
  if (yearLine) {
    parts.push(
      `<text x="${num(center.x + 2)}" y="${num(y + h / 2 + 12)}" font-family="${escapeXml(style.fontFamily)}" font-size="${num(style.yearFontSize)}" fill="${style.textColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(yearLine)}</text>`
    );
  }
  return parts.join("");
}

export function renderPosterSvg(
  layout: PosterLayout,
  page: PosterPageSize,
  style: PosterStyleOptions
): string {
  const coords = new Coords(style);
  const centerOf = new Map<string, Point>();
  for (const node of layout.nodes) centerOf.set(node.personId, coords.center(node));

  const svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(page.widthPt)}" height="${num(page.heightPt)}" viewBox="0 0 ${num(page.widthPt)} ${num(page.heightPt)}">`
  );
  svgParts.push(`<rect x="0" y="0" width="${num(page.widthPt)}" height="${num(page.heightPt)}" fill="${style.backgroundColor}"/>`);

  // Connectors first so node boxes render on top of the lines that touch their edges.
  for (const connector of layout.connectors) {
    if (connector.kind === "marriage") {
      const [aId, bId] = connector.personIds;
      const a = centerOf.get(aId);
      const b = centerOf.get(bId);
      if (!a || !b) continue;
      svgParts.push(
        `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
    } else if (connector.kind === "cross-branch") {
      const from = centerOf.get(connector.fromPersonId);
      const to = centerOf.get(connector.toMarriageAnchorId);
      if (!from || !to) continue;
      svgParts.push(
        `<path d="M ${num(from.x)} ${num(from.y)} L ${num(to.x)} ${num(to.y)}" fill="none" stroke="${style.crossBranchColor}" stroke-width="${num(style.lineThickness)}" stroke-dasharray="6,4"/>`
      );
    } else {
      const parentPoints = connector.parentPersonIds.map((id) => centerOf.get(id)).filter((p): p is Point => !!p);
      const childPoints = connector.childPersonIds.map((id) => centerOf.get(id)).filter((p): p is Point => !!p);
      if (!parentPoints.length || !childPoints.length) continue;
      const parentX = parentPoints.reduce((s, p) => s + p.x, 0) / parentPoints.length;
      const parentY = Math.max(...parentPoints.map((p) => p.y)) + style.nodeHeight / 2;
      const busY = parentY + style.generationSpacing / 2;
      const childY = Math.min(...childPoints.map((p) => p.y)) - style.nodeHeight / 2;
      const childXs = childPoints.map((p) => p.x);
      const busLeft = Math.min(parentX, ...childXs);
      const busRight = Math.max(parentX, ...childXs);
      // Single shared branch: one stub down from the parents, one horizontal bus, one
      // stub per child -- never a duplicated line per child back to the parents.
      svgParts.push(
        `<line x1="${num(parentX)}" y1="${num(parentY)}" x2="${num(parentX)}" y2="${num(busY)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
      svgParts.push(
        `<line x1="${num(busLeft)}" y1="${num(busY)}" x2="${num(busRight)}" y2="${num(busY)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
      );
      for (const cp of childPoints) {
        svgParts.push(
          `<line x1="${num(cp.x)}" y1="${num(busY)}" x2="${num(cp.x)}" y2="${num(childY)}" stroke="${style.lineColor}" stroke-width="${num(style.lineThickness)}"/>`
        );
      }
    }
  }

  for (const node of layout.nodes) {
    const center = centerOf.get(node.personId);
    if (!center) continue;
    svgParts.push(renderNode(node, center, style));
  }

  svgParts.push(`</svg>`);
  return svgParts.join("\n");
}
