// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

// The attribution grammar against the engine's own answers. Each case in
// ENGINE was run through `jubarte convert` (Markdown to docx) and read back:
// `true` means the engine took the brace as the change's metadata, `false`
// that it kept the brace as document text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attributionTag, isDate, parseChangeIds, readNote } from './attribution-tags.js';
import { prepareCritic } from './vendor/remark-critic-markup-jubarte/index.js';

const ENGINE = [
  ['{r1 @A}', true],
  ['{r1 Ann}', true],
  ['{r7}', true],
  ['{noid @A}', true],
  ['{footnotes.noid @A}', true],
  ['{body:rev:007 @A}', true],
  ['{header.a:rev:4 @A}', true],
  ['{r7 @A move  move1}', true],
  ['{r1 @A move n\\}rest}', true],
  ['{r1 @Ann (2026-01-01T00:00:00Z)}', true],
  ['{r1 @A 2026-01-01T00:00:00Z}', true],
  ['{r1 @A 2026-01-01T00:00}', true],
  ['{r1+2 @A; r3 @B}', true],
  ['{r4 @A re r3 @B}', true],
  ['{r4 @A move m2 re r3 @B}', true],
  ['{#r1 @A}', false],
  ['{r01 @A}', false],
  ['{r1 @A_B}', false],
  ['{r1 @A 2026-01-01}', false],
  ['{r1 @A 2026-02-30T12:00:00Z}', false],
  ['{body:rev:7 @A}', false],
  ['{madeup.r1 @A}', false],
  ['{r1 @A re payment is due}', false],
  ['{r1 @A move two words}', false],
  ['{5 @A}', false],
  ['{r1-2 @A}', false],
];

test('every brace reads as the engine reads it', () => {
  for (const [brace, metadata] of ENGINE) {
    const tag = attributionTag(brace, 0, brace.length);
    assert.equal(!!tag, metadata, brace);
    if (tag) assert.equal(tag.end, brace.length, brace);
    const prepared = prepareCritic(`A {++x++}${brace}TAIL`, { agentView: true });
    assert.equal(prepared.markdown, metadata ? 'A xTAIL' : `A x${brace}TAIL`, brace);
  }
});

test('the brace stops at the first unescaped closer, opener or newline', () => {
  assert.equal(attributionTag('{r1 @A}rest}', 0, 12).end, 7);
  assert.equal(attributionTag('{r1 @A{x}', 0, 9), null);
  assert.equal(attributionTag('{r1 @A\n}', 0, 8), null);
  // The search ends at `until`.
  assert.equal(attributionTag('{r1 @A}', 0, 6), null);
  // An escaped opener does not start a tag.
  assert.equal(attributionTag('\\{r1 @A}', 1, 8), null);
});

test('change ids follow the engine: canonical numbers, known stories, long ids', () => {
  assert.deepEqual(parseChangeIds('r12'), [{ story: null, wid: '12' }]);
  assert.deepEqual(parseChangeIds('r1+r2'), [{ story: null, wid: '1' }, { story: null, wid: '2' }]);
  assert.deepEqual(parseChangeIds('header1.r3'), [{ story: 'header1', wid: '3' }]);
  assert.deepEqual(parseChangeIds('footnotes.r7'), [{ story: 'footnotes', wid: '7' }]);
  assert.deepEqual(parseChangeIds('body:rev:007'), [{ story: 'body', wid: '007' }]);
  assert.deepEqual(parseChangeIds('header.a:rev:7'), [{ story: 'header.a', wid: '7' }]);
  for (const bad of ['r0012', 'header01.r3', 'header.r3', 'row1.r2', 'r', 'r1+', 'r4294967296', 'body:rev:7', 'a:b:rev:7', ':rev:7']) {
    assert.equal(parseChangeIds(bad), null, bad);
  }
});

test('dates are calendar dates and times, as Word accepts them', () => {
  for (const good of ['2026-01-01T00:00', '2026-01-01T00:00:00Z', '2024-02-29T23:59:59.5+14:00', '2026-12-31T12:00-05:30']) assert.ok(isDate(good), good);
  for (const bad of ['2026-01-01', '2026-02-29T00:00', '2026-13-01T00:00', '2026-01-01T24:00', '2026-01-01T00:60', '2026-01-01T00:00:00.', '2026-01-01T00:00+15:00', '2026-01-01T00:00+05:60', '26-01-01T00:00', '0000-01-01T00:00']) assert.ok(!isDate(bad), bad);
});

test('a note names its own change first; plain notes keep the author name', () => {
  assert.deepEqual(readNote('r4+5 @AC re r3 @JD').map((t) => [t.handle, t.ids.map((i) => i.wid)]), [['AC', ['4', '5']]]);
  assert.deepEqual(readNote('r1 @AC; r2 @JD 2026-01-02T03:04:05Z').map((t) => [t.handle, t.date]), [['AC', undefined], ['JD', '2026-01-02T03:04:05Z']]);
  assert.deepEqual(readNote('r5 Ana%20Lima (2026-01-01T00:00:00Z)').map((t) => [t.author, t.date]), [['Ana Lima', '2026-01-01T00:00:00Z']]);
  assert.deepEqual(readNote('r7 Bo re r1 Kim').map((t) => t.author), ['Bo']);
  assert.deepEqual(readNote('noid @A')[0].ids, []);
  assert.equal(readNote('r1 Ann: says'), null);
});

test('chained tags after one change are all metadata, as in the engine', () => {
  const chained = prepareCritic('A {++x++}{r1 @A}{r2 @B} Z', { agentView: true });
  assert.equal(chained.markdown, 'A x Z');
  assert.deepEqual(chained.changes[0].revisionIds, ['1', '2']);
});

test('emphasis markers between a closer and its tag are kept; the tag is metadata', () => {
  // (⸎ is the reader's own flanking sentinel, not text.)
  assert.equal(prepareCritic('A **{++x++}**{r1 @A} Z', { agentView: true }).markdown.replaceAll('\u2e0e', ''), 'A **x** Z');
  // After a highlight or a comment a brace is text.
  assert.equal(prepareCritic('{==x==}{r1 @A}', { agentView: true }).markdown, 'x{r1 @A}');
});

test('an inserted paragraph mark ¶{tag} is an insertion of the paragraph break', () => {
  const p = prepareCritic('A¶{r1 @AC}\n\nB', { agentView: true, authors: { AC: 'Ann' } });
  assert.equal(p.markdown, 'A\n\nB');
  assert.equal(p.changes.length, 1);
  const [mark] = p.changes;
  assert.equal(mark.kind, 'insertion');
  assert.equal(mark.paragraphMark, true);
  assert.equal(mark.author, 'Ann');
  assert.deepEqual(mark.revisionIds, ['1']);
  assert.equal(p.markdown.slice(mark.start, mark.end), '\n\n');
  // Only the first blank line is the mark (critic.rs resolve: reject keeps the rest).
  const wide = prepareCritic('A¶{r1 @AC}\n\n\n\nB', { agentView: true });
  assert.equal(wide.markdown.slice(wide.changes[0].start, wide.changes[0].end), '\n\n');
  // The last paragraph's mark has no break after it: a zero-width change.
  const last = prepareCritic('{++Heading++}{r1 @A}¶{r2 @A}', { agentView: true });
  assert.equal(last.markdown, 'Heading');
  assert.deepEqual(last.changes.map((c) => [c.kind, c.start, c.end, c.paragraphMark ?? false]), [['insertion', 0, 7, false], ['insertion', 7, 7, true]]);
  // An escaped brace, or no tag, keeps the pilcrow as text.
  assert.equal(prepareCritic('A¶\\{r1 @A}\n\nB', { agentView: true }).markdown, 'A¶\\{r1 @A}\n\nB');
  assert.equal(prepareCritic('A¶ and more', { agentView: true }).markdown, 'A¶ and more');
  // Outside the agent view nothing is read as a tag.
  assert.equal(prepareCritic('A¶{r1 @A}\n\nB').markdown, 'A¶{r1 @A}\n\nB');
});

test('K65 retains parent revisions separately from the change author', () => {
  const p = prepareCritic('{++x++}{r4 @A re r3 @B}', { agentView: true });
  assert.deepEqual(p.changes[0].revisionIds, ['4']);
  assert.deepEqual(p.changes[0].parentRevisions?.map(r => r.ids), [['3']]);
});
