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
 * @returns {{ascent: number, descent: number, height: number}} in points
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
  return { ascent, descent, height };
}
