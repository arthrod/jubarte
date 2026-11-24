// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// A table line's `merged tN.rowR.cellC` counts Word cells (write.rs
// plan_table), not Markdown columns: a span's covered columns are the empty
// Markdown cells after it, and they are not cells of their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJubarte } from './jubarte.mjs';

function cells(md) {
  const out = [];
  parseJubarte(`---\nview: tracked\n---\n\n${md}\n`).doc.descendants((n) => {
    if (n.type.name === 'td' || n.type.name === 'th') {
      const d = n.attrs.data;
      out.push([n.textContent, d.colSpan || 1, d.rowSpan || 1, !!d.mergedCovered]);
    }
  });
  return out;
}

test('a merge names its Word cell; columns a span covers are skipped (b111)', () => {
  assert.deepEqual(cells('<!-- t0 2x5, merged t0.row0.cell1 across 2; t0.row0.cell3 down 2 -->\n|A|B||C|D|\n|-|-|-|-|-|\n|1|2|3|4||'), [
    ['A', 1, 1, false], ['B', 2, 1, false], ['', 1, 1, true], ['C', 1, 1, false], ['D', 1, 2, false],
    ['1', 1, 1, false], ['2', 1, 1, false], ['3', 1, 1, false], ['4', 1, 1, false], ['', 1, 1, true],
  ]);
});

test('a vertical merge covers the same grid column below, past spans in those rows', () => {
  assert.deepEqual(cells('<!-- t0 2x3, merged t0.row0.cell2 down 2; t0.row1.cell0 across 2 -->\n|A|B|C|\n|-|-|-|\n|x|||'), [
    ['A', 1, 1, false], ['B', 1, 1, false], ['C', 1, 2, false],
    ['x', 2, 1, false], ['', 1, 1, true], ['', 1, 1, true],
  ]);
});

test('the widths clause keeps the grid columns Word drew (b111)', async () => {
  const { parseDirective } = await import('./metadata.mjs');
  const d = parseDirective('t3 6x3, widths 0.5in 1.25in 0in, width auto');
  assert.deepEqual(d.columnWidthsIn, [0.5, 1.25, 0]);
  assert.ok(!d.clauses.some((c) => c.type === 'unknown' && /widths/.test(c.raw)));
});

test('grid columns share the frame in proportion to their widths', async () => {
  const { gridWidths } = await import('./table-layout.js');
  const w = gridWidths([0.5, 1.5], 2, 400);
  assert.deepEqual(w.map(Math.round), [100, 300]);
  // A zero-width column stays drawable; the total is the frame's.
  const z = gridWidths([1, 0, 1], 3, 300);
  assert.ok(z[1] > 0 && Math.abs(z.reduce((a, b) => a + b, 0) - 300) < 1e-9);
  // Without usable widths the columns are even, each at least 48px when room allows.
  assert.deepEqual(gridWidths(null, 4, 400), [100, 100, 100, 100]);
  assert.deepEqual(gridWidths([1, 2], 3, 300), [100, 100, 100]);
});

test('size clauses reach paragraphs and the table cells they name', async () => {
  const { parseDirective } = await import('./metadata.mjs');
  assert.equal(parseDirective('p0 center, size 30pt, mark style').fontSizePt, 30);
  const t = parseDirective('t3 2x2, cells p4-p7 by row, p4-p5 size 10pt, p6 size 8.5pt');
  assert.deepEqual(t.cellSizes, [{ from: 4, to: 5, points: 10 }, { from: 6, to: 6, points: 8.5 }]);
  const sizes = [];
  parseJubarte('---\nview: tracked\n---\n\n<!-- t0 2x2, cells p4-p7 by row, p4-p5 size 10pt -->\n|A|B|\n|-|-|\n|C|D|\n').doc.descendants((n) => {
    if (n.type.name === 'td' || n.type.name === 'th') sizes.push(n.attrs.data.fontSizePt ?? null);
  });
  assert.deepEqual(sizes, [10, 10, null, null]);
});

test('no column is narrower than its longest word while others have room (b097)', async () => {
  const { fitMinimums } = await import('./table-layout.js');
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  // Column 0 needs 60; columns 1 and 2 give it room in proportion to their slack.
  const w = fitMinimums([40, 200, 160], [60, 50, 40], 400);
  assert.equal(w[0], 60);
  assert.ok(Math.abs(sum(w) - 400) < 1e-9);
  assert.ok(Math.abs((200 - w[1]) / (160 - w[2]) - (150 / 120)) < 1e-9);
  // Widths already wide enough stay as they are.
  assert.deepEqual(fitMinimums([100, 100], [50, 50], 200), [100, 100]);
  // When the words cannot all fit, columns share the frame by their minimums.
  assert.deepEqual(fitMinimums([100, 100], [300, 100], 200), [150, 50]);
});

test('a grid wider than the text frame reaches into the right margin, as in Word (b111)', async () => {
  const { tableWidth } = await import('./table-layout.js');
  // 6.4in of grid in a 6in frame with a 1in right margin: drawn at 6.4in.
  assert.ok(Math.abs(tableWidth([3.2, 3.2], 576, 96) - 614.4) < 1e-9);
  // Never past the page edge: the margin keeps a 12px gutter.
  assert.equal(tableWidth([5, 3], 576, 96), 576 + 96 - 12);
  // A grid that fits, or no grid, fills the frame as before.
  assert.equal(tableWidth([1, 1], 576, 96), 576);
  assert.equal(tableWidth(undefined, 576, 96), 576);
});

test('a crowded table grows into the margin, then tightens its padding, before breaking words (b111)', async () => {
  const { fitTable } = await import('./table-layout.js');
  // need(pad) sums text + 2*pad + 3 over the columns that hold text.
  assert.deepEqual(fitTable([40, 40], 576, 660), { pad: 8, width: 576 }); // fits as is
  assert.deepEqual(fitTable([300, 280], 576, 660), { pad: 8, width: 618 }); // 580 + 38: into the margin
  assert.deepEqual(fitTable([320, 300], 576, 660), { pad: 8, width: 658 }); // the margin first
  assert.deepEqual(fitTable([330, 300], 576, 660), { pad: 6, width: 660 }); // then padding: 630 + 30
  assert.deepEqual(fitTable([400, 400], 576, 660), { pad: 2, width: 660 }); // cannot fit: tightest, widest
  assert.deepEqual(fitTable([40, 0, 40], 576, 660), { pad: 8, width: 576 }); // an empty column costs nothing
});

test('a paragraph line may open with size or spacing, not a style (#25)', async () => {
  const { parseDirective } = await import('./metadata.mjs');
  const d = parseDirective('p0 size 9pt');
  assert.equal(d.fontSizePt, 9);
  assert.ok(!d.style, `style ${d.style}`);
  const e = parseDirective('p0 before 6pt, size 9pt, mark style');
  assert.equal(e.fontSizePt, 9);
  assert.ok(!e.style, `style ${e.style}`);
  assert.equal(parseDirective('p0 Heading1, size 9pt').style, 'Heading1');
});

const cellSizes = (line, md) => {
  const out = [];
  parseJubarte(`---\nview: tracked\n---\n\n<!-- ${line} -->\n${md}\n`).doc.descendants((n) => {
    if (n.type.name === 'td' || n.type.name === 'th') out.push(n.attrs.data.fontSizePt ?? null);
  });
  return out;
};

test('a cell group reads its size beside spacing and mark style, as the engine writes it (#25)', () => {
  const md = '|A|B|C|\n|-|-|-|';
  assert.deepEqual(cellSizes('t0 1x3, cells p0-p2 by row, p0-p2 size 9pt mark style', md), [9, 9, 9]);
  assert.deepEqual(cellSizes('t0 1x3, cells p0-p2 by row, p0-p2 line 12pt exact size 9pt', md), [9, 9, 9]);
  assert.deepEqual(cellSizes('t0 1x3, cells p0-p2 by row, p0-p2 before 1 lines after 2pt size 10.5pt mark style', md), [10.5, 10.5, 10.5]);
});

test('a covered column takes no paragraph id, so sizes stay with their cells (#25)', () => {
  const md = '|A||B|\n|-|-|-|\n|C|D|E|';
  assert.deepEqual(
    cellSizes('t0 2x3, cells p0-p4 by row, p0 size 9pt, p1 size 7pt, widths 1in 1in 1in, merged t0.row0.cell0 across 2', md),
    [9, null, 7, null, null, null],
  );
});
