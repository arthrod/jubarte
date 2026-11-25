// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// A line's height as Word sets it (#100), checked against the pitch Word drew
// in jubarte-mcp-ui/word-metrics (README, "Line pitch"). Word's PDF sits on a
// 0.24pt grid, and multi-line pitches spread by up to 0.48pt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineBox } from "./line-box.mjs";

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
  assert.equal(lineBox("Georgia", 11).height, lineBox("Times New Roman", 11).height);
  assert.equal(lineBox(undefined, 11).height, lineBox("Calibri", 11).height);
});

// Where Word puts the text inside the line (#102, 4c). word-metrics' `lines-*` fixtures give
// each rule's text shift against the auto spacing before it (summary.txt gaps less the pitch
// and the 12pt spacing): an auto multiple puts its extra below the text, at least puts it above,
// and exact sits the baseline at 0.8 of the line. The shifts carry two lines' 0.24pt rounding.
const SHIFT = {
  Calibri: { exact18: 4.56, atleast20: 7.44, atleast8: -0.36 },
  Arial: { exact18: 4.32, atleast20: 7.68, atleast8: -0.48 },
  "Times New Roman": { exact18: 4.92, atleast20: 8.28, atleast8: -0.24 },
  "Courier New": { exact18: 6.48, atleast20: 8.88, atleast8: 0.12 },
};

test("the baseline moves with the line rule as Word moves it, within 1pt", () => {
  for (const [family, shifts] of Object.entries(SHIFT)) {
    const auto = lineBox(family, 10, RULES.auto108).baseline;
    assert.ok(Math.abs(lineBox(family, 10, RULES.auto200).baseline - auto) < 0.01, `${family} auto200`);
    for (const [rule, want] of Object.entries(shifts)) {
      const got = lineBox(family, 10, RULES[rule]).baseline - auto;
      assert.ok(Math.abs(got - want) <= 1, `${family} ${rule}: ${got.toFixed(2)} vs Word ${want}`);
    }
  }
});

test("a single Calibri 11pt line's baseline is where Word's table fixture draws it", () => {
  // `table`: T00's glyph box starts 0.05pt under the margin; Calibri's box top is 0.952em above
  // the baseline in Word's PDF, so the baseline is 10.52pt down.
  assert.ok(Math.abs(lineBox("Calibri", 11).baseline - 10.52) <= 0.25);
});

test("a run's glyph box comes from its CSS font", async () => {
  const { fontBox } = await import("./line-box.mjs");
  const box = fontBox('italic 700 16px "Times New Roman", "Jubarte Page Serif", serif');
  assert.ok(Math.abs(box.ascent - 0.891113 * 16) < 1e-6);
  assert.ok(Math.abs(box.descent - 0.216309 * 16) < 1e-6);
  assert.equal(fontBox("bad"), null);
});
