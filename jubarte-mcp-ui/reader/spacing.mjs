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

// Rust's f64 grammar: signs, exponents and both decimal shapes. The same
// expression is used by `number`, so no parse can leak Infinity or NaN.
const NUM = String.raw`([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)`;

// Rust's `char::is_whitespace` is the Unicode White_Space property: it has
// U+0085, U+00A0 and U+3000 but NOT U+FEFF, which JS `trim()`/`\s` remove.
// The reader uses this exact set (view_styles.rs::cell_spacing_attrs).
const WS = String.raw`[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]`;
const GAP = `${WS}+`;
const TRIM_START = new RegExp(`^${WS}+`, "u");
const TRIM_END = new RegExp(`${WS}+$`, "u");
const SPLIT = new RegExp(`${WS}+`, "u");
export const rustTrimStart = (text) => String(text ?? "").replace(TRIM_START, "");
export const rustTrimEnd = (text) => String(text ?? "").replace(TRIM_END, "");
export const rustTrim = (text) => rustTrimEnd(rustTrimStart(text));
export const rustSplit = (text) => String(text ?? "").split(SPLIT).filter(Boolean);

const number = (token) => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) return null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
};
export const rounded = (n, unit) => {
  const value = Math.round(n * unit) / unit;
  // Rust serializes -0 as 0; assert.deepStrictEqual tells them apart.
  return Object.is(value, -0) ? 0 : value;
};
// Rust `points`: f64 signs and exponents, 0..=1638pt, rounded to the
// unit Word stores (twips for points, hundredths for line counts).
const points = (token) => {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)pt$/.exec(token ?? "");
  if (!match) return null;
  const n = number(match[1]);
  return n === null || n < 0 || n > 1638 ? null : rounded(n, 20);
};

// An id line reads what a file says, not what Word's dialogs allow:
// `xml.rs::Spacing::clause` bounds the *stored* count by u32::MAX (#1479).
const U32_MAX = 0xffffffff;
const stored = (n, unit) => {
  const count = Math.round(n * unit);
  return n >= 0 && count <= U32_MAX ? count / unit : null;
};
const idPoints = (token) => {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)pt$/.exec(token ?? "");
  if (!match) return null;
  const n = number(match[1]);
  return n === null || !Number.isFinite(n) ? null : stored(n, 20);
};
const idLines = (token) => {
  const n = number(token);
  return n === null || !Number.isFinite(n) ? null : stored(n, 100);
};
const idRatio = (token) => {
  const n = number(token);
  return n === null || !Number.isFinite(n) ? null : stored(n, 240);
};

/**
 * A table legend's `cell paragraphs` words as the typed values Rust stores:
 * port of `cell_spacing_attrs` (view_styles.rs). Unlike an id line's spacing,
 * this grammar has no `contextual spacing`, and a repeated attribute
 * rejects the whole clause.
 * @param {string} text
 */
export function cellSpacingAttrs(text) {
  const words = rustSplit(text);
  const assigned = new Set();
  const out = {};
  for (let at = 0; at < words.length;) {
    const word = words[at];
    const value = words[at + 1];
    if (value === undefined) return null;
    const third = words[at + 2];
    const attr = word === "before" || word === "after"
      ? value === "auto" ? `${word}Auto` : third === "lines" ? `${word}Lines` : word
      : word === "line" ? "line" : null;
    if (!attr || assigned.has(attr)) return null;
    assigned.add(attr);
    if (word === "before" || word === "after") {
      if (value === "auto") {
        out[attr] = true;
        at += 2;
      } else if (third === "lines") {
        const count = number(value);
        if (count === null || count < 0 || count > 100) return null;
        out[attr] = rounded(count, 100);
        at += 3;
      } else {
        const pt = points(value);
        if (pt === null) return null;
        out[`${word}Pt`] = pt;
        at += 2;
      }
      continue;
    }
    if (third === "exact" || third === "atLeast") {
      const pt = points(value);
      if (pt === null) return null;
      out.line = { rule: third, points: pt };
      at += 3;
    } else {
      const ratio = number(value);
      if (ratio === null || ratio < 0 || ratio > 132) return null;
      out.line = { rule: "auto", multiple: rounded(ratio, 240) };
      at += 2;
    }
  }
  return Object.keys(out).length ? out : null;
}

// Each word group, anchored at the start, ends at Rust whitespace or the end.
// Its values are rounded with the same helpers as `cellSpacingAttrs`: Word
// stores points in twentieths, line counts in hundredths and line multiples
// in 240ths, and the writer prints the fewest decimals that read back.
const WORDS = [
  [
    new RegExp(String.raw`^(before|after)${GAP}${NUM}pt(?=${GAP}|$)`),
    (m) => {
      const pt = idPoints(`${m[2]}pt`);
      return pt === null ? null : { [`${m[1]}Pt`]: pt };
    },
  ],
  [new RegExp(String.raw`^(before|after)${GAP}auto(?=${GAP}|$)`), (m) => ({ [`${m[1]}Auto`]: true })],
  [
    new RegExp(String.raw`^(before|after)${GAP}${NUM}${GAP}lines(?=${GAP}|$)`),
    (m) => {
      const count = idLines(m[2]);
      return count === null ? null : { [`${m[1]}Lines`]: count };
    },
  ],
  [
    new RegExp(String.raw`^line${GAP}${NUM}pt${GAP}(exact|atLeast)(?=${GAP}|$)`),
    (m) => {
      const pt = idPoints(`${m[1]}pt`);
      return pt === null ? null : { line: { rule: m[2], points: pt } };
    },
  ],
  [
    new RegExp(String.raw`^line${GAP}${NUM}(?=${GAP}|$)`),
    (m) => {
      const ratio = idRatio(m[1]);
      return ratio === null ? null : { line: { rule: "auto", multiple: ratio } };
    },
  ],
  [new RegExp(String.raw`^contextual${GAP}spacing${GAP}off(?=${GAP}|$)`), () => ({ contextual: false })],
  [new RegExp(String.raw`^contextual${GAP}spacing(?=${GAP}|$)`), () => ({ contextual: true })],
];

/**
 * The spacing words at the start of `text`, and what follows them.
 * @param {string} text
 * @returns {{spacing: object|null, rest: string}}
 */
export function takeSpacing(text) {
  let rest = rustTrim(text);
  let spacing = null;
  for (let matched = true; matched && rest;) {
    matched = false;
    for (const [pattern, read] of WORDS) {
      const m = rest.match(pattern);
      if (!m) continue;
      const fields = read(m);
      if (!fields) continue;
      // A repeated attribute makes the clause malformed: reject it, as
      // cell_spacing_attrs does in Rust (R2-F3).
      if (spacing && Object.keys(fields).some((key) => key in spacing)) {
        return { spacing, rest };
      }
      spacing = { ...spacing, ...fields };
      rest = rustTrim(rest.slice(m[0].length));
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
  for (const side of ["before", "after"]) {
    if (style[`${side}Pt`] != null) out[`${side}Pt`] = style[`${side}Pt`];
    if (style[`${side}Lines`] != null) out[`${side}Lines`] = style[`${side}Lines`];
    if (style[`${side}Auto`] != null) out[`${side}Auto`] = style[`${side}Auto`];
  }
  if (style.line) out.line = style.line;
  else if (style.lineHeight != null) out.line = { rule: "auto", multiple: style.lineHeight };
  if (style.contextualSpacing != null) out.contextual = style.contextualSpacing;
  return out;
}

/**
 * The spacing Word applies to a paragraph: its own value, else its style's,
 * else its table style's, else Normal's, else Word's (none, single), one
 * property at a time. A side is automatic when the winning value there is
 * `auto`. A table style sits above the document defaults and below the
 * paragraph styles (ECMA-376 §17.7.2); the engine leaves out of its
 * `cell paragraphs` what Normal itself sets, so it goes above the legend's
 * Normal, which folds in the defaults (#124).
 * @param {object} [own] the id line's spacing
 * @param {object} [style] the paragraph's legend style
 * @param {object} [normal] the legend's Normal
 * @param {object} [table] the table style's `cell paragraphs` spacing
 */
export function resolveSpacing(own, style, normal, table) {
  const layers = [own ?? {}, style === normal ? {} : styleSpacing(style), table ?? {}, styleSpacing(normal)];
  const side = (name) => {
    for (const layer of layers) {
      if (layer[`${name}Auto`]) return { pt: 0, auto: true };
      // `w:{before,after}Lines` is in hundredths of a 240-twip line, so a
      // line count wins inside its layer and means twelve points per line.
      if (layer[`${name}Lines`] != null) {
        return { pt: layer[`${name}Lines`] * 12, auto: false };
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
    line: pick("line", { rule: "auto", multiple: 1 }),
    contextual: pick("contextual", false),
  };
}
