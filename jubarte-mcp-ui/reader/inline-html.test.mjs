// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The engine writes inline HTML where Markdown emphasis cannot open
// (crates/jubarte-markdown/src/markdown/from_docx/ooxml.rs and header.rs):
// <b>, <i>, <u>, <s>, <mark class="hl-…">, <code>, <sup>, <sub>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJubarte } from './jubarte.mjs';

function runs(md) {
  const out = [];
  parseJubarte(`---\nview: tracked\n---\n\n${md}\n`).doc.descendants((n) => {
    if (n.isText) out.push([n.text, n.marks.map((m) => m.type.name).sort().join(',')]);
  });
  return out;
}

test('the engine’s inline HTML tags are marks, not literal text (b098)', () => {
  assert.deepEqual(runs('**Droits/**<b><i>Registration fees</i></b> end'), [
    ['Droits/', 'bold'],
    ['Registration fees', 'bold,italic'],
    [' end', ''],
  ]);
  assert.deepEqual(runs('a <s>gone</s> <code>x()</code> <mark class="hl-green">lit</mark> <mark>y</mark>'), [
    ['a ', ''],
    ['gone', 'strikethrough'],
    [' ', ''],
    ['x()', 'code'],
    [' ', ''],
    ['lit', 'highlight'],
    [' ', ''],
    ['y', 'highlight'],
  ]);
});

test('a highlight keeps its Word colour', () => {
  const doc = parseJubarte('---\nview: tracked\n---\n\n<mark class="hl-green">lit</mark> <mark>y</mark>\n').doc;
  const colours = [];
  doc.descendants((n) => {
    if (n.isText) for (const m of n.marks) if (m.type.name === 'highlight') colours.push(m.attrs.color);
  });
  assert.deepEqual(colours, ['green', 'yellow']);
});

test('an unknown tag stays literal text', () => {
  assert.ok(runs('a <blink>b</blink>').map((r) => r[0]).join('').includes('<blink>'));
});

const blocks = (md) => {
  const out = [];
  parseJubarte(`---\nview: tracked\n---\n\n${md}\n`).doc.descendants((n) => { if (n.isTextblock) out.push(n.textContent); });
  return out;
};

test('an HTML comment the reader does not know is never drawn, as the engine writes no text for it (b106)', () => {
  // markdown_to_docx: `a\n\n<!-- hello world -->\n\nb` holds paragraphs a and b;
  // `a <!-- x y --> b` holds `a  b`.
  assert.deepEqual(blocks('a\n\n<!-- hello world -->\n\nb'), ['a', 'b']);
  assert.deepEqual(blocks('a <!-- x y --> b'), ['a  b']);
  assert.deepEqual(blocks('a\n\n<!--\nmulti\nline -->\n\nb'), ['a', 'b']);
  // b106: each picture's drawing rides in a comment after its definition.
  assert.deepEqual(blocks('Text ![a][image1] end\n\n[image1]: <data:image/png;base64,AAAA>\n<!-- image1 drawing:eyJABC -->'), ['Text a end']);
  assert.deepEqual(blocks('T\n\n<!-- text-box d10.0 -->\n# Step\n<!-- /text-box -->\n\nZ'), ['T', 'Step', 'Z']);
  // Raw HTML that is not a comment stays literal.
  assert.deepEqual(blocks('a <span>b</span>'), ['a <span>b</span>']);
});
