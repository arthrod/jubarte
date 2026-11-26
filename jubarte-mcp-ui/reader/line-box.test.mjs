// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// A line's height as Word sets it (#100), checked against the pitch Word drew
// in jubarte-mcp-ui/word-metrics (README, "Line pitch"). Word's PDF sits on a
// 0.24pt grid, and multi-line pitches spread by up to 0.48pt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineBox, measureFace } from "./line-box.mjs";

const RULES = {
  auto100: { line: 240, rule: "auto" },
  auto108: { line: 259, rule: "auto" },
  auto150: { line: 360, rule: "auto" },
  auto200: { line: 480, rule: "auto" },
  exact18: { line: 360, rule: "exact" },
  atleast20: { line: 400, rule: "atLeast" },
  atleast8: { line: 160, rule: "atLeast" },
};
const ORDER = Object.keys(RULES);
// Word's measured pitch, in points (word-metrics/README.md).
const WORD = {
  Calibri: {
    10: [12.24, 13.08, 18.36, 24.48, 18, 20.04, 12.24],
    11: [13.44, 14.4, 20.16, 26.88, 18, 19.92, 13.44],
    12: [14.64, 15.84, 22.08, 29.28, 18, 19.92, 14.64],
    14: [17.04, 18.48, 25.68, 34.08, 18, 19.92, 17.04],
  },
  Arial: {
    10: [11.52, 12.48, 17.28, 23.04, 18, 19.92, 11.52],
    11: [12.72, 13.68, 18.96, 25.2, 18, 19.92, 12.72],
    12: [13.68, 14.88, 20.64, 27.6, 18, 20.16, 13.92],
    14: [16.08, 17.28, 24.12, 32.16, 18, 19.92, 16.08],
  },
  "Times New Roman": {
    10: [11.52, 12.36, 17.28, 23.04, 18, 20.04, 11.52],
    11: [12.72, 13.68, 18.96, 25.2, 18, 19.92, 12.72],
    12: [13.92, 14.88, 20.64, 27.6, 18, 20.16, 13.92],
    14: [16.08, 17.28, 24.24, 32.16, 18, 19.92, 16.08],
  },
  "Courier New": {
    10: [11.28, 12.24, 17.04, 22.56, 18, 20.04, 11.28],
    11: [12.48, 13.44, 18.72, 24.96, 18, 20.04, 12.48],
    12: [13.68, 14.64, 20.4, 27.12, 18, 19.92, 13.68],
    14: [15.84, 17.04, 23.76, 31.68, 18, 20.04, 15.84],
  },
};

test("every line height Word drew is matched within its own grid (0.24pt) plus 0.25pt", () => {
  let worst = 0;
  for (const [family, sizes] of Object.entries(WORD))
    for (const [size, row] of Object.entries(sizes))
      row.forEach((want, i) => {
        const got = lineBox(family, Number(size), RULES[ORDER[i]]).height;
        worst = Math.max(worst, Math.abs(got - want));
        assert.ok(
          Math.abs(got - want) <= 0.49,
          `${family} ${size}pt ${ORDER[i]}: ${got.toFixed(2)} vs Word ${want}`,
        );
      });
  assert.ok(worst > 0, "the table was read");
});

test("the text sits inside the line: ascent and descent are the face's, at its size", () => {
  const box = lineBox("Calibri", 11);
  assert.ok(Math.abs(box.ascent - 0.75 * 11) < 1e-6);
  assert.ok(Math.abs(box.descent - 0.25 * 11) < 1e-6);
  assert.ok(box.height >= box.ascent + box.descent);
});

test("no rule means single spacing, and an exact line may be shorter than its text", () => {
  assert.equal(
    lineBox("Arial", 12).height,
    lineBox("Arial", 12, { line: 240, rule: "auto" }).height,
  );
  assert.equal(lineBox("Calibri", 40, { line: 200, rule: "exact" }).height, 10);
});

test("a family with no twin measures with its class's face", () => {
  assert.equal(
    lineBox("Georgia", 11).height,
    lineBox("Times New Roman", 11).height,
  );
  assert.equal(lineBox(undefined, 11).height, lineBox("Calibri", 11).height);
});

test("K108: the selected source face supplies baseline and auto/atLeast pitch", () => {
  // A source face whose normalized hhea metrics differ from the serif fallback.
  const source = { ascent: 1.1, descent: 0.3, lineGap: 0.2 };
  const measure = (stack) => {
    assert.equal(stack, '"Georgia", "Jubarte Page Serif", serif');
    return source;
  };
  const box = lineBox("Georgia", 10, { line: 360, rule: "auto" }, measure);
  assert.equal(box.ascent, 11);
  assert.equal(box.descent, 3);
  assert.equal(box.height, 24);
  assert.equal(
    lineBox("Georgia", 10, { line: 200, rule: "atLeast" }, measure).height,
    16,
  );
  assert.equal(
    lineBox("Georgia", 10, { line: 400, rule: "atLeast" }, measure).height,
    20,
  );
});

test("K109: exact zero is explicit spacing, not omitted spacing", () => {
  assert.equal(lineBox("Calibri", 11, { line: 0, rule: "exact" }).height, 0);
  assert.ok(lineBox("Calibri", 11).height > 0);
  assert.ok(lineBox("Calibri", 11, { rule: "exact" }).height > 0);
});

// A layout fake, since a DOM without a layout engine reports zero rectangles.
// Geometry comes from the selected fixture face, never the host's installed fonts.
function fontDocument(faces) {
  const elements = [];
  const mounted = new Set();
  const rect = (element) => {
    const [line, text, baseline] = elements.slice(-3);
    const stack = line.style.font.slice("1000px ".length);
    const name = stack.split(", ").find((name) => faces[name]);
    const { ascent, descent, lineGap } = faces[name];
    if (element === text)
      return { top: -ascent * 1000, bottom: descent * 1000 };
    if (element === baseline) return { top: 0 };
    return { height: (ascent + descent + lineGap) * 1000 };
  };
  return {
    mounted,
    body: { append: (element) => mounted.add(element) },
    createElement() {
      const element = {
        style: {},
        append(...children) {
          this.children = children;
        },
        getBoundingClientRect() {
          return rect(this);
        },
        remove() {
          mounted.delete(this);
        },
      };
      elements.push(element);
      return element;
    },
  };
}

test("K108: browser measurement follows source selection and later font loads", () => {
  const faces = {
    '"Jubarte Page Serif"': { ascent: 0.9, descent: 0.2, lineGap: 0.1 },
  };
  const doc = fontDocument(faces);
  const measure = (stack) => measureFace(stack, doc);
  assert.equal(lineBox("Georgia", 10, {}, measure).ascent, 9);
  // The source face becomes available after an earlier fallback measurement.
  faces['"Georgia"'] = { ascent: 1.1, descent: 0.3, lineGap: 0.2 };
  const box = lineBox("Georgia", 10, {}, measure);
  assert.equal(box.ascent, 11);
  assert.equal(box.descent, 3);
  assert.equal(box.height, 16);
  assert.equal(doc.mounted.size, 0, "measurement nodes are removed");
});

test("unavailable browser layout retains bundled metrics", () => {
  assert.equal(measureFace("serif", {}), undefined);
  for (const fixture of [
    { ascent: 0, descent: 0, lineGap: 0 },
    { ascent: NaN, descent: 0, lineGap: 0 },
    { ascent: -1, descent: 2, lineGap: 0 },
    { ascent: 2, descent: -1, lineGap: 0 },
  ]) {
    const doc = fontDocument({ '"Georgia"': fixture });
    assert.equal(measureFace('"Georgia"', doc), undefined);
    assert.equal(doc.mounted.size, 0);
    assert.deepEqual(
      lineBox("Georgia", 11, {}, (stack) => measureFace(stack, doc)),
      lineBox("Georgia", 11, {}, () => undefined),
    );
  }
});

test("invalid spacing stays single spaced and zero is special only for exact", () => {
  for (const line of [NaN, Infinity, -20]) {
    assert.equal(
      lineBox("Calibri", 11, { line, rule: "exact" }).height,
      lineBox("Calibri", 11).height,
    );
  }
  for (const rule of ["auto", "atLeast"]) {
    assert.equal(
      lineBox("Calibri", 11, { line: 0, rule }).height,
      lineBox("Calibri", 11).height,
    );
  }
});
