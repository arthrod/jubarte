// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Line breaking with measured glyphs, as a browser measures them: jsdom has no
// canvas, so the other layout tests use the reader's fallback metrics.
import { beforeAll, expect, it } from "vitest";
import { parseJubarte } from "../reader/jubarte.mjs";

let mountPagination;
beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Proportional widths at 16px: narrow, wide and space glyphs differ, as in Source Serif.
  const width = (ch) =>
    ch === " " ? 4 : ch === "w" || ch === "W" ? 12 : /[A-Z]/.test(ch) ? 11 : 8;
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        font: "",
        measureText: (text) => ({ width: [...text].reduce((n, ch) => n + width(ch), 0) }),
      };
    }
  };
  ({ mountPagination } = await import("../reader/pagination.js"));
});

const compose = (markdown) => {
  const container = document.createElement("div");
  document.body.append(container);
  const view = mountPagination(container, parseJubarte(markdown));
  return { composed: view.composed, done: () => (view.destroy(), container.remove()) };
};

// Word fills each line greedily at that line's own width: every line fits it, and no line but
// the last could have taken the next word (#83).
const WORD = 4 + 12 + 3 * 8; // " word"
const fills = (composed, tag, start) => {
  const lines = composed.layout.pages[0].frames[0].fragments
    .filter((f) => (f.lines || []).some((l) => l.runs.some((r) => r.text?.includes(tag))))
    .flatMap((f) => f.lines)
    .map((l) => {
      const text = l.runs.filter((r) => r.text?.trim());
      return {
        left: Math.min(...text.map((r) => r.x)),
        right: Math.max(...text.map((r) => r.x + r.width - (r.text.endsWith(" ") ? 4 : 0))),
      };
    });
  return lines.map((line, i) => ({
    i,
    left: Math.round(line.left),
    fits: line.right <= 624 + 0.5,
    full: i === lines.length - 1 || line.right + WORD > 624 - 0.5,
    start: start(i),
  }));
};
it("first-line, hanging and negative indents wrap each line at its own width (#83)", () => {
  const words = " word".repeat(40);
  const { composed, done } = compose(
    `---\nview: tracked\npage: Letter portrait\n---\n\n<!-- p0 hanging 0.5in, left 1in -->\nHANG${words}\n\n<!-- p1 first-line 1in -->\nFIRST${words}\n\n<!-- p2 hanging 0.5in, left 0in -->\nZERO${words}\n`,
  );
  for (const [tag, start] of [
    ["HANG", (i) => (i ? 96 : 48)],
    ["FIRST", (i) => (i ? 0 : 96)],
    ["ZERO", (i) => (i ? 0 : -48)],
  ])
    for (const line of fills(composed, tag, start))
      expect({ tag, ...line }).toEqual({ tag, ...line, left: line.start, fits: true, full: true });
  done();
});
