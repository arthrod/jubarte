// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkCriticMarkup, { prepareCritic, parseAgentTag, isEscaped } from './vendor/remark-critic-markup-jubarte/index.js';

const parse = (source, options = {}) => unified().use(remarkParse).use(remarkCriticMarkup, options).use(remarkGfm).parse(source);
const text = (node) => node.value ?? (node.children || []).map(text).join('');
const kinds = (prepared) => prepared.changes.map((change) => change.kind);

test('canonical insertion and deletion retain half-open output/source offsets', () => {
  const p = prepareCritic('A {++new++} {--old--} Z');
  assert.equal(p.markdown, 'A new old Z');
  assert.deepEqual(kinds(p), ['insertion', 'deletion']);
  assert.deepEqual(p.changes.map((x) => [x.start, x.end]), [[2, 5], [6, 9]]);
  assert.equal(p.sourceMap.length, p.markdown.length + 1);
  for (let i = 0; i < p.markdown.length; i++) assert.equal(p.markdown[i], p.source[p.sourceMap[i]]);
});

test('canonical substitution is one logical group, deletion then insertion', () => {
  const p = prepareCritic('{~~old~>new~~}');
  assert.equal(p.markdown, 'oldnew');
  assert.deepEqual(kinds(p), ['deletion', 'insertion']);
  assert.equal(p.changes[0].groupId, p.changes[1].groupId);
  assert.equal(p.groups[0].kind, 'substitution');
  assert.deepEqual(p.changes.map((x) => [x.start, x.end]), [[0, 3], [3, 6]]);
});

test('empty substitution halves are preserved as zero-width changes', () => {
  assert.deepEqual(prepareCritic('{~~~>new~~}').changes.map((x) => [x.start, x.end]), [[0, 0], [0, 3]]);
  assert.deepEqual(prepareCritic('{~~old~>~~}').changes.map((x) => [x.start, x.end]), [[0, 3], [3, 3]]);
});

test('bare upstream delimiters are no longer CriticMarkup', () => {
  const source = '++new++ --old-- ==highlight== //comment//';
  const p = prepareCritic(source);
  assert.equal(p.markdown, source);
  assert.equal(p.changes.length + p.comments.length + p.highlights.length, 0);
});

test('highlight + adjacent comment is anchored; a space makes a point comment', () => {
  const p = prepareCritic('{==text==}{>>note<<} {==other==} {>>point<<}');
  assert.equal(p.markdown, 'text other ');
  assert.deepEqual(p.comments.map((x) => [x.text, x.start, x.end]), [['note', 0, 4], ['point', 11, 11]]);
  assert.equal(p.highlights[0].isCommentAnchor, true);
  assert.equal(p.highlights[1].isCommentAnchor, false);
});

test('comment on change and standalone point', () => {
  const p = prepareCritic('A{++new++}{>>check<<}B{>>point<<}');
  assert.deepEqual(p.comments.map((x) => [x.anchorKind, x.start, x.end]), [['insertion', 1, 4], ['point', 5, 5]]);
  assert.equal(p.groups[0].commentIds.length, 1);
});

test('unmatched forms and missing substitution separator remain literal', () => {
  for (const source of ['{++open', '{--open', '{==open', '{>>open', '{~~oldnew~~}']) {
    const p = prepareCritic(source);
    assert.equal(p.markdown, source);
    assert.equal(p.changes.length + p.comments.length + p.highlights.length, 0);
  }
});

test('odd/even slash parity applies to openers', () => {
  assert.equal(prepareCritic(String.raw`\{++new++}`).changes.length, 0);
  assert.equal(prepareCritic(String.raw`\\{++new++}`).changes.length, 1);
  assert.equal(isEscaped(String.raw`\\\{`, 3), true);
  assert.equal(isEscaped(String.raw`\\{`, 2), false);
});

test('escaped closer is skipped and later real closer ends span', () => {
  const p = prepareCritic(String.raw`{++a \++} b++}`);
  assert.equal(p.markdown, String.raw`a \++} b`);
  assert.equal(p.changes.length, 1);
});

test('escaped separator is skipped, or makes substitution literal if only one', () => {
  const p = prepareCritic(String.raw`{~~a\~>b~>c~~}`);
  assert.equal(p.markdown, String.raw`a\~>bc`);
  assert.equal(p.changes[0].end, 5);
  assert.equal(prepareCritic(String.raw`{~~a\~>b~~}`).changes.length, 0);
});

test('changes cross nested emphasis, links, and blank lines before Markdown', () => {
  const p = prepareCritic('start {++**bold** and [link](https://example.org)\n\nsecond++} end');
  assert.equal(p.changes.length, 1);
  assert.match(p.markdown, /\n\n/);
  const tree = parse('start {++**bold** and [link](https://example.org)\n\nsecond++} end');
  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].children[1].type, 'strong');
  assert.equal(tree.children[0].children[3].type, 'link');
  assert.equal(tree.data.critic.changes[0].end, p.changes[0].end);
});

test('a highlight can contain changes and comments', () => {
  const p = prepareCritic('{==a {++b++}{>>inner<<} c==}{>>outer<<}');
  assert.equal(p.markdown, 'a b c');
  assert.equal(p.changes.length, 1);
  assert.equal(p.highlights.length, 1);
  assert.deepEqual(p.comments.map((x) => [x.start, x.end]), [[2, 3], [0, 5]]);
});

test('a change can contain a commented highlight', () => {
  const p = prepareCritic('{~~a~>{==b==}{>>note<<}~~}');
  assert.equal(p.markdown, 'ab');
  assert.deepEqual(kinds(p), ['deletion', 'insertion']);
  assert.deepEqual([p.comments[0].start, p.comments[0].end], [1, 2]);
});

test('same-kind nesting is literal and comment bodies do not parse markup', () => {
  const p = prepareCritic('{++a {--b--} c++}{>>{++literal++}<<}');
  assert.equal(p.markdown, 'a {--b--} c');
  assert.equal(p.changes.length, 1);
  assert.equal(p.comments[0].text, '{++literal++}');
  assert.equal(p.diagnostics[0].code, 'literal-nested-critic');
});

test('Critic preprocesses code globally, matching Jubarte', () => {
  const tree = parse('`{++code++}`\n\n```js\n{--old--}\n```');
  assert.equal(tree.children[0].children[0].type, 'inlineCode');
  assert.equal(tree.children[0].children[0].value, 'code');
  assert.equal(tree.children[1].type, 'code');
  assert.equal(tree.children[1].value, 'old');
  assert.deepEqual(kinds(tree.data.critic), ['insertion', 'deletion']);
});

test('noCritic initially bypasses scanning exactly and preserves code', () => {
  const source = '{++a++} {~~b~>c~~} `{--code--}` {>>note<<}';
  const p = prepareCritic(source, { noCritic: true });
  assert.equal(p.markdown, source);
  assert.equal(p.changes.length + p.comments.length + p.highlights.length, 0);
  assert.deepEqual(p.sourceMap, Array.from({ length: source.length + 1 }, (_, i) => i));
});

test('agent tags are gated: ordinary notes outside agent view stay comments', () => {
  const p = prepareCritic('{++new++}{>>r12 @AC<<}');
  assert.equal(p.changes[0].isNew, true);
  assert.equal(p.comments[0].text, 'r12 @AC');
  assert.equal(p.comments[0].author, 'Modified User');
});

test('current and historical revision ID spellings share semantics', () => {
  for (const prefix of ['r12', '#r12', '#12']) {
    const p = prepareCritic(`{++new++}{>>${prefix} @AC<<}`, { agentView: true, authors: { AC: 'Ann Counsel' } });
    assert.equal(p.comments.length, 0);
    assert.equal(p.changes[0].author, 'Ann Counsel');
    assert.deepEqual(p.changes[0].revisionIds, ['12']);
    assert.deepEqual(p.changes[0].referenceIds, ['body:rev:12']);
  }
});

test('grouped IDs are retained on both halves for one substitution tag', () => {
  const p = prepareCritic('{~~old~>new~~}{>>r1+2 @AC<<}', { agentView: true });
  assert.deepEqual(p.groups[0].revisionIds, ['1', '2']);
  assert.deepEqual(p.changes[0].revisionIds, ['1', '2']);
  assert.deepEqual(p.changes[1].revisionIds, ['1', '2']);
});

test('two-author substitution assigns deletion first and insertion second', () => {
  const p = prepareCritic('{~~a~>b~~}{>>r1 @AC<<}{>>r2 @JD<<}', { agentView: true, authors: { AC: 'Ann', JD: 'Jane' } });
  assert.deepEqual(p.changes.map((x) => [x.kind, x.author, x.revisionIds]), [['deletion', 'Ann', ['1']], ['insertion', 'Jane', ['2']]]);
});

test('story-qualified revisions override document/storyAt defaults', () => {
  const p = prepareCritic('{++head++}{>>header1.r3 @AC<<} {--note--}{>>r7 @AC<<}', { agentView: true, storyAt: () => 'footnotes' });
  assert.deepEqual(p.changes.map((x) => x.referenceIds), [['header1:rev:3'], ['footnotes:rev:7']]);
});

test('tag dates and author-map default date are carried', () => {
  const p = prepareCritic('{++a++}{>>r1 @AC<<}{--b--}{>>r2 @AC 2026-10-03T14:05:00Z<<}', {
    agentView: true, authors: { AC: { name: 'Ann', timestamp: '2026-10-01T00:00:00Z' } },
  });
  assert.deepEqual(p.changes.map((x) => x.date), ['2026-10-01T00:00:00Z', '2026-10-03T14:05:00Z']);
});

test('tagged comment thread, reply, and resolved root', () => {
  const p = prepareCritic('{==word==}{>>c5 @AC resolved: root<<}{>>c6 @AS re c5: reply<<}', { agentView: true });
  assert.equal(p.comments[0].id, 'c5');
  assert.equal(p.comments[0].resolved, true);
  assert.equal(p.comments[1].replyTo, 'c5');
  assert.equal(p.comments[1].threadReference, 'body:comment:5');
  assert.equal(p.comments[1].anchorKind, 'highlight');
});

test('untagged notes following a tagged note are replies by the plan author', () => {
  const p = prepareCritic('{==word==}{>>c5 @AC: root<<}{>>reply one<<}{>>reply two<<}', { agentView: true, planAuthor: 'Editor' });
  assert.deepEqual(p.comments.slice(1).map((x) => [x.author, x.replyTo]), [['Editor', 'c5'], ['Editor', 'c5']]);
});

test('tagged comments have date parsing despite colons in timestamps', () => {
  const tag = parseAgentTag('c5 @AC 2026-10-03T14:05:00Z resolved: discuss: this');
  assert.equal(tag.date, '2026-10-03T14:05:00Z');
  assert.equal(tag.text, 'discuss: this');
  assert.equal(tag.resolved, true);
});

test('unrecognized tag-shaped prose is kept as an ordinary comment', () => {
  const p = prepareCritic('{>>r12 @AC extra words<<}', { agentView: true, planAuthor: 'Editor' });
  assert.equal(p.comments[0].text, 'r12 @AC extra words');
  assert.equal(p.comments[0].author, 'Editor');
});

test('orphan revision tags are retained with a diagnostic', () => {
  const p = prepareCritic('{>>r12 @AC<<}', { agentView: true });
  assert.equal(p.comments[0].text, 'r12 @AC');
  assert.equal(p.diagnostics[0].code, 'orphan-revision-tag');
});

test('whole footnote change leaves the Markdown definition recognizable', () => {
  const tree = parse('Reference[^2].\n\n{++[^2]: Added later.++}');
  assert.equal(tree.children[1].type, 'footnoteDefinition');
  const p = tree.data.critic;
  assert.equal(p.changes[0].footnoteLabel, '2');
  assert.equal(p.markdown.slice(p.changes[0].start, p.changes[0].end), 'Added later.');
});

test('Unicode source-map offsets match JavaScript/mdast UTF-16 offsets', () => {
  const p = prepareCritic('🐋 {++café 🐋++}');
  assert.equal(p.markdown, '🐋 café 🐋');
  assert.deepEqual([p.changes[0].start, p.changes[0].end], [3, 10]);
  for (let i = 0; i < p.markdown.length; i++) assert.equal(p.markdown[i], p.source[p.sourceMap[i]]);
});

test('actual plugin preserves native GFM and provides metadata', () => {
  const tree = parse('- [x] {++done++}\n\n| a | b |\n| - | - |\n| ~~old~~ | **bold** |');
  assert.equal(tree.children[0].type, 'list');
  assert.equal(tree.children[0].children[0].checked, true);
  assert.equal(tree.children[1].type, 'table');
  assert.equal(tree.children[1].children[1].children[0].children[0].type, 'delete');
  assert.equal(tree.data.critic.changes.length, 1);
});

test('plugin requires remark-parse to be installed first', () => {
  assert.throws(() => unified().use(remarkCriticMarkup).freeze(), /after remark-parse/);
});

test('large unmatched input does not repeatedly scan the suffix', () => {
  const source = '{++unmatched '.repeat(10000);
  const start = performance.now();
  const p = prepareCritic(source);
  assert.equal(p.markdown, source);
  assert.ok(performance.now() - start < 3000);
});

test('substitution of two bold sides retains two strong nodes', () => {
  const tree = parse('{~~**30**~>**45**~~}');
  assert.deepEqual(tree.children[0].children.filter((node) => node.type === 'strong').map(text), ['30', '45']);
  assert.equal(tree.data.critic.sentinelPositions.length, 1);
  assert.equal(tree.data.critic.markdown[tree.data.critic.sentinelPositions[0]], '\u2e0e');
  assert.deepEqual(tree.data.critic.changes.map((x) => [x.start, x.end]), [[0, 6], [7, 13]]);
});

test('Critic boundary punctuation preserves word-edge underscore emphasis', () => {
  const tree = parse('a{++_b_++}c');
  assert.equal(tree.children[0].children.find((node) => node.type === 'emphasis')?.children[0].value, 'b');
  assert.equal(tree.data.critic.sentinelPositions.length, 2);
});

test('sentinels preserve source-authored identical punctuation', () => {
  const p = prepareCritic('\u2e0e{~~**a**~>**b**~~}');
  assert.equal(p.markdown[0], '\u2e0e');
  assert.ok(!p.sentinelPositions.includes(0));
});

test('optional literal protection keeps noCritic substitution delimiters visible', () => {
  const tree = parse('{~~old~>new~~} and ~~ordinary strike~~', { noCritic: true, literalProtection: true });
  assert.equal(tree.children[0].children[0].value, '{~~old~>new~~} and ');
  assert.equal(tree.children[0].children[1].type, 'delete');
  assert.equal(tree.data.critic.changes.length, 0);
  assert.equal(tree.data.critic.insertedEscapes.length, 4);
});

test('literal protection does not add visible backslashes to code', () => {
  const tree = parse('`{~~a~>b~~}`\n\n> ```text\n> {~~c~>d~~}\n> ```', { noCritic: true, literalProtection: true });
  assert.equal(tree.children[0].children[0].value, '{~~a~>b~~}');
  assert.equal(tree.children[1].children[0].value, '{~~c~>d~~}');
  assert.equal(tree.data.critic.insertedEscapes.length, 0);
});

test('literal protection also protects escaped/unmatched substitution delimiters', () => {
  const tree = parse(String.raw`\{~~old~>new~~} {~~missing separator~~}`, { literalProtection: true });
  assert.equal(text(tree), '{~~old~>new~~} {~~missing separator~~}');
  assert.equal(tree.children[0].children.some((x) => x.type === 'delete'), false);
});

test('range/source maps remap after inserted literal escapes', () => {
  const p = prepareCritic(String.raw`\{~~literal~~} then {++new++}`, { literalProtection: true });
  assert.equal(p.markdown.slice(p.changes[0].start, p.changes[0].end), 'new');
  assert.equal(p.sourceMap.length, p.markdown.length + 1);
  assert.equal(p.source[p.sourceMap[p.changes[0].start]], 'n');
});
