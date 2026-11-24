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

// The reader breaks CriticMarkup shapes in a code block's text with a
// backslash run (from_docx escape_code); the engine unwinds an odd run
// inside a fenced block only (critic.rs fence_escape_at). #25, codex re-review.
const fenced = (body) => read('```\n' + body + '\n```\n');

test('a fence escape names the delimiter as text, as the engine reads it', () => {
  assert.deepEqual(fenced('{\\++x++\\}'), ['{++x++}', 0]);
  assert.deepEqual(fenced('{\\--x--\\}'), ['{--x--}', 0]);
  assert.deepEqual(fenced('{\\~~a~\\>b~~\\}'), ['{~~a~>b~~}', 0]);
  assert.deepEqual(fenced('{\\>>n<<\\}'), ['{>>n<<}', 0]);
  assert.deepEqual(fenced('{\\==h==\\}'), ['{==h==}', 0]);
  // A run of three names one backslash kept before the delimiter.
  assert.deepEqual(fenced('{\\\\\\++x++\\\\\\}'), ['{\\++x++\\}', 0]);
  // An even run cannot come from the reader: kept as written, opening nothing.
  assert.deepEqual(fenced('{\\\\++x'), ['{\\\\++x', 0]);
});

test('outside a fence the escapes are Markdown\'s own', () => {
  assert.deepEqual(read('a {\\++x++\\} b'), ['a {++x++} b', 0]);
});

test('a change still marks inside a fence, closing even after a backslash', () => {
  assert.deepEqual(fenced('{++a\\++}'), ['a\\', 1]);
});

test('a highlight still marks inside a fence, as markdown_to_docx writes it', () => {
  assert.deepEqual(fenced('{==h==}'), ['h', 0]);
});

test('the scanner is linear on one long line', async () => {
  const { verbatimRanges, codeFences } = await import('./verbatim.js');
  const s = 'word `x` [l](u) '.repeat(40000);
  const start = performance.now();
  verbatimRanges(s);
  codeFences(s);
  assert.ok(performance.now() - start < 500, `${performance.now() - start}ms`);
});

// codex's re-review inputs, each with what markdown_to_docx writes (#25).
test('indented code holding a fence shape is still indented code', () => {
  assert.equal(read('    ```\n    {++x++}\n')[1], 0);
  assert.equal(read('    ~~~\n    {++x++}\n')[1], 0);
});

test('a fence inside a block quote is not indented code: its change marks', () => {
  assert.equal(read('> ~~~\n> {++x++}\n> ~~~\n\n    other\n')[1], 1);
});

test('indent counts UTF-8 bytes of Unicode white space, as the engine does', () => {
  // Two em spaces are six bytes: no fence, so the backticks open a code span.
  assert.equal(read('  ```\n{++x++}\n```')[1], 0);
});

test('an autolink ends at any Unicode white space', () => {
  assert.equal(read('<https://a/\u0085{++x++}>')[1], 1);
});

// codex's final review: the tag grammar trims with JavaScript's white space,
// which holds U+FEFF and lacks U+0085; Rust's is the reverse (#25).
test('a fence keeps the backslash before a brace the engine reads as no tag', () => {
  assert.deepEqual(fenced('\\{r1\ufeff}'), ['\\{r1\ufeff}', 0]);
  assert.deepEqual(fenced('\\{r1 @A move X\u0085Y}'), ['\\{r1 @A move X\u0085Y}', 0]);
});

// codex's last review: in a code fence a backslash before an opener is
// text, and the change still opens (critic.rs encode, line 1251).
test('a change opens after a backslash inside a fence, as the engine reads it', () => {
  assert.deepEqual(fenced('\\{++x++}'), ['\\x', 1]);
  assert.deepEqual(fenced('\\{==h==}'), ['\\h', 0]);
});
