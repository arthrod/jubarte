# remark-critic-markup: local Jubarte fork

This directory is the actual locally modified parser used by the demo. Its
starting point is `remark-critic-markup@1.0.1`, published by Benbinbin under
the MIT license. `upstream-1.0.1.js`, `upstream-package.json`, and `LICENSE`
preserve the exact original implementation, package metadata, and license.

The upstream implementation recognized four **bare** delimiter forms by
replacing individual mdast text nodes with HTML. That approach cannot
implement Jubarte's brace-based syntax or spans across Markdown nodes.
The fork replaces that parser path in `index.js` with a lexical pass before
CommonMark and GFM parsing. It emits metadata ranges instead of HTML.

## API

```js
import remarkCriticMarkup, { prepareCritic, parseAgentTag } from './index.js';
const prepared = prepareCritic(source, {
  noCritic: false,
  agentView: true, // caller enables this only for YAML containing view:
  planAuthor: 'Modified User',
  authors: { AC: 'Ann Counsel' },
  story: 'body',
  storyAt: (sourceOffset) => 'body', // optional per-source-position override
  preserveFlanking: true, // default; preserve punctuation at emphasis edges
  literalProtection: true, // protect leftover Critic ~~ from GFM strike
});
const tree = unified().use(remarkParse).use(remarkCriticMarkup, options)
  .use(remarkGfm).parse(source);
```

The plugin must be registered after `remark-parse`; it wraps that parser
and exposes the preparation result on `tree.data.critic` and
`file.data.critic`. Callers remain responsible for applying those ranges
to their Markdown renderer/editor model. YAML and ID lines are handled
by the surrounding Jubarte dialect adapter, which passes `agentView`,
authors and story context explicitly. This plugin does not parse YAML.

`prepareCritic` returns:

- `markdown`: source with complete Critic delimiters and comment notes
  removed; substitution retains deleted then inserted content. See the
  punctuation/literal-protection notes below for inserted characters.
- `changes`: insertion/deletion intervals with `id`, `groupId`, `start`,
  `end`, author, story, revision IDs and source positions. The two halves
  of a substitution share a group.
- `groups`: logical changes with all their revision tags and child changes.
- `highlights`: highlight intervals; `isCommentAnchor` distinguishes
  highlights carrying a following comment from stand-alone highlights.
- `comments`: comments and replies, range or point anchors, author,
  thread/root IDs, resolved state and story-qualified references.
- `anchors`: the plain intervals for change/highlight anchors.
- `sourceMap`: output UTF-16 character offset → original UTF-16 offset;
  its final entry is `source.length`. `start`/`end` throughout are half-open
  output offsets, matching mdast's UTF-16 positions. To recover a content
  character use `sourceMap[i]`; removed delimiters have no output position.
- `source`, `warnings`, `diagnostics`, `agentView`, `noCritic`.
- `sentinelPositions`: exact output offsets of inserted punctuation, and
  `sentinels`: objects containing offset, original source offset, and
  character. The renderer must suppress **only these indexed characters**;
  an identical source-authored character remains document text.
- `insertedEscapes`: output offsets of optional Markdown protection
  backslashes. CommonMark resolves these escapes normally.

Source positions are `sourceStart`/`sourceEnd` including delimiters and,
for changes, `contentSourceStart`/`contentSourceEnd` without delimiters.
`revisionIds` are unqualified numeric strings; `referenceIds` use
`body:rev:12`, `header1:rev:3`, etc. A grouped substitution note's IDs are
retained on both halves; two separate notes assign deletion first and
insertion second. Comments expose `id: 'c5'`, `referenceId`, `threadId`,
`threadReference`, and `replyTo`/`replyToReference` where applicable.

## Parsing rules

- Canonical `{++…++}`, `{--…--}`, `{~~…~>…~~}`, `{==…==}`, `{>>…<<}`.
- Scan Critic before Markdown, including content in inline/fenced code,
  matching Jubarte's current global preprocessing contract.
- Allow spans to cross emphasis, links, and paragraph breaks.
- Odd backslash parity escapes opening/closing delimiters and substitution
  separators. Unmatched syntax remains literal. `noCritic` is a complete
  Critic bypass and returns no Critic metadata. With literal protection
  disabled it returns the exact input.
- Highlights can contain changes/comments, changes can contain
  highlights/comments; same-kind nesting and markup within comments are
  literal. A line-start footnote definition label is kept outside its
  change interval so the Markdown definition retains its structure.
- Only explicit `agentView: true` interprets revision/comment tags. Current
  `r12`, `r1+2`, `c5`, story-qualified `header1.r3`, and historical `#12`,
  `#r12`, `#c5` spellings are understood. Untagged comments/changes use
  `planAuthor`. Ordinary comment notes attach only to an immediately
  preceding highlight/change/comment chain; otherwise they are points.

### Markdown punctuation and literal protection

Removing every delimiter blindly would concatenate `{~~**30**~>**45**~~}`
into `**30****45**`, changing its Markdown meaning. By default the fork
inserts U+2E0E punctuation at removed-delimiter boundaries adjacent to
`*`, `_`, or `~` when both sides are non-whitespace. This preserves the
two bold sides and word-edge emphasis such as `a{++_b_++}c`. These exact
positions are listed in `sentinelPositions`; the editor adapter removes
their visible characters after Markdown parsing. Ranges include their
offset effects. Set `preserveFlanking: false` for a strictly delimiter-free
lexical result. Original occurrences of U+2E0E are never interpreted as
sentinels merely because they have the same character.

With `literalProtection: true`, remaining canonical `{~~` / `~~}`
delimiters (escaped, unmatched, or under `noCritic`) get Markdown escapes
so GFM cannot silently turn them into strikethrough. Ordinary `~~strike~~`
is unaffected. CommonMark's actual code-node positions are used to avoid
adding visible backslashes in inline, fenced, indented, or container code.
All metadata intervals and source maps are remapped after protection.

This parser reports document metadata. It does not implement Word export,
paragraph-mark relocation, acceptance/rejection, layout, or DOCX identity
reconciliation. The Plate adapter can use these precise intervals to
represent whole-block and whole-row changes.
