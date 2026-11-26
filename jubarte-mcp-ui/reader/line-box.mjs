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
// In a browser, measure the same stack that draws the text, including an
// installed source face. Outside a layout-capable browser, use the bundled
// face's hhea metrics (face-metrics.json, written by scripts/page_fonts.py).
// Browser normal line heights are platform-dependent, not a Word oracle.
// Text is measured and drawn unkerned (fontKerning "none"): Word does not
// kern by default.
import metrics from "./face-metrics.json" with { type: "json" };
import { faceFor } from "./faces.mjs";

/** Measure a selected CSS stack in ems, after the page's fonts have loaded.
 * An inline span gives the font box; an empty inline-block marks its baseline.
 * The containing normal line also includes the selected face's line gap.
 * Do not cache: a later font load may change which face the stack selects.
 */
export function measureFace(stack, doc = globalThis.document) {
  if (!doc?.body) return undefined;
  const line = doc.createElement("div");
  const text = doc.createElement("span");
  const baseline = doc.createElement("span");
  line.style.cssText =
    "all:initial;position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;";
  line.style.font = `1000px ${stack}`;
  line.style.lineHeight = "normal";
  text.style.cssText = "all:initial;font:inherit;line-height:inherit;";
  text.textContent = "Hg";
  baseline.style.cssText =
    "all:initial;display:inline-block;width:0;height:0;vertical-align:baseline;";
  line.append(text, baseline);
  doc.body.append(line);
  try {
    const box = text.getBoundingClientRect();
    const y = baseline.getBoundingClientRect().top;
    const ascent = (y - box.top) / 1000;
    const descent = (box.bottom - y) / 1000;
    const height = line.getBoundingClientRect().height / 1000;
    if (
      ![ascent, descent, height].every(Number.isFinite) ||
      ascent < 0 ||
      descent < 0 ||
      height <= 0
    )
      return undefined;
    return { ascent, descent, lineGap: height - ascent - descent };
  } finally {
    line.remove();
  }
}

/**
 * @param {string|undefined} family the source font family
 * @param {number} sizePt the font size, in points
 * @param {{line?: number, rule?: "auto"|"exact"|"atLeast"}} [spacing] w:spacing's
 *   line (in 240ths of a line for auto, twentieths of a point otherwise) and lineRule
 * @param {(stack: string) => {ascent: number, descent: number, lineGap: number}|undefined} [measure]
 *   selected-face metrics in ems; defaults to browser measurement
 * @returns {{ascent: number, descent: number, height: number}} in points
 */
export function lineBox(
  family,
  sizePt,
  { line, rule = "auto" } = {},
  measure = measureFace,
) {
  const selected = faceFor(family);
  const face = measure(selected.stack) ?? metrics[selected.bundled];
  const ascent = face.ascent * sizePt;
  const descent = face.descent * sizePt;
  const single = ascent + descent + face.lineGap * sizePt;
  let height = single;
  if (Number.isFinite(line) && (line > 0 || (line === 0 && rule === "exact"))) {
    if (rule === "exact") height = line / 20;
    else if (rule === "atLeast") height = Math.max(line / 20, single);
    else height = (single * line) / 240;
  }
  return { ascent, descent, height };
}
