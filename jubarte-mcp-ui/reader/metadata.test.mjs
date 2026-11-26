// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocumentMetadata, parseDirective, splitClauses} from './metadata.mjs';

const fixed = {now: '2026-10-13T12:00:00Z'};
const parse = (source, options = {}) => parseDocumentMetadata(source, {...fixed, ...options});
const view = source => parse(`---\nview: tracked\n---\n${source}`);
const codes = result => result.warnings.map(warning => warning.code);

function unchangedOffsets(source, result) {
  assert.equal(result.body.length, source.length);
  assert.deepEqual([...result.body.matchAll(/\r\n|\r|\n/g)].map(match => [match.index, match[0]]), [...source.matchAll(/\r\n|\r|\n/g)].map(match => [match.index, match[0]]));
  for (const directive of result.directives) assert.equal(source.slice(directive.start, directive.end), directive.raw);
}

test('without frontmatter, ID-looking comments and all body bytes remain literal', () => {
  const source = '<!-- p1 right -->\n{++new++}{>>r12 @AC<<}\n<!-- page 2 of 5 -->';
  const result = parse(source);
  assert.equal(result.body, source);
  assert.equal(result.agentView, false);
  assert.equal(result.frontmatter, null);
  assert.deepEqual(result.directives, []);
  assert.equal(result.metadata.page.size, 'Letter');
  assert.equal(result.metadata.page.orientation, 'portrait');
  assert.equal(result.metadata.page.margins.left, 1);
  assert.equal(result.metadata.styles.Normal.fontFamily, 'Calibri');
  assert.equal(result.metadata.defaults.author, 'Modified User');
  assert.equal(result.metadata.defaults.documentOwner, 'Original User');
  assert.equal(result.metadata.defaults.date, '2026-10-13T12:00:00.000Z');
});

test('ordinary YAML honors all document metadata while gating ID interpretation', () => {
  const source = `---
page: A4 landscape, margins 0.75in, header/footer 0.4in
styles:
  Normal: Aptos 12pt, after 8pt, line 1.08, left
  "#": Heading1, Calibri bold 16pt, before 12pt, keep-next
headers:
  first: none
  default: {id: header1, text: Smith & Co, right}
footers:
  default: {id: footer2, text: "Page {PAGE} of {NUMPAGES} on {DATE}"}
sections:
  2: {p11-p40, page: Letter portrait, headers: {first: none}}
---
<!-- p0 right -->
Hello
`;
  const result = parse(source);
  assert.equal(result.agentView, false);
  assert.deepEqual(result.directives, []);
  assert.ok(result.body.includes('<!-- p0 right -->'));
  assert.equal(result.metadata.page.size, 'A4');
  assert.equal(result.metadata.page.orientation, 'landscape');
  assert.equal(result.metadata.page.margins.bottom, 0.75);
  assert.equal(result.metadata.page.headerIn, 0.4);
  assert.ok(result.metadata.page.widthIn > result.metadata.page.heightIn);
  assert.equal(result.metadata.styles.Normal.fontSizePt, 12);
  assert.equal(result.metadata.styles.Normal.afterPt, 8);
  assert.equal(result.metadata.styles.Normal.lineHeight, 1.08);
  assert.equal(result.metadata.styles['#'].styleId, 'Heading1');
  assert.equal(result.metadata.styles['#'].fontFamily, 'Calibri');
  assert.equal(result.metadata.styles['#'].bold, true);
  assert.equal(result.metadata.styles['#'].keepNext, true);
  assert.equal(result.metadata.headers.first.none, true);
  assert.equal(result.metadata.headers.default.alignment, 'right');
  assert.deepEqual(result.metadata.footers.default.fields.map(field => field.type), ['PAGE', 'NUMPAGES', 'DATE']);
  assert.equal(result.metadata.sections['2'].paragraphRanges[0].start, 11);
  assert.equal(result.metadata.sections['2'].paragraphRanges[0].end, 40);
  assert.equal(result.metadata.sections['2'].headers.first.none, true);
  assert.equal(result.metadata.raw.headers.default.right, null);
  assert.equal(result.metadata.raw.sections['2']['p11-p40'], null);
  unchangedOffsets(source, result);
});

for (const value of ['tracked', 'null', 'false', '""', '']) {
  test(`agent view is enabled by own view key presence: ${JSON.stringify(value)}`, () => {
    const result = parse(`---\nview: ${value}\n---\n<!-- p0 -->\nBody`);
    assert.equal(result.agentView, true);
    assert.equal(result.directives[0].id, 'p0');
    assert.equal(result.body.includes('<!-- p0 -->'), false);
  });
}

test('nested view key does not enable directives', () => {
  const result = parse('---\ncustom: {view: tracked}\n---\n<!-- p0 -->');
  assert.equal(result.agentView, false);
  assert.equal(result.directives.length, 0);
  assert.ok(result.body.includes('<!-- p0 -->'));
});

test('quoted hashes, unspaced URL fragments, and ordinary YAML comments survive correctly', () => {
  const source = `---
title: "Quoted # hash"
author: 'O''Brien # counsel'
source: https://example.test/file#fragment # actual comment
styles:
  "#": Heading1, Calibri 16pt # heading legend
headers:
  default: {id: header1, text: "A # B", right} # real comment
---
Body`;
  const result = parse(source);
  assert.equal(result.frontmatter.data.title, 'Quoted # hash');
  assert.equal(result.frontmatter.data.author, "O'Brien # counsel");
  assert.equal(result.metadata.source, 'https://example.test/file#fragment');
  assert.equal(result.metadata.headers.default.text, 'A # B');
  assert.equal(result.metadata.styles['#'].fontSizePt, 16);
  assert.ok(result.frontmatter.raw.includes('# actual comment'));
});

test('YAML preserves multiline strings, aliases and inline bare flags', () => {
  const result = parse(`---
view: tracked
headers:
  default: &default {id: header1, text: "A: B, C", right, inactive}
  even: *default
footers:
  default:
    id: footer1
    text: |-
      Page {PAGE}
      Confidential
---
Body`);
  assert.equal(result.frontmatter.valid, true);
  assert.equal(result.metadata.headers.even.alignment, 'right');
  assert.equal(result.metadata.headers.default.inactive, true);
  assert.equal(result.metadata.footers.default.text, 'Page {PAGE}\nConfidential');
});

test('frontmatter supports BOM, CRLF, closing ellipsis and UTF-16 offsets', () => {
  const source = '\uFEFF---\r\nview: tracked\r\ntitle: "💡"\r\n...\r\n<!-- p0 right -->\r\n💡 {++new++}\r\n';
  const result = parse(source);
  assert.equal(result.frontmatter.valid, true);
  assert.equal(result.directives[0].id, 'p0');
  assert.equal(result.body.indexOf('{++new++}'), source.indexOf('{++new++}'));
  unchangedOffsets(source, result);
});

for (const source of ['---\nview: [\n---\n<!-- p0 -->', '---\nview: tracked\nview: accepted\n---\n<!-- p0 -->', '---\n- view\n- tracked\n---\n<!-- p0 -->']) {
  test(`invalid/nonmapping YAML stays literal: ${source.split('\n')[1]}`, () => {
    const result = parse(source);
    assert.equal(result.frontmatter.valid, false);
    assert.equal(result.agentView, false);
    assert.equal(result.body, source);
    assert.ok(result.warnings.length > 0);
  });
}

test('unclosed YAML and later YAML fences stay literal', () => {
  const unclosed = '---\nview: tracked\n<!-- p0 -->';
  assert.equal(parse(unclosed).body, unclosed);
  assert.ok(codes(parse(unclosed)).includes('unclosed-frontmatter'));
  const later = 'Text\n---\nview: tracked\n---\n<!-- p0 -->';
  assert.equal(parse(later).body, later);
});

test('all paragraph clauses, optional style, indents, labels and level normalize', () => {
  const result = view('<!-- p18 Quote justify, first-line 0.5in, hanging 0.25in, left 1in, right -0.2in, num "1)", level 2, page-break, section-break -->\nText');
  const paragraph = result.directives[0];
  assert.equal(paragraph.id, 'p18');
  assert.equal(paragraph.canonicalId, 'body:p:18');
  assert.equal(paragraph.style, 'Quote');
  assert.equal(paragraph.alignment, 'justify');
  assert.deepEqual(paragraph.indents, {'first-line': 0.5, hanging: 0.25, left: 1, right: -0.2});
  assert.deepEqual(paragraph.numbering, {kind: 'numbered', label: '1)'});
  assert.equal(paragraph.level, 2);
  assert.equal(paragraph.pageBreak, true);
  assert.equal(paragraph.sectionBreak, true);
  assert.equal(paragraph.unknown.length, 0);
});

for (const alignment of ['left', 'center', 'right', 'justify']) {
  test(`alignment ${alignment} is not mistaken for a style`, () => {
    const paragraph = view(`<!-- p1 ${alignment} -->`).directives[0];
    assert.equal(paragraph.style, null);
    assert.equal(paragraph.alignment, alignment);
  });
}

test('optional quoted styles and bullet numbering are kept', () => {
  const paragraph = view('<!-- p1 "My Custom Style" center, bullet, level 0 -->').directives[0];
  assert.equal(paragraph.style, 'My Custom Style');
  assert.equal(paragraph.alignment, 'center');
  assert.deepEqual(paragraph.numbering, {kind: 'bullet'});
});

test('quoted numbering labels support commas, escaped quotes and backslashes', () => {
  const raw = String.raw`<!-- p3 num "a, \"quote\" \\ b)", level 3 -->`;
  const paragraph = view(raw).directives[0];
  assert.equal(paragraph.numbering.label, 'a, "quote" \\ b)');
  assert.equal(paragraph.level, 3);
  assert.equal(paragraph.clauses.length, 2);
});

test('revision, formatting and paragraph-mark tags retain all raw data', () => {
  const paragraph = view('<!-- p3 break-ins r1+2 @AC; r3 @JD, break-del r4 @AC, fmt header1.r5 @AC, rev footnotes.r7 @JD 2026-10-13T10:00:00Z -->').directives[0];
  assert.equal(paragraph.revisions.length, 4);
  assert.deepEqual(paragraph.revisions[0].tags[0].revisionIds, [1, 2]);
  assert.deepEqual(paragraph.revisions[0].tags[0].canonicalIds, ['body:rev:1', 'body:rev:2']);
  assert.equal(paragraph.revisions[0].tags[1].author, 'JD');
  assert.equal(paragraph.revisions[2].tags[0].story, 'header1');
  assert.equal(paragraph.revisions[3].tags[0].canonicalIds[0], 'footnotes:rev:7');
  assert.equal(paragraph.revisions[3].tags[0].timestamp, '2026-10-13T10:00:00Z');
});

for (const change of ['ins', 'del']) {
  test(`page-break-${change} retains its revision without a paragraph-mark clause (#134 K141)`, () => {
    const paragraph = parseDirective(`<!-- p1 page-break-${change} r1 @A -->`);
    assert.equal(paragraph.revisions.length, 1);
    assert.equal(paragraph.revisions[0].type, 'page-break');
    assert.equal(paragraph.revisions[0].change, change);
    assert.deepEqual(paragraph.revisions[0].tags[0].canonicalIds, ['body:rev:1']);
  });

  test(`page-break-${change} parses its change and tags without warnings (#134 K142)`, () => {
    const warnings = [];
    const paragraph = parseDirective(`<!-- footnotes.p1 page-break-${change} r1+2 @A -->`, {warnings});
    assert.equal(paragraph.pageBreak, true);
    assert.equal(paragraph.pageBreakChange?.change, change);
    assert.deepEqual(paragraph.pageBreakChange.tags[0].revisionIds, [1, 2]);
    assert.deepEqual(paragraph.pageBreakChange.tags[0].canonicalIds, ['footnotes:rev:1', 'footnotes:rev:2']);
    assert.equal(paragraph.pageBreakChange.tags[0].author, 'A');
    assert.deepEqual(warnings, []);
  });
}

test('legacy hash tags from authoritative document are also accepted', () => {
  const paragraph = view('<!-- p3 rev #0 @AC; #1+2 @AC, comments #c5+6, in #c11 -->').directives[0];
  assert.deepEqual(paragraph.revisions[1]?.tags, undefined);
  assert.deepEqual(paragraph.revisions[0].tags[1].revisionIds, [1, 2]);
  assert.deepEqual(paragraph.comments.map(comment => comment.id), ['c5', 'c6']);
  assert.equal(paragraph.openComments[0].id, 'c11');
});

test('comment ranges and hidden comments normalize user cN spelling', () => {
  const paragraph = view('<!-- p3 comments c5+c6, in c11 -->').directives[0];
  assert.deepEqual(paragraph.comments.map(comment => comment.id), ['c5', 'c6']);
  assert.equal(paragraph.openComments[0].id, 'c11');
});

test('empty paragraph ranges remain compact and retain tracked marks', () => {
  const result = view('<!-- p4-p7 empty -->\n<!-- p8 empty, break-ins r3 @AC -->');
  assert.equal(result.directives[0].index, 4);
  assert.equal(result.directives[0].endIndex, 7);
  assert.equal(result.directives[0].empty, true);
  assert.equal(result.directives[1].revisions[0].type, 'break-ins');
});

test('story paragraph IDs retain their canonical identity', () => {
  const result = view('<!-- footnotes.p0 -->\nNote\n<!-- header1.p2 center -->\nHeader\n<!-- footer2.p1 right -->\nFooter');
  assert.deepEqual(result.directives.map(item => item.canonicalId), ['footnotes:p:0', 'header1:p:2', 'footer2:p:1']);
  assert.deepEqual(result.directives.map(item => item.story), ['footnotes', 'header1', 'footer2']);
});

test('tables retain dimensions, cell ranges, repeated header and merges', () => {
  const table = view('<!-- t0 center 3x2, cells p8-p13 by row, header row repeats, merged t0.row0.cell0 across 2 down 1 -->').directives[0];
  assert.equal(table.type, 'table');
  assert.equal(table.alignment, 'center');
  assert.equal(table.rows, 3);
  assert.equal(table.columns, 2);
  assert.equal(table.cells.paragraphRange.start, 8);
  assert.equal(table.cells.paragraphRange.end, 13);
  assert.equal(table.headerRowRepeats, true);
  assert.deepEqual(table.merges.map(({tableId, row, cell, across, down}) => ({tableId, row, cell, across, down})), [{tableId: 't0', row: 0, cell: 0, across: 2, down: 1}]);
});

test('tables support row groups, compact headerrow and scoped changes/comments', () => {
  const table = view('<!-- t4 right 2x3, cells r0 p8-p10 r1 p11-p14, headerrow repeats, break-ins r12 @AC in p9, rev r13 @JD in p11, fmt r14 @AC in p12, comments c9 in p11, in c5 -->').directives[0];
  assert.deepEqual(table.cells.rows.map(row => [row.row, row.paragraphRanges[0].start, row.paragraphRanges[0].end]), [[0, 8, 10], [1, 11, 14]]);
  assert.equal(table.headerRowRepeats, true);
  assert.deepEqual(table.scopedClauses.map(clause => [clause.type, clause.paragraphId]), [['break-ins', 'p9'], ['rev', 'p11'], ['fmt', 'p12'], ['comments', 'p11']]);
  assert.equal(table.openComments[0].id, 'c5');
  assert.equal(table.revisions.length, 0);
});

test('table merges support multiple cells and compact coordinates', () => {
  const table = view('<!-- t0 4x4, merged cells t0.r0.c0 across 2 down 2; t0.row2.cell2 across 2 down 1 -->').directives[0];
  assert.equal(table.merges.length, 2);
  assert.equal(table.merges[1].row, 2);
});

test('multiline table ID comments retain offsets and line breaks', () => {
  const source = '---\nview: tracked\n---\n<!-- t0 center 3x2, cells p8-p13 by row,\n  header row repeats -->\n| A | B |\n';
  const result = parse(source);
  assert.equal(result.directives[0].headerRowRepeats, true);
  unchangedOffsets(source, result);
});

test('source page markers are parsed without claiming layout calculation', () => {
  const marker = view('<!-- page 2 of 5 -->').directives[0];
  assert.equal(marker.type, 'page');
  assert.equal(marker.page, 2);
  assert.equal(marker.total, 5);
  assert.equal(marker.layoutVerified, false);
  assert.equal(marker.provenance, 'source-marker');
});

test('unknown syntax and malformed tags remain lossless and explicitly warned', () => {
  const source = '<!-- p0 center, strange-feature hello, rev weird tag -->';
  const result = view(source);
  assert.equal(result.directives[0].raw, source);
  assert.equal(result.directives[0].unknown[0].trim(), 'strange-feature hello');
  assert.equal(result.directives[0].revisions[0].tags[0].raw, 'weird tag');
  assert.equal(result.directives[0].revisions[0].tags[0].known, false);
  assert.ok(codes(result).includes('unknown-directive-clause'));
  assert.ok(codes(result).includes('unknown-revision-tag'));
});

test('unknown YAML, page/style/story/section fields stay available', () => {
  const result = parse(`---
custom: {enabled: true}
page: Letter portrait, secret margin
styles:
  Normal: Calibri 11pt, custom setting
headers:
  default: {id: header1, text: hi, future: true}
sections:
  2: {p1-p3, future: value}
---
Text`);
  assert.deepEqual(result.metadata.unknown.custom, {enabled: true});
  assert.equal(result.metadata.page.unknown[0].trim(), 'secret margin');
  assert.equal(result.metadata.styles.Normal.unknown[0].trim(), 'custom setting');
  assert.equal(result.metadata.headers.default.unknown.future, true);
  assert.equal(result.metadata.sections['2'].unknown.future, 'value');
  assert.ok(codes(result).includes('unknown-frontmatter-key'));
  assert.ok(codes(result).includes('unknown-page-clause'));
  assert.ok(codes(result).includes('unknown-style-clause'));
  assert.ok(codes(result).includes('unknown-story-field'));
  assert.ok(codes(result).includes('unknown-section-field'));
});

test('fenced code, indented code, inline comments and escaped comments stay literal', () => {
  const examples = [
    '```html\n<!-- p1 -->\n```',
    '~~~md\n<!-- p2 -->\n~~~',
    '    <!-- p3 -->',
    '\t<!-- p4 -->',
    'before <!-- p5 -->',
    '\\<!-- p6 -->',
    '<!-- ordinary HTML comment -->',
  ];
  const result = view(examples.join('\n\n') + '\n\n<!-- p7 -->\nBody');
  assert.deepEqual(result.directives.map(item => item.id), ['p7']);
  for (const example of examples) assert.ok(result.body.includes(example));
});

test('unclosed fenced code protects all later ID-looking comments', () => {
  const result = view('```md\n<!-- p0 -->\n~~~\n<!-- p1 -->');
  assert.equal(result.directives.length, 0);
});

test('Critic comment bodies are left for Critic parser in both views', () => {
  const critic = '{~~a~>b~~}{>>r1 @AC<<}{>>r2 @JD<<} {>>c5 @AC re c3 resolved: note<<}';
  assert.ok(view(critic).body.includes(critic));
  assert.equal(parse(critic).body, critic);
});

test('duplicates, overlaps, backwards ranges and bad page counts warn', () => {
  const result = view('<!-- p4-p7 empty -->\n<!-- p5 -->\n<!-- p10-p8 empty -->\n<!-- page 5 of 2 -->\n<!-- t0 0x2 -->\n<!-- t0 2x2 -->');
  assert.ok(codes(result).includes('duplicate-directive-id'));
  assert.ok(codes(result).includes('reversed-paragraph-range'));
  assert.ok(codes(result).includes('invalid-page-marker'));
  assert.ok(codes(result).includes('invalid-table-dimensions'));
});

test('single non-owner author and own timestamp are available as defaults', () => {
  const result = parse(`---
view: tracked
authors:
  document_owner: Owner Person
  AC: Ann Counsel # 5 revisions, 2 comments, 2026-10-01T09:00:00Z
---
Text`);
  assert.equal(result.metadata.defaults.documentOwner, 'Owner Person');
  assert.equal(result.metadata.defaults.author, 'Ann Counsel');
  assert.equal(result.metadata.defaults.authorHandle, 'AC');
  assert.equal(result.metadata.defaults.date, '2026-10-01T09:00:00Z');
  assert.equal(result.metadata.defaults.dateSource, 'author');
  assert.equal(codes(result).includes('missing-revision-date'), false);
});

test('multiple authors and author date ranges fall back without inventing a date', () => {
  const result = parse(`---
view: tracked
authors:
  AC: Ann Counsel # 2026-10-01 to 2026-10-03
  JD: Jane Doe
---
Text`);
  assert.equal(result.metadata.defaults.author, 'Modified User');
  assert.equal(result.metadata.authorDetails.AC.singleTimestamp, null);
  assert.equal(result.metadata.defaults.date, '2026-10-13T12:00:00.000Z');
  assert.ok(codes(result).includes('missing-revision-date'));
});

test('source inheritance is a declared unresolved contract, not a DOCX claim', () => {
  const result = parse('---\nview: tracked\nsource: received.docx\n---\n<!-- p0 -->\nBody');
  assert.deepEqual(result.metadata.sourceContract, {path: 'received.docx', inheritUnspecifiedById: true, sourceLoaded: false});
  assert.equal(result.metadata.defaults.inheritedFromSource, true);
  assert.equal(result.metadata.page.origin, 'source-document');
  assert.equal(result.metadata.capabilities.docxGenerated, false);
  assert.equal(result.metadata.capabilities.layoutCalculated, false);
});

test('explicit author/date options override document fallback author/date', () => {
  const result = parse('---\nview: tracked\nauthors: {AC: Ann Counsel}\n---\nText', {author: 'Plan Author', date: '2026-10-12T08:00:00Z'});
  assert.equal(result.metadata.defaults.author, 'Plan Author');
  assert.equal(result.metadata.defaults.date, '2026-10-12T08:00:00Z');
  assert.equal(result.metadata.defaults.dateSource, 'option');
});

test('standalone parser and comma splitter have predictable public interfaces', () => {
  assert.equal(parseDirective('<!-- ordinary -->'), null);
  assert.equal(parseDirective('<!-- p0 -->', {offset: 100}).start, 100);
  assert.equal(parseDirective('<!-- p0 -->', {offset: 100}).end, 111);
  assert.deepEqual(splitClauses('num "a,b)", left 1in, x {a,b}'), ['num "a,b)"', ' left 1in', ' x {a,b}']);
  assert.throws(() => parseDocumentMetadata(null), /expects a string/);
});

test('recursive YAML aliases are rejected with source preserved, never circular output', () => {
  const source = '---\nview: tracked\ncustom: &a {self: *a}\n---\n<!-- p0 -->';
  const result = parse(source);
  assert.equal(result.body, source);
  assert.equal(result.agentView, false);
  assert.equal(result.frontmatter.valid, false);
  assert.ok(codes(result).includes('yaml-error'));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('special object keys are preserved as data without prototype mutation', () => {
  const result = parse('---\nstyles:\n  __proto__: Calibri 11pt\nheaders:\n  default: {__proto__: {hello: world}}\nsections:\n  2: {__proto__: {hello: world}}\n---\nBody');
  assert.equal(Object.getPrototypeOf(result.metadata.styles), Object.prototype);
  assert.equal(Object.hasOwn(result.metadata.styles, '__proto__'), true);
  assert.equal(result.metadata.styles.__proto__.fontFamily, 'Calibri');
  assert.equal(Object.getPrototypeOf(result.metadata.headers.default.unknown), Object.prototype);
  assert.equal(Object.hasOwn(result.metadata.headers.default.unknown, '__proto__'), true);
  assert.equal(Object.getPrototypeOf(result.metadata.sections['2'].unknown), Object.prototype);
  assert.equal(result.metadata.headers.default.unknown.hello, undefined);
});

test('malformed numeric legends do not create NaN values', () => {
  const result = parse('---\npage: Letter portrait, margins .in\nstyles:\n  Normal: Calibri ..pt\n---\nBody');
  assert.equal(result.metadata.page.margins.top, 1);
  assert.equal(result.metadata.styles.Normal.fontSizePt, 11);
  assert.ok(codes(result).includes('unknown-page-clause'));
  assert.ok(codes(result).includes('unknown-style-clause'));
});

test('a partial Normal legend retains writer baseline defaults', () => {
  const result = parse('---\nstyles:\n  Normal: after 8pt\n---\nBody');
  assert.equal(result.metadata.styles.Normal.afterPt, 8);
  assert.equal(result.metadata.styles.Normal.fontFamily, 'Calibri');
  assert.equal(result.metadata.styles.Normal.fontSizePt, 11);
});

test('a fenced block in a list does not consume ID-looking code lines', () => {
  const result = view('- ```html\n  <!-- p0 -->\n  ```\n\n<!-- p1 -->\nBody');
  assert.deepEqual(result.directives.map(item => item.id), ['p1']);
  assert.ok(result.body.includes('  <!-- p0 -->'));
});

test('paragraph directives allow the user-contract comma immediately after ID', () => {
  const result = view('<!-- p0, center, first-line 0.5in -->\n<!-- p4-p7, empty -->');
  assert.equal(result.directives[0].alignment, 'center');
  assert.equal(result.directives[0].indents['first-line'], 0.5);
  assert.equal(result.directives[1].endIndex, 7);
  assert.equal(result.directives[1].empty, true);
});

test('comment IDs inherit the containing story when no prefix is supplied', () => {
  const paragraph = view('<!-- footnotes.p0 comments c5, in c6 -->').directives[0];
  assert.equal(paragraph.comments[0].story, 'footnotes');
  assert.equal(paragraph.openComments[0].story, 'footnotes');
});

test('the engine quotes a page change (#20): the header reads as YAML with no repair', () => {
  const source = '---\nview: tracked\npage: "A4 portrait, margins 1in; was: Letter portrait, margins 1in; fmt r227 @ASR"\nauthors:\n  ASR: Ann\n---\n<!-- p0 -->\n{++new++}{r1 @ASR}\n';
  const result = parse(source);
  assert.equal(result.agentView, true);
  assert.equal(result.frontmatter.data.page, 'A4 portrait, margins 1in; was: Letter portrait, margins 1in; fmt r227 @ASR');
  assert.ok(!result.warnings.some((w) => w.code === 'yaml-repaired' || w.code === 'yaml-error'));
});

test('an engine header line with a second `: ` is read as text, not a reason to leave the view (b078, b102)', () => {
  // jubarte 0.20.0 writes a page change as `page: A; was: B; fmt r227 @ASR`,
  // which YAML refuses ("mapping values are not allowed here"). One such
  // line must not turn the whole agent view into literal text.
  const source = '---\nview: tracked\npage: A4 portrait, margins 1in; was: Letter portrait, margins 1in; fmt r227 @ASR  # from layout\nauthors:\n  ASR: Ann\n---\n<!-- p0 -->\n{++new++}{r1 @ASR}\n';
  const result = parse(source);
  assert.equal(result.agentView, true);
  assert.equal(result.frontmatter.valid, true);
  assert.equal(result.frontmatter.data.page, 'A4 portrait, margins 1in; was: Letter portrait, margins 1in; fmt r227 @ASR');
  assert.equal(result.frontmatter.data.authors.ASR, 'Ann');
  assert.equal(result.directives[0].id, 'p0');
  assert.equal(result.body.indexOf('{++new++}'), source.indexOf('{++new++}'));
  assert.ok(result.warnings.some((w) => w.code === 'yaml-repaired'));
  assert.ok(!result.warnings.some((w) => w.code === 'yaml-error'));
  // The repair reads values only: a broken `view:` still leaves the source literal.
  const broken = parse('---\nview: tracked: yes\n---\n<!-- p0 -->');
  assert.equal(broken.agentView, false);
});

test('an ID-line tag with no author (`@??`, the engine’s is_handle) is a known tag (019, 070)', () => {
  const source = '---\nview: tracked\n---\n<!-- t0 3x3, cells p8-p16 by row, fmt r1 @R; r2 @?? -->\n';
  const result = parse(source);
  assert.ok(!codes(result).includes('unknown-revision-tag'), JSON.stringify(result.warnings));
});

test('a table line names the rows Word keeps on one page (#71)', () => {
  const directive = parseDirective('<!-- t0 3x1, cells p0-p2 by row, cant-split t0.row1 t0.row2 -->');
  assert.deepEqual(directive.properties.cantSplitRows, [1, 2]);
  assert.deepEqual(directive.properties.unknown, []);
});

test('a style line names a double underline and a double strike apart from its font (#96)', () => {
  const {styles} = parse('---\nview: tracked\nstyles:\n  Emph: Calibri bold underline-double strike dstrike 11pt\n---\n').metadata;
  assert.equal(styles.Emph.fontFamily, 'Calibri');
  assert.equal(styles.Emph.fontSizePt, 11);
  assert.equal(styles.Emph.bold, true);
  assert.equal(styles.Emph.underline, true);
  assert.equal(styles.Emph.underlineKind, 'double');
  assert.equal(styles.Emph.strike, true);
  assert.equal(styles.Emph.dstrike, true);
  assert.deepEqual(styles.Emph.unknown, []);
});
