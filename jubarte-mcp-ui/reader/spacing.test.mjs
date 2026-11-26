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
import { parseSpacing, takeSpacing, resolveSpacing } from "./spacing.mjs";
import { parseDirective, parseDocumentMetadata as parseSourceDocument, parseTableLegend } from "./metadata.mjs";

const VIEWS = new URL("../word-metrics/views/", import.meta.url);

test("each clause spacing_clauses can write reads as typed fields", () => {
  assert.deepEqual(parseSpacing("before 6pt"), { beforePt: 6 });
  assert.deepEqual(parseSpacing("after 10.05pt"), { afterPt: 10.05 });
  assert.deepEqual(parseSpacing("before 0pt"), { beforePt: 0 });
  assert.deepEqual(parseSpacing("before auto"), { beforeAuto: true });
  assert.deepEqual(parseSpacing("after auto"), { afterAuto: true });
  assert.deepEqual(parseSpacing("before 1.5 lines"), { beforeLines: 1.5 });
  assert.deepEqual(parseSpacing("line 1.08"), { line: { rule: "auto", multiple: 1.08 } });
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
    { rule: "auto", multiple: 1.08 },
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
