// SPDX-FileCopyrightText: 2022 Ben
//
// SPDX-License-Identifier: MIT

/**
 * Jubarte compatibility fork of remark-critic-markup 1.0.1 (MIT).
 * The original release and its license are preserved alongside this file.
 *
 * CriticMarkup must be recognized BEFORE CommonMark. The upstream text-node
 * replacement is replaced here by a lexical pass and source-offset ranges.
 */

import { fromMarkdown } from 'mdast-util-from-markdown';

const FORMS = [
  { open: '{++', close: '++}', kind: 'insertion', bit: 1 },
  { open: '{--', close: '--}', kind: 'deletion', bit: 2 },
  { open: '{~~', close: '~~}', kind: 'substitution', bit: 4 },
  { open: '{==', close: '==}', kind: 'highlight', bit: 8 },
  { open: '{>>', close: '<<}', kind: 'comment', bit: 16 },
];
const ALL = 31;
const CHANGES = 7;
const ISO_DATE = /^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?)?$/;

/** True when an odd number of immediately preceding backslashes escapes at. */
export function isEscaped(source, at) {
  let count = 0;
  while (at > 0 && source[--at] === '\\') count++;
  return count % 2 === 1;
}

function lowerBound(values, target) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function closerIndex(source) {
  const index = new Map();
  for (const pattern of [...FORMS.map((form) => form.close), '~>']) {
    const positions = [];
    let from = 0;
    while (from < source.length) {
      const at = source.indexOf(pattern, from);
      if (at < 0) break;
      if (!isEscaped(source, at)) positions.push(at);
      from = at + 1;
    }
    index.set(pattern, positions);
  }
  return (pattern, from, until) => {
    const values = index.get(pattern);
    const at = values[lowerBound(values, from)];
    return at !== undefined && at + pattern.length <= until ? at : -1;
  };
}

function literalProtectionOffsets(markdown) {
  // Ask CommonMark itself where code is, so escapes are never introduced
  // into literal code content (including nested/container fenced blocks).
  const codeRanges = [];
  const visit = (node) => {
    if (node.type === 'code' || node.type === 'inlineCode') codeRanges.push([node.position.start.offset, node.position.end.offset]);
    else for (const child of node.children || []) visit(child);
  };
  visit(fromMarkdown(markdown));
  const result = [];
  let codeIndex = 0;
  for (const match of markdown.matchAll(/\{~~|~~\}/g)) {
    const first = match.index + (match[0][0] === '{' ? 1 : 0);
    for (const at of [first, first + 1]) {
      while (codeIndex < codeRanges.length && codeRanges[codeIndex][1] <= at) codeIndex++;
      if (codeRanges[codeIndex]?.[0] <= at && at < codeRanges[codeIndex][1]) continue;
      if (!isEscaped(markdown, at)) result.push(at);
    }
  }
  return result;
}

function authorDetails(handle, options) {
  const entry = handle ? options.authors?.[handle] : undefined;
  if (typeof entry === 'string') return { author: entry, authorHandle: handle };
  if (entry && typeof entry === 'object') {
    return {
      author: entry.name || entry.author || handle,
      authorHandle: handle,
      ...(entry.timestamp || entry.date ? { date: entry.timestamp || entry.date } : {}),
    };
  }
  return { author: handle || options.planAuthor || 'Modified User', ...(handle ? { authorHandle: handle } : {}) };
}

function identifier(raw, type, defaultStory) {
  // Current r12/c5 form; #r12 and historical #12 are accepted aliases.
  const pattern = type === 'revision'
    ? /^(?:(?<story>[A-Za-z][\w-]*)\.)?(?:#r|r|#)(?<ids>\d+(?:\+\d+)*)$/
    : /^(?:(?<story>[A-Za-z][\w-]*)\.)?#?c(?<ids>\d+)$/;
  const match = raw.match(pattern);
  if (!match) return null;
  const story = match.groups.story || defaultStory || 'body';
  const ids = match.groups.ids.split('+');
  return { story, ids, referenceIds: ids.map((id) => `${story}:${type === 'revision' ? 'rev' : 'comment'}:${id}`) };
}

/** One tag part without a trailing ` move` or ` move NAME` (one token). */
function withoutMove(part) {
  const text = part.trim();
  const match = text.match(/^(.*\S) move(?: (\S+))?$/);
  return match ? match[1] : text;
}

/** Parse one agent-view note. This function does not itself enable view mode. */
export function parseAgentTag(note, options = {}) {
  const text = String(note).trim();
  const revision = text.match(/^(\S+)\s+@([^\s:]+)(?:\s+(\S+))?$/);
  if (revision) {
    const ref = identifier(revision[1], 'revision', options.story);
    if (ref && (!revision[3] || ISO_DATE.test(revision[3]))) {
      return { type: 'revision', ...ref, ...authorDetails(revision[2], options), ...(revision[3] ? { date: revision[3] } : {}) };
    }
  }

  // Split at the colon AFTER the optional timestamp, not an ISO time's colon.
  const comment = text.match(/^(\S+)\s+@([^\s:]+)((?:\s+(?:re\s+\S+|resolved|\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?)?))*)\s*:\s*([\s\S]*)$/);
  if (!comment) return null;
  const ref = identifier(comment[1], 'comment', options.story);
  if (!ref) return null;
  const qualifier = comment[3].trim();
  const reply = qualifier.match(/(?:^|\s)re\s+(\S+)/);
  const replyRef = reply ? identifier(reply[1], 'comment', ref.story) : null;
  if (reply && !replyRef) return null;
  const date = qualifier.split(/\s+/).find((word) => ISO_DATE.test(word));
  return {
    type: 'comment', ...ref, ...authorDetails(comment[2], options),
    text: comment[4], resolved: /(?:^|\s)resolved(?:\s|$)/.test(qualifier),
    ...(date ? { date } : {}),
    ...(replyRef ? { replyTo: `c${replyRef.ids[0]}`, replyToReference: replyRef.referenceIds[0] } : {}),
  };
}

/**
 * Strip complete CriticMarkup syntax before Markdown parsing.
 * Ranges and sourceMap use UTF-16 offsets, exactly like mdast positions.
 * agentView must be explicitly enabled by the caller's YAML view detection.
 */
export function prepareCritic(input, options = {}) {
  const source = String(input ?? '');
  const changes = [];
  const comments = [];
  const highlights = [];
  const groups = [];
  const anchors = [];
  const warnings = [];
  const diagnostics = [];
  const sourceMap = [];
  const sentinelPositions = [];
  const sentinels = [];
  const chunks = [];
  let length = 0;
  let lastCharacter = '';
  let sequence = 0;
  const nextId = (kind) => `critic-${kind}-${++sequence}`;
  const findCloser = closerIndex(source);
  const storyAt = (offset) => options.storyAt?.(offset) || options.story || 'body';
  const defaultAuthor = () => ({ author: options.planAuthor || 'Modified User', ...(options.date ? { date: options.date } : {}), isNew: true });

  function warn(code, message, sourceStart, sourceEnd) {
    warnings.push(message);
    diagnostics.push({ code, message, sourceStart, sourceEnd });
  }

  function append(from, until) {
    if (until <= from) return;
    chunks.push(source.slice(from, until));
    for (let offset = from; offset < until; offset++) sourceMap.push(offset);
    length += until - from;
    lastCharacter = source[until - 1];
  }

  function boundary(nextSourceOffset, delimiterSourceOffset) {
    if (options.preserveFlanking === false) return;
    const next = source[nextSourceOffset] || '';
    // A removed Critic delimiter is punctuation. Preserve that separation
    // only when concatenation could alter inline emphasis/strike parsing.
    // Never add punctuation before block markers or across whitespace.
    if (!lastCharacter || !next || /\s/.test(lastCharacter) || /\s/.test(next)) return;
    if (!/[*_~]/.test(lastCharacter) && !/[*_~]/.test(next)) return;
    const character = '\u2e0e';
    sentinelPositions.push(length);
    sentinels.push({ offset: length, sourceOffset: delimiterSourceOffset, character });
    chunks.push(character);
    sourceMap.push(delimiterSourceOffset);
    length++;
    lastCharacter = character;
  }

  function attachRevision(anchor, tag, sourceStart, sourceEnd) {
    const group = anchor.group;
    group.tags.push({ ...tag, sourceStart, sourceEnd });
    const noteIndex = group.tags.length - 1;
    const info = {
      author: tag.author, authorHandle: tag.authorHandle,
      revisionIds: tag.ids, referenceIds: tag.referenceIds,
      story: tag.story, isNew: false,
      ...(tag.date ? { date: tag.date } : {}),
    };
    if (group.kind === 'substitution') {
      if (noteIndex === 0) {
        // A single tag is shared by both halves. A second note overrides only
        // the inserted half, leaving the deleted side's author first.
        for (const change of group.changes) Object.assign(change, info);
      } else if (noteIndex === 1) Object.assign(group.changes[1], info);
      else warn('extra-revision-tag', 'A substitution has more than two revision notes; extra metadata was retained on its group.', sourceStart, sourceEnd);
    } else if (noteIndex === 0) Object.assign(group.changes[0], info);
    else {
      // Preserve all marks when an exporter emitted several adjacent tags.
      const change = group.changes[0];
      change.revisionIds = [...new Set([...change.revisionIds, ...tag.ids])];
      change.referenceIds = [...new Set([...change.referenceIds, ...tag.referenceIds])];
      if (change.author !== tag.author) warn('mixed-change-authors', 'Several authors are tagged on one non-substitution change; all tags were preserved on its group.', sourceStart, sourceEnd);
    }
    group.revisionIds = [...new Set(group.tags.flatMap((item) => item.ids))];
    group.referenceIds = [...new Set(group.tags.flatMap((item) => item.referenceIds))];
  }

  function addComment(body, sourceStart, sourceEnd, preceding) {
    const story = storyAt(sourceStart);
    const tag = options.agentView ? parseAgentTag(body, { ...options, story }) : null;
    if (tag?.type === 'revision' && preceding?.group) {
      attachRevision(preceding, tag, sourceStart, sourceEnd);
      return { ...preceding, sourceEnd };
    }
    if (tag?.type === 'revision') warn('orphan-revision-tag', 'A revision tag has no immediately preceding change and was kept as a point comment.', sourceStart, sourceEnd);
    const tagged = tag?.type === 'comment' ? tag : null;
    const comment = {
      id: tagged ? `c${tagged.ids[0]}` : nextId('comment'),
      text: tagged ? tagged.text : body,
      start: preceding?.start ?? length,
      end: preceding?.end ?? length,
      sourceStart, sourceEnd, story: tagged?.story || story,
      anchorKind: preceding?.kind || 'point',
      anchorId: preceding?.id || null,
      ...defaultAuthor(),
      resolved: false,
      ...(tagged ? {
        author: tagged.author, authorHandle: tagged.authorHandle,
        commentId: tagged.ids[0], referenceId: tagged.referenceIds[0],
        resolved: tagged.resolved, isNew: false,
        ...(tagged.date ? { date: tagged.date } : {}),
        ...(tagged.replyTo ? { replyTo: tagged.replyTo, replyToReference: tagged.replyToReference } : {}),
      } : {}),
    };
    const previousComment = preceding?.comment;
    if (!tagged && previousComment && !previousComment.isNew) {
      comment.replyTo = previousComment.threadId || previousComment.id;
      comment.replyToReference = previousComment.threadReference || previousComment.referenceId;
    }
    comment.threadId = comment.replyTo || comment.id;
    comment.threadReference = comment.replyToReference || comment.referenceId || comment.id;
    // An untagged reply following another new reply remains in the same thread.
    if (!tagged && previousComment?.replyTo) {
      comment.replyTo = previousComment.replyTo;
      comment.threadId = previousComment.threadId;
      comment.replyToReference = previousComment.replyToReference;
      comment.threadReference = previousComment.threadReference;
    }
    comments.push(comment);
    if (preceding?.highlight) {
      preceding.highlight.isCommentAnchor = true;
      preceding.highlight.commentIds.push(comment.id);
    }
    if (preceding?.group) preceding.group.commentIds.push(comment.id);
    return { ...(preceding || { id: comment.id, kind: 'point', start: length, end: length }), sourceEnd, comment };
  }

  /**
   * The engine's attribution brace at `at` (agent view only), read as
   * crates/jubarte-markdown critic.rs `recognized_note` reads it: one flat
   * brace; ` re ` separates the change's own tags from the change it sits
   * in, and every segment must be a tag; `; ` joins a substitution's two
   * authors; each part may end in ` move` or ` move NAME`. Returns the
   * change's own tags, or null when the brace is document text.
   */
  function attributionTagAt(at, until) {
    if (!options.agentView || source[at] !== '{' || isEscaped(source, at)) return null;
    if (FORMS.some((form) => source.startsWith(form.open, at))) return null;
    const close = source.indexOf('}', at + 1);
    if (close < 0 || close >= until) return null;
    const body = source.slice(at + 1, close);
    if (/[{\n]/.test(body)) return null;
    const story = storyAt(at);
    const segments = body.split(' re ').map((segment) => segment.split('; ').map(withoutMove));
    if (segments.length > 1 && segments.some((parts) => parts.length !== 1)) return null;
    const tags = segments.map((parts) => parts.map((part) => parseAgentTag(part, { ...options, story })));
    if (tags.some((parts) => parts.some((tag) => tag?.type !== 'revision'))) return null;
    return { revisions: tags[0], end: close + 1 };
  }

  function render(from, until, allowed) {
    let at = from;
    let previous = null;
    while (at < until) {
      const possibleForm = source[at] === '{' && !isEscaped(source, at)
        ? FORMS.find((candidate) => source.startsWith(candidate.open, at))
        : null;
      if (possibleForm && !(possibleForm.bit & allowed)) {
        const nestedClose = findCloser(possibleForm.close, at + 3, until);
        if (nestedClose >= 0 && (possibleForm.kind !== 'substitution' || findCloser('~>', at + 3, nestedClose) >= 0)) {
          warn('literal-nested-critic', `Nested ${possibleForm.kind} syntax at this depth is kept as literal text.`, at, nestedClose + 3);
        }
      }
      const form = possibleForm && (possibleForm.bit & allowed) ? possibleForm : null;
      const bodyStart = at + 3;
      const closer = form ? findCloser(form.close, bodyStart, until) : -1;
      const split = form?.kind === 'substitution' && closer >= 0 ? findCloser('~>', bodyStart, closer) : -1;
      if (!form || closer < 0 || (form.kind === 'substitution' && split < 0)) {
        append(at, at + 1);
        previous = null;
        at++;
        continue;
      }
      const after = closer + 3;
      if (form.kind === 'comment') {
        previous = addComment(source.slice(bodyStart, closer), at, after, previous?.sourceEnd === at ? previous : null);
        at = after;
        continue;
      }

      const nested = form.kind === 'highlight' ? allowed & ~8 : allowed & ~CHANGES;
      let textStart = bodyStart;
      let footnoteLabel;
      // Keep a line-start footnote label outside the change's text interval,
      // so its definition remains a definition in the Markdown parser.
      if ((at === 0 || source[at - 1] === '\n') && from === 0) {
        const label = source.slice(bodyStart, closer).match(/^\[\^([^\]\n]+)\]:[ \t]*/);
        if (label && (split < 0 || split >= bodyStart + label[0].length)) {
          append(bodyStart, bodyStart + label[0].length);
          textStart += label[0].length;
          footnoteLabel = label[1];
        }
      }
      if (textStart < (split < 0 ? closer : split)) boundary(textStart, at);
      const start = length;
      const common = { sourceStart: at, sourceEnd: after, story: storyAt(at), ...(footnoteLabel ? { footnoteLabel } : {}) };
      if (form.kind === 'highlight') {
        render(textStart, closer, nested);
        const highlight = { id: nextId('highlight'), kind: 'highlight', start, end: length, ...common, isCommentAnchor: false, commentIds: [] };
        highlights.push(highlight);
        previous = { ...highlight, highlight };
      } else {
        const group = { id: nextId('group'), kind: form.kind, start, ...common, changes: [], tags: [], commentIds: [], revisionIds: [], referenceIds: [] };
        const addChange = (kind, rangeStart, rangeEnd) => {
          const change = { id: nextId(kind), kind, start: length, end: length, groupId: group.id, ...common, contentSourceStart: rangeStart, contentSourceEnd: rangeEnd, ...defaultAuthor(), revisionIds: [], referenceIds: [] };
          render(rangeStart, rangeEnd, nested);
          change.end = length;
          changes.push(change);
          group.changes.push(change);
        };
        if (form.kind === 'substitution') {
          addChange('deletion', textStart, split);
          if (split + 2 < closer) boundary(split + 2, split);
          addChange('insertion', split + 2, closer);
        } else addChange(form.kind, textStart, closer);
        group.end = length;
        groups.push(group);
        previous = { id: group.id, kind: form.kind, start, end: length, sourceEnd: after, group };
      }
      anchors.push({ id: previous.id, kind: previous.kind, start, end: length, ...common });
      // The engine's attribution tags (`{++x++}{r12 @AC}`, engine 0.20.0+)
      // are the change's metadata: attach them and leave them out of the text.
      let end = after;
      const tag = previous.group ? attributionTagAt(end, until) : null;
      if (tag) {
        for (const revision of tag.revisions) attachRevision(previous, revision, end, tag.end);
        previous.sourceEnd = tag.end;
        end = tag.end;
      }
      boundary(end, closer);
      at = end;
    }
  }

  if (options.noCritic) append(0, source.length);
  else render(0, source.length, ALL);
  sourceMap.push(source.length);
  let markdown = chunks.join('');
  const insertedEscapes = [];
  if (options.literalProtection) {
    const protect = literalProtectionOffsets(markdown);
    if (protect.length) {
      const protectedChunks = [];
      const protectedMap = [];
      const positions = new Map();
      let cursor = 0;
      for (let offset = 0; offset < markdown.length; offset++) {
        positions.set(offset, protectedMap.length);
        if (protect[cursor] === offset) {
          insertedEscapes.push(protectedMap.length);
          protectedChunks.push('\\');
          protectedMap.push(sourceMap[offset]);
          cursor++;
        }
        protectedChunks.push(markdown[offset]);
        protectedMap.push(sourceMap[offset]);
      }
      positions.set(markdown.length, protectedMap.length);
      protectedMap.push(source.length);
      // Groups share their child change objects with changes; remap once.
      const ranges = new Set([...changes, ...comments, ...highlights, ...groups, ...anchors]);
      for (const range of ranges) {
        range.start = positions.get(range.start);
        range.end = positions.get(range.end);
      }
      for (const sentinel of sentinels) sentinel.offset = positions.get(sentinel.offset);
      sentinelPositions.length = 0;
      for (const sentinel of sentinels) sentinelPositions.push(sentinel.offset);
      sourceMap.length = 0;
      for (const offset of protectedMap) sourceMap.push(offset);
      markdown = protectedChunks.join('');
    }
  }
  return {
    markdown, source, sourceMap, changes, comments, highlights,
    groups, anchors, warnings, diagnostics, sentinelPositions, sentinels, insertedEscapes, agentView: !!options.agentView,
    noCritic: !!options.noCritic,
  };
}

/**
 * A real remark plugin: install AFTER remark-parse. It wraps the parser, so
 * CriticMarkup is recognized before GFM, emphasis, links or block parsing.
 * Metadata is available as tree.data.critic and file.data.critic.
 */
export default function remarkCriticMarkup(options = {}) {
  const parser = this.parser;
  if (typeof parser !== 'function') throw new Error('remark-critic-markup-jubarte must be registered after remark-parse.');
  this.parser = (document, file) => {
    const prepared = prepareCritic(document, options);
    const tree = parser(prepared.markdown, file);
    tree.data = { ...tree.data, critic: prepared };
    if (file) {
      file.data ||= {};
      file.data.critic = prepared;
    }
    return tree;
  };
}
