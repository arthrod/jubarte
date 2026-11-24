// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/**
 * The engine's attribution grammar, read exactly as jubarte reads it, so
 * the card never takes document text for a tag nor shows a tag as text:
 *
 * - the brace: crates/jubarte-markdown/src/markdown/critic.rs
 *   `attribution_tag`, `recognized_note`, `note_without_move`,
 *   `part_without_move`;
 * - the notes: view_notes.rs `revision_tags`, `nested_revision_tags`,
 *   `plain_revision(s)`, `nested_plain_revisions`, `nested_parts`,
 *   `trailing_bare_group`; write.rs `is_date`, `named`, `unescaped`;
 * - the ids: crates/jubarte-dom/src/ids.rs `parse_change_ids`, `number`,
 *   ids/short.rs `change_of`, `part_stem`; util/datetime.rs
 *   `parse_datetime`.
 *
 * tags.test.mjs holds the cases checked against the engine itself.
 */

const PARTS = ['footnotes', 'endnotes', 'comments', 'styles', 'numbering'];
const U32 = 0xffffffff;

/** Odd backslashes before `at`. */
function escaped(source, at) {
  let count = 0;
  while (at > 0 && source[--at] === '\\') count++;
  return count % 2 === 1;
}

const allDigits = (text) => text.length > 0 && /^[0-9]+$/.test(text);

/** ASCII digits without a leading zero, as a u32; null otherwise. */
function number(text) {
  if (!allDigits(text) || (text !== '0' && text.startsWith('0'))) return null;
  const value = Number(text);
  return value <= U32 ? value : null;
}

function partStem(head) {
  return PARTS.includes(head) || ['header', 'footer'].some((p) => head.startsWith(p) && number(head.slice(p.length)) !== null);
}

/** `r12`, `r1+2`, `r1+r2`, `header1.r3`: the story (null for the body) and w:ids. */
function changeOf(token) {
  if (token.includes('-')) return null; // a `FIRST-N` range, never a change
  const dot = token.lastIndexOf('.');
  let story = null;
  let rest = token;
  if (dot >= 0) {
    story = token.slice(0, dot);
    if (!partStem(story)) return null;
    rest = token.slice(dot + 1);
  }
  if (!rest.startsWith('r')) return null;
  const members = rest.slice(1).split('+');
  const wids = [];
  for (const [index, member] of members.entries()) {
    const value = number(index > 0 && member.startsWith('r') ? member.slice(1) : member);
    if (value === null) return null;
    wids.push(String(value));
  }
  return { story, wids };
}

/**
 * The changes a change id names, each `{ story, wid }` (story null: the
 * view's own story); null when the token is no change id. A colon long id
 * (`header.a:rev:7`, `body:rev:007`) is accepted only when the change has
 * no short spelling, as the engine prints it.
 */
export function parseChangeIds(token) {
  const at = token.indexOf(':rev:');
  if (at >= 0) {
    const story = token.slice(0, at);
    const wid = token.slice(at + ':rev:'.length);
    if (!story || story.includes(':')) return null;
    const short = story === 'body' ? `r${wid}` : `${story}.r${wid}`;
    const back = changeOf(short);
    const hasShort = back && back.wids.length === 1 && back.wids[0] === wid;
    return hasShort ? null : [{ story, wid }];
  }
  const change = changeOf(token);
  return change ? change.wids.map((wid) => ({ story: change.story, wid })) : null;
}

function idOk(id) {
  return !/^[0-9]/.test(id) && !id.startsWith('#') && (id === 'noid' || id.endsWith('.noid') || parseChangeIds(id) !== null);
}

function idsOf(id) {
  return parseChangeIds(id) ?? [];
}

/** util/datetime.rs parse_datetime: a real date and time and a ±14:00 zone. */
function parseDatetime(value) {
  const shape = value.length >= 19 && value[4] === '-' && value[7] === '-' && value[10] === 'T' && value[13] === ':' && value[16] === ':';
  if (!shape) return false;
  const field = (from, to) => (allDigits(value.slice(from, to)) ? Number(value.slice(from, to)) : null);
  const [year, month, day, hour, minute, second] = [field(0, 4), field(5, 7), field(8, 10), field(11, 13), field(14, 16), field(17, 19)];
  if ([year, month, day, hour, minute, second].includes(null)) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : month >= 1 && month <= 12 ? 31 : 0;
  let rest = value.slice(19);
  if (rest.startsWith('.')) {
    const n = rest.slice(1).match(/^[0-9]*/)[0].length;
    if (n === 0) return false;
    rest = rest.slice(1 + n);
  }
  let zone = false;
  if (rest === '' || rest === 'Z') zone = true;
  else if (/^[+-][0-9]{2}:[0-9]{2}$/.test(rest)) {
    const hours = Number(rest.slice(1, 3));
    const minutes = Number(rest.slice(4, 6));
    zone = minutes <= 59 && hours * 60 + minutes <= 14 * 60;
  }
  return year >= 1 && day >= 1 && day <= days && hour <= 23 && minute <= 59 && second <= 59 && zone;
}

/** write.rs is_date: `YYYY-MM-DDTHH:MM[:SS[.f]][Z|±HH:MM]`, in range. */
export function isDate(text) {
  const t = text.indexOf('T');
  if (t < 0) return false;
  const dayText = text.slice(0, t);
  const time = text.slice(t + 1);
  const day = dayText.split('-');
  if (day.length !== 3 || day[0].length !== 4 || day[1].length !== 2 || day[2].length !== 2 || !day.every(allDigits)) return false;
  const z = time.search(/[Z+-]/);
  const clockText = z < 0 ? time : time.slice(0, z);
  const zone = z < 0 ? '' : time.slice(z);
  let zoneOk = zone === '' || zone === 'Z';
  if (!zoneOk) {
    const offset = zone.slice(1);
    zoneOk = offset.length === 5 && offset[2] === ':' && allDigits(offset.slice(0, 2)) && allDigits(offset.slice(3));
  }
  const clock = clockText.split(':');
  let secondsOk = true;
  if (clock.length > 2) {
    const dot = clock[2].indexOf('.');
    const whole = dot < 0 ? clock[2] : clock[2].slice(0, dot);
    const fraction = dot < 0 ? '0' : clock[2].slice(dot + 1);
    secondsOk = whole.length === 2 && allDigits(whole) && allDigits(fraction);
  }
  const shaped = zoneOk && clock.length >= 2 && clock.length <= 3 && clock.slice(0, 2).every((p) => p.length === 2 && allDigits(p)) && secondsOk;
  return shaped && parseDatetime(`${dayText}T${clockText}${clock.length === 2 ? ':00' : ''}${zone}`);
}

/** Letters and digits, or `??` (a mark with no author). */
const isHandle = (text) => text === '??' || /^[\p{Alphabetic}\p{N}]+$/u.test(text);

/** `r1+2 @AC` or `r1 @AC; r2 @JD 2026-…`: each tag, or null. */
function revisionTags(text) {
  const tags = [];
  for (const tag of text.trim().split('; ')) {
    const words = tag.split(' ');
    const [id, at, date] = words;
    if (at === undefined || !at.startsWith('@') || words.length > 3) return null;
    const handle = at.slice(1);
    if (!isHandle(handle) || !idOk(id) || (date !== undefined && !isDate(date))) return null;
    tags.push({ kind: 'handle', handle, ...(date !== undefined ? { date } : {}), ids: idsOf(id) });
  }
  return tags;
}

function oneTag(part) {
  const tags = revisionTags(part);
  return tags?.length === 1 ? tags[0] : null;
}

/** The parts of a note joined by ` re `; the last split that parses wins. */
function nestedParts(text, one, memo = new Map()) {
  text = text.trim();
  if (memo.has(text)) return memo.get(text);
  let result = null;
  let from = text.length;
  for (;;) {
    const at = text.slice(0, from).lastIndexOf(' re ');
    if (at < 0) break;
    from = at;
    const head = one(text.slice(0, at).trim());
    if (head) {
      const rest = nestedParts(text.slice(at + ' re '.length), one, memo);
      if (rest) {
        result = [head, ...rest];
        break;
      }
    }
  }
  if (!result) {
    const last = one(text);
    result = last ? [last] : null;
  }
  memo.set(text, result);
  return result;
}

function nestedRevisionTags(text) {
  const tags = nestedParts(text, oneTag);
  return tags && tags.length > 1 ? tags : null;
}

/** Percent-spelled `%20`, `%25`, `%28`, `%29`, `%5C` read back. */
function unescaped(name) {
  const spelled = { '20': ' ', '25': '%', '28': '(', '29': ')', '5C': '\\', '5c': '\\' };
  return name.replace(/%(..)?/g, (match, code) => (code !== undefined && code in spelled ? spelled[code] : match.length === 3 ? `%${code}` : '%'));
}

/** `Name (date)` or `(date)` and what follows; null when no date group fits. */
function named(text) {
  let from = 0;
  for (;;) {
    const open = text.indexOf('(', from);
    if (open < 0) return null;
    from = open + 1;
    const close = text.indexOf(')', open);
    if (close < 0) continue;
    const date = text.slice(open + 1, close);
    if (!isDate(date)) continue;
    const name = text.slice(0, open);
    let author;
    if (name.trim() === '') {
      if (name !== '') return null;
      author = null;
    } else if (name.endsWith(' ')) author = unescaped(name.trim());
    else continue;
    let depth = 0;
    let unbalanced = false;
    for (const c of name) {
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth < 0) unbalanced = true;
      }
    }
    if (unbalanced || depth !== 0) return null;
    return { author, date, rest: text.slice(close + 1) };
  }
}

/** The plain view's note: `r5 Ana (date)`, `r1+2 (date)`, `r7 Di Eng`, `r7`. */
function plainRevision(text) {
  text = text.trim();
  const space = text.indexOf(' ');
  const id = space < 0 ? text : text.slice(0, space);
  const rest = space < 0 ? '' : text.slice(space + 1);
  if (!idOk(id)) return null;
  let author;
  let date;
  const name = named(rest);
  if (name) {
    if (name.rest !== '') return null;
    author = name.author ?? '';
    date = name.date;
  } else {
    if (/[:()]/.test(rest) || rest.startsWith('@')) return null;
    author = unescaped(rest.trim());
  }
  return { kind: 'plain', author, ...(date ? { date } : {}), ids: idsOf(id) };
}

function plainRevisions(text) {
  const parts = text.split('; ').map(plainRevision);
  if (parts.every(Boolean)) return parts;
  const one = plainRevision(text);
  return one ? [one] : null;
}

/** Where the final bare parenthesised group of `text` opens. */
function trailingBareGroup(text) {
  if (!text.endsWith(')')) return null;
  let isEscaped = false;
  let depth = 0;
  let open = null;
  for (let at = 0; at < text.length; at++) {
    const c = text[at];
    if (c === '\\') isEscaped = !isEscaped;
    else if (c === '(' && !isEscaped) {
      if (depth === 0) open = at;
      depth++;
      isEscaped = false;
    } else if (c === ')' && !isEscaped) {
      depth = Math.max(0, depth - 1);
      if (at + 1 === text.length && depth === 0) return open;
      isEscaped = false;
    } else isEscaped = false;
  }
  return null;
}

function plainPart(part) {
  const trimmed = part.trim();
  const space = trimmed.indexOf(' ');
  const rest = space < 0 ? '' : trimmed.slice(space + 1);
  const group = trailingBareGroup(rest);
  const authorEnd = group !== null && isDate(rest.slice(group + 1, rest.length - 1)) ? group : rest.length;
  let isEscaped = false;
  for (const c of rest.slice(0, authorEnd)) {
    if ((c === '(' || c === ')') && !isEscaped) return null;
    isEscaped = c === '\\' && !isEscaped;
  }
  return plainRevision(part);
}

function nestedPlainRevisions(text) {
  const parts = nestedParts(text, plainPart);
  return parts && parts.length > 1 ? parts : null;
}

/** One part without ` move` or ` move NAME` when NAME is one token. */
function partWithoutMove(part) {
  part = part.trim();
  const at = part.lastIndexOf(' move ');
  if (at >= 0) {
    const name = part.slice(at + ' move '.length).trim();
    if (name && !/\s/.test(name)) return part.slice(0, at).trimEnd();
  }
  return part.endsWith(' move') ? part.slice(0, -' move'.length) : part;
}

function noteWithoutMove(note) {
  return note.split(' re ').map((segment) => segment.split('; ').map(partWithoutMove).join('; ')).join(' re ');
}

function ownTags(note) {
  // write.rs applies a note in this order: nested notes before plain ones,
  // so `r7 Bo re r1 Kim` is Bo's change inside Kim's, not an author `Bo re r1 Kim`.
  const tags = revisionTags(note);
  if (tags) return tags;
  const nested = nestedRevisionTags(note);
  if (nested) return [nested[0]];
  const nestedPlain = nestedPlainRevisions(note);
  if (nestedPlain) return [nestedPlain[0]];
  return plainRevisions(note);
}

/**
 * The change's own tags in a note (a substitution's two authors, or one),
 * each `{ kind: 'handle', handle } | { kind: 'plain', author }` with
 * `date?` and `ids: [{ story, wid }]`; null when the note is no tag.
 */
export function readNote(note) {
  return ownTags(note) ?? (note.includes(' move') ? ownTags(noteWithoutMove(note)) : null);
}

/**
 * The complete attribution brace opening at `at` (stopping before `until`):
 * `{ note, tags, end }`, or null when the brace is document text.
 */
export function attributionTag(source, at, until) {
  if (source[at] !== '{' || escaped(source, at)) return null;
  for (let i = at + 1; i < until; i++) {
    const c = source[i];
    if ((c === '}' || c === '{' || c === '\n') && !escaped(source, i)) {
      if (c !== '}') return null;
      const note = source.slice(at + 1, i);
      const tags = readNote(note);
      return tags ? { note, tags, end: i + 1 } : null;
    }
  }
  return null;
}
