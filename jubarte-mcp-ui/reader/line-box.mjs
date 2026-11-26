// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// A line's height as Word sets it (#100), in points. Measured in
// word-metrics/ (README, "Line pitch"):
//   - single spacing is the face's hhea height, ascent + descent + line gap,
//     times the size; the OS/2 typo heights play no part;
//   - `auto` multiplies single spacing by line/240;
//   - `exact` is the line value, even when shorter than the text;
//   - `atLeast` is the larger of the line value and single spacing.
// The heights come from the bundled faces (face-metrics.json, written by
// scripts/page_fonts.py): each twin has its family's metrics, and a family
// with no twin measures with its class's face, as faces.mjs draws it.
// Text is measured and drawn unkerned (fontKerning "none"): Word does not
// kern by default.
import metrics from "./face-metrics.json" with { type: "json" };
import { faceFor } from "./faces.mjs";

/**
 * @param {string|undefined} family the source font family
 * @param {number} sizePt the font size, in points
 * @param {{line?: number, rule?: "auto"|"exact"|"atLeast"}} [spacing] w:spacing's
 *   line (in 240ths of a line for auto, twentieths of a point otherwise) and lineRule
 * @returns {{ascent: number, descent: number, height: number, baseline: number}} in points
 */
export function lineBox(family, sizePt, { line, rule = "auto" } = {}) {
  const face = metrics[faceFor(family).bundled];
  const ascent = face.ascent * sizePt;
  const descent = face.descent * sizePt;
  const single = ascent + descent + face.lineGap * sizePt;
  let height = single;
  if (Number.isFinite(line) && line > 0) {
    if (rule === "exact") height = line / 20;
    else if (rule === "atLeast") height = Math.max(line / 20, single);
    else height = (single * line) / 240;
  }
  // Where the baseline sits, from the top of the line (#102, 4c): an auto multiple's extra space
  // goes below the text, at least puts it above, and exact puts the baseline at 0.8 of the line
  // (word-metrics, `lines-*`).
  const natural = face.lineGap * sizePt + ascent;
  const baseline =
    rule === "exact" && Number.isFinite(line) && line > 0
      ? 0.8 * height
      : rule === "atLeast"
        ? height - single + natural
        : natural;
  return { ascent, descent, height, baseline };
}

/**
 * The ascent and descent, in px, of a CSS font shorthand such as
 * `normal 400 14.67px "Calibri", "Jubarte Page C", sans-serif` (#102, 4c): the box a run's
 * glyphs take when its line height is exactly that tall, so its top can sit the baseline
 * where Word puts it.
 * @param {string|undefined} font
 * @returns {{ascent: number, descent: number}|null}
 */
export function fontBox(font) {
  const match = /(\d+(?:\.\d+)?)px\s+(.+)$/.exec(String(font ?? ""));
  if (!match) return null;
  const size = Number(match[1]);
  const face = metrics[faceFor(match[2]).bundled];
  return { ascent: face.ascent * size, descent: face.descent * size };
}
