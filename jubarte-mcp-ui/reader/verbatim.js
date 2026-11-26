// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Where Markdown reads literally, so CriticMarkup opens nothing: a port of
 * the engine's scanner (crates/jubarte-markdown/src/markdown/critic.rs,
 * `Literal::new`, `code_span_end`, `destination_ends`, `autolink_end`,
 * `definition_destination`). Code spans, link destinations, autolinks and
 * reference definitions are found here; indented code blocks, which the
 * engine asks pulldown-cmark for, come from the caller (`indented`).
 * Fenced code and the YAML front matter are not verbatim: changes still
 * mark there. Offsets are UTF-16 code units; every delimiter is ASCII.
 */

// Rust's `char::is_whitespace` (Unicode White_Space), which `trim` uses.
const WHITE = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const LEADING = new RegExp(`^[${WHITE}]+`), TRAILING = new RegExp(`[${WHITE}]+$`), SPACE = new RegExp(`[${WHITE}<>]`);
const trim = (s) => s.replace(LEADING, '').replace(TRAILING, '');
/** UTF-8 length: the engine measures an indent in bytes. */
const bytes = (s) => new TextEncoder().encode(s).length;

const escaped = (s, at) => {
  let n = 0;
  while (at > 0 && s[--at] === '\\') n++;
  return n % 2 === 1;
};

function codeSpanEnd(s, at) {
  let width = 0;
  while (s[at + width] === '`') width++;
  let i = at + width;
  while (i < s.length) {
    if (s[i] === '`') {
      let run = 0;
      while (s[i + run] === '`') run++;
      if (run === width) return i + run;
      i += run;
    } else if (s.startsWith('\n\n', i)) return null;
    else i++;
  }
  return null;
}

function definitionDestination(line) {
  const indent = line.length - line.replace(/^ +/, '').length;
  if (indent > 3 || line[indent] !== '[' || line[indent + 1] === '^') return null;
  const label = line.slice(indent + 1);
  for (let i = 0; i < label.length; i++) {
    const c = label[i];
    if (c === '\\') i++;
    else if (c === '[') return null;
    else if (c === ']') return i > 0 && label[i + 1] === ':' ? indent + 1 + i + 2 : null;
  }
  return null;
}

function destinationEnds(s) {
  const ends = new Map();
  let lineStart = 0;
  for (const line of s.split('\n')) {
    const levels = [], starts = [];
    let level = 0, backslashes = 0, bracket = false, opened = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], at = lineStart + i;
      if (opened) starts.push(at);
      const free = backslashes % 2 === 0, before = level;
      if (free) { if (c === '(') level++; else if (c === ')') level--; }
      opened = bracket && c === '(';
      bracket = free && c === ']';
      backslashes = c === '\\' ? backslashes + 1 : 0;
      levels.push([at, before, level]);
    }
    const nearest = new Map();
    let next = starts.length - 1;
    for (let k = levels.length - 1; k >= 0; k--) {
      const [at, before, after] = levels[k];
      nearest.set(after, at);
      if (next >= 0 && starts[next] === at) {
        next--;
        const end = nearest.get(before - 1);
        if (end !== undefined) ends.set(at, end);
      }
    }
    lineStart += line.length + 1;
  }
  return ends;
}

function autolinkEnd(s, at) {
  const rest = s.slice(at + 1, at + 1 + 4096);
  const scheme = rest.match(/^[A-Za-z0-9+.-]*/)[0].length;
  if (scheme < 2 || scheme > 32 || rest[scheme] !== ':') return null;
  const close = rest.search(SPACE);
  return close >= 0 && rest[close] === '>' ? at + 1 + close + 1 : null;
}

/** Sorted, disjoint `[start, end)` ranges of `s` that open nothing. */
export function verbatimRanges(s, indented = []) {
  return scan(s, indented).verbatim;
}

/** The fenced code blocks of `s`, front matter aside (`in_code_fence`):
 * where the reader's fence escapes are unwound. */
export function codeFences(s) {
  return scan(s, []).fences;
}

function scan(s, indented) {
  const verbatim = [], fences = [];
  const destinations = destinationEnds(s);
  let fence = null, canDefine = true, lineStart = 0;
  if (s.startsWith('---\n') || s.startsWith('---\r\n')) {
    let end = s.indexOf('\n') + 1;
    while (end < s.length) {
      const lineEnd = s.indexOf('\n', end) < 0 ? s.length : s.indexOf('\n', end);
      const closes = ['---', '...'].includes(s.slice(end, lineEnd).trimEnd());
      end = Math.min(lineEnd + 1, s.length);
      if (closes) { lineStart = end; break; }
    }
  }
  let at = lineStart;
  while (at < s.length) {
    if (at === lineStart) {
      const lineEnd = s.indexOf('\n', at) < 0 ? s.length : s.indexOf('\n', at);
      const line = s.slice(at, lineEnd);
      const lead = line.length - line.replace(LEADING, '').length, indent = bytes(line.slice(0, lead));
      const run = (b) => { let n = 0; while (line[lead + n] === b) n++; return n; };
      if (fence) {
        if (indent < 4 && run(fence.b) >= fence.width && !trim(line.slice(lead + run(fence.b)))) {
          fences.push([fence.start, lineEnd]);
          fence = null;
        }
        canDefine = true;
        at = lineEnd + 1;
        lineStart = at;
        continue;
      }
      for (const b of '`~') {
        const width = run(b), info = line.slice(lead + width);
        if (indent < 4 && width >= 3 && !(b === '`' && info.includes('`'))) fence = { b, width, start: at };
      }
      const destination = canDefine ? definitionDestination(line) : null;
      canDefine = !!fence || destination !== null || !trim(line) || line.replace(LEADING, '').startsWith('#');
      if (destination !== null) verbatim.push([at + destination, lineEnd]);
      if (fence || destination !== null) {
        at = lineEnd + 1;
        lineStart = at;
        continue;
      }
    }
    const from = at;
    let end = null;
    if (s[at] === '`' && !escaped(s, at)) end = codeSpanEnd(s, at);
    else if (s[at] === '(' && at > 0 && s[at - 1] === ']' && !escaped(s, at - 1)) end = destinations.get(at + 1) ?? null;
    else if (s[at] === '<' && !escaped(s, at)) end = autolinkEnd(s, at);
    if (end !== null) {
      verbatim.push([at, end]);
      at = end;
    } else if (s[at] === '`') while (s[at] === '`') at++;
    else at++;
    // Only the span just consumed can hold a new line start.
    for (let i = at - 1; i >= from; i--) if (s[i] === '\n') { lineStart = i + 1; break; }
  }
  if (fence) fences.push([fence.start, s.length]);
  return { verbatim: [...verbatim, ...indented].sort((a, b) => a[0] - b[0]), fences };
}

const OPENER = ['++', '--', '~~', '>>', '=='];
const CLOSER = ['++', '--', '~~', '<<', '=='];

/**
 * The reader's fence escape at `at`, if one sits there (critic.rs
 * `fence_escape_at`): `{ text, length }`. A delimiter shape with an odd
 * backslash run at its break point names the run halved and the delimiter
 * as text; an even run cannot come from the reader and stays as written.
 * `tagWidth(s, at)` is the width of a complete attribution tag at `at`.
 */
export function fenceEscapeAt(s, at, tagWidth = () => null) {
  if (s[at] === '\\') {
    let run = 0;
    while (s[at + run] === '\\') run++;
    const width = tagWidth(s, at + run);
    if (width) {
      const kept = run % 2 === 1 ? (run - 1) / 2 : run;
      return { text: '\\'.repeat(kept) + s.slice(at + run, at + run + width), length: run + width };
    }
  }
  const shape = (head, tails) => {
    let run = at + head;
    while (s[run] === '\\') run++;
    const tail = tails.find((t) => s.startsWith(t, run));
    return tail === undefined ? null : [head, run - (at + head), tail.length];
  };
  const found = s[at] === '{' ? shape(1, OPENER)
    : CLOSER.some((h) => s.startsWith(h, at)) ? shape(2, ['}'])
    : s[at] === '~' ? shape(1, ['>'])
    : null;
  if (!found || found[1] === 0) return null;
  const [head, run, tail] = found, whole = head + run + tail;
  if (run % 2 === 0) return { text: s.slice(at, at + whole), length: whole };
  return { text: s.slice(at, at + head) + '\\'.repeat((run - 1) / 2) + s.slice(at + head + run, at + whole), length: whole };
}

/** `at`'s verbatim range end, or null: a lookup over `verbatimRanges`. */
export function verbatimEnd(ranges) {
  return (at) => {
    let lo = 0, hi = ranges.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (ranges[mid][1] <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo < ranges.length && ranges[lo][0] <= at ? ranges[lo][1] : null;
  };
}
