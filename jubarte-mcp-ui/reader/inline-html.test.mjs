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
