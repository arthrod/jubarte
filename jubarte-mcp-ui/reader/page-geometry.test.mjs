// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePageGeometry} from './page-geometry.mjs';
import {parseJubarte} from './jubarte.mjs';
const read = page => resolvePageGeometry({metadata: {page: {raw: page}}});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} ≈ ${expected}`);
test('default Letter with one-inch margins', () => {
  assert.deepEqual(resolvePageGeometry(), {page: {widthPx:816,heightPx:1056,preset:'letter'},margins:{topPx:96,rightPx:96,bottomPx:96,leftPx:96},label:'Letter portrait',warnings:[]});
});
test('legend supports all paper sizes and orientations', () => {
  assert.equal(read('Legal landscape, margins 0.5in').page.widthPx, 1344);
  assert.equal(read('Letter landscape').page.heightPx, 816);
  close(read('A4 portrait').page.widthPx, 210 * 96 / 25.4);
  close(read('A4 landscape').page.widthPx, 297 * 96 / 25.4);
});
test('all length units and individual margin overrides', () => {
  const value = read('Letter portrait, margins 25.4mm, top 2.54cm, right margin 72pt, bottom 48px, left 0.25in, header/footer 0.5in');
  assert.deepEqual(value.margins, {topPx:96,rightPx:96,bottomPx:48,leftPx:24});
  assert.deepEqual(value.warnings, []);
});
test('structured page preserved by old metadata parser is interpreted losslessly', () => {
  const result = parseJubarte('---\npage:\n  size: Legal\n  orientation: landscape\n  margins:\n    top: 12mm\n    right: 0.5in\n    bottom: 36pt\n    left: 48px\n---\n# Hello');
  const original = JSON.stringify(result.metadata.page);
  const value = resolvePageGeometry(result);
  assert.equal(value.page.widthPx, 1344);
  close(value.margins.topPx, 12 * 96 / 25.4);
  assert.equal(value.margins.leftPx, 48);
  assert.equal(JSON.stringify(result.metadata.page), original);
  assert.deepEqual(value.warnings, []);
});
test('raw Legal legend overrides older parser’s Letter fallback', () => {
  const result = parseJubarte('---\npage: Legal portrait, margins 18mm\n---\nText');
  const value = resolvePageGeometry(result);
  assert.equal(value.page.heightPx, 1344);
  close(value.margins.topPx, 18 * 96 / 25.4);
});
test('normalized compatibility, scalar margins and numeric inches', () => {
  const value = resolvePageGeometry({metadata:{page:{size:'A4',orientation:'landscape',margins:0.5}}});
  close(value.page.widthPx, 297 * 96 / 25.4);
  assert.equal(value.margins.leftPx, 48);
});
test('invalid, negative, infinite and huge margins produce visible warnings', () => {
  for (const margin of [-1, Infinity, NaN, 'enormous', '50in', [], true]) {
    const value = read({margins:margin});
    assert.equal(value.margins.topPx, 96);
    assert.ok(value.warnings.length);
  }
  assert.ok(read({size:'banana',orientation:'sideways'}).warnings.length === 2);
});
test('margins cannot consume the content frame', () => {
  const value = read('Letter, margins 5in');
  assert.ok(value.page.widthPx-value.margins.leftPx-value.margins.rightPx >= 96);
  assert.ok(value.page.heightPx-value.margins.topPx-value.margins.bottomPx >= 96);
  assert.ok(value.warnings.length);
});
test('custom dimensions and safe bounds', () => {
  const value = read({width:'20cm',height:'30cm',margins:'12mm'});
  close(value.page.widthPx, 20 * 96 / 2.54);
  assert.equal(value.page.preset, undefined);
  for (const width of [0,-1,Infinity,'100in']) assert.ok(read({width,height:'11in'}).warnings.length);
  const small = read({width:'2in',height:'2in'});
  assert.equal(small.page.widthPx-small.margins.leftPx-small.margins.rightPx,96);
});
test('unknown fields do not disappear without a warning', () => {
  assert.ok(read({size:'A4',bleed:'3mm'}).warnings[0].includes('bleed'));
  assert.ok(read('Letter, decorative').warnings[0].includes('decorative'));
});

test('eight substantial reader examples parse and cover the four paper layouts', async () => {
  const {readerExamples} = await import('./examples.mjs');
  assert.equal(readerExamples.length, 8);
  assert.equal(new Set(readerExamples.map(example => example.id)).size, 8);
  const layouts = [];
  for (const example of readerExamples) {
    assert.ok(example.title && example.description && example.source);
    assert.ok(example.source.split(/\s+/).length > 1000);
    const result = parseJubarte(example.source);
    result.doc.check();
    assert.ok(result.critic.comments.length >= 3);
    assert.ok(result.critic.changes.length >= 2);
    const geometry = resolvePageGeometry(result);
    assert.deepEqual(geometry.warnings, []);
    layouts.push(geometry.label);
  }
  assert.deepEqual(layouts, ['Letter portrait','Letter portrait','Letter portrait','A4 portrait','A4 landscape','Legal portrait','Letter portrait','A4 landscape']);
});
