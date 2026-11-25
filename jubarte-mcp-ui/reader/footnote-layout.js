// SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Page-local footnotes. A source definition is scheduled exactly once, by its
 * first canonical reference. The compositor accepts body lines in order and
 * commits the note reservation at the same time. Reservations never shrink.
 * A rejected line has no side effects; page/row checkpoints support rollback.
 * Oversized definitions have an explicit source-line cursor and continue on
 * later pages. There is no speculative global repagination/fixed-point loop.
 */
export function flattenLayoutBlocks(blocks) {
 return (blocks || []).flatMap(block => block.type === 'table'
  ? block.rows.flatMap(row => row.cells.flatMap(cell => flattenLayoutBlocks(cell.blocks)))
  : [block]);
}

export function createFootnoteAllocator({snapshot, composeLines, width, height, lineHeight, warn}) {
 // Extremely short custom frames can still show one source line on a
 // continuation-only page. Suppress decorative label/rule spacing if needed.
 // Sized again once the notes' lines are known: a note line can be taller than the default (#119).
 let labelHeight = Math.min(20, Math.max(0, height - lineHeight));
 let separator = Math.min(12, Math.max(0, height - lineHeight - labelHeight));
 const between = 6;
 const notes = new Map(), sourceRuns = new Map(), missing = new Set(), nestedReferences = new Set();
 const definitions = snapshot.footnotes || [];
 for (const block of flattenLayoutBlocks([...snapshot.blocks, ...definitions.flatMap(note => note.blocks || [])]))
  for (const run of block.runs || []) sourceRuns.set(run.id, run);
 for (const source of definitions) {
  const id = String(source.id ?? source.identifier);
  if (notes.has(id)) {
   // Keep malformed duplicate definitions visible instead of silently replacing.
   const previous = notes.get(id);
   previous.blocks.push(...flattenLayoutBlocks(source.blocks));
   warn('duplicate-footnote-definition', `Footnote ${id} has multiple definitions; all definition text is preserved together.`, id);
   continue;
  }
  if ((source.blocks || []).some(block => block.type === 'table'))
   warn('footnote-table-linearized', `The table in footnote ${id} is shown in row and cell order in the page-bottom note band.`, id);
  notes.set(id, {...source, id, identifier: String(source.identifier ?? id), blocks: flattenLayoutBlocks(source.blocks), orphan: false});
 }
 for (const note of notes.values()) for (const block of note.blocks) for (const run of block.runs || []) {
  const target = run.footnoteId ?? snapshot.runMap?.get(run.id)?.footnoteId;
  if (target == null || target === '') continue;
  const id = String(target); nestedReferences.add(id);
  if (!notes.has(id)) warn('missing-footnote-definition', `Footnote reference ${id} inside note ${note.identifier} has no visible definition.`, id);
 }
 // A note's blocks from position `from` on: a run cut at `from` keeps its tail.
 const clipBlocks = (blocks, from) => blocks.flatMap(block => {
  const runs = (block.runs || []).flatMap(run => {
   const r = run.pmRange;
   if (!r || r.from >= from) return [run];
   if (r.to <= from || typeof run.text !== 'string') return [];
   const cut = from - r.from;
   return [{...run, text: run.text.slice(cut), pmRange: {from, to: r.to}}];
  });
  if (!runs.length) return [];
  return [{...block, runs, pmRange: {...block.pmRange, from: Math.max(block.pmRange?.from ?? from, from)}, attrs: {...block.attrs, clipFrom: from, first: false}}];
 });
 const wrap = note => {
  note.lines = composeLines(note.blocks, width);
  // An empty definition is still a visible labelled note.
  if (!note.lines.length) note.lines = [{blockId: note.blocks[0]?.id || `empty-footnote-${note.id}`, y: 0, height: lineHeight, advance: lineHeight, runs: [], pmRange: note.pmRange || {from: 0, to: 0}}];
 };
 for (const note of notes.values()) wrap(note);
 // The decoration gives way to the tallest note line, so a line that fits the frame is laid out (#119).
 const tallest = Math.max(lineHeight, ...[...notes.values()].flatMap(note => note.lines.map(line => line.advance ?? lineHeight)));
 labelHeight = Math.min(labelHeight, Math.max(0, height - tallest));
 separator = Math.min(separator, Math.max(0, height - tallest - labelHeight));
 let scheduled = new Set(), pending = [], requests = [], allocations = [], active = false;
 const cloneEntries = items => items.map(item => ({...item}));
 // A note's lines take their own heights (#102): Word sets footnote text in its own style.
 const lineAt = (id, index) => notes.get(id).lines[index]?.advance ?? lineHeight;
 const span = (id, offset, count) => { let sum = 0; for (let i = 0; i < count; i++) sum += lineAt(id, offset + i); return sum; };
 const footprint = items => items.length ? separator + items.reduce((sum, item) => sum + labelHeight + span(item.id, item.offset, item.count), 0) + between * (items.length - 1) : 0;
 function checkpoint() { return {scheduled: new Set(scheduled), pending: cloneEntries(pending), requests: cloneEntries(requests), allocations: cloneEntries(allocations), active}; }
 function restore(state) { scheduled = new Set(state.scheduled); pending = cloneEntries(state.pending); requests = cloneEntries(state.requests); allocations = cloneEntries(state.allocations); active = state.active; }
 function beginPage() { requests = cloneEntries(pending); allocations = []; active = false; }
 function referenceIds(lines) {
  const ids = [];
  for (const line of lines) for (const run of line.runs || []) {
   const value = run.footnoteId ?? sourceRuns.get(run.runId ?? run.id)?.footnoteId ?? snapshot.runMap?.get(run.runId ?? run.id)?.footnoteId;
   if (value == null || value === '') continue;
   const id = String(value);
   // An endnote's reference: its note follows the body, not the page (#46).
   if (snapshot.endnoteIds?.has(id)) continue;
   if (!notes.has(id)) {
    if (!missing.has(id)) { missing.add(id); warn('missing-footnote-definition', `Footnote reference ${id} has no visible definition.`, id); }
    continue;
   }
   if (!scheduled.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
 }
 // Allocate whole measured lines. Reserve one line per newly referenced note
 // first when possible, so a large earlier note cannot hide a short later one.
 // Where a note's content ends: its trailing spacer is drawn when there is room but never
 // continues the note onto another page (#58).
 function contentEnd(note) { let end = note.lines.length; while (end > 0 && !(note.lines[end - 1].runs || []).length) end--; return Math.max(end, 1); }
 function allocate(items, budget, preferred = []) {
  const result = [], counts = new Map(); let used = 0;
  function addLine(item) {
   const old = counts.get(item.id) || 0;
   if (item.offset + old >= notes.get(item.id).lines.length) return false;
   const cost = lineAt(item.id, item.offset + old) + (old ? 0 : labelHeight + (counts.size ? between : separator));
   if (used + cost > budget + 0.001) return false;
   counts.set(item.id, old + 1); used += cost; return true;
  }
  for (const id of preferred) { const item = items.find(item => item.id === id); if (item) addLine(item); }
  for (const item of items) while (addLine(item)) { /* bounded by source line count */ }
  for (const item of items) if (counts.has(item.id)) result.push({...item, count: counts.get(item.id)});
  return result;
 }
 function accept(lines, bodyBottom, bodyStart = bodyBottom - lineHeight) {
  if (bodyBottom > height + 0.001) return false;
  const ids = referenceIds(lines), additions = ids.map(id => ({id, offset: 0}));
  if (!active) {
   const all = [...requests, ...additions], budget = height - bodyBottom;
   const proposed = allocate(all, budget, ids);
   // At least the first note must fit beside the reference if geometry allows;
   // otherwise retain the call, carry the definition, and disclose the limit.
   if (all.length && !proposed.length && bodyStart > 0) return false;
   if (ids.length && bodyStart > 0) {
    const full = all.map(item => ({...item, count: notes.get(item.id).lines.length - item.offset}));
    if (footprint(full) > budget + 0.001) return false;
   }
   requests = all; allocations = proposed; active = true;
  } else if (!ids.length) {
   if (bodyBottom + footprint(allocations) > height + 0.001) return false;
  } else {
   const full = additions.map(item => ({...item, count: notes.get(item.id).lines.length}));
   if (bodyBottom + footprint([...allocations, ...full]) > height + 0.001) return false;
   requests.push(...additions); allocations.push(...full);
  }
  for (const id of ids) scheduled.add(id);
  if (ids.some(id => !allocations.some(item => item.id === id)))
   warn('footnote-reference-capacity', 'This page has more footnote references than its available note area can hold. Excess notes continue on the following page.', ids.find(id => !allocations.some(item => item.id === id)));
  return true;
 }
 function enqueueOrphans() {
  for (const note of notes.values()) if (!scheduled.has(note.id)) {
   scheduled.add(note.id); note.orphan = !nestedReferences.has(note.id); requests.push({id: note.id, offset: 0});
   if (note.orphan) warn('unreferenced-footnote', `Footnote ${note.identifier} is unreferenced; its definition is retained in the final page-bottom notes.`, note.id);
   else warn('nested-footnote-deferred', `Footnote ${note.identifier} is referenced within another note. Nested footnotes are retained with the final page-bottom notes rather than allocated recursively.`, note.id);
  }
 }
 // Once the body is finished, spend remaining page space on pending definitions.
 function fillRemainder(bodyBottom = 0) {
  const old = new Map(allocations.map(item => [item.id, item.count]));
  const left = requests.map(item => ({...item, offset: item.offset + (old.get(item.id) || 0)})).filter(item => item.offset < contentEnd(notes.get(item.id)));
  if (!allocations.length) { allocations = allocate(left, height - bodyBottom); active = true; return; }
  let budget = height - bodyBottom - footprint(allocations);
  for (const item of left) {
   const existing = allocations.find(part => part.id === item.id);
   const overhead = existing ? 0 : labelHeight + between;
   const start = item.offset;
   let count = 0, used = 0;
   while (start + count < notes.get(item.id).lines.length && overhead + used + lineAt(item.id, start + count) <= budget + 0.001) used += lineAt(item.id, start + count++);
   if (count <= 0) continue;
   if (existing) existing.count += count; else allocations.push({...item, count});
   budget -= overhead + used;
  }
 }
 function finishPage(pageIndex) {
  const total = footprint(allocations), band = total ? {pageIndex, frameIndex: 0, x: 0, y: height - total, width, height: total} : null;
  let y = height - total + separator;
  const fragments = allocations.map(item => {
   const note = notes.get(item.id), continuedBefore = item.offset > 0, continuedAfter = item.offset + item.count < contentEnd(note);
   let top = labelHeight;
   const lines = note.lines.slice(item.offset, item.offset + item.count).map(line => { const placed = {...line, y: top}; top += line.advance ?? lineHeight; return placed; });
   const fragment = {footnoteId: note.id, identifier: note.identifier, pageIndex, frameIndex: 0, x: 0, y, width, height: top, lines, continuedBefore, continuedAfter, orphan: note.orphan};
   y += fragment.height + between; return fragment;
  });
  const emitted = new Map(allocations.map(item => [item.id, item.count]));
  pending = requests.map(item => ({...item, offset: item.offset + (emitted.get(item.id) || 0)})).filter(item => item.offset < contentEnd(notes.get(item.id)));
  return {band, fragments};
 }
 return {beginPage, accept, checkpoint, restore, finishPage, enqueueOrphans, fillRemainder, referenceIds,
  get bodyLimit() { return height - footprint(allocations); },
 // A section's pages bring their own content area (#47).
 // Notes are rewrapped to its width (#49); a note continued from the previous
 // page resumes at the new line holding the first text it had not shown.
 // The lines already drawn stay as they were; only the text not yet shown is
 // wrapped again, from its first character (#50), so nothing repeats.
 setGeometry(geometry) {
  const rewrap = Math.abs(geometry.width - width) > 0.001;
  width = geometry.width; height = geometry.height;
  if (!rewrap) return;
  for (const note of notes.values()) {
   const carried = pending.find(item => item.id === note.id && item.offset > 0);
   if (!carried) { wrap(note); continue; }
   const from = note.lines[carried.offset]?.pmRange?.from;
   if (!Number.isFinite(from)) continue;
   const rest = composeLines(clipBlocks(note.blocks, from), width);
   note.lines = [...note.lines.slice(0, carried.offset), ...rest];
  }
 },
  get hasPending() { return pending.length > 0; },
  get enabled() { return notes.size > 0 || sourceRuns.size > 0; }};
}
