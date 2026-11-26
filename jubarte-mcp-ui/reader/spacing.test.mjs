// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// Spacing read into typed fields (#101): every clause the engine writes
// (crates/jubarte-markdown agent.rs `spacing_clauses`, header.rs's legend,
// mod.rs `cell_spacings`) parses, and a paragraph's own value wins over its
// style's, property by property.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseSpacing, takeSpacing, cellSpacingAttrs, resolveSpacing } from "./spacing.mjs";
import { parseDirective, parseDocumentMetadata as parseSourceDocument, parseTableLegend } from "./metadata.mjs";

const VIEWS = new URL("../word-metrics/views/", import.meta.url);

test("each clause spacing_clauses can write reads as typed fields", () => {
  assert.deepEqual(parseSpacing("before 6pt"), { beforePt: 6 });
  assert.deepEqual(parseSpacing("after 10.05pt"), { afterPt: 10.05 });
  assert.deepEqual(parseSpacing("before 0pt"), { beforePt: 0 });
  assert.deepEqual(parseSpacing("before auto"), { beforeAuto: true });
  assert.deepEqual(parseSpacing("after auto"), { afterAuto: true });
  assert.deepEqual(parseSpacing("before 1.5 lines"), { beforeLines: 1.5 });
  // The writer prints `1.08` for `w:line="259"`; read it as the stored 240th.
  assert.deepEqual(parseSpacing("line 1.08"), { line: { rule: "auto", multiple: 259 / 240 } });
  assert.deepEqual(parseSpacing("line 1"), { line: { rule: "auto", multiple: 1 } });
  assert.deepEqual(parseSpacing("line 8.65pt exact"), { line: { rule: "exact", points: 8.65 } });
  assert.deepEqual(parseSpacing("line 20pt atLeast"), { line: { rule: "atLeast", points: 20 } });
  assert.deepEqual(parseSpacing("contextual spacing"), { contextual: true });
  assert.deepEqual(parseSpacing("contextual spacing off"), { contextual: false });
});

test("words that are not spacing are not read as spacing", () => {
  for (const text of [
    "left",
    "size 10pt",
    "line",
    "before",
    "line 18pt",
    "line 1.5x",
    "after 3pt extra",
    "beforeauto",
  ])
    assert.equal(parseSpacing(text), null, text);
});

test("a cell group's space-joined words give their spacing and the rest", () => {
  assert.deepEqual(takeSpacing("before 0pt after 0pt"), {
    spacing: { beforePt: 0, afterPt: 0 },
    rest: "",
  });
  assert.deepEqual(takeSpacing("line 8.65pt exact size 9pt mark style"), {
    spacing: { line: { rule: "exact", points: 8.65 } },
    rest: "size 9pt mark style",
  });
  assert.deepEqual(takeSpacing("size 9pt"), { spacing: null, rest: "size 9pt" });
});

test("a paragraph's own value wins over its style's, and its style's over Normal's, one property at a time", () => {
  const normal = { afterPt: 8, lineHeight: 1.08 };
  const style = { beforePt: 12, contextualSpacing: true };
  const own = { afterPt: 0, line: { rule: "exact", points: 18 } };
  assert.deepEqual(resolveSpacing(own, style, normal), {
    beforePt: 12,
    afterPt: 0,
    beforeAuto: false,
    afterAuto: false,
    line: { rule: "exact", points: 18 },
    contextual: true,
  });
  assert.deepEqual(resolveSpacing(undefined, undefined, undefined), {
    beforePt: 0,
    afterPt: 0,
    beforeAuto: false,
    afterAuto: false,
    line: { rule: "auto", multiple: 1 },
    contextual: false,
  });
  // Word's automatic space replaces the points it overrides.
  assert.equal(resolveSpacing({ beforeAuto: true }, { beforePt: 6 }, {}).beforeAuto, true);
  assert.equal(resolveSpacing({ beforePt: 3 }, { beforeAuto: true }, {}).beforeAuto, false);
  // The legend's `line Xpt exact` reaches a style as `line`.
  assert.deepEqual(resolveSpacing({}, { line: { rule: "atLeast", points: 20 } }, normal).line, {
    rule: "atLeast",
    points: 20,
  });
  // An explicit zero is a value, not an absence.
  assert.equal(resolveSpacing({ afterPt: 0 }, {}, normal).afterPt, 0);
});

test("the engine's views of the Word fixtures: no spacing clause is unknown", () => {
  let lines = 0;
  for (const name of readdirSync(VIEWS)) {
    for (const line of readFileSync(new URL(name, VIEWS), "utf8").split("\n")) {
      if (!/^<!-- (\w+\.)?[pt]\d/.test(line)) continue;
      lines++;
      const warnings = [];
      parseDirective(line, { warnings });
      const spacing = warnings.filter(
        (w) =>
          /unknown/.test(w.code) &&
          /\b(before|after|line|contextual)\b/.test(w.message.split(": ").slice(1).join(": ")),
      );
      assert.deepEqual(
        spacing.map((w) => w.message),
        [],
        `${name}: ${line}`,
      );
    }
  }
  assert.ok(lines > 100, `read ${lines} id lines`);
});

test("a view's paragraphs carry their spacing, and the legend's styles theirs", () => {
  const { directives, metadata } = parseSourceDocument(
    readFileSync(new URL("lines-arial.md", VIEWS), "utf8"),
  );
  assert.deepEqual(
    metadata.styles.Normal.line ?? { rule: "auto", multiple: metadata.styles.Normal.lineHeight },
    { rule: "auto", multiple: 259 / 240 },
  );
  const byId = Object.fromEntries(
    directives.filter((d) => d.type === "paragraph").map((d) => [d.id, d.properties.spacing]),
  );
  assert.deepEqual(byId.p4, { beforePt: 0, afterPt: 12, line: { rule: "exact", points: 18 } });
  assert.deepEqual(byId.p5, { beforePt: 0, afterPt: 12, line: { rule: "atLeast", points: 20 } });
  const table = parseSourceDocument(
    readFileSync(new URL("table.md", VIEWS), "utf8"),
  ).directives.find((d) => d.type === "table");
  assert.deepEqual(table.properties.cellSpacings, [
    { from: 1, to: 8, spacing: { beforePt: 0, afterPt: 0 } },
  ]);
});

test("a table style's cell paragraph spacing sits above Normal and below the paragraph's own and its style's (#124)", () => {
  const normal = { afterPt: 10, lineHeight: 1.15 };
  const table = { afterPt: 0, line: { rule: "auto", multiple: 1 } };
  const cell = resolveSpacing(undefined, normal, normal, table);
  assert.equal(cell.afterPt, 0);
  assert.deepEqual(cell.line, { rule: "auto", multiple: 1 });
  assert.equal(resolveSpacing({ afterPt: 6 }, normal, normal, table).afterPt, 6);
  assert.equal(resolveSpacing({}, { afterPt: 3 }, normal, table).afterPt, 3);
  assert.equal(resolveSpacing({}, normal, normal, undefined).afterPt, 10);
});

test("the tables legend gives each style its cell paragraph spacing, and a table line its style (#124)", () => {
  const legend = parseTableLegend(
    'TableNormal, LightShading-Accent1, borders vary, cell paragraphs after 0pt line 1, "A, B", named X, all borders 0.5pt, Plain, cell paragraphs line 12pt exact',
  );
  assert.deepEqual(Object.keys(legend), ["TableNormal", "LightShading-Accent1", "A, B", "Plain"]);
  assert.deepEqual(legend["LightShading-Accent1"].cellSpacing, { afterPt: 0, line: { rule: "auto", multiple: 1 } });
  assert.equal(legend.TableNormal.cellSpacing, undefined);
  assert.deepEqual(legend.Plain.cellSpacing, { line: { rule: "exact", points: 12 } });
  const view = [
    "---",
    "view: tracked",
    "styles:",
    "  Normal: Aptos 10.5pt, after 10pt, line 1.15, left  # default",
    "  tables: TableNormal, MediumShading1-Accent1, borders vary, cell paragraphs after 0pt line 1",
    "---",
    "",
    "<!-- t0 1x1, cells p0-p0 by row, style MediumShading1-Accent1 -->",
    "| A |",
    "|---|",
    "",
  ].join("\n");
  const { directives, metadata } = parseSourceDocument(view);
  const t0 = directives.find((d) => d.type === "table");
  assert.equal(t0.properties.tableStyle, "MediumShading1-Accent1");
  assert.equal(t0.properties.unknown?.length ?? 0, 0);
  assert.deepEqual(metadata.tableStyles["MediumShading1-Accent1"].cellSpacing, { afterPt: 0, line: { rule: "auto", multiple: 1 } });
});

test('K130 prototype names are own table styles and do not contaminate later documents', () => {
  const before = Object.getOwnPropertyDescriptor(Object.prototype, 'cellSpacing');
  try {
    const styles = parseTableLegend('__proto__, cell paragraphs after 24pt, constructor, cell paragraphs after 6pt');
    assert.ok(Object.hasOwn(styles, '__proto__'));
    assert.deepEqual(styles.__proto__.cellSpacing, {afterPt: 24});
    assert.ok(Object.hasOwn(styles, 'constructor'));
    assert.deepEqual(styles.constructor.cellSpacing, {afterPt: 6});
    assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'cellSpacing'), before);
    assert.equal(parseTableLegend('Ordinary').Ordinary.cellSpacing, undefined);
  } finally {
    if (before) Object.defineProperty(Object.prototype, 'cellSpacing', before);
    else delete Object.prototype.cellSpacing;
    delete Object.cellSpacing;
  }
});

test('K126 invalid border clauses start a new table style, including unquoted IDs', () => {
  for (const id of ['borders 2', '"borders 2"', 'all borders 9pt', 'borders top', 'borders top single top double']) {
    const name = id.replaceAll('"', '');
    const styles = parseTableLegend(`A, ${id}, cell paragraphs after 6pt`);
    assert.deepEqual(Object.keys(styles), ['A', name]);
    assert.equal(styles.A.cellSpacing, undefined);
    assert.deepEqual(styles[name].cellSpacing, {afterPt: 6});
  }
  const valid = parseTableLegend('A, borders top double 0.75pt #FF0000 space 4pt left single, named "A, B", cell paragraphs after 6pt, B, all borders 0.5pt, cell paragraphs after 0pt');
  assert.deepEqual(Object.keys(valid), ['A', 'B']);
  assert.deepEqual(valid.A.cellSpacing, {afterPt: 6});
  assert.deepEqual(valid.B.cellSpacing, {afterPt: 0});
});

test('K131 plain tables and neutral directives resolve identical default cell spacing', async () => {
  const {parseJubarte} = await import('./jubarte.mjs');
  function spacings(directive, legend = '') {
    const result = parseJubarte(`---\nview: tracked\nstyles:\n  Normal: Aptos 11pt, after 8pt, line 1.08\n${legend}---\n\n${directive}| A | B |\n|---|---|\n| C | D |\n`);
    const out = [];
    result.doc.descendants(node => {
      if (['td', 'th'].includes(node.type.name)) {
        const data = node.attrs.data;
        out.push(resolveSpacing(data.cellSpacing, data.documentStyle, result.metadata.styles.Normal, data.tableSpacing));
      }
    });
    return out;
  }
  const plain = spacings('');
  assert.equal(plain.length, 4);
  assert.deepEqual(plain, spacings('<!-- t0 2x2 -->\n'));
  for (const spacing of plain) {
    assert.equal(spacing.afterPt, 0);
    assert.deepEqual(spacing.line, {rule: 'auto', multiple: 1});
  }
  const custom = spacings('', '  table: Ledger, cell paragraphs after 6pt\n');
  assert.deepEqual(custom, spacings('<!-- t0 2x2 -->\n', '  table: Ledger, cell paragraphs after 6pt\n'));
  for (const spacing of custom) assert.equal(spacing.afterPt, 6);
});


test('K126 border space +5pt is accepted like Rust u32 parsing', () => {
  const styles = parseTableLegend('A, borders top single space +5pt, cell paragraphs after 6pt, B, cell paragraphs after 0pt');
  assert.deepEqual(Object.keys(styles), ['A', 'B']);
  assert.deepEqual(styles.A.cellSpacing, {afterPt: 6});
  assert.deepEqual(styles.B.cellSpacing, {afterPt: 0});
});

test('R2-F3 shared table legend cases (JS reads same fixture as Rust)', () => {
  const cases = JSON.parse(readFileSync(new URL('../../tests/fixtures/table_legend_cases.json', import.meta.url), 'utf8'));
  for (const c of cases) {
    const styles = parseTableLegend(c.legend);
    const got = Object.fromEntries(Object.entries(styles).map(([id, s]) => [id, {
      border: s.border ?? null,
      spacing: s.cellSpacing ?? null,
    }]));
    const want = Object.fromEntries(Object.entries(c.styles).map(([id, s]) => [id, {
      border: s.border ?? null,
      spacing: s.spacing ?? null,
    }]));
    assert.deepEqual(got, want, c.name);
  }
});

test('table legend differential corpus (JS matches Rust-generated expected, border included)', () => {
  const cases = JSON.parse(readFileSync(new URL('../../tests/fixtures/table_legend_differential.json', import.meta.url), 'utf8'));
  let failures = 0;
  const first = [];
  for (const c of cases) {
    // `kind: table` is the singular `table:` line: Rust keeps its first entry
    // only, where `tables:` replaces a repeated id's whole entry.
    const styles = c.kind === 'table'
      ? parseSourceDocument(`---\nview: tracked\nstyles:\n  table: ${c.legend}\n---\n`).metadata.tableStyles
      : parseTableLegend(c.legend);
    const got = Object.fromEntries(Object.entries(styles).map(([id, s]) => [id, {
      border: s.border ?? null,
      name: s.name ?? null,
      cellSpacing: s.cellSpacing ?? null,
    }]));
    const want = Object.fromEntries(Object.entries(c.expected).map(([id, s]) => [id, {
      border: s.border ?? null,
      name: s.name ?? null,
      cellSpacing: s.cellSpacing ?? null,
    }]));
    try {
      assert.deepEqual(got, want);
    } catch (e) {
      failures++;
      if (first.length < 20) first.push({legend: c.legend, got, want, message: e.message});
    }
  }
  assert.equal(failures, 0, `${failures}/${cases.length} differential cases failed:\n${JSON.stringify(first, null, 2)}`);
});

test('round 6: the reader agrees with Rust on the review findings', () => {
  // 1: Rust's `{:.2}` rounds exact halves to even, unlike toFixed.
  assert.equal(parseTableLegend('A, borders bottom single 0.125pt #999999').A.border,
    'borders bottom single 0.12pt #999999');
  assert.equal(parseTableLegend('A, all borders 0.625pt').A.border, 'all borders 0.62pt');

  // 2: a size that rounds to zero eighths is still a size, so a second
  // size token rejects the border and starts a new legend entry.
  const zeroSize = parseTableLegend('A, borders top single 0.03pt 3pt, B, cell paragraphs after 6pt');
  assert.equal(zeroSize.A.border, undefined);
  assert.deepEqual(zeroSize.B.cellSpacing, {afterPt: 6});

  // 3/4: the typed spacing values and Rust's Unicode White_Space.
  assert.deepEqual(parseTableLegend('A, cell paragraphs after +6pt').A.cellSpacing, {afterPt: 6});
  assert.deepEqual(parseTableLegend('A, cell paragraphs line 1.038').A.cellSpacing,
    {line: {rule: 'auto', multiple: 1.0375}});
  assert.equal(parseTableLegend('A, cell paragraphs after 1638.5pt, B, cell paragraphs after 6pt').A.cellSpacing, undefined);
  assert.equal(parseTableLegend('A, \u0085, borders top single').A.border, 'borders top single');
  assert.deepEqual(parseTableLegend('A, cell paragraphs after\u00856pt').A.cellSpacing, {afterPt: 6});
  assert.equal(parseTableLegend('A, \uFEFF, borders top single').A.border, undefined);

  // 5: serde_json refuses a lone surrogate, so the quoted id is not an entry.
  const surrogate = parseTableLegend('"\\ud800", A, cell paragraphs after 6pt');
  assert.deepEqual(Object.keys(surrogate), ['A']);
  assert.deepEqual(surrogate.A.cellSpacing, {afterPt: 6});

  // 8: the legend comes from the raw YAML line, not YAML.parse's scalar.
  const coloured = parseSourceDocument([
    '---', 'view: tracked', 'styles:',
    '  tables: A, borders top single 1pt #FF0000, B, cell paragraphs after 6pt',
    '---', '',
  ].join('\n'));
  assert.deepEqual(Object.keys(coloured.metadata.tableStyles), ['A', 'B']);
  assert.equal(coloured.metadata.tableStyles.A.border, 'borders top single 1pt #FF0000');
  assert.deepEqual(coloured.metadata.tableStyles.B.cellSpacing, {afterPt: 6});

  // 9: null-prototype maps keep legend order, including integer-like ids.
  const ordered = parseTableLegend('X, borders top single, 5');
  assert.equal(Object.getPrototypeOf(ordered), null);
  assert.equal(Object.hasOwn(ordered, 'X'), true);
  assert.equal(Object.hasOwn(ordered, '5'), true);
  const singular = parseSourceDocument([
    '---', 'view: tracked', 'styles:',
    '  table: X, borders top single, 5',
    '---', '',
  ].join('\n'));
  assert.equal(singular.metadata.tableStyle, 'X');
  assert.equal(Object.getPrototypeOf(singular.metadata.tableStyles), null);
  assert.equal(Object.hasOwn(singular.metadata.tableStyles, 'X'), true);
  // The singular line reads one entry, as `table_style` does (review 3).
  assert.equal(Object.hasOwn(singular.metadata.tableStyles, '5'), false);
});

// The writer's spellings (crates/jubarte-markdown/src/markdown/from_docx/agent.rs:
// `line_ratio`, `exact_points`), reproduced so this sample can be checked
// without a Rust build. The loops below cover `w:line` 1..960 and `w:after`
// 0..2000 only, not every value Word can store. Rust's `format!("{:.p$}", f64)`
// rounds ties to even on the exact binary value (unlike JS `toFixed`).
function rustFixed(value, places) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  const mantissa = bits & ((1n << 52n) - 1n);
  const shift = rawExp === 0 ? -1074 : rawExp - 1023 - 52;
  const sig = rawExp === 0 ? mantissa : mantissa | (1n << 52n);
  let num = sig;
  let den = 1n;
  if (shift >= 0) num <<= BigInt(shift);
  else den = 1n << BigInt(-shift);
  num *= 10n ** BigInt(places);
  let q = num / den;
  const r = num % den;
  if (2n * r > den || (2n * r === den && q % 2n === 1n)) q += 1n;
  const digits = q.toString().padStart(places + 1, "0");
  return places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}
const writerLineRatio = (line) => {
  const ratio = line / 240;
  let text;
  for (let places = 2; places <= 4; places++) {
    const candidate = rustFixed(ratio, places);
    if (Math.round(Number(candidate) * 240) === line) {
      text = candidate;
      break;
    }
  }
  text ??= rustFixed(ratio, 4);
  return text.replace(/0+$/, "").replace(/\.$/, "");
};
const writerExactPoints = (twips) =>
  `${rustFixed(twips / 20, 2).replace(/0+$/, "").replace(/\.$/, "")}pt`;

test('round 7: id-line spacing rounds to the units Word stores, like cell-group spacing', () => {
  for (const text of ['line 1.038', 'after 6.666pt', 'line 8.655pt exact']) {
    assert.deepEqual(parseSpacing(text), cellSpacingAttrs(text), text);
  }
  assert.deepEqual(parseSpacing('line 1.038'), {line: {rule: 'auto', multiple: 249 / 240}});
  assert.deepEqual(parseSpacing('after 6.666pt'), {afterPt: 6.65});
  assert.deepEqual(parseSpacing('line 8.655pt exact'), {line: {rule: 'exact', points: 8.65}});

  // Every `w:line` 1..960 and `w:after` 0..2000 twentieths, spelled exactly as
  // the writer prints it: the id-line reader and the legend reader must agree.
  let checked = 0;
  for (let line = 1; line <= 960; line++) {
    const text = `line ${writerLineRatio(line)}`;
    assert.deepEqual(parseSpacing(text), cellSpacingAttrs(text), text);
    assert.equal(Math.round(parseSpacing(text).line.multiple * 240), line, text);
    checked++;
  }
  for (let twips = 0; twips <= 2000; twips++) {
    const text = `after ${writerExactPoints(twips)}`;
    assert.deepEqual(parseSpacing(text), cellSpacingAttrs(text), text);
    assert.equal(Math.round(parseSpacing(text).afterPt * 20), twips, text);
    checked++;
  }
  assert.equal(checked, 2961);
});

test('round 8: a TableGrid legend with borders only keeps Word\'s default cell spacing', async () => {
  const {parseJubarte} = await import('./jubarte.mjs');
  // The engine keeps Word's built-in TableGrid style when its legend entry
  // only names borders: the written style gives cell paragraphs Word's own
  // `after 0pt line 1`. A custom style based on TableNormal names no Word
  // default, so its cells fall back to Normal, as before.
  const cells = (legend) => {
    const result = parseJubarte(`---\nview: tracked\nstyles:\n  Normal: Aptos 11pt, after 8pt, line 1.08\n${legend}---\n\n| A | B |\n|---|---|\n| C | D |\n`);
    const out = [];
    result.doc.descendants(node => {
      if (['td', 'th'].includes(node.type.name)) {
        const data = node.attrs.data;
        out.push({
          tableSpacing: data.tableSpacing,
          spacing: resolveSpacing(data.cellSpacing, data.documentStyle, result.metadata.styles.Normal, data.tableSpacing),
        });
      }
    });
    return out;
  };
  const plain = cells('');
  assert.equal(plain.length, 4);
  for (const cell of plain) {
    assert.equal(cell.spacing.afterPt, 0);
    assert.deepEqual(cell.spacing.line, {rule: 'auto', multiple: 1});
  }
  const grid = cells('  table: TableGrid, all borders 0.5pt\n');
  assert.equal(grid.length, 4);
  for (const cell of grid) {
    assert.deepEqual(cell.tableSpacing, {afterPt: 0, line: {rule: 'auto', multiple: 1}});
    assert.deepEqual(cell.spacing, plain[0].spacing);
  }
  // A TableGrid legend that changes Word's thin border makes the style
  // custom in the engine too: its cells then get no table spacing either.
  const thick = cells('  table: TableGrid, all borders 1.5pt\n');
  assert.equal(thick.length, 4);
  for (const cell of thick) {
    assert.equal(cell.tableSpacing, undefined);
    assert.equal(cell.spacing.afterPt, 8);
    assert.deepEqual(cell.spacing.line, {rule: 'auto', multiple: 259 / 240});
  }
  const custom = cells('  table: Ledger, all borders 0.5pt\n');
  assert.equal(custom.length, 4);
  for (const cell of custom) {
    assert.equal(cell.tableSpacing, undefined);
    assert.equal(cell.spacing.afterPt, 8);
    assert.deepEqual(cell.spacing.line, {rule: 'auto', multiple: 259 / 240});
  }
});

test('round 9: a winning line count wins over lower layers and means 12pt per line', () => {
  const normal = {afterPt: 8, lineHeight: 1.08};
  // The engine writes `cell paragraphs after 1 lines` as w:afterLines="100":
  // hundredths of a 240-twip line, so one line is 12pt.
  assert.deepEqual(resolveSpacing(undefined, undefined, normal, {afterLines: 1}), {
    beforePt: 0,
    afterPt: 12,
    beforeAuto: false,
    afterAuto: false,
    line: {rule: 'auto', multiple: 1.08},
    contextual: false,
  });
  assert.equal(resolveSpacing({beforeLines: 1.5}, {}, {beforePt: 8}).beforePt, 18);
  // Points and auto keep their existing results, including layer precedence.
  assert.equal(resolveSpacing({afterPt: 3}, {}, normal, {afterLines: 1}).afterPt, 3);
  assert.equal(resolveSpacing({}, {}, {beforePt: 8}, {beforeAuto: true}).beforeAuto, true);
  assert.equal(resolveSpacing(undefined, {afterLines: 2}, normal).afterPt, 24);
});

test('round 9: the engine\'s named TableGrid and other Word styles keep their tight cell spacing', async () => {
  const {parseJubarte} = await import('./jubarte.mjs');
  const cells = (legend) => {
    const result = parseJubarte(`---\nview: tracked\nstyles:\n  Normal: Aptos 11pt, after 8pt, line 1.08\n${legend}---\n\n| A | B |\n|---|---|\n| C | D |\n`);
    const out = [];
    result.doc.descendants(node => {
      if (['td', 'th'].includes(node.type.name)) {
        const data = node.attrs.data;
        out.push({
          tableSpacing: data.tableSpacing,
          spacing: resolveSpacing(data.cellSpacing, data.documentStyle, result.metadata.styles.Normal, data.tableSpacing),
        });
      }
    });
    return out;
  };
  // write.rs drops Word's TableGrid template when the legend names a style,
  // even when the name is Word's own (`Table Grid`): presence, not value.
  for (const legend of [
    '  table: TableGrid, all borders 0.5pt, named "My Grid"\n',
    '  table: TableGrid, named "Table Grid"\n',
    '  table: TableGrid, all borders 0.5pt, named ""\n',
  ]) {
    for (const cell of cells(legend)) {
      assert.equal(cell.tableSpacing, undefined, legend);
      assert.equal(cell.spacing.afterPt, 8, legend);
      assert.deepEqual(cell.spacing.line, {rule: 'auto', multiple: 259 / 240}, legend);
    }
  }
  // Every built-in Word table style carries the same tight w:pPr, whatever
  // the legend says about its borders, name or cell paragraphs (package.rs).
  for (const legend of [
    '  table: LightShading-Accent1, borders vary\n',
    '  table: LightShading-Accent1, borders vary, named "My Shading", cell paragraphs after 6pt\n',
    '  table: MediumList1-Accent1, borders vary\n',
  ]) {
    for (const cell of cells(legend)) {
      assert.deepEqual(cell.tableSpacing, {afterPt: 0, line: {rule: 'auto', multiple: 1}}, legend);
      assert.equal(cell.spacing.afterPt, 0, legend);
      assert.deepEqual(cell.spacing.line, {rule: 'auto', multiple: 1}, legend);
    }
  }
});

test('round 9: a singular table legend keeps only the first entry, as the engine does', async () => {
  const {parseJubarte} = await import('./jubarte.mjs');
  const cells = (legend, directive) => {
    const result = parseJubarte(`---\nview: tracked\nstyles:\n  Normal: Aptos 11pt, after 8pt, line 1.08\n${legend}---\n\n${directive}| A | B |\n|---|---|\n| C | D |\n`);
    const out = [];
    result.doc.descendants(node => {
      if (['td', 'th'].includes(node.type.name)) {
        const data = node.attrs.data;
        out.push(resolveSpacing(data.cellSpacing, data.documentStyle, result.metadata.styles.Normal, data.tableSpacing));
      }
    });
    return out;
  };
  // The engine's `table_style` reads one entry; `tables:` is the plural map
  // where a repeated id replaces the whole entry.
  const singular = parseSourceDocument([
    '---', 'view: tracked', 'styles:',
    '  table: A, cell paragraphs after 6pt, B, cell paragraphs after 12pt',
    '---', '',
  ].join('\n'));
  assert.deepEqual(Object.keys(singular.metadata.tableStyles), ['A'], 'singular legend');
  assert.equal(singular.metadata.tableStyle, 'A');

  const firstOnly = [
    ['  table: A, cell paragraphs after 6pt, B, cell paragraphs after 12pt\n', '<!-- t0 2x2, style B -->\n', 8, 259 / 240],
    ['  table: TableGrid, cell paragraphs after 6pt, TableGrid, cell paragraphs after 0pt\n', '', 6, 259 / 240],
    ['  table: Ledger, all borders 1pt, TableGrid, all borders 1.5pt\n', '<!-- t0 2x2, style TableGrid -->\n', 0, 1],
    ['  table: Ledger, cell paragraphs after 6pt, TableGrid, cell paragraphs after 0pt\n', '<!-- t0 2x2, style TableGrid -->\n', 0, 1],
  ];
  for (const [legend, directive, afterPt, line] of firstOnly) {
    for (const cell of cells(legend, directive)) {
      assert.equal(cell.afterPt, afterPt, legend);
      assert.deepEqual(cell.line, {rule: 'auto', multiple: line}, legend);
    }
  }
});

test('round 9: a legend style rounds spacing to the units the engine stores', () => {
  const {metadata} = parseSourceDocument([
    '---', 'view: tracked', 'styles:',
    '  Normal: Aptos 11pt, after 6.666pt, line 1.038, line 8.655pt exact',
    '---', '',
  ].join('\n'));
  // The engine writes w:after="133" and w:line="249" for these words.
  assert.equal(metadata.styles.Normal.afterPt, 6.65);
  assert.equal(metadata.styles.Normal.lineHeight, 1.0375);
  assert.deepEqual(metadata.styles.Normal.line, {rule: 'exact', points: 8.65});
});

test('round 9: id-line spacing uses the engine\'s u32 stored-unit bounds', () => {
  // The engine writes and prints these values: the id-line reader is not
  // bound by the legend's 1638pt/100 lines/132-ratio limits.
  assert.deepEqual(parseSpacing('before 101 lines'), {beforeLines: 101});
  assert.deepEqual(parseSpacing('after 2000pt'), {afterPt: 2000});
  assert.deepEqual(parseSpacing('line 200'), {line: {rule: 'auto', multiple: 200}});
  // The legend and cell-clause readers keep their narrower bounds.
  assert.equal(cellSpacingAttrs('after 2000pt'), null);
  assert.equal(cellSpacingAttrs('before 101 lines'), null);
  assert.equal(cellSpacingAttrs('line 200'), null);
});
