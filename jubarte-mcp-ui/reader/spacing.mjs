// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// A paragraph's spacing as typed fields (#101), read from the words the
// engine writes: `spacing_clauses` (crates/jubarte-markdown
// from_docx/agent.rs) on id lines and in a table's cell groups, and the
// styles legend (from_docx/header.rs).
//   before 6pt | before auto | before 1.5 lines   (and after)
//   line 1.08 (a multiple) | line 8.65pt exact | line 20pt atLeast
//   contextual spacing | contextual spacing off

import { lineBox } from "./line-box.mjs";

const NUM = String.raw`(\d+(?:\.\d*)?|\.\d+)`;
// Each word group, anchored at the start, ends at a space or the end.
const WORDS = [
  [
    new RegExp(String.raw`^(before|after)\s+${NUM}pt(?=\s|$)`),
    (m) => ({ [`${m[1]}Pt`]: Number(m[2]) }),
  ],
  [/^(before|after)\s+auto(?=\s|$)/, (m) => ({ [`${m[1]}Auto`]: true })],
  [
    new RegExp(String.raw`^(before|after)\s+${NUM}\s+lines(?=\s|$)`),
    (m) => ({ [`${m[1]}Lines`]: Number(m[2]) }),
  ],
  [
    new RegExp(String.raw`^line\s+${NUM}pt\s+(exact|atLeast)(?=\s|$)`),
    (m) => ({ line: { rule: m[2], points: Number(m[1]) } }),
  ],
  [
    new RegExp(String.raw`^line\s+${NUM}(?=\s|$)`),
    (m) => ({ line: { rule: "auto", multiple: Number(m[1]) } }),
  ],
  [/^contextual\s+spacing\s+off(?=\s|$)/, () => ({ contextual: false })],
  [/^contextual\s+spacing(?=\s|$)/, () => ({ contextual: true })],
];

/**
 * The spacing words at the start of `text`, and what follows them.
 * @param {string} text
 * @returns {{spacing: object|null, rest: string}}
 */
export function takeSpacing(text) {
  let rest = String(text ?? "").trim();
  let spacing = null;
  for (let matched = true; matched && rest;) {
    matched = false;
    for (const [pattern, read] of WORDS) {
      const m = rest.match(pattern);
      if (!m) continue;
      spacing = { ...spacing, ...read(m) };
      rest = rest.slice(m[0].length).trim();
      matched = true;
      break;
    }
  }
  return { spacing, rest };
}

/**
 * `text` read as spacing, or null unless every word in it is spacing.
 * @param {string} text
 */
export function parseSpacing(text) {
  const { spacing, rest } = takeSpacing(text);
  return spacing && !rest ? spacing : null;
}

/** A legend style's spacing in the same fields as a paragraph's. */
function styleSpacing(style) {
  if (!style) return {};
  const out = {};
  if (style.beforePt != null) out.beforePt = style.beforePt;
  if (style.afterPt != null) out.afterPt = style.afterPt;
  if (style.line) out.line = style.line;
  else if (style.lineHeight != null) out.line = { rule: "auto", multiple: style.lineHeight };
  if (style.contextualSpacing != null) out.contextual = style.contextualSpacing;
  return out;
}

/**
 * The spacing Word applies to a paragraph: its own value, else its style's,
 * else Normal's, else Word's (none, single), one property at a time. A side
 * is automatic when the winning value there is `auto`.
 * @param {object} [own] the id line's spacing
 * @param {object} [style] the paragraph's legend style
 * @param {object} [normal] the legend's Normal
 * @param {object} [font] the paragraph's direct font properties
 */
export function resolveSpacing(own, style, normal, font = {}) {
  const layers = [own ?? {}, styleSpacing(style), styleSpacing(normal)];
  // Before/after lines are multiples of the font's single-line height,
  // independent of the paragraph's exact/atLeast/multiple line rule.
  const single = () => lineBox(
    font.fontFamily ?? style?.fontFamily ?? normal?.fontFamily,
    font.fontSizePt ?? style?.fontSizePt ?? normal?.fontSizePt ?? 11,
  ).height;
  const side = (name) => {
    for (const layer of layers) {
      if (layer[`${name}Auto`]) return { pt: 0, auto: true };
      if (layer[`${name}Lines`] != null) {
        const lines = layer[`${name}Lines`];
        return { pt: lines * single(), lines, auto: false };
      }
      if (layer[`${name}Pt`] != null) return { pt: layer[`${name}Pt`], auto: false };
    }
    return { pt: 0, auto: false };
  };
  const pick = (key, fallback) => layers.find((layer) => layer[key] != null)?.[key] ?? fallback;
  const before = side("before");
  const after = side("after");
  return {
    beforePt: before.pt,
    afterPt: after.pt,
    beforeAuto: before.auto,
    afterAuto: after.auto,
    ...(before.lines != null ? { beforeLines: before.lines } : {}),
    ...(after.lines != null ? { afterLines: after.lines } : {}),
    line: pick("line", { rule: "auto", multiple: 1 }),
    contextual: pick("contextual", false),
  };
}
