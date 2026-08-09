import "@testing-library/jest-dom/vitest";
import { afterEach, expect, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";
import { MockWorker } from "./mocks/mockWorker.js";

expect.extend(toHaveNoViolations);

// Not running in vitest "globals" mode, so @testing-library/react's automatic afterEach
// cleanup isn't registered implicitly — without this, DOM from one test leaks into the next.
afterEach(() => cleanup());

// jsdom has no real Worker implementation — see mocks/mockWorker.ts for why this is a
// faithful stand-in rather than a shortcut around the logic being tested.
vi.stubGlobal("Worker", MockWorker);

// jsdom doesn't implement Blob object URLs either.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

// jsdom's File/Blob don't implement arrayBuffer() or text() (both real, well-supported
// browser APIs) — this is a jsdom gap, not something to work around in production code.
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function (this: File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
if (!Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom always reports 0×0 for layout geometry (no real layout engine) — real browsers
// report actual dimensions. Faking a plausible non-zero size matters beyond cosmetics: React
// Flow's onlyRenderVisibleElements treats every node as "outside a 0×0 viewport" and marks
// it `visibility: hidden`, which then makes those nodes invisible to accessible-role queries
// (jsdom/Testing Library correctly excludes visibility:hidden elements, matching real browser
// behavior) — so without this, no test could ever click a person node on the canvas.
const FAKE_SIZE = { width: 1200, height: 800 };
// jsdom's real implementation always returns all-zero geometry — replace it wholesale.
globalThis.Element.prototype.getBoundingClientRect = function () {
  return {
    x: 0,
    y: 0,
    width: FAKE_SIZE.width,
    height: FAKE_SIZE.height,
    top: 0,
    left: 0,
    right: FAKE_SIZE.width,
    bottom: FAKE_SIZE.height,
    toJSON() {
      return this;
    },
  } as DOMRect;
};

// jsdom doesn't implement DOMMatrixReadOnly at all. React Flow's internals construct one
// from a CSS transform string (e.g. "translate(-590px,-344px) scale(1)") purely to read the
// zoom factor back out (m22). A full CSS-matrix implementation isn't needed — just enough
// surface for that one real call site to not throw.
if (typeof (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly === "undefined") {
  class DOMMatrixReadOnlyPolyfill {
    m11 = 1;
    m12 = 0;
    m21 = 0;
    m22 = 1;
    m41 = 0;
    m42 = 0;
    constructor(transform?: string) {
      if (!transform) return;
      const matrixMatch = /matrix\(([^)]+)\)/.exec(transform);
      if (matrixMatch) {
        const [a, b, c, d, e, f] = matrixMatch[1]!.split(",").map((n) => parseFloat(n.trim()));
        this.m11 = a ?? 1;
        this.m12 = b ?? 0;
        this.m21 = c ?? 0;
        this.m22 = d ?? 1;
        this.m41 = e ?? 0;
        this.m42 = f ?? 0;
        return;
      }
      const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
      if (scaleMatch) {
        const scale = parseFloat(scaleMatch[1]!.split(",")[0]!.trim());
        this.m11 = scale;
        this.m22 = scale;
      }
    }
  }
  vi.stubGlobal("DOMMatrixReadOnly", DOMMatrixReadOnlyPolyfill);
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverPolyfill {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      // Real ResizeObservers fire asynchronously after layout — queueMicrotask mirrors that
      // ordering closely enough for React effects that wait on the callback.
      queueMicrotask(() => {
        const entry = {
          target,
          contentRect: {
            ...FAKE_SIZE,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: FAKE_SIZE.width,
            bottom: FAKE_SIZE.height,
          },
          borderBoxSize: [{ inlineSize: FAKE_SIZE.width, blockSize: FAKE_SIZE.height }],
          contentBoxSize: [{ inlineSize: FAKE_SIZE.width, blockSize: FAKE_SIZE.height }],
          devicePixelContentBoxSize: [{ inlineSize: FAKE_SIZE.width, blockSize: FAKE_SIZE.height }],
        } as unknown as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
      });
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverPolyfill);
}
