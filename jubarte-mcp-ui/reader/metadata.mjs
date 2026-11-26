// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

import YAML from 'yaml';
import {fromMarkdown} from 'mdast-util-from-markdown';

/**
 * Lossless reader for Jubarte's YAML legend and agent-view ID lines.
 * This describes document intent; it does not lay out pages or write DOCX.
 * All offsets are UTF-16 offsets in the original source, as in MDAST.
 */
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const blank = value => value.replace(/[^\r\n]/g, ' ');
const STORY = '(?:footnotes|endnotes|header\\d+|footer\\d+)';
const PARAGRAPH = `(?:${STORY}\\.)?p\\d+`;
const KNOWN_HEADER_KEYS = new Set(['title', 'author', 'source', 'view', 'track_changes', 'revisions', 'comments', 'authors', 'body', 'page', 'styles', 'headers', 'footers', 'sections', 'range', 'date']);
const ALIGNMENTS = ['left', 'center', 'right', 'justify'];
const setOwn = (object, key, value) => Object.defineProperty(object, key, {value, enumerable: true, writable: true, configurable: true});
const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?\b/g;

function warn(warnings, code, message, range, detail) {
  warnings.push({code, message, ...(range ? {range} : {}), ...(detail === undefined ? {} : {detail})});
}

/** Split only outside quotes/brackets; preserve every clause's original text. */
export function splitClauses(value, separator = ',') {
  const result = [];
  let start = 0;
  let quote = null;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) {
        if (quote === "'" && value[i + 1] === "'") i++;
        else quote = null;
      }
    } else if (c === '"' || c === "'") quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (c === separator && depth === 0) {
      result.push(value.slice(start, i));
      start = i + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}

function paragraphIdentity(id) {
  const match = id.match(new RegExp(`^(?:(${STORY})\\.)?p(\\d+)$`));
  if (!match) return null;
  const story = match[1] || 'body';
  const index = Number(match[2]);
  return {id, story, index, canonicalId: `${story}:p:${index}`};
}

function paragraphRange(raw) {
  const match = raw.match(/^(p(\d+))(?:-p?(\d+))?$/);
  return match ? {raw, start: Number(match[2]), end: Number(match[3] ?? match[2])} : null;
}

function decodeLabel(value) {
  // Jubarte escapes only quotation marks and backslashes in list labels.
  return value.replace(/\\(["\\])/g, '$1');
}

function parseTags(value, defaultStory, warnings, range) {
  return splitClauses(value, ';').map(part => {
    const raw = part.trim();
    const match = raw.match(new RegExp(`^(?:(${STORY})\\.)?(?:r|#)(\\d+(?:\\+\\d+)*)\\s+@([\\p{L}\\p{N}_-]+)(?:\\s+(.+))?$`, 'u'));
    if (!match) {
      warn(warnings, 'unknown-revision-tag', `Unrecognized revision tag is preserved: ${raw}`, range);
      return {raw, known: false};
    }
    const story = match[1] || defaultStory;
    const revisionIds = match[2].split('+').map(Number);
    return {raw, known: true, story, revisionIds, canonicalIds: revisionIds.map(id => `${story}:rev:${id}`), author: match[3], ...(match[4] ? {timestamp: match[4]} : {})};
  });
}

function parseCommentIds(value, warnings, range, defaultStory = 'body') {
  const tokens = value.trim().split(/[\s;+]+/);
  const comments = [];
  let story = defaultStory;
  for (const token of tokens) {
    const match = token.match(new RegExp(`^(?:(${STORY})\\.)?#?c?(\\d+)$`));
    if (!match) {
      warn(warnings, 'unknown-comment-id', `Unrecognized comment ID is preserved: ${token}`, range);
      comments.push({raw: token, known: false});
    } else {
      story = match[1] || story;
      comments.push({raw: token, known: true, id: `c${match[2]}`, index: Number(match[2]), story, canonicalId: `${story}:comment:${match[2]}`});
    }
  }
  return comments;
}

function parseCellGroups(value) {
  const flat = value.match(/^(p\d+(?:-p?\d+)?)\s+by\s+row$/i);
  if (flat) return {order: 'row', paragraphRange: paragraphRange(flat[1])};
  const groups = [];
  const pattern = /r(\d+)\s+((?:p\d+(?:-p?\d+)?(?:\s+|$))+)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(value))) {
    if (value.slice(cursor, match.index).trim()) return null;
    groups.push({row: Number(match[1]), paragraphRanges: match[2].trim().split(/\s+/).map(paragraphRange)});
    cursor = pattern.lastIndex;
  }
  return groups.length && !value.slice(cursor).trim() ? {order: 'row', rows: groups} : null;
}

function parseMerges(value) {
  const merges = [];
  const pattern = /t(\d+)\.(?:row|r)(\d+)\.(?:cell|c)(\d+)(?:\s+across\s+(\d+))?(?:\s+down\s+(\d+))?/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(value))) {
    if (value.slice(cursor, match.index).replace(/[;\s]+/g, '')) return null;
    if (!match[4] && !match[5]) return null;
    merges.push({raw: match[0], tableId: `t${match[1]}`, row: Number(match[2]), cell: Number(match[3]), across: Number(match[4] ?? 1), down: Number(match[5] ?? 1)});
    cursor = pattern.lastIndex;
  }
  return merges.length && !value.slice(cursor).trim() ? merges : null;
}

function parseClause(raw, context) {
  const {warnings, range, story} = context;
  let value = raw.trim();
  const base = {raw, value};
  const scoped = value.match(new RegExp(`^(.*?)\\s+in\\s+(${PARAGRAPH})$`));
  const scope = scoped ? paragraphIdentity(scoped[2]) : null;
  if (scope) value = scoped[1];
  const scopedBase = {...base, ...(scope ? {paragraphId: scope.id, scope} : {})};
  let match;
  if (ALIGNMENTS.includes(value)) return {...scopedBase, type: 'alignment', alignment: value};
  if ((match = value.match(/^(first-line|hanging|left|right)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+))in$/))) {
    return {...scopedBase, type: 'indent', kind: match[1], inches: Number(match[2])};
  }
  if ((match = value.match(/^num\s+"((?:[^"\\]|\\.)*)"$/s))) return {...scopedBase, type: 'numbering', label: decodeLabel(match[1]), encodedLabel: match[1]};
  if (value === 'bullet') return {...scopedBase, type: 'bullet'};
  if ((match = value.match(/^level\s+(\d+)$/))) return {...scopedBase, type: 'level', level: Number(match[1])};
  if (['page-break', 'section-break', 'empty'].includes(value)) return {...scopedBase, type: value};
  if ((match = value.match(/^(break-ins|break-del|fmt|rev)\s+(.+)$/s))) {
    return {...scopedBase, type: match[1], tagSource: match[2], tags: parseTags(match[2], scope?.story || story, warnings, range)};
  }
  if ((match = value.match(/^(comments|in)\s+(.+)$/s))) return {...scopedBase, type: match[1], comments: parseCommentIds(match[2], warnings, range, scope?.story || story)};
  if ((match = value.match(/^cells\s+(.+)$/s))) {
    const cells = parseCellGroups(match[1]);
    if (cells) return {...scopedBase, type: 'cells', ...cells};
  }
  if (/^header\s*row\s+repeats$/i.test(value)) return {...scopedBase, type: 'header-row', repeats: true};
  if ((match = value.match(/^merged\s+(?:cells\s+)?(.+)$/s))) {
    const merges = parseMerges(match[1]);
    if (merges) return {...scopedBase, type: 'merged', merges};
  }
  warn(warnings, 'unknown-directive-clause', `Unrecognized ID-line clause is preserved: ${raw.trim()}`, range);
  return {...base, type: 'unknown', known: false};
}

function looksLikeClause(value) {
  return /^(?:left|center|right|justify|first-line|hanging|num|bullet|level|page-break|section-break|break-ins|break-del|fmt|rev|comments|in|empty)(?:\s|$)/.test(value);
}

function normalizeDirective(directive) {
  const properties = {indents: {}, revisions: [], comments: [], openComments: [], unknown: []};
  const scoped = [];
  for (const clause of directive.clauses) {
    if (clause.paragraphId) { scoped.push(clause); continue; }
    switch (clause.type) {
      case 'alignment': properties.alignment = clause.alignment; break;
      case 'indent': properties.indents[clause.kind] = clause.inches; break;
      case 'numbering': properties.numbering = {kind: 'numbered', label: clause.label}; break;
      case 'bullet': properties.numbering = {kind: 'bullet'}; break;
      case 'level': properties.level = clause.level; break;
      case 'page-break': properties.pageBreak = true; break;
      case 'section-break': properties.sectionBreak = true; break;
      case 'empty': properties.empty = true; break;
      case 'break-ins': case 'break-del': case 'fmt': case 'rev': properties.revisions.push(clause); break;
      case 'comments': properties.comments.push(...clause.comments); break;
      case 'in': properties.openComments.push(...clause.comments); break;
      case 'cells': properties.cells = clause; break;
      case 'header-row': properties.headerRowRepeats = true; break;
      case 'merged': properties.merges = [...(properties.merges || []), ...clause.merges]; break;
      case 'unknown': properties.unknown.push(clause.raw); break;
    }
  }
  directive.properties = properties;
  directive.scopedClauses = scoped;
  // Convenient presentation aliases; clauses remain the lossless authority.
  Object.assign(directive, properties);
  return directive;
}

/** Parse one ID-line comment. `null` means it is ordinary literal content. */
export function parseDirective(raw, options = {}) {
  const warnings = options.warnings || [];
  const range = options.range || {start: options.offset || 0, end: (options.offset || 0) + raw.length};
  const inner = raw.replace(/^\s*<!--/, '').replace(/-->\s*$/, '').trim();
  const content = inner.replace(/\s*\r?\n\s*/g, ' ');
  const base = {raw, content: inner, range, start: range.start, end: range.end, clauses: []};
  let match;
  if ((match = content.match(/^page\s+(\d+)\s+of\s+(\d+)$/i))) {
    const page = Number(match[1]);
    const total = Number(match[2]);
    if (page < 1 || total < page) warn(warnings, 'invalid-page-marker', `Page marker ${page} of ${total} is inconsistent.`, range);
    return {...base, type: 'page', page, total, provenance: 'source-marker', layoutVerified: false};
  }
  match = content.match(new RegExp(`^((?:(${STORY})\\.)?p(\\d+))(?:-p(\\d+))?(?:(?:\\s*,\\s*|\\s+)([\\s\\S]*))?$`));
  if (match) {
    const id = match[1];
    const story = match[2] || 'body';
    const index = Number(match[3]);
    const endIndex = Number(match[4] ?? match[3]);
    const pieces = splitClauses(match[5] || '');
    let first = pieces.shift()?.trim() || '';
    let style = null;
    if (first && !looksLikeClause(first)) {
      const styleMatch = first.match(/^("(?:[^"\\]|\\.)*"|\S+)(?:\s+([\s\S]*))?$/);
      if (styleMatch) {
        style = styleMatch[1].startsWith('"') ? decodeLabel(styleMatch[1].slice(1, -1)) : styleMatch[1];
        first = styleMatch[2] || '';
      }
    }
    const directive = {...base, type: 'paragraph', id, story, index, endIndex, canonicalId: `${story}:p:${index}`, style};
    directive.clauses = [first, ...pieces].filter(value => value.trim()).map(value => parseClause(value, {warnings, range, story}));
    if (endIndex < index) warn(warnings, 'reversed-paragraph-range', `Paragraph range ${id}-p${endIndex} runs backwards.`, range);
    if (endIndex !== index && !directive.clauses.some(clause => clause.type === 'empty')) warn(warnings, 'paragraph-range-not-empty', 'Paragraph ID ranges are defined for empty paragraphs; this range is preserved.', range);
    return normalizeDirective(directive);
  }
  match = content.match(/^t(\d+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const pieces = splitClauses(match[2] || '');
  const first = pieces.shift()?.trim() || '';
  const dimensions = first.match(/^(?:(left|center|right|justify)\s+)?(\d+)\s*[x×]\s*(\d+)(?:\s+([\s\S]*))?$/i);
  const directive = {...base, type: 'table', id: `t${match[1]}`, story: 'body', index: Number(match[1]), canonicalId: `body:table:${match[1]}`};
  if (dimensions) {
    directive.rows = Number(dimensions[2]);
    directive.columns = Number(dimensions[3]);
    if (dimensions[1]) directive.clauses.push({type: 'alignment', raw: dimensions[1], value: dimensions[1], alignment: dimensions[1]});
    if (dimensions[4]) pieces.unshift(dimensions[4]);
    if (!directive.rows || !directive.columns) warn(warnings, 'invalid-table-dimensions', 'Table dimensions must be positive.', range);
  } else if (first) pieces.unshift(first);
  directive.clauses.push(...pieces.filter(value => value.trim()).map(value => parseClause(value, {warnings, range, story: 'body'})));
  return normalizeDirective(directive);
}

function parsePage(raw, warnings, path = 'page', inherited = false) {
  const page = {raw: raw ?? null, size: 'Letter', orientation: 'portrait', widthIn: 8.5, heightIn: 11, margins: {top: 1, right: 1, bottom: 1, left: 1}, headerIn: 0.5, footerIn: 0.5, clauses: [], unknown: [], origin: raw == null ? (inherited ? 'source-document' : 'default') : 'header'};
  if (raw == null) return page;
  if (typeof raw !== 'string') {
    page.unknown.push(raw);
    warn(warnings, 'unsupported-page-value', `${path} must be a Jubarte page legend string; its original value is preserved.`, undefined, raw);
    return page;
  }
  for (const original of splitClauses(raw)) {
    const value = original.trim();
    let match;
    let clause;
    if ((match = value.match(/^(Letter|A4)(?:\s+(portrait|landscape))?$/i))) {
      page.size = match[1].toLowerCase() === 'a4' ? 'A4' : 'Letter';
      if (match[2]) page.orientation = match[2].toLowerCase();
      clause = {type: 'size', size: page.size, orientation: page.orientation};
    } else if (/^(portrait|landscape)$/i.test(value)) {
      page.orientation = value.toLowerCase(); clause = {type: 'orientation', orientation: page.orientation};
    } else if ((match = value.match(/^margins\s+((?:\d+(?:\.\d*)?|\.\d+))in$/i))) {
      const inches = Number(match[1]);
      page.margins = {top: inches, right: inches, bottom: inches, left: inches}; clause = {type: 'margins', inches};
    } else if ((match = value.match(/^(top|bottom|left|right)(?:\s+margin)?\s+((?:\d+(?:\.\d*)?|\.\d+))in$/i))) {
      page.margins[match[1].toLowerCase()] = Number(match[2]); clause = {type: 'margin', edge: match[1].toLowerCase(), inches: Number(match[2])};
    } else if ((match = value.match(/^(header\/footer|header|footer)\s+((?:\d+(?:\.\d*)?|\.\d+))in$/i))) {
      if (match[1].toLowerCase().includes('header')) page.headerIn = Number(match[2]);
      if (match[1].toLowerCase().includes('footer')) page.footerIn = Number(match[2]);
      clause = {type: 'distance', target: match[1].toLowerCase(), inches: Number(match[2])};
    } else {
      page.unknown.push(original);
      clause = {type: 'unknown'};
      warn(warnings, 'unknown-page-clause', `Unrecognized ${path} clause is preserved: ${value}`);
    }
    page.clauses.push({raw: original, ...clause});
  }
  const sizes = page.size === 'A4' ? [210 / 25.4, 297 / 25.4] : [8.5, 11];
  [page.widthIn, page.heightIn] = page.orientation === 'landscape' ? sizes.reverse() : sizes;
  return page;
}

function parseStyle(raw, key, warnings) {
  const style = {raw, key, styleId: /^#{1,6}$/.test(key) ? `Heading${key.length}` : key === 'table' ? 'TableGrid' : key, clauses: [], unknown: []};
  if (typeof raw !== 'string') {
    style.unknown.push(raw);
    warn(warnings, 'unsupported-style-value', `Style ${key} must be a legend string; its original value is preserved.`);
    return style;
  }
  const segments = splitClauses(raw);
  for (let i = 0; i < segments.length; i++) {
    const original = segments[i];
    const value = original.trim();
    let match;
    let clause;
    if (ALIGNMENTS.includes(value)) { style.alignment = value; clause = {type: 'alignment', alignment: value}; }
    else if ((match = value.match(/^(before|after)\s+((?:\d+(?:\.\d*)?|\.\d+))pt$/))) { style[`${match[1]}Pt`] = Number(match[2]); clause = {type: 'spacing', side: match[1], points: Number(match[2])}; }
    else if ((match = value.match(/^line\s+((?:\d+(?:\.\d*)?|\.\d+))$/))) { style.lineHeight = Number(match[1]); clause = {type: 'line-height', multiple: Number(match[1])}; }
    else if (['keep-next', 'keep-lines', 'page-break-before'].includes(value)) { style[value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true; clause = {type: value}; }
    else if ((match = value.match(/^all borders\s+((?:\d+(?:\.\d*)?|\.\d+))pt$/))) { style.borders = {allPt: Number(match[1])}; clause = {type: 'borders', points: Number(match[1])}; }
    else if ((match = value.match(/^(.*?)\s+((?:\d+(?:\.\d*)?|\.\d+))pt$/))) {
      const fontWords = match[1].split(/\s+/);
      const marks = fontWords.filter(word => ['bold', 'italic', 'underline', 'strike'].includes(word));
      const family = fontWords.filter(word => !marks.includes(word)).join(' ');
      if (family) style.fontFamily = family;
      style.fontSizePt = Number(match[2]);
      for (const mark of marks) style[mark] = true;
      clause = {type: 'font', fontFamily: family, fontSizePt: style.fontSizePt, marks};
    } else if (i === 0 && !/\s/.test(value) && value) { style.styleId = value; clause = {type: 'style-id', styleId: value}; }
    else {
      style.unknown.push(original); clause = {type: 'unknown'};
      warn(warnings, 'unknown-style-clause', `Unrecognized style ${key} clause is preserved: ${value}`);
    }
    style.clauses.push({raw: original, ...clause});
  }
  return style;
}

function parseStories(raw, warnings, path) {
  if (raw == null) return {};
  if (!mapping(raw)) {
    warn(warnings, 'unsupported-story-value', `${path} must be a mapping; its original value is preserved.`);
    return {unparsed: {raw, unknown: true}};
  }
  return Object.fromEntries(Object.entries(raw).map(([kind, value]) => {
    if (value === 'none' || value === null) return [kind, {raw: value, none: true, kind, fields: []}];
    if (!mapping(value)) {
      warn(warnings, 'unsupported-story-entry', `${path}.${kind} must be 'none' or a mapping; its original value is preserved.`);
      return [kind, {raw: value, kind, unknown: true, fields: []}];
    }
    const result = {raw: value, kind, id: value.id ?? null, text: value.text ?? '', alignment: value.alignment ?? value.align ?? ALIGNMENTS.find(align => own(value, align)) ?? 'left', inactive: own(value, 'inactive') ? value.inactive !== false : false, fields: [], unknown: {}};
    if (typeof result.text === 'string') result.fields = [...result.text.matchAll(/\{(PAGE|NUMPAGES|DATE)\}/g)].map(match => ({type: match[1], raw: match[0], start: match.index, end: match.index + match[0].length}));
    for (const [field, fieldValue] of Object.entries(value)) {
      if (!['id', 'text', 'alignment', 'align', 'inactive', ...ALIGNMENTS].includes(field)) {
        setOwn(result.unknown, field, fieldValue);
        warn(warnings, 'unknown-story-field', `Unrecognized ${path}.${kind} field is preserved: ${field}`);
      }
    }
    return [kind, result];
  }));
}

function parseSections(raw, warnings, source) {
  if (raw == null) return {};
  if (!mapping(raw)) { warn(warnings, 'unsupported-sections-value', 'sections must be a mapping; its original value is preserved.'); return {unparsed: {raw}}; }
  return Object.fromEntries(Object.entries(raw).map(([id, value]) => {
    const section = {id, raw: value, paragraphRanges: [], unknown: {}};
    if (!mapping(value)) { warn(warnings, 'unsupported-section-value', `Section ${id} must be a mapping; its original value is preserved.`); return [id, section]; }
    for (const [key, entry] of Object.entries(value)) {
      const range = paragraphRange(key);
      if (range && entry === null) section.paragraphRanges.push(range);
      else if (key === 'page') section.page = parsePage(entry, warnings, `sections.${id}.page`, !!source);
      else if (key === 'headers' || key === 'footers') section[key] = parseStories(entry, warnings, `sections.${id}.${key}`);
      else if (key === 'range' && typeof entry === 'string' && paragraphRange(entry)) section.paragraphRanges.push(paragraphRange(entry));
      else { setOwn(section.unknown, key, entry); warn(warnings, 'unknown-section-field', `Unrecognized section ${id} field is preserved: ${key}`); }
    }
    return [id, section];
  }));
}

function readAuthors(raw, yamlDocument, warnings) {
  if (raw == null) return {};
  if (!mapping(raw)) { warn(warnings, 'unsupported-authors-value', 'authors must be a mapping; its original value is preserved.'); return {}; }
  return Object.fromEntries(Object.entries(raw).map(([handle, value]) => {
    const node = yamlDocument?.getIn(['authors', handle], true);
    const comment = node?.comment?.trim() || '';
    const name = typeof value === 'string' ? value : mapping(value) ? value.name ?? handle : String(value);
    const dates = [...new Set((comment.match(DATE_PATTERN) || []).concat(mapping(value) && value.date ? String(value.date) : []))];
    return [handle, {handle, name, raw: value, comment, documentOwner: handle === 'document_owner', timestamps: dates, singleTimestamp: dates.length === 1 ? dates[0] : null}];
  }));
}

function normalizeMetadata(data, yamlDocument, options, warnings, agentView) {
  const source = typeof data.source === 'string' ? data.source : null;
  const authorDetails = readAuthors(data.authors, yamlDocument, warnings);
  const eligibleAuthors = Object.values(authorDetails).filter(author => !author.documentOwner);
  const selectedAuthor = eligibleAuthors.length === 1 ? eligibleAuthors[0] : null;
  const nowValue = options.conversionTime ?? options.now ?? new Date().toISOString();
  const validDate = new Date(nowValue);
  const conversionTime = Number.isNaN(validDate.getTime()) ? null : validDate.toISOString();
  const defaultDate = options.date ?? selectedAuthor?.singleTimestamp ?? conversionTime;
  const defaultAuthor = options.author ?? options.planAuthor ?? selectedAuthor?.name ?? 'Modified User';
  const dateSource = options.date ? 'option' : selectedAuthor?.singleTimestamp ? 'author' : 'conversion-time';
  const unknown = Object.fromEntries(Object.entries(data).filter(([key]) => !KNOWN_HEADER_KEYS.has(key)));
  for (const key of Object.keys(unknown)) warn(warnings, 'unknown-frontmatter-key', `Unrecognized YAML field is preserved: ${key}`);
  if (agentView && dateSource === 'conversion-time') warn(warnings, 'missing-revision-date', 'A revision without its own or its author’s single timestamp falls back to the conversion time in UTC.');
  if (!conversionTime) warn(warnings, 'invalid-conversion-time', 'The supplied conversion time is invalid; the unresolved date is preserved.');
  const styles = {Normal: {raw: null, key: 'Normal', styleId: 'Normal', fontFamily: 'Calibri', fontSizePt: 11, clauses: [], unknown: [], origin: source ? 'source-document' : 'default'}};
  if (data.styles != null && !mapping(data.styles)) warn(warnings, 'unsupported-styles-value', 'styles must be a mapping; its original value is preserved.');
  else for (const [key, value] of Object.entries(data.styles || {})) setOwn(styles, key, {...(key === 'Normal' ? styles.Normal : {}), ...parseStyle(value, key, warnings), origin: 'header'});
  return {
    ...data,
    raw: data,
    source,
    page: parsePage(data.page, warnings, 'page', !!source),
    styles,
    headers: parseStories(data.headers, warnings, 'headers'),
    footers: parseStories(data.footers, warnings, 'footers'),
    sections: parseSections(data.sections, warnings, source),
    authors: mapping(data.authors) ? data.authors : {},
    authorDetails,
    defaults: {
      documentOwner: authorDetails.document_owner?.name ?? 'Original User',
      author: defaultAuthor,
      authorHandle: options.author || options.planAuthor ? eligibleAuthors.find(author => author.name === defaultAuthor)?.handle ?? null : selectedAuthor?.handle ?? null,
      date: defaultDate,
      dateSource,
      conversionTime,
      inheritedFromSource: !!source,
      resolutionOrder: ['source-by-id', 'note-author-and-timestamp', 'author-single-timestamp', 'sole-non-owner-author', 'Modified User'],
      missingDatePolicy: 'conversion-time-UTC-with-warning',
    },
    sourceContract: {path: source, inheritUnspecifiedById: !!source, sourceLoaded: false},
    unknown,
    capabilities: {metadataParsed: true, sourceDocumentLoaded: false, docxGenerated: false, layoutCalculated: false},
  };
}

function assertAcyclic(value, active = new Set(), completed = new Set()) {
  if (value === null || typeof value !== 'object' || completed.has(value)) return;
  if (active.has(value)) throw new Error('Recursive YAML aliases are not supported; the source is left literal.');
  active.add(value);
  for (const child of Object.values(value)) assertAcyclic(child, active, completed);
  active.delete(value);
  completed.add(value);
}

function frontmatterAtStart(source, warnings) {
  const opening = source.match(/^(?:\uFEFF)?---[ \t]*\r?\n/);
  if (!opening) return null;
  const closingPattern = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  closingPattern.lastIndex = opening[0].length;
  const closing = closingPattern.exec(source);
  if (!closing) {
    warn(warnings, 'unclosed-frontmatter', 'An opening YAML fence has no closing fence; the source is left literal.');
    return null;
  }
  const range = {start: 0, end: closing.index + closing[0].length};
  const yaml = source.slice(opening[0].length, closing.index);
  let document;
  let data;
  let valid = true;
  try {
    document = YAML.parseDocument(yaml, {keepSourceTokens: true, uniqueKeys: true, prettyErrors: false});
    for (const problem of [...document.errors, ...document.warnings]) {
      const position = problem.pos ? {start: opening[0].length + problem.pos[0], end: opening[0].length + problem.pos[1]} : range;
      warn(warnings, document.errors.includes(problem) ? 'yaml-error' : 'yaml-warning', problem.message, position);
    }
    valid = document.errors.length === 0;
    if (valid) { data = document.toJS({maxAliasCount: 50}); assertAcyclic(data); }
    if (data == null) data = {};
    if (valid && !mapping(data)) {
      valid = false;
      warn(warnings, 'frontmatter-not-mapping', 'YAML frontmatter must be a mapping; the source is left literal.', range);
    }
  } catch (error) {
    valid = false;
    warn(warnings, 'yaml-error', `YAML frontmatter could not be read: ${error.message}`, range);
  }
  return {raw: source.slice(0, range.end), yaml, range, data: valid ? data : null, valid, document};
}

function fencedCodeRanges(body) {
  const ranges=[];
  const visit=node=>{if(node.type==='code')ranges.push({start:node.position.start.offset,end:node.position.end.offset});else for(const child of node.children||[])visit(child);};
  visit(fromMarkdown(body));
  return ranges;
}

/**
 * Parse YAML in any header. Interpret ID lines only when YAML contains `view:`.
 * Removed syntax is padded rather than trimmed so downstream source positions
 * still refer to the user's original document. Invalid YAML stays literal.
 */
export function parseDocumentMetadata(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('parseDocumentMetadata expects a string');
  const warnings = [];
  const parsedFrontmatter = frontmatterAtStart(source, warnings);
  const data = parsedFrontmatter?.valid ? parsedFrontmatter.data : {};
  const agentView = !!parsedFrontmatter?.valid && own(data, 'view');
  const metadata = normalizeMetadata(data, parsedFrontmatter?.document, options, warnings, agentView);
  let body = parsedFrontmatter?.valid ? blank(parsedFrontmatter.raw) + source.slice(parsedFrontmatter.range.end) : source;
  const directives = [];
  if (agentView) {
    const codeRanges = fencedCodeRanges(body);
    const commentPattern = /^ {0,3}<!--(?:(?!-->)[\s\S])*-->[ \t]*(?=\r?$)/gm;
    const replacements = [];
    for (const match of body.matchAll(commentPattern)) {
      const range = {start: match.index, end: match.index + match[0].length};
      if (codeRanges.some(code => range.start >= code.start && range.start < code.end)) continue;
      const directive = parseDirective(match[0], {range, warnings});
      if (!directive) continue;
      directives.push(directive);
      replacements.push(range);
    }
    const duplicates=duplicateDirectiveFlags(directives);
    duplicates.forEach((duplicate,i)=>{if(duplicate)warn(warnings,'duplicate-directive-id',`Repeated or overlapping ID ${directives[i].id} is preserved.`,replacements[i]);});
    const chunks=[];let cursor=0;
    for(const {start,end} of replacements){chunks.push(body.slice(cursor,start),blank(body.slice(start,end)));cursor=end;}
    chunks.push(body.slice(cursor));body=chunks.join('');
  }
  const frontmatter = parsedFrontmatter ? Object.fromEntries(Object.entries(parsedFrontmatter).filter(([key]) => key !== 'document')) : null;
  return {body, frontmatter, metadata, directives, warnings, agentView};
}

/** Offline coordinate compression keeps interval duplicate checks O(n log n). */
export function duplicateDirectiveFlags(items) {
 const stories=new Map(), tables=new Set();
 for(const d of items)if(d.type==='paragraph'){
  if(!stories.has(d.story))stories.set(d.story,{starts:[],tree:[]});
  stories.get(d.story).starts.push(d.index);
 }
 for(const state of stories.values()){
  state.starts=[...new Set(state.starts)].sort((a,b)=>a-b);
  state.tree=Array(state.starts.length+1).fill(-Infinity);
 }
 const bound=(xs,x,inclusive)=>{let lo=0,hi=xs.length;while(lo<hi){const mid=(lo+hi)>>>1;if(xs[mid]<x||(inclusive&&xs[mid]===x))lo=mid+1;else hi=mid;}return lo;};
 return items.map(d=>{
  if(d.type==='table'){const duplicate=tables.has(d.id);tables.add(d.id);return duplicate;}
  if(d.type!=='paragraph')return false;
  const {starts,tree}=stories.get(d.story), start=d.index, end=d.endIndex;
  let max=-Infinity;
  for(let i=bound(starts,end,true);i>0;i-=i&-i)max=Math.max(max,tree[i]);
  for(let i=bound(starts,start,false)+1;i<tree.length;i+=i&-i)tree[i]=Math.max(tree[i],end);
  return max>=start;
 });
}
