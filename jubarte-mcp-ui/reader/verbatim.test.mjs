// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The engine opens nothing where Markdown reads literally: code spans, link
// destinations, autolinks, reference definitions and indented code
// (crates/jubarte-markdown/src/markdown/critic.rs, `Literal`). In fenced code
// CriticMarkup still marks tracked changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJubarte } from './jubarte.mjs';
import { verbatimRanges } from './verbatim.js';

const read = (md) => {
  const r = parseJubarte(`---\nview: tracked\n---\n\n<!-- p0 -->\n${md}\n`);
  return [r.doc.textContent, (r.critic?.changes || r.changes || []).length];
};

test('nothing opens inside a code span (#25)', () => {
  assert.deepEqual(read('`A¶{r1 @A}B`'), ['A¶{r1 @A}B', 0]);
  assert.deepEqual(read('`A{++x++}B`'), ['A{++x++}B', 0]);
  assert.deepEqual(read('``a ` {--b--}``'), ['a ` {--b--}', 0]);
});

test('a change may hold code, and a closer inside code closes nothing', () => {
  assert.deepEqual(read('{++`x`++}'), ['x', 1]);
  assert.deepEqual(read('{++a `++}` b++}'), ['a ++} b', 1]);
});

test('link destinations and autolinks are literal', () => {
  assert.deepEqual(read('[a](https://x.example/{++y++}) <https://b.example/{--z--}>')[1], 0);
});

test('an unclosed backtick run opens no code span', () => {
  assert.deepEqual(read('`a {++b++}'), ['`a b', 1]);
  assert.deepEqual(read('`a\n\nb` {++c++}')[1], 1);
});

test('verbatimRanges ports the engine scanner', () => {
  const s = '---\na: `x`\n---\nq `c` [l](u (v)) <ab:c>\n```\n`f`\n```\n[d]: dest\n';
  const got = verbatimRanges(s).map(([a, b]) => s.slice(a, b));
  assert.deepEqual(got, ['`c`', '(u (v)', '<ab:c>', ' dest']);
});
